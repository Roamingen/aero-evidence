const { ethers } = require('ethers');

const {
    createProvider,
    createWallet,
    deployMaintenanceContract,
    hashJson,
    loadArtifact,
    loadDeploymentInfo,
} = require('./chain_helpers');

const ROLE_TECHNICIAN = 0;
const ROLE_REVIEWER = 1;
const ROLE_RELEASE_AUTHORITY = 3;

const ACTION_TECHNICIAN_SIGN = 1;
const ACTION_REVIEWER_SIGN = 2;
const ACTION_RELEASE = 4;

const OFFCHAIN_SIGNER_PRIVATE_KEYS = {
    technicianTwo: '0x59c6995e998f97a5a0044966f094538e4c1f65c01dc5f2cb6f0b5c6f7f0b6f52',
    reviewerOne: '0x5de4111afa1a4b94908f831031f1415f4524f7b8d70d820ee7da8db36805b97d',
    reviewerTwo: '0x7c852118294266a7013c9a7bd2073b55f4d5a6d52d58a3b16130ad13fe7a7c09',
    releaseAuthority: '0x47e179ec1974887d8cffd4c04675f0d8e7f6f2f7d5a3d3f5b5d0c719cde7b4dd',
};

async function loadOrDeployContract() {
    const provider = createProvider();
    const wallet = createWallet(undefined, provider);
    const signer = new ethers.NonceManager(wallet);
    const artifact = loadArtifact();
    const deploymentInfo = loadDeploymentInfo();

    if (deploymentInfo?.address) {
        const contract = new ethers.Contract(deploymentInfo.address, artifact.abi, signer);
        return { provider, wallet, signer, contract, deploymentInfo };
    }

    const deployed = await deployMaintenanceContract({ provider, wallet });
    return {
        provider,
        wallet,
        signer,
        contract: new ethers.Contract(deployed.deploymentInfo.address, artifact.abi, signer),
        deploymentInfo: deployed.deploymentInfo,
    };
}

function buildFixture() {
    const recordCode = `REC-${Date.now()}`;
    const recordId = ethers.id(recordCode);

    const formPayload = {
        recordCode,
        aircraftRegNo: 'B-1234',
        aircraftType: 'A320',
        jobCardNo: 'JC-2026-0001',
        ataCode: '27-41',
        workType: '故障排查',
        locationCode: 'HGH-H1',
        workDescription: '执行副翼作动检查，完成线束紧固和功能复测。',
        referenceDocument: 'AMM 27-41-00 Rev.12',
    };

    const faultInfo = {
        faultCode: 'FIM-27-4101',
        faultDescription: '副翼控制响应迟缓',
    };

    const parts = [
        { role: 'used', partNumber: 'PN-AC-001', serialNumber: 'SN-001' },
        { role: 'installed', partNumber: 'PN-AC-002', serialNumber: 'SN-002' },
    ];

    const measurements = [
        { testItemName: '舵面偏转角', measuredValues: '18.2deg', isPass: true },
        { testItemName: '回中时间', measuredValues: '1.8s', isPass: true },
    ];

    const replacements = [
        {
            removedPartNo: 'PN-AC-OLD',
            removedSerialNo: 'SN-OLD',
            removedStatus: 'faulty',
            installedPartNo: 'PN-AC-NEW',
            installedSerialNo: 'SN-NEW',
            installedSource: 'warehouse',
            replacementReason: '功能异常更换',
        },
    ];

    const manifest = {
        recordCode,
        version: 1,
        attachments: [
            {
                attachmentId: 'DOC-001',
                type: 'document',
                fileName: 'job-card.pdf',
                mimeType: 'application/pdf',
                size: 245678,
                contentHash: ethers.id('job-card.pdf:245678'),
                storagePath: '2026/B-1234/' + recordCode + '/documents/DOC-001-job-card.pdf',
            },
            {
                attachmentId: 'IMG-001',
                type: 'image',
                fileName: 'fault-photo.jpg',
                mimeType: 'image/jpeg',
                size: 845221,
                contentHash: ethers.id('fault-photo.jpg:845221'),
                storagePath: '2026/B-1234/' + recordCode + '/images/IMG-001-fault-photo.jpg',
            },
        ],
    };

    return {
        recordCode,
        recordId,
        formPayload,
        faultInfo,
        parts,
        measurements,
        replacements,
        manifest,
    };
}

function buildSubmitInput(fixture) {
    const formHash = hashJson(fixture.formPayload);
    const faultHash = hashJson(fixture.faultInfo);
    const partsHash = hashJson(fixture.parts);
    const measurementsHash = hashJson(fixture.measurements);
    const replacementsHash = hashJson(fixture.replacements);
    const attachmentManifestHash = hashJson(fixture.manifest);

    return {
        input: {
            recordId: fixture.recordId,
            aircraftRegNo: fixture.formPayload.aircraftRegNo,
            aircraftType: fixture.formPayload.aircraftType,
            jobCardNo: fixture.formPayload.jobCardNo,
            revision: 1,
            ataCode: fixture.formPayload.ataCode,
            workType: fixture.formPayload.workType,
            locationCode: fixture.formPayload.locationCode,
            performerEmployeeNo: 'E1001',
            requiredTechnicianSignatures: 2,
            requiredReviewerSignatures: 2,
            isRII: false,
            occurrenceTime: Math.floor(Date.now() / 1000),
            digest: {
                formHash,
                faultHash,
                partsHash,
                measurementsHash,
                replacementsHash,
                attachmentManifestHash,
            },
            attachmentSummary: {
                manifestHash: attachmentManifestHash,
                attachmentCount: fixture.manifest.attachments.length,
                documentCount: 1,
                imageCount: 1,
                videoCount: 0,
                totalSize: fixture.manifest.attachments.reduce((sum, item) => sum + item.size, 0),
            },
        },
        hashes: {
            formHash,
            faultHash,
            partsHash,
            measurementsHash,
            replacementsHash,
            attachmentManifestHash,
        },
    };
}

