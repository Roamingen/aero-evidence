<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthSession } from '../stores/authSession';
import { authorizedJsonRequest } from '../utils/apiClient';
import { Loading, Download } from '@element-plus/icons-vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  recordId: { type: String, default: null },
});
const emit = defineEmits(['update:visible', 'jump']);

const auth = useAuthSession();
const loading = ref(false);
const record = ref(null);
const attachmentPreviewUrls = ref({});

const internalVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
});

const expandedSections = ref(['basic', 'payload', 'parts', 'measurements', 'replacements', 'sigTimeline', 'specifiedSigners', 'attachments', 'revisions']);

const STATUS_LABELS = { draft: '草稿', finalized: '已定稿', submitted: '待审核', peer_checked: '已复核', rii_approved: '已RII批准', released: '已放行', rejected: '已驳回' };
const ACTION_LABELS = { submit: '提交', technician_sign: '技术签名', reviewer_sign: '审核签名', rii_approve: 'RII 批准', release: '放行', reject: '驳回' };
const ROLE_LABELS = { technician: '工程师', reviewer: '审核员', rii_inspector: 'RII 检查员', release_authority: '放行人员' };
const ACTION_COLORS = { submit: '', technician_sign: '', reviewer_sign: '', rii_approve: 'timeline-action-rii', release: 'timeline-action-release', reject: 'timeline-action-reject' };

function statusLabel(s) { return STATUS_LABELS[s] || s || '-'; }
function actionLabel(a) { return ACTION_LABELS[a] || a || '-'; }
function roleLabel(r) { return ROLE_LABELS[r] || r || '-'; }
function actionColor(a) { return ACTION_COLORS[a] || ''; }

function formatDateTime(val) {
  if (!val) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Shanghai',
  }).format(new Date(val)).replace(/\//g, '-');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncHash(hash, len = 14) {
  if (!hash) return '-';
  if (hash.length <= len) return hash;
  return hash.slice(0, len) + '...';
}

function signingProgress(r) {
  if (!r) return '';
  return `技术 ${r.technicianSignatureCount}/${r.requiredTechnicianSignatures} · 审核 ${r.reviewerSignatureCount}/${r.requiredReviewerSignatures}`;
}

function signerStatusLabel(s) {
  if (s === 'signed') return '已签';
  if (s === 'cancelled') return '已取消';
  return '待签';
}

function statusTagType(s) {
  const m = { submitted: 'warning', peer_checked: '', rii_approved: '', released: 'success', rejected: 'danger', draft: 'info', finalized: 'info' };
  return m[s] || 'info';
}

function isImageFile(attachmentType) {
  return attachmentType === 'image';
}

