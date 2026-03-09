// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AviationMaintenanceV2 {
    enum RecordStatus {
        Draft,
        Submitted,
        PeerChecked,
        RiiApproved,
        Released,
        Rejected,
        Revoked
    }

    enum SignatureRole {
        Technician,
        Reviewer,
        RiiInspector,
        ReleaseAuthority,
        SystemNode
    }

    enum SignatureAction {
        Submit,
        TechnicianSign,
        ReviewerSign,
        RiiApprove,
        Release,
        Reject,
        Revoke
    }

    struct RecordCore {
        bytes32 recordId;
        string aircraftRegNo;
        string aircraftType;
        string jobCardNo;
        uint32 revision;
        string ataCode;
        string workType;
        string locationCode;
        string performerEmployeeNo;
        uint16 requiredTechnicianSignatures;
        uint16 requiredReviewerSignatures;
        uint16 technicianSignatureCount;
        uint16 reviewerSignatureCount;
        bool isRII;
        uint64 occurrenceTime;
        uint64 createdAt;
        uint64 updatedAt;
        RecordStatus status;
    }

    struct RecordDigest {
        bytes32 formHash;
        bytes32 faultHash;
        bytes32 partsHash;
        bytes32 measurementsHash;
        bytes32 replacementsHash;
        bytes32 attachmentManifestHash;
    }

    struct AttachmentManifestSummary {
        bytes32 manifestHash;
        uint32 attachmentCount;
        uint32 documentCount;
        uint32 imageCount;
        uint32 videoCount;
        uint64 totalSize;
    }

    struct SignatureProof {
        SignatureRole signerRole;
        SignatureAction action;
        address signer;
        string signerEmployeeNo;
        bytes32 signedDigest;
        bytes32 signatureHash;
        uint64 signedAt;
    }

    struct MaintenanceRecord {
        RecordCore core;
        RecordDigest digest;
        AttachmentManifestSummary attachmentSummary;
        uint64 releasedAt;
        bool exists;
    }

    struct SubmitRecordInput {
        bytes32 recordId;
        string aircraftRegNo;
        string aircraftType;
        string jobCardNo;
        uint32 revision;
        string ataCode;
        string workType;
        string locationCode;
        string performerEmployeeNo;
        uint16 requiredTechnicianSignatures;
        uint16 requiredReviewerSignatures;
        bool isRII;
        uint64 occurrenceTime;
        RecordDigest digest;
        AttachmentManifestSummary attachmentSummary;
    }

    address public owner;
    mapping(address => bool) public authorizedNodes;
    address[] private authorizedNodeList;

    mapping(bytes32 => MaintenanceRecord) private records;
    mapping(bytes32 => SignatureProof[]) private recordSignatures;
    mapping(bytes32 => bytes32[]) private aircraftRecordIds;
    mapping(bytes32 => bytes32[]) private jobCardRecordIds;
    mapping(bytes32 => bytes32[]) private performerRecordIds;
    bytes32[] private allRecordIds;

    event NodeAuthorizationUpdated(address indexed node, bool authorized);
    event RecordSubmitted(
        bytes32 indexed recordId,
        string aircraftRegNo,
        string jobCardNo
    );
    event RecordStatusChanged(
        bytes32 indexed recordId,
        RecordStatus status,
        SignatureAction action,
        SignatureRole signerRole,
        address signer
    );
    event AttachmentManifestUpdated(
        bytes32 indexed recordId,
        bytes32 manifestHash,
        uint32 attachmentCount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier onlyAuthorizedNode() {
        require(authorizedNodes[msg.sender], "Not an authorized node");
        _;
    }

    modifier recordMustExist(bytes32 recordId) {
        require(records[recordId].exists, "Record not found");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedNodes[msg.sender] = true;
        authorizedNodeList.push(msg.sender);
    }

    function setNodeAuthorization(
        address node,
        bool status
    ) external onlyOwner {
        if (status) {
            if (!authorizedNodes[node]) {
                authorizedNodes[node] = true;
                authorizedNodeList.push(node);
                emit NodeAuthorizationUpdated(node, true);
            }
            return;
        }

        if (authorizedNodes[node]) {
            authorizedNodes[node] = false;
            for (
                uint256 index = 0;
                index < authorizedNodeList.length;
                index++
            ) {
                if (authorizedNodeList[index] == node) {
                    authorizedNodeList[index] = authorizedNodeList[
                        authorizedNodeList.length - 1
                    ];
                    authorizedNodeList.pop();
                    break;
                }
            }
            emit NodeAuthorizationUpdated(node, false);
        }
    }

    function getAuthorizedNodes() external view returns (address[] memory) {
        return authorizedNodeList;
    }

    function submitRecord(
        SubmitRecordInput calldata input,
        string calldata signerEmployeeNo,
        bytes32 signedDigest,
        bytes calldata signature
    ) external onlyAuthorizedNode {
        require(!records[input.recordId].exists, "Record already exists");
        require(input.recordId != bytes32(0), "recordId is required");
        require(
            input.requiredTechnicianSignatures >= 1,
            "At least one technician signature is required"
        );

        SignatureProof memory proof = _buildSignatureProof(
            SignatureRole.Technician,
            SignatureAction.Submit,
            signerEmployeeNo,
            signedDigest,
            signature
        );

        MaintenanceRecord storage record = records[input.recordId];
        record.core = RecordCore({
            recordId: input.recordId,
            aircraftRegNo: input.aircraftRegNo,
            aircraftType: input.aircraftType,
            jobCardNo: input.jobCardNo,
            revision: input.revision,
            ataCode: input.ataCode,
            workType: input.workType,
            locationCode: input.locationCode,
            performerEmployeeNo: input.performerEmployeeNo,
            requiredTechnicianSignatures: input.requiredTechnicianSignatures,
            requiredReviewerSignatures: input.requiredReviewerSignatures,
            technicianSignatureCount: 1,
            reviewerSignatureCount: 0,
            isRII: input.isRII,
            occurrenceTime: input.occurrenceTime,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            status: RecordStatus.Submitted
        });
        record.digest = input.digest;
        record.attachmentSummary = input.attachmentSummary;
        record.exists = true;

        recordSignatures[input.recordId].push(proof);
        allRecordIds.push(input.recordId);
        aircraftRecordIds[_hashKey(input.aircraftRegNo)].push(input.recordId);
        jobCardRecordIds[_hashKey(input.jobCardNo)].push(input.recordId);
        performerRecordIds[_hashKey(input.performerEmployeeNo)].push(
            input.recordId
        );

        emit RecordSubmitted(
            input.recordId,
            input.aircraftRegNo,
            input.jobCardNo
        );
        emit RecordStatusChanged(
            input.recordId,
            RecordStatus.Submitted,
            SignatureAction.Submit,
            SignatureRole.Technician,
            proof.signer
        );
    }

    function recordApproval(
        bytes32 recordId,
        SignatureRole signerRole,
        SignatureAction action,
        string calldata signerEmployeeNo,
        bytes32 signedDigest,
        bytes calldata signature
    ) external onlyAuthorizedNode recordMustExist(recordId) {
        require(
            action != SignatureAction.Submit,
            "Use submitRecord for submit action"
        );

        MaintenanceRecord storage record = records[recordId];
        _assertRoleMatchesAction(signerRole, action);

        SignatureProof memory proof = _buildSignatureProof(
            signerRole,
            action,
            signerEmployeeNo,
            signedDigest,
            signature
        );
        _assertNoDuplicateSignature(recordId, action, proof.signer);

        uint16 nextTechnicianCount = record.core.technicianSignatureCount;
        uint16 nextReviewerCount = record.core.reviewerSignatureCount;
        if (action == SignatureAction.TechnicianSign) {
            nextTechnicianCount += 1;
        }
        if (action == SignatureAction.ReviewerSign) {
            nextReviewerCount += 1;
        }

        RecordStatus nextStatus = _nextStatus(
            record.core.status,
            record.core.isRII,
            action,
            nextTechnicianCount,
            record.core.requiredTechnicianSignatures,
            nextReviewerCount,
            record.core.requiredReviewerSignatures
        );

        recordSignatures[recordId].push(proof);
        record.core.technicianSignatureCount = nextTechnicianCount;
        record.core.reviewerSignatureCount = nextReviewerCount;
        record.core.status = nextStatus;
        record.core.updatedAt = uint64(block.timestamp);
        if (action == SignatureAction.Release) {
            record.releasedAt = uint64(block.timestamp);
        }

        emit RecordStatusChanged(
            recordId,
            nextStatus,
            action,
            signerRole,
            proof.signer
        );
    }

    function updateAttachmentManifest(
        bytes32 recordId,
        AttachmentManifestSummary calldata attachmentSummary,
        bytes32 attachmentManifestHash
    ) external onlyAuthorizedNode recordMustExist(recordId) {
        MaintenanceRecord storage record = records[recordId];
        record.attachmentSummary = attachmentSummary;
        record.digest.attachmentManifestHash = attachmentManifestHash;
        record.core.updatedAt = uint64(block.timestamp);

        emit AttachmentManifestUpdated(
            recordId,
            attachmentManifestHash,
            attachmentSummary.attachmentCount
        );
    }

    function getRecord(
        bytes32 recordId
    )
        external
        view
        recordMustExist(recordId)
        returns (MaintenanceRecord memory)
    {
        return records[recordId];
    }

    function getSignatures(
        bytes32 recordId
    )
        external
        view
        recordMustExist(recordId)
        returns (SignatureProof[] memory)
    {
        return recordSignatures[recordId];
    }

    function getRecordIdsByAircraft(
        string calldata aircraftRegNo
    ) external view returns (bytes32[] memory) {
        return aircraftRecordIds[_hashKey(aircraftRegNo)];
    }

    function getRecordIdsByJobCard(
        string calldata jobCardNo
    ) external view returns (bytes32[] memory) {
        return jobCardRecordIds[_hashKey(jobCardNo)];
    }

    function getRecordIdsByPerformer(
        string calldata performerEmployeeNo
    ) external view returns (bytes32[] memory) {
        return performerRecordIds[_hashKey(performerEmployeeNo)];
    }

    function getRecordCount() external view returns (uint256) {
        return allRecordIds.length;
    }

    function _buildSignatureProof(
        SignatureRole signerRole,
        SignatureAction action,
        string calldata signerEmployeeNo,
        bytes32 signedDigest,
        bytes calldata signature
    ) internal view returns (SignatureProof memory) {
        require(signature.length == 65, "Invalid signature length");

        address recoveredSigner = _recoverEthSignedMessageSigner(
            signedDigest,
            signature
        );
        require(recoveredSigner != address(0), "Invalid signature");

        return
            SignatureProof({
                signerRole: signerRole,
                action: action,
                signer: recoveredSigner,
                signerEmployeeNo: signerEmployeeNo,
                signedDigest: signedDigest,
                signatureHash: keccak256(signature),
                signedAt: uint64(block.timestamp)
            });
    }

    function _nextStatus(
        RecordStatus currentStatus,
        bool isRII,
        SignatureAction action,
        uint16 technicianSignatureCount,
        uint16 requiredTechnicianSignatures,
        uint16 reviewerSignatureCount,
        uint16 requiredReviewerSignatures
    ) internal pure returns (RecordStatus) {
        if (action == SignatureAction.TechnicianSign) {
            require(
                currentStatus == RecordStatus.Submitted ||
                    currentStatus == RecordStatus.PeerChecked,
                "Technician co-sign not allowed"
            );
            return currentStatus;
        }

        if (action == SignatureAction.ReviewerSign) {
            require(
                currentStatus == RecordStatus.Submitted ||
                    currentStatus == RecordStatus.PeerChecked,
                "Reviewer sign not allowed"
            );
            return RecordStatus.PeerChecked;
        }

        if (action == SignatureAction.RiiApprove) {
            require(isRII, "RII approval not required");
            require(
                currentStatus == RecordStatus.Submitted ||
                    currentStatus == RecordStatus.PeerChecked,
                "RII approval not allowed"
            );
            require(
                technicianSignatureCount >= requiredTechnicianSignatures,
                "Not enough technician signatures"
            );
            require(
                reviewerSignatureCount >= requiredReviewerSignatures,
                "Not enough reviewer signatures"
            );
            return RecordStatus.RiiApproved;
        }

        if (action == SignatureAction.Release) {
            require(
                technicianSignatureCount >= requiredTechnicianSignatures,
                "Not enough technician signatures"
            );
            require(
                reviewerSignatureCount >= requiredReviewerSignatures,
                "Not enough reviewer signatures"
            );
            if (isRII) {
                require(
                    currentStatus == RecordStatus.RiiApproved,
                    "Release requires RII approval"
                );
            } else {
                require(
                    currentStatus == RecordStatus.Submitted ||
                        currentStatus == RecordStatus.PeerChecked,
                    "Release not allowed"
                );
            }
            return RecordStatus.Released;
        }

        if (action == SignatureAction.Reject) {
            require(
                currentStatus != RecordStatus.Released &&
                    currentStatus != RecordStatus.Revoked,
                "Reject not allowed"
            );
            return RecordStatus.Rejected;
        }

        if (action == SignatureAction.Revoke) {
            require(
                currentStatus == RecordStatus.Released,
                "Revoke only allowed after release"
            );
            return RecordStatus.Revoked;
        }

        revert("Unsupported action");
    }

    function _assertRoleMatchesAction(
        SignatureRole signerRole,
        SignatureAction action
    ) internal pure {
        if (action == SignatureAction.TechnicianSign) {
            require(
                signerRole == SignatureRole.Technician,
                "TechnicianSign requires Technician role"
            );
            return;
        }

        if (action == SignatureAction.ReviewerSign) {
            require(
                signerRole == SignatureRole.Reviewer,
                "ReviewerSign requires Reviewer role"
            );
            return;
        }

        if (action == SignatureAction.RiiApprove) {
            require(
                signerRole == SignatureRole.RiiInspector,
                "RiiApprove requires RiiInspector role"
            );
            return;
        }

        if (action == SignatureAction.Release) {
            require(
                signerRole == SignatureRole.ReleaseAuthority,
                "Release requires ReleaseAuthority role"
            );
            return;
        }

        if (action == SignatureAction.Reject) {
            require(
                signerRole == SignatureRole.Reviewer ||
                    signerRole == SignatureRole.RiiInspector ||
                    signerRole == SignatureRole.ReleaseAuthority,
                "Reject requires reviewer-side role"
            );
            return;
        }

        if (action == SignatureAction.Revoke) {
            require(
                signerRole == SignatureRole.ReleaseAuthority ||
                    signerRole == SignatureRole.SystemNode,
                "Revoke requires release or system role"
            );
        }
    }

    function _assertNoDuplicateSignature(
        bytes32 recordId,
        SignatureAction action,
        address signer
    ) internal view {
        SignatureProof[] storage proofs = recordSignatures[recordId];
        for (uint256 index = 0; index < proofs.length; index++) {
            require(
                !(proofs[index].action == action &&
                    proofs[index].signer == signer),
                "Signer already used this action"
            );
        }
    }

    function _recoverEthSignedMessageSigner(
        bytes32 digest,
        bytes calldata signature
    ) internal pure returns (address) {
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            return address(0);
        }

        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    function _hashKey(string memory value) internal pure returns (bytes32) {
        return keccak256(bytes(value));
    }
}
