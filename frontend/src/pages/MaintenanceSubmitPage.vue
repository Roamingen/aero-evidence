<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ethers } from 'ethers';
import { Upload, Delete, Document, Picture, VideoPlay, Files } from '@element-plus/icons-vue';

import { useAuthSession } from '../stores/authSession';
import { buildApiUrl } from '../utils/apiBase';
import { parseJsonResponse } from '../utils/http';
import { createWalletFromPrivateKey } from '../utils/wallet';

const auth = useAuthSession();
const route = useRoute();

// ─── Phase state machine ───
// list → edit → finalized → submitted
const pagePhase = ref('list');

// ─── Draft list ───
const drafts = ref([]);
const draftsLoading = ref(false);

// ─── My submitted records ───
const myRecords = ref([]);
const myRecordsLoading = ref(false);
const summaryStats = reactive({
  totalSubmitted: 0,
  pendingReview: 0,
  released: 0,
  rejected: 0,
});

// ─── Current draft ───
const currentDraftId = ref(null);
const currentJobCardNo = ref('');

// ─── Form data ───
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

function createInitialForm() {
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
    specifiedSigners: [],
    confirmationPrivateKey: '',
  };
}

const form = ref(createInitialForm());
const attachments = ref([]);
const saving = ref(false);
const finalizing = ref(false);
const submitting = ref(false);
const uploading = ref(false);

// ─── Finalize result ───
const finalizeResult = ref(null);

// ─── Submit result ───
const submitResult = ref(null);

const currentUser = computed(() => auth.latestLoggedInUser.value);

function authHeaders() {
  return {
    Authorization: `Bearer ${auth.loginResult.value?.token}`,
  };
}

// ─── Row factories ───
function createPartRow() {
  return { partRole: 'used', partNumber: '', serialNumber: '', partStatus: '', sourceDescription: '', replacementReason: '' };
}
function createMeasurementRow() {
  return { testItemName: '', measuredValues: '', isPass: true };
}
function createReplacementRow() {
  return { removedPartNo: '', removedSerialNo: '', removedStatus: '', installedPartNo: '', installedSerialNo: '', installedSource: '', replacementReason: '' };
}
function createSpecifiedSignerRow() {
  return { signerRole: 'reviewer', employeeNo: '', isRequired: true, sequenceNo: 0 };
}

function addRow(collectionName, factory) {
  form.value[collectionName].push(factory());
}
function removeRow(collectionName, index) {
  form.value[collectionName].splice(index, 1);
}

// ─── API helpers ───
async function apiFetch(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  return response;
}

async function apiJson(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}

// ─── Draft list operations ───
async function fetchDrafts() {
  draftsLoading.value = true;
  try {
    const data = await apiJson('/api/maintenance/drafts');
    drafts.value = data.drafts || [];
  } catch (error) {
    ElMessage.error(error.message || '加载草稿列表失败');
  } finally {
    draftsLoading.value = false;
  }
}

// ─── My submitted records ───
async function fetchMyRecords() {
  const employeeNo = currentUser.value?.employeeNo;
  if (!employeeNo) return;
  myRecordsLoading.value = true;
  try {
    const data = await apiJson(
      `/api/maintenance/records?performerEmployeeNo=${encodeURIComponent(employeeNo)}&pageSize=50`
    );
    myRecords.value = data.rows || [];
    const total = data.total || myRecords.value.length;
    summaryStats.totalSubmitted = total;
    summaryStats.pendingReview = myRecords.value.filter((r) => r.status === 'submitted' || r.status === 'peer_checked').length;
    summaryStats.released = myRecords.value.filter((r) => r.status === 'released').length;
    summaryStats.rejected = myRecords.value.filter((r) => r.status === 'rejected').length;
  } catch (error) {
    ElMessage.error(error.message || '加载提交记录失败');
  } finally {
    myRecordsLoading.value = false;
  }
}