async function getAttachmentPreviewBlobUrl(recordId, att) {
  try {
    const token = auth.loginResult.value?.token;
    if (!token) return null;
    const baseUrl = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';
    const url = `${baseUrl}/api/maintenance/records/${recordId}/attachments/${att.attachmentId}/preview`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch { return null; }
}

const downloadingAll = ref(false);

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadAttachment(att) {
  try {
    const token = auth.loginResult.value?.token;
    if (!token) return;
    const baseUrl = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';
    const url = `${baseUrl}/api/maintenance/records/${props.recordId}/attachments/${att.attachmentId}/preview`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(response.statusText);
    triggerBlobDownload(await response.blob(), att.originalFileName || att.fileName || 'download');
  } catch { ElMessage.error('下载附件失败'); }
}

async function downloadAllAttachments() {
  try {
    downloadingAll.value = true;
    const token = auth.loginResult.value?.token;
    if (!token) return;
    const baseUrl = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';
    const response = await fetch(`${baseUrl}/api/maintenance/records/${props.recordId}/attachments/download-all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(response.statusText);
    triggerBlobDownload(await response.blob(), `attachments-${record.value?.jobCardNo || 'record'}.zip`);
  } catch { ElMessage.error('下载全部附件失败'); }
  finally { downloadingAll.value = false; }
}

watch(
  () => [props.recordId, props.visible],
  async ([newId, vis]) => {
    if (!newId || !vis) return;
    const token = auth.loginResult.value?.token;
    if (!token) return;
    loading.value = true;
    record.value = null;
    attachmentPreviewUrls.value = {};
    try {
      record.value = await authorizedJsonRequest(token, `/api/maintenance/records/${newId}`, { method: 'GET' });
      if (record.value.attachments) {
        for (const att of record.value.attachments) {
          if (isImageFile(att.attachmentType)) {
            const blobUrl = await getAttachmentPreviewBlobUrl(newId, att);
            if (blobUrl) attachmentPreviewUrls.value[att.attachmentId] = blobUrl;
          }
        }
      }
    } catch (err) {
      ElMessage.error(err.message || '加载记录详情失败');
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <el-drawer v-model="internalVisible" title="检修记录详情" size="48%" :destroy-on-close="false" direction="rtl" :append-to-body="false">
    <div v-loading="loading" class="drawer-body">
      <div v-if="!record && !loading" class="module-empty-state">未加载到记录数据。</div>

      <el-collapse v-if="record" v-model="expandedSections">

        <!-- 1. 基础信息 -->
        <el-collapse-item title="基础信息" name="basic">
          <div class="detail-grid two-up-grid">
            <div class="detail-item"><span class="detail-label">记录号</span><span class="detail-value mono" :title="record.recordId">{{ truncHash(record.recordId, 20) }}</span></div>
            <div class="detail-item"><span class="detail-label">工卡号</span><span class="detail-value">{{ record.jobCardNo || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">飞机注册号</span><span class="detail-value">{{ record.aircraftRegNo || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">机型</span><span class="detail-value">{{ record.aircraftType || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">ATA 章节</span><span class="detail-value">{{ record.ataCode || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">工作类型</span><span class="detail-value">{{ record.workType || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">维修位置</span><span class="detail-value">{{ record.locationCode || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">执行人</span><span class="detail-value">{{ record.performerName || record.performerEmployeeNo || '-' }}</span></div>
            <div class="detail-item"><span class="detail-label">发生时间</span><span class="detail-value">{{ formatDateTime(record.occurrenceTime) }}</span></div>
            <div class="detail-item">
              <span class="detail-label">状态</span>
              <span class="detail-value"><el-tag :type="statusTagType(record.status)" size="small">{{ statusLabel(record.status) }}</el-tag></span>
            </div>
            <div class="detail-item"><span class="detail-label">版本</span><span class="detail-value">R{{ record.revision }}</span></div>
            <div class="detail-item"><span class="detail-label">RII</span><span class="detail-value">{{ record.isRII ? '是' : '否' }}</span></div>
            <div class="detail-item"><span class="detail-label">签名进度</span><span class="detail-value">{{ signingProgress(record) }}</span></div>
            <div class="detail-item"><span class="detail-label">提交时间</span><span class="detail-value">{{ formatDateTime(record.submittedAt) }}</span></div>
            <div v-if="record.rejectionReason" class="detail-item detail-full-width">
              <span class="detail-label">驳回原因</span>
              <span class="detail-value" style="color: var(--el-color-danger);">{{ record.rejectionReason }}</span>
            </div>
          </div>
        </el-collapse-item>

        <!-- 2. 工作详情 -->
        <el-collapse-item title="工作详情" name="payload">
          <div class="detail-stack">
            <div class="detail-item detail-full-width">
              <span class="detail-label">工作描述</span>
              <span class="detail-value pre-wrap">{{ record.payload?.workDescription || '-' }}</span>
            </div>
            <div v-if="record.payload?.referenceDocument" class="detail-item detail-full-width">
              <span class="detail-label">参考手册</span>
              <span class="detail-value">{{ record.payload.referenceDocument }}</span>
            </div>
            <div v-if="record.payload?.faultCode" class="detail-item detail-full-width">
              <span class="detail-label">故障代码</span>
              <span class="detail-value">{{ record.payload.faultCode }}</span>
            </div>
            <div v-if="record.payload?.faultDescription" class="detail-item detail-full-width">
              <span class="detail-label">故障描述</span>
              <span class="detail-value pre-wrap">{{ record.payload.faultDescription }}</span>
            </div>
          </div>
        </el-collapse-item>

        <!-- 3. 零件信息 -->
        <el-collapse-item title="零件信息" name="parts" v-if="record.parts && record.parts.length > 0">
          <div v-for="(p, i) in record.parts" :key="i" class="sub-card">
            <div class="sub-card-title">零件 {{ i + 1 }} · {{ p.partRole }}</div>
            <div class="detail-grid two-up-grid">
              <div class="detail-item"><span class="detail-label">件号</span><span class="detail-value">{{ p.partNumber || '-' }}</span></div>
              <div v-if="p.serialNumber" class="detail-item"><span class="detail-label">序列号</span><span class="detail-value">{{ p.serialNumber }}</span></div>
              <div v-if="p.partStatus" class="detail-item"><span class="detail-label">状态</span><span class="detail-value">{{ p.partStatus }}</span></div>
              <div v-if="p.sourceDescription" class="detail-item"><span class="detail-label">来源</span><span class="detail-value">{{ p.sourceDescription }}</span></div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 4. 测量数据 -->
        <el-collapse-item title="测量数据" name="measurements" v-if="record.measurements && record.measurements.length > 0">
          <div v-for="(m, i) in record.measurements" :key="i" class="sub-card">
            <div class="detail-grid two-up-grid">
              <div class="detail-item"><span class="detail-label">测试项</span><span class="detail-value">{{ m.testItemName }}</span></div>
              <div class="detail-item"><span class="detail-label">测量值</span><span class="detail-value">{{ m.measuredValues }}</span></div>
              <div class="detail-item">
                <span class="detail-label">结果</span>
                <span class="detail-value"><el-tag :type="m.isPass ? 'success' : 'danger'" size="small">{{ m.isPass ? '通过' : '不通过' }}</el-tag></span>
              </div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 5. 更换记录 -->
        <el-collapse-item title="更换记录" name="replacements" v-if="record.replacements && record.replacements.length > 0">
          <div v-for="(r, i) in record.replacements" :key="i" class="sub-card">
            <div class="sub-card-title">更换 {{ i + 1 }}</div>
            <div class="detail-grid two-up-grid">
              <div class="detail-item"><span class="detail-label">拆下件号</span><span class="detail-value">{{ r.removedPartNo || '-' }}</span></div>
              <div v-if="r.removedSerialNo" class="detail-item"><span class="detail-label">拆下序列号</span><span class="detail-value">{{ r.removedSerialNo }}</span></div>
              <div class="detail-item"><span class="detail-label">安装件号</span><span class="detail-value">{{ r.installedPartNo || '-' }}</span></div>
              <div v-if="r.installedSerialNo" class="detail-item"><span class="detail-label">安装序列号</span><span class="detail-value">{{ r.installedSerialNo }}</span></div>
              <div v-if="r.replacementReason" class="detail-item detail-full-width"><span class="detail-label">更换原因</span><span class="detail-value">{{ r.replacementReason }}</span></div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 6. 签名时间线 -->
        <el-collapse-item title="签名时间线" name="sigTimeline">
          <div v-if="!record.signatures || record.signatures.length === 0" class="module-empty-state">暂无签名记录。</div>
          <div v-else class="timeline-stack">
            <div v-for="(sig, i) in record.signatures" :key="i" class="timeline-item" :class="actionColor(sig.action)">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-head">
                  <el-tag :type="sig.action === 'reject' ? 'danger' : sig.action === 'release' ? 'success' : 'info'" size="small">{{ actionLabel(sig.action) }}</el-tag>
                  <span class="timeline-time">{{ formatDateTime(sig.signedAt) }}</span>
                </div>
                <div class="timeline-body">
                  {{ sig.signerName || sig.signerEmployeeNo }}
                  <span class="timeline-role">({{ roleLabel(sig.signerRole) }})</span>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>

        <!-- 7. 指定签名人 -->
        <el-collapse-item title="指定签名人" name="specifiedSigners">
          <div v-if="!record.specifiedSigners || record.specifiedSigners.length === 0" class="module-empty-state">未指定签名人。</div>
          <div v-else class="detail-stack">
            <div v-for="(s, i) in record.specifiedSigners" :key="i" class="detail-item detail-full-width">
              <span class="detail-label">{{ roleLabel(s.signerRole) }} · {{ s.isRequired ? '必签' : '可选' }}</span>
              <span class="detail-value">
                {{ s.signerName || s.signerEmployeeNo }}
                <el-tag :type="s.status === 'signed' ? 'success' : s.status === 'cancelled' ? 'info' : 'warning'" size="small" style="margin-left: 6px;">{{ signerStatusLabel(s.status) }}</el-tag>
                <template v-if="s.signedAt"><span style="margin-left: 6px; color: #888; font-size: 0.78rem;">签于 {{ formatDateTime(s.signedAt) }}</span></template>
              </span>
            </div>
          </div>
        </el-collapse-item>

        <!-- 8. 附件 -->
        <el-collapse-item name="attachments" v-if="record.attachments && record.attachments.length > 0">
          <template #title>附件 ({{ record.attachments.length }})</template>
          <div style="margin-bottom: 10px; text-align: right;">
            <el-button size="small" type="primary" plain :loading="downloadingAll" @click.stop="downloadAllAttachments">
              <el-icon v-if="!downloadingAll"><Download /></el-icon>
              下载全部(ZIP)
            </el-button>
          </div>
          <div class="detail-stack">
            <div v-for="(a, i) in record.attachments" :key="i" class="attachment-item">
              <el-image v-if="isImageFile(a.attachmentType) && attachmentPreviewUrls[a.attachmentId]"
                :src="attachmentPreviewUrls[a.attachmentId]"
                :preview-src-list="[attachmentPreviewUrls[a.attachmentId]]"
                style="width:60px;height:60px;border-radius:4px;object-fit:cover;cursor:pointer;flex-shrink:0;" />
              <div v-else-if="isImageFile(a.attachmentType)"
                style="width:60px;height:60px;border-radius:4px;background:var(--el-fill-color-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <el-icon><Loading /></el-icon>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ a.originalFileName || a.fileName || '-' }}</div>
                <div style="font-size:0.8rem;color:var(--el-text-color-secondary);margin-top:0.2rem;">
                  {{ a.attachmentType || '-' }} · {{ formatFileSize(a.fileSize) }} · <span class="mono" style="font-size:0.75rem;">{{ truncHash(a.contentHash) }}</span>
                </div>
              </div>
              <el-button size="small" text type="primary" @click="downloadAttachment(a)" style="flex-shrink:0;">
                <el-icon><Download /></el-icon>
              </el-button>
            </div>
          </div>
        </el-collapse-item>

        <!-- 9. 哈希与链上信息 -->
        <el-collapse-item title="哈希与链上信息" name="hashes">
          <div class="detail-stack" v-if="record.hashes">
            <div class="detail-item detail-full-width" v-for="(val, key) in record.hashes" :key="key">
              <span class="detail-label">{{ key }}</span>
              <span class="detail-value mono hash-full">{{ val || '-' }}</span>
            </div>
          </div>
          <div class="detail-stack" style="margin-top:12px;">
            <div v-if="record.chainTxHash" class="detail-item detail-full-width">
              <span class="detail-label">交易哈希</span>
              <span class="detail-value mono hash-full">{{ record.chainTxHash }}</span>
            </div>
            <div v-if="record.chainBlockNumber" class="detail-item detail-full-width">
              <span class="detail-label">区块高度</span>
              <span class="detail-value">{{ record.chainBlockNumber }}</span>
            </div>
          </div>
        </el-collapse-item>

        <!-- 10. 版本历史 -->
        <el-collapse-item title="版本历史" name="revisions" v-if="record.revisions && record.revisions.length > 0">
          <div class="timeline-stack">
            <div v-for="rev in record.revisions" :key="rev.recordId" class="timeline-item"
              :class="rev.recordId === record.recordId ? 'timeline-action-release' : ''">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-head">
                  <span style="font-weight:700">R{{ rev.revision }}</span>
                  <el-tag :type="statusTagType(rev.status)" size="small">{{ statusLabel(rev.status) }}</el-tag>
                  <el-tag v-if="rev.recordId === record.recordId" type="success" size="small">当前版本</el-tag>
                  <el-tag v-if="rev.supersededByRecordId" type="info" size="small">已被取代</el-tag>
                </div>
                <div class="timeline-body" style="font-size:0.75rem;color:#8899aa;">{{ formatDateTime(rev.createdAt) }}</div>
                <div v-if="rev.rejectedAt" class="timeline-body" style="color:#f56c6c;font-size:0.78rem;">驳回于 {{ formatDateTime(rev.rejectedAt) }}</div>
                <div v-if="rev.releasedAt" class="timeline-body" style="color:#67c23a;font-size:0.78rem;">放行于 {{ formatDateTime(rev.releasedAt) }}</div>
                <div v-if="rev.recordId !== record.recordId" style="margin-top:6px;">
                  <el-button size="small" text type="primary" @click="emit('jump', rev.recordId)">查看此版本</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>

      </el-collapse>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-body { padding: 0 4px; min-height: 300px; }
:deep(.el-collapse-item__header) { font-weight: 600; font-size: 0.9rem; }
:deep(.el-collapse-item__content) { padding-bottom: 12px; }
.detail-stack { display: flex; flex-direction: column; gap: 8px; }
.detail-full-width { grid-column: 1 / -1; }
.pre-wrap { white-space: pre-wrap; word-break: break-word; }
.sub-card { background: rgba(255,255,255,0.04); border: 1px solid var(--border-color,#333); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
.sub-card-title { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary,#888); margin-bottom: 6px; }
.timeline-stack { display: flex; flex-direction: column; gap: 0; padding-left: 8px; }
.timeline-item { display: flex; gap: 12px; padding: 10px 0; border-left: 2px solid var(--border-color,#333); padding-left: 16px; position: relative; }
.timeline-dot { position: absolute; left: -6px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent-color,#4fc3f7); border: 2px solid var(--bg-primary,#111); }
.timeline-content { flex: 1; }
.timeline-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.timeline-time { font-size: 0.78rem; color: var(--text-muted,#666); }
.timeline-body { font-size: 0.85rem; color: var(--text-primary,#e0e0e0); }
.timeline-role { color: var(--text-secondary,#888); font-size: 0.8rem; }
.timeline-action-reject { border-left-color: var(--el-color-danger,#f56c6c); }
.timeline-action-reject .timeline-dot { background: var(--el-color-danger,#f56c6c); }
.timeline-action-release { border-left-color: var(--el-color-success,#67c23a); }
.timeline-action-release .timeline-dot { background: var(--el-color-success,#67c23a); }
.timeline-action-rii .timeline-dot { background: var(--el-color-warning,#e6a23c); }
.hash-full { word-break: break-all; font-size: 0.75rem; line-height: 1.5; }
.attachment-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
</style>
