const solc = require('solc');
const { ethers } = require('ethers');

// 1. 编写最简单的 Solidity HelloWorld 作为测试
const sourceCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message;

    constructor() {
        message = "Hello, Besu!";
    }

    function get() public view returns (string memory) {
        return message;
    }

    function set(string memory _message) public {
        message = _message;
    }
}
`;

const RPC_URL = process.env.BESU_RPC_URL || 'http://43.167.254.129:8545';
const PRIVATE_KEY = process.env.BESU_PRIVATE_KEY || '0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63';
const CHAIN_ID = Number(process.env.BESU_CHAIN_ID || '1337');
const WAIT_TX_TIMEOUT_MS = Number(process.env.WAIT_TX_TIMEOUT_MS || '120000');

async function compileHelloWorld() {
    const input = {
        language: 'Solidity',
        sources: { 'HelloWorld.sol': { content: sourceCode } },
        settings: {
            evmVersion: 'paris',
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors && output.errors.length > 0) {
        const fatal = output.errors.filter((e) => e.severity === 'error');
        if (fatal.length > 0) {
            throw new Error(`Solidity 编译失败:\n${fatal.map((e) => e.formattedMessage).join('\n')}`);
        }
    }

    const contractInfo = output.contracts['HelloWorld.sol']['HelloWorld'];
    return { abi: contractInfo.abi, bytecode: contractInfo.evm.bytecode.object };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFeeOverrides(provider) {
    const feeData = await provider.getFeeData();
    const fallbackMaxFee = ethers.parseUnits('3', 'gwei');
    const fallbackTip = ethers.parseUnits('1', 'gwei');

    return {
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas ?? fallbackMaxFee,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? fallbackTip
    };
}

async function waitForReceiptOrExplain(provider, txHash, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
            return receipt;
        }

        const block = await provider.getBlockNumber();
        process.stdout.write(`... 等待交易上链 ${txHash.slice(0, 12)}..., 当前区块=${block}\r`);
        await sleep(2000);
    }
    process.stdout.write('\n');

    // 超时后诊断交易是否被节点看到。
    const tx = await provider.getTransaction(txHash);
    if (tx) {
        throw new Error(
            `交易 ${txHash} 已被节点识别，但超过 ${timeoutMs / 1000}s 未产出 receipt。` +
            '请检查服务器上是否持续出块，或调大 WAIT_TX_TIMEOUT_MS。'
        );
    }

    try {
        const pending = await provider.send('txpool_besuTransactions', []);
        const exists = Array.isArray(pending) && pending.some((item) => item.hash?.toLowerCase() === txHash.toLowerCase());
        if (exists) {
            throw new Error(
                `交易 ${txHash} 在 txpool 中等待过久，未被打包。` +
                '请检查节点封块状态（qbft_getValidatorsByBlockNumber / eth_blockNumber）。'
            );
        }
    } catch (err) {
        if (err instanceof Error && err.message.includes('txpool')) {
            throw err;
        }
    }

    throw new Error(`交易 ${txHash} 未被节点接收（eth_getTransactionByHash 为 null）。`);
}

async function main() {
    console.log('1. 正在编译智能合约 HelloWorld.sol ...');
    const { abi, bytecode } = await compileHelloWorld();

    console.log(`2. 正在连接 Besu 节点: ${RPC_URL}`);
    const provider = new ethers.JsonRpcProvider(
        RPC_URL,
        { chainId: CHAIN_ID, name: 'besu' },
        { staticNetwork: true }
    );

    const network = await provider.getNetwork();
    const block = await provider.getBlockNumber();
    console.log(`=> 链接成功，chainId=${network.chainId.toString()}，当前区块=${block}`);

    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const signer = new ethers.NonceManager(wallet);
    console.log(`=> 使用地址: ${wallet.address}`);

    const feeOverrides = await getFeeOverrides(provider);
    const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');
    console.log(`=> pending nonce: ${pendingNonce}`);

    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const deployTxRequest = await factory.getDeployTransaction();

    console.log('3. 正在发送部署交易 ...');
    const deployTx = await signer.sendTransaction({
        ...deployTxRequest,
        chainId: CHAIN_ID,
        ...feeOverrides,
        gasLimit: 3_000_000n,
    });
    console.log(`=> deploy txHash: ${deployTx.hash}`);

    const deployReceipt = await waitForReceiptOrExplain(provider, deployTx.hash, WAIT_TX_TIMEOUT_MS);
    if (!deployReceipt.contractAddress) {
        throw new Error('部署交易已确认，但未返回合约地址。');
    }

    const contract = new ethers.Contract(deployReceipt.contractAddress, abi, signer);
    console.log(`=> 合约部署成功！合约地址: ${deployReceipt.contractAddress}`);

    console.log('\n4. 开始测试：读取 get()');
    let msg = await contract.get();
    console.log(`=> 链上当前数据: "${msg}"`);

    console.log('\n5. 开始测试：调用 set() 并等待打包 ...');
    const setTx = await contract.set('Data Link Established: Node.js -> Besu!', {
        chainId: CHAIN_ID,
        ...feeOverrides,
        gasLimit: 300_000n,
    });
    console.log(`=> set txHash: ${setTx.hash}`);
    await waitForReceiptOrExplain(provider, setTx.hash, WAIT_TX_TIMEOUT_MS);

    console.log('\n6. 再次读取并验证 ...');
    msg = await contract.get();
    console.log(`=> 链上最新数据: "${msg}"`);
    console.log('\n✅ 数据链路打通：Node.js -> Besu -> Contract');
}

main().catch((err) => {
    console.error('\n执行失败：');
    console.error(err.message || err);
    process.exit(1);
});