function statusLabel(status) {
  const map = {
    submitted: '待审核', peer_checked: '已复核', rii_approved: 'RII 通过',
    released: '已放行', rejected: '已驳回', revoked: '已撤销',
  };
  return map[status] || status;
}

function statusTagType(status) {
  if (status === 'released') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'submitted') return 'warning';
  return 'info';
}

async function handleCreateDraft() {
  try {
    const data = await apiJson('/api/maintenance/drafts', { method: 'POST' });
    currentDraftId.value = data.draftId;
    currentJobCardNo.value = data.jobCardNo;
    form.value = createInitialForm();
    attachments.value = [];
    finalizeResult.value = null;
    submitResult.value = null;
    pagePhase.value = 'edit';
    ElMessage.success(`草稿已创建，工卡号：${data.jobCardNo}`);
  } catch (error) {
    ElMessage.error(error.message || '创建草稿失败');
  }
}

async function handleOpenDraft(draft) {
  try {
    const data = await apiJson(`/api/maintenance/drafts/${draft.id}`);
    currentDraftId.value = data.id;
    currentJobCardNo.value = data.jobCardNo || '';
    populateFormFromDraft(data);
    if (data.status === 'finalized') {
      finalizeResult.value = {
        recordId: data.recordId,
        rootRecordId: data.rootRecordId,
        signedDigest: data.signedDigest,
        hashes: {
          formHash: data.formHash,
          faultHash: data.faultHash,
          partsHash: data.partsHash,
          measurementsHash: data.measurementsHash,
          replacementsHash: data.replacementsHash,
          attachmentManifestHash: data.attachmentManifestHash,
        },
      };
      pagePhase.value = 'finalized';
    } else {
      finalizeResult.value = null;
      pagePhase.value = 'edit';
    }
    submitResult.value = null;
  } catch (error) {
    ElMessage.error(error.message || '加载草稿失败');
  }
}

function populateFormFromDraft(data) {
  form.value.aircraftRegNo = data.aircraftRegNo || '';
  form.value.aircraftType = data.aircraftType || '';
  form.value.ataCode = data.ataCode || '';
  form.value.workType = data.workType || '';
  form.value.locationCode = data.locationCode || '';
  form.value.requiredTechnicianSignatures = data.requiredTechnicianSignatures || 1;
  form.value.requiredReviewerSignatures = data.requiredReviewerSignatures || 1;
  form.value.isRII = Boolean(data.isRII);
  form.value.occurrenceTime = data.occurrenceTime
    ? toLocalDateTimeInputValue(new Date(data.occurrenceTime))
    : toLocalDateTimeInputValue();
  form.value.payload = {
    workDescription: data.payload?.workDescription || '',
    referenceDocument: data.payload?.referenceDocument || '',
    faultCode: data.payload?.faultCode || '',
    faultDescription: data.payload?.faultDescription || '',
  };
  form.value.parts = (data.parts || []).map((p) => ({
    partRole: p.partRole || 'used',
    partNumber: p.partNumber || '',
    serialNumber: p.serialNumber || '',
    partStatus: p.partStatus || '',
    sourceDescription: p.sourceDescription || '',
    replacementReason: p.replacementReason || '',
  }));
  form.value.measurements = (data.measurements || []).map((m) => ({
    testItemName: m.testItemName || '',
    measuredValues: m.measuredValues || '',
    isPass: m.isPass !== false,
  }));
  form.value.replacements = (data.replacements || []).map((r) => ({
    removedPartNo: r.removedPartNo || '',
    removedSerialNo: r.removedSerialNo || '',
    removedStatus: r.removedStatus || '',
    installedPartNo: r.installedPartNo || '',
    installedSerialNo: r.installedSerialNo || '',
    installedSource: r.installedSource || '',
    replacementReason: r.replacementReason || '',
  }));
  form.value.specifiedSigners = (data.specifiedSigners || []).map((s) => ({
    signerRole: s.signerRole || 'reviewer',
    employeeNo: s.employeeNo || '',
    isRequired: s.isRequired !== false,
    sequenceNo: s.sequenceNo || 0,
  }));
  attachments.value = (data.attachments || []).map((a) => ({
    id: a.id,
    fileName: a.fileName || a.originalFileName || '',
    fileSize: a.fileSize || 0,
    mimeType: a.mimeType || '',
    contentHash: a.contentHash || '',
    attachmentType: a.attachmentType || 'document',
  }));
}

