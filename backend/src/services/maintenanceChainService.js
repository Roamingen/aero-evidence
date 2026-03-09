const { ethers } = require('ethers');
const {
    createProvider,
    createWallet,
    loadArtifact,
    loadDeploymentInfo,
} = require('../../scripts/chain_helpers');

const STATUS_BY_ENUM = [
    'draft',
    'submitted',
    'peer_checked',
    'rii_approved',
    'released',
    'rejected',
    'revoked',
];

const SIGNER_ROLE_TO_ENUM = {
    technician: 0,
    reviewer: 1,
    rii_inspector: 2,
    release_authority: 3,
    system_node: 4,
};

const SIGNATURE_ACTION_TO_ENUM = {
    technician_sign: 1,
    reviewer_sign: 2,
    rii_approve: 3,
    release: 4,
    reject: 5,
    revoke: 6,
};

function createError(message, statusCode = 500) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function getContract() {
    const deploymentInfo = loadDeploymentInfo();
    if (!deploymentInfo || !deploymentInfo.address) {
        throw createError('未找到 maintenance V2 合约部署信息，请先执行 npm run chain:deploy:v2', 503);
    }

    const artifact = loadArtifact();
    const provider = createProvider();
    const code = await provider.getCode(deploymentInfo.address);
    if (!code || code === '0x') {
        throw createError(
            '本地链上未找到 maintenance V2 合约字节码。Hardhat 节点可能已重启，请重新执行 npm run chain:deploy:v2',
            503
        );
    }

    const wallet = createWallet(undefined, provider);
    const signer = new ethers.NonceManager(wallet);
    const contract = new ethers.Contract(deploymentInfo.address, artifact.abi, signer);
    return { contract, deploymentInfo };
}

function mapChainRecord(record) {
    return {
        status: STATUS_BY_ENUM[Number(record.core.status)],
        technicianSignatureCount: Number(record.core.technicianSignatureCount),
        reviewerSignatureCount: Number(record.core.reviewerSignatureCount),
        releasedAt: Number(record.releasedAt || 0),
    };
}

async function submitRecord(input, signerEmployeeNo, signedDigest, signature) {
    const { contract } = await getContract();
    const tx = await contract.submitRecord(input, signerEmployeeNo, signedDigest, signature);
    const receipt = await tx.wait();
    let chainRecord;
    try {
        chainRecord = await contract.getRecord(input.recordId);
    } catch (error) {
        if (error?.code === 'BAD_DATA') {
            throw createError('链上提交交易已发送，但未能读取记录详情，请检查本地合约部署和 ABI 是否匹配', 502);
        }
        throw error;
    }

    return {
        txHash: tx.hash,
        blockNumber: Number(receipt.blockNumber),
        chainRecord: mapChainRecord(chainRecord),
    };
}

async function appendSignature(recordId, signerRole, action, signerEmployeeNo, signedDigest, signature) {
    const { contract } = await getContract();
    const signerRoleEnum = SIGNER_ROLE_TO_ENUM[signerRole];
    const actionEnum = SIGNATURE_ACTION_TO_ENUM[action];
    if (signerRoleEnum == null) {
        throw createError(`不支持的 signerRole: ${signerRole}`, 400);
    }
    if (actionEnum == null) {
        throw createError(`不支持的 action: ${action}`, 400);
    }

    const tx = await contract.recordApproval(
        recordId,
        signerRoleEnum,
        actionEnum,
        signerEmployeeNo,
        signedDigest,
        signature
    );
    const receipt = await tx.wait();
    let chainRecord;
    try {
        chainRecord = await contract.getRecord(recordId);
    } catch (error) {
        if (error?.code === 'BAD_DATA') {
            throw createError('链上签名交易已发送，但未能读取记录详情，请检查本地合约部署和 ABI 是否匹配', 502);
        }
        throw error;
    }

    return {
        txHash: tx.hash,
        blockNumber: Number(receipt.blockNumber),
        chainRecord: mapChainRecord(chainRecord),
    };
}

module.exports = {
    appendSignature,
    submitRecord,
};