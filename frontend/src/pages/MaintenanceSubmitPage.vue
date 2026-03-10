<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ethers } from 'ethers';

import { useAuthSession } from '../stores/authSession';
import { buildApiUrl } from '../utils/apiBase';
import { parseJsonResponse } from '../utils/http';
import { createWalletFromPrivateKey } from '../utils/wallet';

const auth = useAuthSession();

const attachmentTypeOptions = [
  { label: '文档', value: 'document' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '其他', value: 'other' },
];

const signerRoleOptions = [
  { label: '额外技术签名人', value: 'technician' },
  { label: '审核签名人', value: 'reviewer' },
  { label: 'RII 检查员', value: 'rii_inspector' },
  { label: '放行授权人', value: 'release_authority' },
];

function toLocalDateTimeInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createPartRow() {
  return {
    partRole: 'used',
    partNumber: '',
    serialNumber: '',
    partStatus: '',
    sourceDescription: '',
    replacementReason: '',
  };
}

function createMeasurementRow() {
  return {
    testItemName: '',
    measuredValues: '',
    isPass: true,
  };
}

function createReplacementRow() {
  return {
    removedPartNo: '',
    removedSerialNo: '',
    removedStatus: '',
    installedPartNo: '',
    installedSerialNo: '',
    installedSource: '',
    replacementReason: '',
  };
}

function createAttachmentRow() {
  return {
    attachmentId: '',
    attachmentType: 'document',
    categoryCode: '',
    fileName: '',
    originalFileName: '',
    mimeType: '',
    fileExtension: '',
    fileSize: 0,
    contentHash: '',
    thumbnailHash: '',
    storageDisk: 'local',
    storagePath: '',
    previewPath: '',
    transcodedPath: '',
    uploadStatus: 'ready',
    uploadedAt: toLocalDateTimeInputValue(),
  };
}

function createSpecifiedSignerRow() {
  return {
    signerRole: 'reviewer',
    employeeNo: '',
    isRequired: true,
    sequenceNo: 0,
  };
}

function createInitialMaintenanceForm() {
  return {
    aircraftRegNo: '',
    aircraftType: '',
    ataCode: '',
    workType: '',
    locationCode: '',
    requiredTechnicianSignatures: 1,
    requiredReviewerSignatures: 1,
    isRII: false,
    occurrenceTime: toLocalDateTimeInputValue(),
    payload: {
      workDescription: '',
      referenceDocument: '',
      faultCode: '',
      faultDescription: '',
    },
    parts: [],
    measurements: [],
    replacements: [],
    manifestVersion: 1,
    attachments: [],
    specifiedSigners: [],
    confirmationPrivateKey: '',
  };
}

const maintenanceForm = ref(createInitialMaintenanceForm());
const maintenancePreparing = ref(false);
const maintenanceLoading = ref(false);
const maintenanceDraft = ref(null);
const maintenanceResult = ref(null);
const preparedSubmission = ref(null);

const currentUser = computed(() => auth.latestLoggedInUser.value);

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function assertRequiredString(value, label) {
  if (!normalizeString(value)) {
    throw new Error(`${label}不能为空`);
  }
}

