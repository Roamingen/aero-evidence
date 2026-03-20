<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ethers } from 'ethers';

import { useAuthSession } from '../stores/authSession';
import { authorizedJsonRequest } from '../utils/apiClient';
import RecordDetailDrawer from '../components/RecordDetailDrawer.vue';

const auth = useAuthSession();

const detailVisible = ref(false);
const detailRecordId = ref(null);

function openDetail(recordId) {
  detailRecordId.value = recordId;
  detailVisible.value = true;
}

const loading = ref(false);
const activeTab = ref('');

const workbench = ref({
  summary: {
    myTechnicianPending: 0,
    myReviewerDesignated: 0,
    myReviewerPool: 0,
    myReleasePending: 0,
    myRiiPending: 0,
  },
  queues: {
    technician: [],
    reviewerDesignated: [],
    reviewerPool: [],
    release: [],
    rii: [],
  },
});

const canLoad = computed(() => auth.isLoggedIn.value && auth.loginResult.value?.token);

// ─── Permission checks ───
const hasTechPerm = computed(() => auth.hasPermission('record.sign.technician'));
const hasReviewPerm = computed(() => auth.hasPermission('record.sign.reviewer'));
const hasReleasePerm = computed(() => auth.hasPermission('record.sign.release'));

const visibleCards = computed(() => {
  const cards = [];
  if (hasTechPerm.value) cards.push({ label: '待我技术签名', count: workbench.value.summary.myTechnicianPending, type: 'primary', tab: 'technician' });
  if (hasReviewPerm.value) cards.push({ label: '待我审核', count: workbench.value.summary.myReviewerDesignated + workbench.value.summary.myReviewerPool, type: 'warning', tab: 'reviewer' });
  if (hasReleasePerm.value) cards.push({ label: '待我放行', count: workbench.value.summary.myReleasePending, type: 'success', tab: 'release' });
  if (hasReviewPerm.value) cards.push({ label: '待我RII检查', count: workbench.value.summary.myRiiPending, type: 'info', tab: 'rii' });
  return cards;
});

const cardGridClass = computed(() => {
  const n = visibleCards.value.length;
  if (n <= 2) return 'card-grid-two';
  if (n === 3) return 'card-grid-three';
  return 'card-grid-four';
});

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

function statusLabel(status) {
  const mapping = {
    submitted: '待审核',
    peer_checked: '已复核',
    rii_approved: '已RII批准',
    released: '已放行',
    rejected: '已驳回',
  };
  return mapping[status] || status || '-';
}

function signingProgress(item) {
  const parts = [];
  parts.push(`技术 ${item.technicianSignatureCount}/${item.requiredTechnicianSignatures}`);
  parts.push(`审核 ${item.reviewerSignatureCount}/${item.requiredReviewerSignatures}`);
  return parts.join(' · ');
}