async function signDigest(wallet, digest) {
    return wallet.signMessage(ethers.getBytes(digest));
}

function buildWorkflowDigest(recordCode, action, signerEmployeeNo, hashes) {
    return hashJson({
        recordCode,
        action,
        formHash: hashes.formHash,
        attachmentManifestHash: hashes.attachmentManifestHash,
        signerEmployeeNo,
    });
}

async function main() {
    const { wallet, contract, deploymentInfo } = await loadOrDeployContract();
    const fixture = buildFixture();
    const { input, hashes } = buildSubmitInput(fixture);

    const technicianTwoWallet = createWallet(OFFCHAIN_SIGNER_PRIVATE_KEYS.technicianTwo);
    const reviewerOneWallet = createWallet(OFFCHAIN_SIGNER_PRIVATE_KEYS.reviewerOne);
    const reviewerTwoWallet = createWallet(OFFCHAIN_SIGNER_PRIVATE_KEYS.reviewerTwo);
    const releaseAuthorityWallet = createWallet(OFFCHAIN_SIGNER_PRIVATE_KEYS.releaseAuthority);

    const submitDigest = buildWorkflowDigest(
        fixture.recordCode,
        'submit',
        'E1001',
        hashes
    );
    const submitSignature = await signDigest(wallet, submitDigest);

    const submitTx = await contract.submitRecord(
        input,
        'E1001',
        submitDigest,
        submitSignature
    );
    await submitTx.wait();

    const technicianTwoDigest = buildWorkflowDigest(
        fixture.recordCode,
        'technician_sign',
        'E1002',
        hashes
    );
    const technicianTwoSignature = await signDigest(
        technicianTwoWallet,
        technicianTwoDigest
    );
    const technicianTwoTx = await contract.recordApproval(
        fixture.recordId,
        ROLE_TECHNICIAN,
        ACTION_TECHNICIAN_SIGN,
        'E1002',
        technicianTwoDigest,
        technicianTwoSignature
    );
    await technicianTwoTx.wait();

    const reviewerOneDigest = buildWorkflowDigest(
        fixture.recordCode,
        'reviewer_sign',
        'E2001',
        hashes
    );
    const reviewerOneSignature = await signDigest(
        reviewerOneWallet,
        reviewerOneDigest
    );
    const reviewerOneTx = await contract.recordApproval(
        fixture.recordId,
        ROLE_REVIEWER,
        ACTION_REVIEWER_SIGN,
        'E2001',
        reviewerOneDigest,
        reviewerOneSignature
    );
    await reviewerOneTx.wait();

    const reviewerTwoDigest = buildWorkflowDigest(
        fixture.recordCode,
        'reviewer_sign',
        'E2002',
        hashes
    );
    const reviewerTwoSignature = await signDigest(
        reviewerTwoWallet,
        reviewerTwoDigest
    );
    const reviewerTwoTx = await contract.recordApproval(
        fixture.recordId,
        ROLE_REVIEWER,
        ACTION_REVIEWER_SIGN,
        'E2002',
        reviewerTwoDigest,
        reviewerTwoSignature
    );
    await reviewerTwoTx.wait();

    const releaseDigest = buildWorkflowDigest(
        fixture.recordCode,
        'release',
        'E3001',
        hashes
    );
    const releaseSignature = await signDigest(
        releaseAuthorityWallet,
        releaseDigest
    );

    const releaseTx = await contract.recordApproval(
        fixture.recordId,
        ROLE_RELEASE_AUTHORITY,
        ACTION_RELEASE,
        'E3001',
        releaseDigest,
        releaseSignature
    );
    await releaseTx.wait();

    const record = await contract.getRecord(fixture.recordId);
    const signatures = await contract.getSignatures(fixture.recordId);

    console.log(JSON.stringify({
        deployment: deploymentInfo,
        recordCode: fixture.recordCode,
        recordId: fixture.recordId,
        status: Number(record.core.status),
        aircraftRegNo: record.core.aircraftRegNo,
        jobCardNo: record.core.jobCardNo,
        requiredTechnicianSignatures: record.core.requiredTechnicianSignatures,
        requiredReviewerSignatures: record.core.requiredReviewerSignatures,
        technicianSignatureCount: record.core.technicianSignatureCount,
        reviewerSignatureCount: record.core.reviewerSignatureCount,
        digest: record.digest,
        attachmentSummary: record.attachmentSummary,
        signatureCount: signatures.length,
        signatureRoles: signatures.map((item) => Number(item.signerRole)),
        signatureActions: signatures.map((item) => Number(item.action)),
        signerAddresses: signatures.map((item) => item.signer),
    }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch((error) => {
    console.error('V2 冒烟测试失败:');
    console.error(error.message || error);
    process.exit(1);
});