function assertNonNegativeInteger(value, label, defaultValue = 0) {
  const parsed = value === '' || value == null ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label}必须是非负整数`);
  }
  return parsed;
}

function addRow(collectionName, factory) {
  maintenanceForm.value[collectionName].push(factory());
}

function removeRow(collectionName, index) {
  maintenanceForm.value[collectionName].splice(index, 1);
}

function buildNormalizedAttachments() {
  return maintenanceForm.value.attachments
    .filter((attachment) => [attachment.attachmentId, attachment.fileName, attachment.storagePath].some((value) => normalizeString(value)))
    .map((attachment, index) => {
      assertRequiredString(attachment.attachmentId, `附件 ${index + 1} attachmentId`);
      assertRequiredString(attachment.fileName, `附件 ${index + 1} fileName`);
      assertRequiredString(attachment.mimeType, `附件 ${index + 1} mimeType`);
      assertRequiredString(attachment.storagePath, `附件 ${index + 1} storagePath`);

      const fileSize = assertNonNegativeInteger(attachment.fileSize, `附件 ${index + 1} fileSize`, 0);
      const derivedContentHash = normalizeString(attachment.contentHash)
        || ethers.id(`${normalizeString(attachment.attachmentId)}:${normalizeString(attachment.fileName)}:${fileSize}`);

      return {
        attachmentId: normalizeString(attachment.attachmentId),
        attachmentType: normalizeString(attachment.attachmentType) || 'document',
        categoryCode: normalizeOptionalString(attachment.categoryCode),
        fileName: normalizeString(attachment.fileName),
        originalFileName: normalizeOptionalString(attachment.originalFileName),
        mimeType: normalizeString(attachment.mimeType),
        fileExtension: normalizeOptionalString(attachment.fileExtension),
        fileSize,
        contentHash: derivedContentHash,
        thumbnailHash: normalizeOptionalString(attachment.thumbnailHash),
        storageDisk: normalizeString(attachment.storageDisk) || 'local',
        storagePath: normalizeString(attachment.storagePath),
        previewPath: normalizeOptionalString(attachment.previewPath),
        transcodedPath: normalizeOptionalString(attachment.transcodedPath),
        uploadStatus: normalizeString(attachment.uploadStatus) || 'ready',
        uploadedAt: new Date(attachment.uploadedAt || new Date()).toISOString(),
      };
    });
}

function buildNormalizedParts() {
  return maintenanceForm.value.parts.map((part, index) => {
    assertRequiredString(part.partRole, `部件 ${index + 1} partRole`);
    assertRequiredString(part.partNumber, `部件 ${index + 1} partNumber`);
    return {
      partRole: normalizeString(part.partRole).toLowerCase(),
      partNumber: normalizeString(part.partNumber),
      serialNumber: normalizeOptionalString(part.serialNumber),
      partStatus: normalizeOptionalString(part.partStatus),
      sourceDescription: normalizeOptionalString(part.sourceDescription),
      replacementReason: normalizeOptionalString(part.replacementReason),
      sortOrder: index,
    };
  });
}

function buildNormalizedMeasurements() {
  return maintenanceForm.value.measurements.map((measurement, index) => {
    assertRequiredString(measurement.testItemName, `测量项 ${index + 1} testItemName`);
    return {
      testItemName: normalizeString(measurement.testItemName),
      measuredValues: normalizeOptionalString(measurement.measuredValues),
      isPass: Boolean(measurement.isPass),
      sortOrder: index,
    };
  });
}

function buildNormalizedReplacements() {
  return maintenanceForm.value.replacements.map((replacement, index) => ({
    removedPartNo: normalizeOptionalString(replacement.removedPartNo),
    removedSerialNo: normalizeOptionalString(replacement.removedSerialNo),
    removedStatus: normalizeOptionalString(replacement.removedStatus),
    installedPartNo: normalizeOptionalString(replacement.installedPartNo),
    installedSerialNo: normalizeOptionalString(replacement.installedSerialNo),
    installedSource: normalizeOptionalString(replacement.installedSource),
    replacementReason: normalizeOptionalString(replacement.replacementReason),
    sortOrder: index,
  }));
}

function buildSpecifiedSigners() {
  return maintenanceForm.value.specifiedSigners
    .filter((item) => normalizeString(item.employeeNo))
    .map((item, index) => ({
      signerRole: normalizeString(item.signerRole),
      employeeNo: normalizeString(item.employeeNo),
      isRequired: item.isRequired == null ? true : Boolean(item.isRequired),
      sequenceNo: assertNonNegativeInteger(item.sequenceNo, `指定签名人 ${index + 1} sequenceNo`, index),
    }));
}

function buildSubmitPayload() {
  assertRequiredString(maintenanceForm.value.aircraftRegNo, '飞机注册号');
  assertRequiredString(maintenanceForm.value.aircraftType, '机型');
  assertRequiredString(maintenanceForm.value.ataCode, 'ATA');
  assertRequiredString(maintenanceForm.value.workType, '工作类型');
  assertRequiredString(maintenanceForm.value.payload.workDescription, '工作描述');

  return {
    aircraftRegNo: normalizeString(maintenanceForm.value.aircraftRegNo),
    aircraftType: normalizeString(maintenanceForm.value.aircraftType),
    ataCode: normalizeString(maintenanceForm.value.ataCode),
    workType: normalizeString(maintenanceForm.value.workType),
    locationCode: normalizeOptionalString(maintenanceForm.value.locationCode),
    requiredTechnicianSignatures: Math.max(1, assertNonNegativeInteger(maintenanceForm.value.requiredTechnicianSignatures, '技术签名数', 1)),
    requiredReviewerSignatures: Math.max(1, assertNonNegativeInteger(maintenanceForm.value.requiredReviewerSignatures, '审核签名数', 1)),
    isRII: Boolean(maintenanceForm.value.isRII),
    occurrenceTime: new Date(maintenanceForm.value.occurrenceTime || new Date()).toISOString(),
    payload: {
      workDescription: normalizeString(maintenanceForm.value.payload.workDescription),
      referenceDocument: normalizeOptionalString(maintenanceForm.value.payload.referenceDocument),
      faultCode: normalizeOptionalString(maintenanceForm.value.payload.faultCode),
      faultDescription: normalizeOptionalString(maintenanceForm.value.payload.faultDescription),
    },
    parts: buildNormalizedParts(),
    measurements: buildNormalizedMeasurements(),
    replacements: buildNormalizedReplacements(),
    specifiedSigners: buildSpecifiedSigners(),
    manifest: {
      version: Math.max(1, assertNonNegativeInteger(maintenanceForm.value.manifestVersion, 'manifestVersion', 1)),
      generatedAt: new Date().toISOString(),
      attachments: buildNormalizedAttachments(),
    },
  };
}

async function requestPreparedMaintenance(forceRefresh = false) {
  if (!auth.isLoggedIn.value || !auth.loginResult.value?.token) {
    throw new Error('请先完成登录');
  }

  const confirmationWallet = createWalletFromPrivateKey(maintenanceForm.value.confirmationPrivateKey || auth.loginForm.value.privateKey);
  if (!forceRefresh && preparedSubmission.value) {
    return { prepared: preparedSubmission.value, confirmationWallet };
  }

  const response = await fetch(buildApiUrl('/api/maintenance/records/prepare'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.loginResult.value.token}`,
    },
    body: JSON.stringify(buildSubmitPayload()),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.message || '生成签名前上下文失败');
  }

  preparedSubmission.value = data;
  return { prepared: data, confirmationWallet };
}

