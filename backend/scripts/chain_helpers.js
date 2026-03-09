const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const DEFAULT_LOCAL_RPC_URL = process.env.CHAIN_RPC_URL || 'http://127.0.0.1:18545';
const DEFAULT_LOCAL_CHAIN_ID = Number(process.env.CHAIN_ID || '31337');
const DEFAULT_DEPLOYER_PRIVATE_KEY = process.env.CHAIN_PRIVATE_KEY
    || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function getArtifactPath() {
    return path.resolve(
        __dirname,
        '..',
        'hardhat-local',
        'artifacts',
        'contracts',
        'AviationMaintenanceV2.sol',
        'AviationMaintenanceV2.json'
    );
}

function getDeploymentFilePath() {
    return path.resolve(__dirname, '..', 'hardhat-local', 'deployments', 'local.json');
}

function loadArtifact() {
    const artifactPath = getArtifactPath();
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`未找到合约产物: ${artifactPath}，请先执行 npm run chain:compile`);
    }

    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

function createProvider() {
    return new ethers.JsonRpcProvider(
        DEFAULT_LOCAL_RPC_URL,
        { chainId: DEFAULT_LOCAL_CHAIN_ID, name: 'hardhat-local' },
        { staticNetwork: true }
    );
}

function createWallet(privateKey = DEFAULT_DEPLOYER_PRIVATE_KEY, provider = createProvider()) {
    return new ethers.Wallet(privateKey, provider);
}

async function deployMaintenanceContract(options = {}) {
    const provider = options.provider || createProvider();
    const wallet = options.wallet || createWallet(options.privateKey, provider);
    const artifact = loadArtifact();

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    const deploymentInfo = {
        contractName: 'AviationMaintenanceV2',
        address,
        chainId: DEFAULT_LOCAL_CHAIN_ID,
        rpcUrl: DEFAULT_LOCAL_RPC_URL,
        deployer: wallet.address,
        deployTxHash: contract.deploymentTransaction()?.hash || null,
        deployedAt: new Date().toISOString(),
    };

    const deploymentFilePath = getDeploymentFilePath();
    fs.mkdirSync(path.dirname(deploymentFilePath), { recursive: true });
    fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, null, 2));

    return { artifact, provider, wallet, contract, deploymentInfo };
}

function loadDeploymentInfo() {
    const deploymentFilePath = getDeploymentFilePath();
    if (!fs.existsSync(deploymentFilePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value);
}

function hashJson(value) {
    return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(value)));
}

module.exports = {
    DEFAULT_LOCAL_RPC_URL,
    DEFAULT_LOCAL_CHAIN_ID,
    DEFAULT_DEPLOYER_PRIVATE_KEY,
    canonicalJson,
    createProvider,
    createWallet,
    deployMaintenanceContract,
    hashJson,
    loadArtifact,
    loadDeploymentInfo,
};