async function fetchWorkbench() {
  if (!canLoad.value) return;
  try {
    loading.value = true;
    const result = await authorizedJsonRequest(
      auth.loginResult.value.token,
      '/api/maintenance/workbench',
      { method: 'GET' },
    );
    workbench.value = result;
    // Auto-select first visible tab
    if (!activeTab.value && visibleCards.value.length > 0) {
      activeTab.value = visibleCards.value[0].tab;
    }
  } catch (error) {
    ElMessage.error(error.message || '加载签名工作台失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => { fetchWorkbench(); });

function buildDigest(recordId, action, hashes, signerEmployeeNo) {
  const digestObject = { recordId, action, formHash: hashes.formHash, attachmentManifestHash: hashes.attachmentManifestHash, signerEmployeeNo };
  const sortedKeys = Object.keys(digestObject).sort();
  const canonicalJson = `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(digestObject[key])}`).join(',')}}`;
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
}

async function executeAction(record, signerRole, action, withReason = false) {
  if (!window.ethereum) {
    ElMessage.error('请先安装 MetaMask');
    return;
  }

  try {
    let rejectionReason = null;
    if (withReason) {
      const result = await ElMessageBox.prompt('请输入驳回原因', '驳回记录', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入驳回原因',
        inputValidator: (value) => (!value || !value.trim()) ? '驳回原因不能为空' : true,
      });
      rejectionReason = result.value.trim();
    }

    loading.value = true;
    const fullRecord = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/maintenance/records/${record.recordId}`,
      { method: 'GET' },
    );

    const currentUser = auth.latestLoggedInUser.value;

    const alreadySigned = fullRecord.signatures.some(
      (sig) => sig.action === action && sig.signerEmployeeNo === currentUser.employeeNo,
    );
    if (alreadySigned) {
      ElMessage.warning(`您已经对此记录执行过 ${action} 操作，不能重复签名`);
      return;
    }

    const signedDigest = buildDigest(fullRecord.recordId, action, fullRecord.hashes, currentUser.employeeNo);

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();

    if (signerAddress.toLowerCase() !== currentUser.address.toLowerCase()) {
      ElMessage.error(`MetaMask 地址（${signerAddress}）与登录用户地址（${currentUser.address}）不一致`);
      return;
    }

    const signature = await signer.signMessage(ethers.getBytes(signedDigest));

    const payload = { signerRole, action, signedDigest, signature };
    if (rejectionReason) payload.rejectionReason = rejectionReason;

    await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/maintenance/records/${record.recordId}/signatures`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    const actionLabels = { reject: '驳回', release: '放行', reviewer_sign: '审核', technician_sign: '技术签名', rii_approve: 'RII审查' };
    ElMessage.success(`${actionLabels[action] || action}成功`);
    await fetchWorkbench();
  } catch (error) {
    if (error !== 'cancel') {
      let msg = error.message || `${action} 操作失败`;
      if (msg.includes('CALL_EXCEPTION')) {
        if (msg.includes('Not enough reviewer signatures')) msg = '审核签名数量不足';
        else if (msg.includes('Not enough technician signatures')) msg = '技术签名数量不足';
        else if (msg.includes('Signer already used this action')) msg = '不能重复签名';
        else msg = '区块链合约调用失败，请检查记录状态和签名条件';
      }
      ElMessage.error(msg);
    }
  } finally {
    loading.value = false;
  }
}

function handleTechnicianSign(record) {
  executeAction(record, 'technician', 'technician_sign');
}
function handleReview(record) {
  executeAction(record, 'reviewer', 'reviewer_sign');
}
function handleReject(record) {
  executeAction(record, 'reviewer', 'reject', true);
}
function handleRelease(record) {
  executeAction(record, 'release_authority', 'release');
}
function handleRiiApprove(record) {
  executeAction(record, 'rii_inspector', 'rii_approve');
}

function handleCardClick(tab) {
  activeTab.value = tab;
}
</script>

<template>
  <div v-if="!canLoad" class="result-block">
    <el-alert type="warning" :closable="false" title="请先登录后再进入签名工作台" description="当前页面需要登录并持有签名权限。" />
    <div class="button-row top-gap">
      <RouterLink to="/auth" class="workspace-auth-link">前往认证页</RouterLink>
    </div>
  </div>

  <div v-else class="module-stack" v-loading="loading">
    <!-- Summary Cards (filtered by permission) -->
    <section class="module-grid" :class="cardGridClass">
      <article
        v-for="card in visibleCards"
        :key="card.label"
        class="module-panel member-card clickable-card"
        :class="{ 'primary-summary-card': card.type === 'primary' }"
        @click="handleCardClick(card.tab)"
      >
        <div class="module-title" :class="{ 'light-title': card.type === 'primary' }">{{ card.label }}</div>
        <div class="member-card-count" :class="{ 'light-count': card.type === 'primary' }">{{ card.count }}</div>
      </article>
    </section>

    <!-- Queue Tabs (filtered by permission) -->
    <section class="module-panel" style="padding: 0;">
      <el-tabs v-model="activeTab" class="workbench-tabs">

        <!-- Tab: Technician signing -->
        <el-tab-pane v-if="hasTechPerm" name="technician">
          <template #label>
            工程师签名
            <span v-if="workbench.summary.myTechnicianPending > 0" class="tab-badge">{{ workbench.summary.myTechnicianPending }}</span>
          </template>
          <div class="queue-tab-content">
            <div v-if="workbench.queues.technician.length === 0" class="module-empty-state">当前没有待技术签名的记录。</div>
            <div v-else class="queue-stack">
              <div v-for="item in workbench.queues.technician" :key="item.recordId" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.aircraftRegNo || item.jobCardNo }}</strong>
                  <span class="status-chip">{{ statusLabel(item.status) }}</span>
                </div>
                <div class="queue-card-copy">{{ item.workType }} / {{ item.ataCode }}</div>
                <div class="queue-card-meta">{{ signingProgress(item) }}</div>
                <div class="queue-card-foot">提交人: {{ item.performerEmployeeNo }} · {{ formatDateTime(item.updatedAt) }}</div>
                <div class="queue-card-actions">
                  <el-button size="small" @click="openDetail(item.recordId)">详情</el-button>
                  <el-button size="small" type="primary" @click="handleTechnicianSign(item)">技术签名</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab: Reviewer signing -->
        <el-tab-pane v-if="hasReviewPerm" name="reviewer">
          <template #label>
            审核签名
            <span v-if="workbench.summary.myReviewerDesignated + workbench.summary.myReviewerPool > 0" class="tab-badge">
              {{ workbench.summary.myReviewerDesignated + workbench.summary.myReviewerPool }}
            </span>
          </template>
          <div class="queue-tab-content">
            <!-- Designated reviewers -->
            <div v-if="workbench.queues.reviewerDesignated.length > 0" class="queue-section">
              <div class="queue-section-title">指定我审核的记录</div>
              <div class="queue-stack">
                <div v-for="item in workbench.queues.reviewerDesignated" :key="item.recordId" class="queue-card">
                  <div class="queue-card-head">
                    <strong>{{ item.aircraftRegNo || item.jobCardNo }}</strong>
                    <span class="status-chip designated-chip">指定审核</span>
                  </div>
                  <div class="queue-card-copy">{{ item.workType }} / {{ item.ataCode }}</div>
                  <div class="queue-card-meta">{{ signingProgress(item) }}</div>
                  <div class="queue-card-foot">提交人: {{ item.performerEmployeeNo }} · {{ formatDateTime(item.updatedAt) }}</div>
                  <div class="queue-card-actions">
                    <el-button size="small" @click="openDetail(item.recordId)">详情</el-button>
                    <el-button size="small" type="success" @click="handleReview(item)">审核通过</el-button>
                    <el-button size="small" type="danger" @click="handleReject(item)">驳回</el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pool reviewers -->
            <div v-if="workbench.queues.reviewerPool.length > 0" class="queue-section">
              <div class="queue-section-title">可参与审核的记录</div>
              <div class="queue-stack">
                <div v-for="item in workbench.queues.reviewerPool" :key="item.recordId" class="queue-card muted-card">
                  <div class="queue-card-head">
                    <strong>{{ item.aircraftRegNo || item.jobCardNo }}</strong>
                    <span class="status-chip">{{ statusLabel(item.status) }}</span>
                  </div>
                  <div class="queue-card-copy">{{ item.workType }} / {{ item.ataCode }}</div>
                  <div class="queue-card-meta">{{ signingProgress(item) }}</div>
                  <div class="queue-card-foot">提交人: {{ item.performerEmployeeNo }} · {{ formatDateTime(item.updatedAt) }}</div>
                  <div class="queue-card-actions">
                    <el-button size="small" @click="openDetail(item.recordId)">详情</el-button>
                    <el-button size="small" type="success" @click="handleReview(item)">审核通过</el-button>
                    <el-button size="small" type="danger" @click="handleReject(item)">驳回</el-button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="workbench.queues.reviewerDesignated.length === 0 && workbench.queues.reviewerPool.length === 0" class="module-empty-state">当前没有待审核的记录。</div>
          </div>
        </el-tab-pane>

        <!-- Tab: Release -->
        <el-tab-pane v-if="hasReleasePerm" name="release">
          <template #label>
            放行签名
            <span v-if="workbench.summary.myReleasePending > 0" class="tab-badge">{{ workbench.summary.myReleasePending }}</span>
          </template>
          <div class="queue-tab-content">
            <div v-if="workbench.queues.release.length === 0" class="module-empty-state">当前没有待放行的记录。</div>
            <div v-else class="queue-stack">
              <div v-for="item in workbench.queues.release" :key="item.recordId" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.aircraftRegNo || item.jobCardNo }}</strong>
                  <span class="status-chip">{{ statusLabel(item.status) }}</span>
                </div>
                <div class="queue-card-copy">{{ item.workType }} / {{ item.ataCode }}</div>
                <div class="queue-card-meta">{{ signingProgress(item) }}</div>
                <div class="queue-card-foot">提交人: {{ item.performerEmployeeNo }} · {{ formatDateTime(item.updatedAt) }}</div>
                <div class="queue-card-actions">
                  <el-button size="small" @click="openDetail(item.recordId)">详情</el-button>
                  <el-button size="small" type="primary" @click="handleRelease(item)">放行</el-button>
                  <el-button size="small" type="danger" @click="handleReject(item)">驳回</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab: RII -->
        <el-tab-pane v-if="hasReviewPerm" name="rii">
          <template #label>
            RII检查
            <span v-if="workbench.summary.myRiiPending > 0" class="tab-badge">{{ workbench.summary.myRiiPending }}</span>
          </template>
          <div class="queue-tab-content">
            <div v-if="workbench.queues.rii.length === 0" class="module-empty-state">当前没有待 RII 检查的记录。</div>
            <div v-else class="queue-stack">
              <div v-for="item in workbench.queues.rii" :key="item.recordId" class="queue-card">
                <div class="queue-card-head">
                  <strong>{{ item.aircraftRegNo || item.jobCardNo }}</strong>
                  <span class="status-chip">RII</span>
                </div>
                <div class="queue-card-copy">{{ item.workType }} / {{ item.ataCode }}</div>
                <div class="queue-card-meta">{{ signingProgress(item) }}</div>
                <div class="queue-card-foot">提交人: {{ item.performerEmployeeNo }} · {{ formatDateTime(item.updatedAt) }}</div>
                <div class="queue-card-actions">
                  <el-button size="small" @click="openDetail(item.recordId)">详情</el-button>
                  <el-button size="small" type="success" @click="handleRiiApprove(item)">RII 批准</el-button>
                  <el-button size="small" type="danger" @click="handleReject(item)">驳回</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <RecordDetailDrawer v-model:visible="detailVisible" :record-id="detailRecordId" />
  </div>
</template>

<style scoped>
.workbench-tabs {
  --el-tabs-header-height: 48px;
}
.workbench-tabs :deep(.el-tabs__header) {
  padding: 0 var(--panel-padding, 20px);
  margin-bottom: 0;
}
.workbench-tabs :deep(.el-tabs__content) {
  padding: 0;
}
.queue-tab-content {
  padding: var(--panel-padding, 20px);
  min-height: 200px;
}
.queue-section {
  margin-bottom: 24px;
}
.queue-section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary, #888);
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color, #333);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  border-radius: 9px;
  background: var(--accent-color, #4fc3f7);
  color: var(--bg-primary, #111);
}
.designated-chip {
  background: var(--accent-color, #4fc3f7) !important;
  color: var(--bg-primary, #111) !important;
  font-weight: 600;
}
.clickable-card {
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.clickable-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.queue-card-meta {
  font-size: 0.78rem;
  color: var(--accent-color, #4fc3f7);
  margin-top: 2px;
  font-weight: 500;
}
</style>