async function handlePrepareMaintenance() {
  try {
    maintenancePreparing.value = true;
    const { prepared } = await requestPreparedMaintenance(true);
    maintenanceDraft.value = {
      ...prepared.preview,
      requestBody: prepared.requestBody,
      specifiedSigners: prepared.requestBody.specifiedSigners,
    };
    ElMessage.success('已生成服务端签名前预览');
  } catch (error) {
    ElMessage.error(error.message || '生成签名前预览失败');
  } finally {
    maintenancePreparing.value = false;
  }
}

async function handleSubmitMaintenance() {
  try {
    maintenanceLoading.value = true;
    maintenanceResult.value = null;

    const { prepared, confirmationWallet } = await requestPreparedMaintenance(false);
    const signature = await confirmationWallet.signMessage(ethers.getBytes(prepared.signedDigest));
    maintenanceDraft.value = {
      ...prepared.preview,
      requestBody: prepared.requestBody,
      specifiedSigners: prepared.requestBody.specifiedSigners,
      signature,
    };

    const response = await fetch(buildApiUrl('/api/maintenance/records'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.loginResult.value.token}`,
      },
      body: JSON.stringify({
        ...prepared.requestBody,
        signedDigest: prepared.signedDigest,
        signature,
      }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.message || '检修记录提交失败');
    }

    maintenanceResult.value = data;
    ElMessage.success('检修记录已提交');
  } catch (error) {
    ElMessage.error(error.message || '检修记录提交失败');
  } finally {
    maintenanceLoading.value = false;
  }
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

watch(() => maintenanceForm.value, () => {
  preparedSubmission.value = null;
  maintenanceDraft.value = null;
}, { deep: true });

watch(() => auth.loginForm.value.privateKey, (privateKey) => {
  if (!maintenanceForm.value.confirmationPrivateKey) {
    maintenanceForm.value.confirmationPrivateKey = privateKey || '';
  }
}, { immediate: true });
</script>

<template>
  <div v-if="!auth.isLoggedIn.value" class="result-block">
    <el-alert
      type="warning"
      :closable="false"
      title="请先完成登录"
      description="当前页依赖 JWT 和当前登录用户的私钥签名。先去认证页登录，再回来提交检修记录。"
    />
    <div class="button-row top-gap">
      <RouterLink to="/auth" class="page-nav-link inline-nav-link">前往认证页</RouterLink>
    </div>
  </div>

  <div v-else class="maintenance-stack">
    <section class="module-panel maintenance-hero-panel">
      <div class="module-header-row">
        <div>
          <div class="module-title">新建检修记录</div>
          <div class="module-subtitle">面向实际业务后台的录入入口。保留真实提交链路，但页面组织改成后台模块风格。</div>
        </div>
        <div class="filter-pills">
          <span class="filter-pill is-active">实时提交</span>
          <span class="filter-pill">草稿模式</span>
          <span class="filter-pill">模板导入</span>
        </div>
      </div>

      <div class="workspace-summary-grid">
        <article class="summary-card">
          <div class="summary-label">当前提交人</div>
          <div class="summary-value">{{ currentUser?.employeeNo || '未登录' }}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">审核门槛</div>
          <div class="summary-value">{{ maintenanceForm.requiredReviewerSignatures }} 人</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">指定签名</div>
          <div class="summary-value">{{ maintenanceForm.specifiedSigners.length }} 项</div>
        </article>
      </div>
    </section>

    <div class="status-strip">
      <div class="status-pill">
        <span class="status-key">当前工号</span>
        <span class="status-value">{{ currentUser?.employeeNo }}</span>
      </div>
      <div class="status-pill wide-pill">
        <span class="status-key">当前地址</span>
        <span class="status-value mono">{{ currentUser?.address }}</span>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">基础信息</div>
          <div class="section-subtitle">只填业务字段。recordId、内部工卡号和执行人信息由后端自动生成。</div>
        </div>
      </div>

      <div class="hint-panel">
        <div class="hint-line">提交时必须使用当前登录人私钥再次签名，作为本人确认提交。</div>
        <div class="hint-line">如果填写了指定签名人，后续只有名单内人员才能完成对应角色的签名。</div>
      </div>

      <el-form label-position="top">
        <div class="form-grid two-col">
          <el-form-item label="飞机注册号">
            <el-input v-model="maintenanceForm.aircraftRegNo" placeholder="例：B-4321" />
          </el-form-item>
          <el-form-item label="机型">
            <el-input v-model="maintenanceForm.aircraftType" placeholder="例：Airbus A320-200" />
          </el-form-item>
        </div>

        <div class="form-grid two-col">
          <el-form-item label="ATA 章节">
            <el-input v-model="maintenanceForm.ataCode" placeholder="例：32-11" />
          </el-form-item>
          <el-form-item label="工作类型">
            <el-input v-model="maintenanceForm.workType" placeholder="例：功能检查" />
          </el-form-item>
        </div>

        <div class="form-grid two-col">
          <el-form-item label="维修位置">
            <el-input v-model="maintenanceForm.locationCode" placeholder="例如 HGH-H2" />
          </el-form-item>
          <el-form-item label="发生时间">
            <el-input v-model="maintenanceForm.occurrenceTime" type="datetime-local" />
          </el-form-item>
        </div>

        <div class="form-grid three-col">
          <el-form-item label="技术签名数">
            <el-input-number v-model="maintenanceForm.requiredTechnicianSignatures" :min="1" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="审核签名数">
            <el-input-number v-model="maintenanceForm.requiredReviewerSignatures" :min="1" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="是否 RII">
            <div class="switch-wrap">
              <el-switch v-model="maintenanceForm.isRII" />
            </div>
          </el-form-item>
        </div>

        <el-form-item label="工作描述">
          <el-input v-model="maintenanceForm.payload.workDescription" type="textarea" :rows="4" resize="none" />
        </el-form-item>

        <div class="form-grid two-col">
          <el-form-item label="参考手册">
            <el-input v-model="maintenanceForm.payload.referenceDocument" />
          </el-form-item>
          <el-form-item label="故障代码">
            <el-input v-model="maintenanceForm.payload.faultCode" />
          </el-form-item>
        </div>

        <el-form-item label="故障描述">
          <el-input v-model="maintenanceForm.payload.faultDescription" type="textarea" :rows="3" resize="none" />
        </el-form-item>

        <el-form-item label="提交确认私钥">
          <el-input
            v-model="maintenanceForm.confirmationPrivateKey"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="再次输入当前登录账户私钥，提交时将用它签名确认本人"
            show-password
          />
        </el-form-item>
      </el-form>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">指定签名人员</div>
          <div class="section-subtitle">当前版本通过工号指定。留空则表示该角色仍按普通权限池处理。</div>
        </div>
        <el-button @click="addRow('specifiedSigners', createSpecifiedSignerRow)">新增指定签名人</el-button>
      </div>

      <div v-if="maintenanceForm.specifiedSigners.length === 0" class="empty-inline-state">
        暂无指定签名人。默认只有提交人用私钥确认本人，后续签名仍由具备权限的用户完成。
      </div>

      <div v-for="(signer, index) in maintenanceForm.specifiedSigners" :key="`signer-${index}`" class="inline-card">
        <div class="section-title-row compact-row">
          <div class="mini-title">签名人 {{ index + 1 }}</div>
          <el-button text type="danger" @click="removeRow('specifiedSigners', index)">删除</el-button>
        </div>

        <div class="form-grid three-col">
          <el-form-item label="角色">
            <el-select v-model="signer.signerRole" style="width: 100%">
              <el-option v-for="option in signerRoleOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="工号">
            <el-input v-model="signer.employeeNo" placeholder="例如 E2001" />
          </el-form-item>
          <el-form-item label="顺序号">
            <el-input-number v-model="signer.sequenceNo" :min="0" :step="1" style="width: 100%" />
          </el-form-item>
        </div>

        <el-form-item label="是否必签">
          <div class="switch-wrap">
            <el-switch v-model="signer.isRequired" />
          </div>
        </el-form-item>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">部件信息</div>
          <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
        </div>
        <el-button @click="addRow('parts', createPartRow)">新增部件</el-button>
      </div>

      <div v-if="maintenanceForm.parts.length === 0" class="empty-inline-state">暂无部件条目。</div>

      <div v-for="(part, index) in maintenanceForm.parts" :key="`part-${index}`" class="inline-card">
        <div class="section-title-row compact-row">
          <div class="mini-title">部件 {{ index + 1 }}</div>
          <el-button text type="danger" @click="removeRow('parts', index)">删除</el-button>
        </div>
        <div class="form-grid three-col">
          <el-form-item label="角色">
            <el-input v-model="part.partRole" placeholder="used / removed / installed" />
          </el-form-item>
          <el-form-item label="件号">
            <el-input v-model="part.partNumber" />
          </el-form-item>
          <el-form-item label="序列号">
            <el-input v-model="part.serialNumber" />
          </el-form-item>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">测量信息</div>
          <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
        </div>
        <el-button @click="addRow('measurements', createMeasurementRow)">新增测量项</el-button>
      </div>

      <div v-if="maintenanceForm.measurements.length === 0" class="empty-inline-state">暂无测量条目。</div>

      <div v-for="(measurement, index) in maintenanceForm.measurements" :key="`measurement-${index}`" class="inline-card">
        <div class="section-title-row compact-row">
          <div class="mini-title">测量项 {{ index + 1 }}</div>
          <el-button text type="danger" @click="removeRow('measurements', index)">删除</el-button>
        </div>
        <div class="form-grid three-col">
          <el-form-item label="测试项名称">
            <el-input v-model="measurement.testItemName" />
          </el-form-item>
          <el-form-item label="测量值">
            <el-input v-model="measurement.measuredValues" />
          </el-form-item>
          <el-form-item label="是否通过">
            <div class="switch-wrap">
              <el-switch v-model="measurement.isPass" />
            </div>
          </el-form-item>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">替换信息</div>
          <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
        </div>
        <el-button @click="addRow('replacements', createReplacementRow)">新增替换项</el-button>
      </div>

      <div v-if="maintenanceForm.replacements.length === 0" class="empty-inline-state">暂无替换条目。</div>

      <div v-for="(replacement, index) in maintenanceForm.replacements" :key="`replacement-${index}`" class="inline-card">
        <div class="section-title-row compact-row">
          <div class="mini-title">替换项 {{ index + 1 }}</div>
          <el-button text type="danger" @click="removeRow('replacements', index)">删除</el-button>
        </div>
        <div class="form-grid two-col">
          <el-form-item label="拆下件号">
            <el-input v-model="replacement.removedPartNo" />
          </el-form-item>
          <el-form-item label="装上件号">
            <el-input v-model="replacement.installedPartNo" />
          </el-form-item>
        </div>

        <el-form-item label="替换原因">
          <el-input v-model="replacement.replacementReason" />
        </el-form-item>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title-row">
        <div>
          <div class="section-title">附件清单</div>
          <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
        </div>
        <el-button @click="addRow('attachments', createAttachmentRow)">新增附件</el-button>
      </div>

      <div v-if="maintenanceForm.attachments.length === 0" class="empty-inline-state">暂无附件条目。</div>

      <el-form-item label="Manifest 版本">
        <el-input-number v-model="maintenanceForm.manifestVersion" :min="1" :step="1" style="width: 100%" />
      </el-form-item>

      <div v-for="(attachment, index) in maintenanceForm.attachments" :key="`attachment-${index}`" class="inline-card">
        <div class="section-title-row compact-row">
          <div class="mini-title">附件 {{ index + 1 }}</div>
          <el-button text type="danger" @click="removeRow('attachments', index)">删除</el-button>
        </div>

        <div class="form-grid three-col">
          <el-form-item label="attachmentId">
            <el-input v-model="attachment.attachmentId" />
          </el-form-item>
          <el-form-item label="附件类型">
            <el-select v-model="attachment.attachmentType" style="width: 100%">
              <el-option v-for="option in attachmentTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="MIME Type">
            <el-input v-model="attachment.mimeType" placeholder="例如 application/pdf" />
          </el-form-item>
        </div>

        <div class="form-grid three-col">
          <el-form-item label="文件名">
            <el-input v-model="attachment.fileName" />
          </el-form-item>
          <el-form-item label="扩展名">
            <el-input v-model="attachment.fileExtension" />
          </el-form-item>
          <el-form-item label="大小（字节）">
            <el-input-number v-model="attachment.fileSize" :min="0" :step="1024" style="width: 100%" />
          </el-form-item>
        </div>

        <div class="form-grid two-col">
          <el-form-item label="存储路径">
            <el-input v-model="attachment.storagePath" />
          </el-form-item>
          <el-form-item label="上传时间">
            <el-input v-model="attachment.uploadedAt" type="datetime-local" />
          </el-form-item>
        </div>
      </div>
    </div>

    <div class="button-row submit-row">
      <el-button :loading="maintenancePreparing" @click="handlePrepareMaintenance">生成签名前预览</el-button>
      <el-button type="primary" :loading="maintenanceLoading" @click="handleSubmitMaintenance">使用当前私钥签名并提交</el-button>
    </div>

    <div v-if="maintenanceDraft" class="result-stack">
      <div class="result-block">
        <div class="result-label">提交摘要预览</div>
        <pre class="mono json-box">{{ formatJson(maintenanceDraft) }}</pre>
      </div>
    </div>

    <div v-if="maintenanceResult" class="result-stack">
      <div class="result-block">
        <div class="result-label">提交结果</div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="recordId">{{ maintenanceResult.recordId }}</el-descriptions-item>
          <el-descriptions-item label="rootRecordId">{{ maintenanceResult.rootRecordId }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ maintenanceResult.status }}</el-descriptions-item>
          <el-descriptions-item label="内部工卡号">{{ maintenanceResult.jobCardNo }}</el-descriptions-item>
          <el-descriptions-item label="执行人工号">{{ maintenanceResult.performerEmployeeNo }}</el-descriptions-item>
          <el-descriptions-item label="审核签名计数">{{ maintenanceResult.reviewerSignatureCount }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="result-block">
        <div class="result-label">后端返回 JSON</div>
        <pre class="mono json-box">{{ formatJson(maintenanceResult) }}</pre>
      </div>
    </div>
  </div>
</template>