async function handleDeleteDraft(draft) {
  try {
    await ElMessageBox.confirm(`确定删除草稿"${draft.jobCardNo}"？删除后无法恢复。`, '删除草稿', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await apiFetch(`/api/maintenance/drafts/${draft.id}`, { method: 'DELETE' });
    ElMessage.success('草稿已删除');
    fetchDrafts();
  } catch (error) {
    ElMessage.error(error.message || '删除草稿失败');
  }
}

// ─── Save draft ───
async function handleSaveDraft() {
  saving.value = true;
  try {
    const body = buildSaveBody();
    await apiJson(`/api/maintenance/drafts/${currentDraftId.value}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    ElMessage.success('草稿已保存');
  } catch (error) {
    ElMessage.error(error.message || '保存草稿失败');
  } finally {
    saving.value = false;
  }
}

function buildSaveBody() {
  return {
    aircraftRegNo: form.value.aircraftRegNo || null,
    aircraftType: form.value.aircraftType || null,
    ataCode: form.value.ataCode || null,
    workType: form.value.workType || null,
    locationCode: form.value.locationCode || null,
    requiredTechnicianSignatures: form.value.requiredTechnicianSignatures,
    requiredReviewerSignatures: form.value.requiredReviewerSignatures,
    isRII: form.value.isRII,
    occurrenceTime: form.value.occurrenceTime ? new Date(form.value.occurrenceTime).toISOString() : null,
    payload: {
      workDescription: form.value.payload.workDescription || null,
      referenceDocument: form.value.payload.referenceDocument || null,
      faultCode: form.value.payload.faultCode || null,
      faultDescription: form.value.payload.faultDescription || null,
    },
    parts: form.value.parts,
    measurements: form.value.measurements,
    replacements: form.value.replacements,
    specifiedSigners: form.value.specifiedSigners.filter((s) => s.employeeNo),
  };
}

// ─── Attachment upload ───
async function handleFileUpload(uploadEvent) {
  const file = uploadEvent.file;
  if (!file) return;

  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('files', file);

    const response = await apiFetch(`/api/maintenance/drafts/${currentDraftId.value}/attachments`, {
      method: 'POST',
      body: formData,
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || '上传失败');

    for (const att of data.attachments || []) {
      attachments.value.push({
        id: att.attachmentId,
        fileName: att.fileName,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        contentHash: att.contentHash,
        attachmentType: att.attachmentType || 'document',
      });
    }
    ElMessage.success(`文件"${file.name}"上传成功`);
  } catch (error) {
    ElMessage.error(error.message || '文件上传失败');
  } finally {
    uploading.value = false;
  }
}

async function handleDeleteAttachment(att) {
  try {
    await apiFetch(`/api/maintenance/drafts/${currentDraftId.value}/attachments/${att.id}`, {
      method: 'DELETE',
    });
    attachments.value = attachments.value.filter((a) => a.id !== att.id);
    ElMessage.success('附件已删除');
  } catch (error) {
    ElMessage.error(error.message || '删除附件失败');
  }
}

function getAttachmentIcon(type) {
  if (type === 'image') return Picture;
  if (type === 'video') return VideoPlay;
  return Document;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Finalize ───
async function handleFinalize() {
  finalizing.value = true;
  try {
    // Save first to ensure latest changes are persisted
    const saveBody = buildSaveBody();
    await apiJson(`/api/maintenance/drafts/${currentDraftId.value}`, {
      method: 'PUT',
      body: JSON.stringify(saveBody),
    });

    const data = await apiJson(`/api/maintenance/drafts/${currentDraftId.value}/finalize`, {
      method: 'POST',
    });
    finalizeResult.value = data;
    pagePhase.value = 'finalized';
    ElMessage.success('定稿成功，请签名后提交');
  } catch (error) {
    ElMessage.error(error.message || '定稿失败');
  } finally {
    finalizing.value = false;
  }
}

// ─── Submit ───
async function handleSubmit() {
  if (!form.value.confirmationPrivateKey && !auth.loginForm.value.privateKey) {
    ElMessage.error('请输入私钥用于签名');
    return;
  }

  submitting.value = true;
  try {
    const privateKey = form.value.confirmationPrivateKey || auth.loginForm.value.privateKey;
    const wallet = createWalletFromPrivateKey(privateKey);
    const signedDigest = finalizeResult.value.signedDigest;
    const signature = await wallet.signMessage(ethers.getBytes(signedDigest));

    const data = await apiJson(`/api/maintenance/drafts/${currentDraftId.value}/submit`, {
      method: 'POST',
      body: JSON.stringify({ signedDigest, signature }),
    });
    submitResult.value = data;
    pagePhase.value = 'submitted';
    ElMessage.success('检修记录已提交上链');
  } catch (error) {
    ElMessage.error(error.message || '签名提交失败');
  } finally {
    submitting.value = false;
  }
}

// ─── Navigation ───
function goBackToList() {
  pagePhase.value = 'list';
  currentDraftId.value = null;
  currentJobCardNo.value = '';
  finalizeResult.value = null;
  submitResult.value = null;
  form.value = createInitialForm();
  attachments.value = [];
  fetchDrafts();
  fetchMyRecords();
}

function goBackToEdit() {
  pagePhase.value = 'edit';
  finalizeResult.value = null;
}

function goToNewDraft() {
  goBackToList();
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

// ─── Init ───
watch(() => auth.loginForm.value.privateKey, (pk) => {
  if (!form.value.confirmationPrivateKey) {
    form.value.confirmationPrivateKey = pk || '';
  }
}, { immediate: true });

onMounted(async () => {
  if (!auth.isLoggedIn.value) return;
  await Promise.all([fetchDrafts(), fetchMyRecords()]);
  // Support ?draftId=123 query param to open a draft directly
  const draftIdParam = route.query.draftId;
  if (draftIdParam) {
    const targetDraft = drafts.value.find((d) => String(d.id) === String(draftIdParam));
    if (targetDraft) {
      handleOpenDraft(targetDraft);
    }
  }
});
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

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Phase: DRAFT LIST                                          -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <template v-if="pagePhase === 'list'">
      <section class="module-grid card-grid-four">
        <article class="module-panel primary-summary-card">
          <div class="module-title light-title">已提交记录</div>
          <div class="member-card-count light-count">{{ summaryStats.totalSubmitted }}</div>
          <div class="module-subtitle light-copy">全部非草稿记录</div>
        </article>
        <article class="module-panel member-card">
          <div class="module-title">待审核</div>
          <div class="member-card-count">{{ summaryStats.pendingReview }}</div>
          <div class="module-subtitle">submitted / peer_checked</div>
        </article>
        <article class="module-panel member-card">
          <div class="module-title">已放行</div>
          <div class="member-card-count">{{ summaryStats.released }}</div>
          <div class="module-subtitle">审批流程全部完成</div>
        </article>
        <article class="module-panel member-card">
          <div class="module-title">被驳回</div>
          <div class="member-card-count">{{ summaryStats.rejected }}</div>
          <div class="module-subtitle">需要修改重新提交</div>
        </article>
      </section>

      <section class="module-grid two-up-grid">
        <!-- Left: My submitted records -->
        <article class="module-panel">
          <div class="module-header-row" style="margin-bottom: 0.75rem;">
            <div class="module-title" style="font-size: 1rem;">我的提交记录</div>
          </div>
          <el-table :data="myRecords" v-loading="myRecordsLoading" stripe size="small" style="width: 100%" max-height="480">
            <el-table-column prop="jobCardNo" label="工卡号" min-width="140" />
            <el-table-column prop="aircraftRegNo" label="飞机注册号" min-width="100">
              <template #default="{ row }">{{ row.aircraftRegNo || '-' }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="submittedAt" label="提交时间" min-width="140">
              <template #default="{ row }">{{ row.submittedAt ? new Date(row.submittedAt).toLocaleString('zh-CN') : '-' }}</template>
            </el-table-column>
          </el-table>
          <div v-if="!myRecordsLoading && myRecords.length === 0" class="empty-inline-state" style="margin-top: 0.75rem">
            暂无已提交记录。
          </div>
        </article>

        <!-- Right: Drafts -->
        <article class="module-panel">
          <div class="module-header-row" style="margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="module-title" style="font-size: 1rem;">草稿箱</div>
              <el-tag size="small" type="info">{{ drafts.length }}</el-tag>
            </div>
            <el-button type="primary" size="small" @click="handleCreateDraft">新建草稿</el-button>
          </div>
          <el-table :data="drafts" v-loading="draftsLoading" stripe size="small" style="width: 100%" max-height="480">
            <el-table-column prop="jobCardNo" label="工卡号" min-width="140" />
            <el-table-column prop="aircraftRegNo" label="飞机注册号" min-width="100">
              <template #default="{ row }">{{ row.aircraftRegNo || '-' }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'finalized' ? 'success' : 'info'" size="small">
                  {{ row.status === 'finalized' ? '已定稿' : '草稿' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="attachmentCount" label="附件" width="60" align="center">
              <template #default="{ row }">{{ row.attachmentCount || 0 }}</template>
            </el-table-column>
            <el-table-column prop="updatedAt" label="最后更新" min-width="140">
              <template #default="{ row }">{{ row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="handleOpenDraft(row)">编辑</el-button>
                <el-button text type="danger" size="small" @click="handleDeleteDraft(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!draftsLoading && drafts.length === 0" class="empty-inline-state" style="margin-top: 0.75rem">
            暂无草稿。点击"新建草稿"开始创建检修记录。
          </div>
        </article>
      </section>

      <section class="module-panel" style="padding: 0.9rem 1.2rem;">
        <div class="hint-panel" style="margin: 0;">
          <div class="hint-line">新建草稿后系统自动分配工卡号，填写表单并上传附件后点击"定稿"生成哈希摘要。</div>
          <div class="hint-line">定稿后使用私钥签名确认，签名通过后记录将提交上链，不可撤回。</div>
          <div class="hint-line">已提交记录的审批进度可在左侧面板跟踪，驳回后可在记录中心发起修订重提。</div>
        </div>
      </section>
    </template>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Phase: EDIT DRAFT                                          -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <template v-if="pagePhase === 'edit'">
      <section class="module-panel maintenance-hero-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">编辑检修记录</div>
            <div class="module-subtitle">工卡号：{{ currentJobCardNo }} &mdash; 填写表单后可随时保存草稿，完成后点击"定稿"。</div>
          </div>
          <el-button @click="goBackToList">返回草稿列表</el-button>
        </div>
      </section>

      <div class="status-strip">
        <div class="status-pill">
          <span class="status-key">工卡号</span>
          <span class="status-value">{{ currentJobCardNo }}</span>
        </div>
        <div class="status-pill">
          <span class="status-key">当前工号</span>
          <span class="status-value">{{ currentUser?.employeeNo }}</span>
        </div>
        <div class="status-pill wide-pill">
          <span class="status-key">当前地址</span>
          <span class="status-value mono">{{ currentUser?.address }}</span>
        </div>
      </div>

      <!-- Basic Info -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">基础信息</div>
            <div class="section-subtitle">recordId 在定稿时自动生成，执行人信息由登录身份自动关联。</div>
          </div>
        </div>

        <el-form label-position="top">
          <div class="form-grid two-col">
            <el-form-item label="飞机注册号">
              <el-input v-model="form.aircraftRegNo" placeholder="例：B-4321" />
            </el-form-item>
            <el-form-item label="机型">
              <el-input v-model="form.aircraftType" placeholder="例：Airbus A320-200" />
            </el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="ATA 章节">
              <el-input v-model="form.ataCode" placeholder="例：32-11" />
            </el-form-item>
            <el-form-item label="工作类型">
              <el-input v-model="form.workType" placeholder="例：功能检查" />
            </el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="维修位置">
              <el-input v-model="form.locationCode" placeholder="例如 HGH-H2" />
            </el-form-item>
            <el-form-item label="发生时间">
              <el-input v-model="form.occurrenceTime" type="datetime-local" />
            </el-form-item>
          </div>

          <div class="form-grid three-col">
            <el-form-item label="技术签名数">
              <el-input-number v-model="form.requiredTechnicianSignatures" :min="1" :step="1" style="width: 100%" />
            </el-form-item>
            <el-form-item label="审核签名数">
              <el-input-number v-model="form.requiredReviewerSignatures" :min="1" :step="1" style="width: 100%" />
            </el-form-item>
            <el-form-item label="是否 RII">
              <div class="switch-wrap">
                <el-switch v-model="form.isRII" />
              </div>
            </el-form-item>
          </div>

          <el-form-item label="工作描述">
            <el-input v-model="form.payload.workDescription" type="textarea" :rows="4" resize="none" />
          </el-form-item>

          <div class="form-grid two-col">
            <el-form-item label="参考手册">
              <el-input v-model="form.payload.referenceDocument" />
            </el-form-item>
            <el-form-item label="故障代码">
              <el-input v-model="form.payload.faultCode" />
            </el-form-item>
          </div>

          <el-form-item label="故障描述">
            <el-input v-model="form.payload.faultDescription" type="textarea" :rows="3" resize="none" />
          </el-form-item>
        </el-form>
      </div>

      <!-- Specified Signers -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">指定签名人员</div>
            <div class="section-subtitle">留空则表示该角色仍按普通权限池处理。</div>
          </div>
          <el-button @click="addRow('specifiedSigners', createSpecifiedSignerRow)">新增指定签名人</el-button>
        </div>

        <div v-if="form.specifiedSigners.length === 0" class="empty-inline-state">暂无指定签名人。</div>

        <div v-for="(signer, index) in form.specifiedSigners" :key="`signer-${index}`" class="inline-card">
          <div class="section-title-row compact-row">
            <div class="mini-title">签名人 {{ index + 1 }}</div>
            <el-button text type="danger" @click="removeRow('specifiedSigners', index)">删除</el-button>
          </div>
          <div class="form-grid three-col">
            <el-form-item label="角色">
              <el-select v-model="signer.signerRole" style="width: 100%">
                <el-option v-for="opt in signerRoleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
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

      <!-- Parts -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">部件信息</div>
            <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
          </div>
          <el-button @click="addRow('parts', createPartRow)">新增部件</el-button>
        </div>
        <div v-if="form.parts.length === 0" class="empty-inline-state">暂无部件条目。</div>
        <div v-for="(part, index) in form.parts" :key="`part-${index}`" class="inline-card">
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

      <!-- Measurements -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">测量信息</div>
            <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
          </div>
          <el-button @click="addRow('measurements', createMeasurementRow)">新增测量项</el-button>
        </div>
        <div v-if="form.measurements.length === 0" class="empty-inline-state">暂无测量条目。</div>
        <div v-for="(measurement, index) in form.measurements" :key="`measurement-${index}`" class="inline-card">
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

      <!-- Replacements -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">替换信息</div>
            <div class="section-subtitle">默认 0 条，只有点击新增后才会出现条目。</div>
          </div>
          <el-button @click="addRow('replacements', createReplacementRow)">新增替换项</el-button>
        </div>
        <div v-if="form.replacements.length === 0" class="empty-inline-state">暂无替换条目。</div>
        <div v-for="(replacement, index) in form.replacements" :key="`replacement-${index}`" class="inline-card">
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

      <!-- Attachments (File Upload) -->
      <div class="section-block">
        <div class="section-title-row">
          <div>
            <div class="section-title">附件管理</div>
            <div class="section-subtitle">拖拽或点击上传文件，支持图片、PDF、Office 文档、视频等。单文件最大 50MB。</div>
          </div>
        </div>

        <el-upload
          :auto-upload="true"
          :show-file-list="false"
          :http-request="handleFileUpload"
          :disabled="uploading"
          drag
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,video/mp4,video/quicktime,.txt,.csv"
        >
          <div style="padding: 1.5rem 0">
            <el-icon :size="40" style="color: var(--el-color-primary)"><Upload /></el-icon>
            <div style="margin-top: 0.5rem; color: var(--el-text-color-secondary)">
              {{ uploading ? '上传中...' : '拖拽文件到此处，或点击选择文件' }}
            </div>
          </div>
        </el-upload>

        <div v-if="attachments.length === 0" class="empty-inline-state" style="margin-top: 0.75rem">
          暂无附件。上传后将自动计算文件 SHA-256 哈希。
        </div>

        <div v-for="att in attachments" :key="att.id" class="inline-card" style="margin-top: 0.75rem">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <el-icon :size="24" style="color: var(--el-color-primary); flex-shrink: 0">
              <component :is="getAttachmentIcon(att.attachmentType)" />
            </el-icon>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ att.fileName }}
              </div>
              <div style="font-size: 0.8rem; color: var(--el-text-color-secondary); margin-top: 0.2rem;">
                {{ formatFileSize(att.fileSize) }} &middot; {{ att.mimeType }}
              </div>
              <div v-if="att.contentHash" class="mono" style="font-size: 0.72rem; color: var(--el-text-color-secondary); margin-top: 0.2rem; word-break: break-all;">
                SHA-256: {{ att.contentHash }}
              </div>
            </div>
            <el-button text type="danger" :icon="Delete" @click="handleDeleteAttachment(att)" style="flex-shrink: 0" />
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="button-row submit-row">
        <el-button @click="goBackToList">返回列表</el-button>
        <el-button :loading="saving" @click="handleSaveDraft">保存草稿</el-button>
        <el-button type="primary" :loading="finalizing" @click="handleFinalize">定稿</el-button>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Phase: FINALIZED (preview + sign)                          -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <template v-if="pagePhase === 'finalized'">
      <section class="module-panel maintenance-hero-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">定稿预览</div>
            <div class="module-subtitle">工卡号：{{ currentJobCardNo }} &mdash; 请核对以下信息，确认无误后签名提交。</div>
          </div>
          <el-button @click="goBackToEdit">继续编辑</el-button>
        </div>
      </section>

      <div class="section-block" v-if="finalizeResult">
        <div class="section-title-row">
          <div class="section-title">链上摘要信息</div>
        </div>

        <el-descriptions :column="1" border>
          <el-descriptions-item label="Record ID">
            <span class="mono">{{ finalizeResult.recordId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Root Record ID">
            <span class="mono">{{ finalizeResult.rootRecordId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Signed Digest">
            <span class="mono" style="word-break: break-all;">{{ finalizeResult.signedDigest }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div style="margin-top: 1rem">
          <div class="section-title" style="margin-bottom: 0.5rem">哈希值</div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="formHash">
              <span class="mono">{{ finalizeResult.hashes?.formHash }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="faultHash">
              <span class="mono">{{ finalizeResult.hashes?.faultHash }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="partsHash">
              <span class="mono">{{ finalizeResult.hashes?.partsHash }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="measurementsHash">
              <span class="mono">{{ finalizeResult.hashes?.measurementsHash }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="replacementsHash">
              <span class="mono">{{ finalizeResult.hashes?.replacementsHash }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="attachmentManifestHash">
              <span class="mono">{{ finalizeResult.hashes?.attachmentManifestHash }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <!-- Readonly form summary -->
      <div class="section-block">
        <div class="section-title-row">
          <div class="section-title">表单内容预览</div>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="飞机注册号">{{ form.aircraftRegNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="机型">{{ form.aircraftType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="ATA 章节">{{ form.ataCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工作类型">{{ form.workType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="维修位置">{{ form.locationCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="是否 RII">{{ form.isRII ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="技术签名数">{{ form.requiredTechnicianSignatures }}</el-descriptions-item>
          <el-descriptions-item label="审核签名数">{{ form.requiredReviewerSignatures }}</el-descriptions-item>
        </el-descriptions>

        <div style="margin-top: 0.75rem">
          <div style="font-weight: 500; margin-bottom: 0.25rem">工作描述</div>
          <div style="padding: 0.5rem; border-radius: 0.5rem; background: var(--el-fill-color-light); white-space: pre-wrap;">{{ form.payload.workDescription || '-' }}</div>
        </div>

        <div v-if="attachments.length > 0" style="margin-top: 0.75rem">
          <div style="font-weight: 500; margin-bottom: 0.25rem">附件 ({{ attachments.length }})</div>
          <div v-for="att in attachments" :key="att.id" style="font-size: 0.85rem; padding: 0.25rem 0; color: var(--el-text-color-regular);">
            {{ att.fileName }} ({{ formatFileSize(att.fileSize) }})
          </div>
        </div>
      </div>

      <!-- Sign and submit -->
      <div class="section-block">
        <div class="section-title-row">
          <div class="section-title">签名提交</div>
        </div>
        <el-form label-position="top">
          <el-form-item label="提交确认私钥">
            <el-input
              v-model="form.confirmationPrivateKey"
              type="textarea"
              :rows="3"
              resize="none"
              placeholder="输入当前登录账户的私钥，将用它对 signedDigest 签名确认"
              show-password
            />
          </el-form-item>
        </el-form>

        <div class="hint-panel">
          <div class="hint-line">签名将使用 EIP-191 对 signedDigest 进行签名，确认本人提交该检修记录。</div>
          <div class="hint-line">签名后记录将提交到区块链，此操作不可逆。</div>
        </div>
      </div>

      <div class="button-row submit-row">
        <el-button @click="goBackToEdit">继续编辑</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">签名并提交上链</el-button>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Phase: SUBMITTED (result)                                  -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <template v-if="pagePhase === 'submitted'">
      <section class="module-panel maintenance-hero-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">提交成功</div>
            <div class="module-subtitle">检修记录已成功提交上链。</div>
          </div>
        </div>
      </section>

      <div class="section-block" v-if="submitResult">
        <div class="section-title-row">
          <div class="section-title">提交结果</div>
        </div>

        <el-descriptions :column="1" border>
          <el-descriptions-item label="Record ID">
            <span class="mono">{{ submitResult.recordId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Root Record ID">
            <span class="mono">{{ submitResult.rootRecordId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag type="success">{{ submitResult.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="工卡号">{{ submitResult.jobCardNo }}</el-descriptions-item>
          <el-descriptions-item label="执行人工号">{{ submitResult.performerEmployeeNo }}</el-descriptions-item>
          <el-descriptions-item label="链上交易哈希" v-if="submitResult.chainTxHash">
            <span class="mono" style="word-break: break-all;">{{ submitResult.chainTxHash }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="区块高度" v-if="submitResult.chainBlockNumber">
            {{ submitResult.chainBlockNumber }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="result-block" v-if="submitResult">
        <div class="result-label">完整返回 JSON</div>
        <pre class="mono json-box">{{ formatJson(submitResult) }}</pre>
      </div>

      <div class="button-row submit-row">
        <el-button type="primary" @click="goToNewDraft">新建检修记录</el-button>
        <el-button @click="goBackToList">返回草稿列表</el-button>
      </div>
    </template>

  </div>
</template>
