<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthSession } from '../stores/authSession';
import { buildApiUrl } from '../utils/apiBase';

const route = useRoute();
const router = useRouter();
const auth = useAuthSession();

const recordIdInput = ref('');
const loading = ref(false);
const result = ref(null);
const tamperLoading = ref(false);
const restoreLoading = ref(false);
const pdfLoading = ref(false);

const isAdmin = computed(() => {
  try {
    return auth.isLoggedIn.value && auth.hasPermission('user.manage');
  } catch {
    return false;
  }
});

const STATUS_LABELS = {
  draft: '草稿',
  submitted: '待审核',
  peer_checked: '已复核',
  rii_approved: '已RII批准',
  released: '已放行',
  rejected: '已驳回',
  revoked: '已撤回',
};

function formatDateTime(val) {
  if (!val) return '-';
  const date = new Date(val);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Shanghai',
  }).format(date).replace(/\//g, '-');
}

function shortenHash(hash) {
  if (!hash || hash.length < 16) return hash || '-';
  return hash.slice(0, 10) + '...' + hash.slice(-8);
}

async function handleVerify() {
  const id = recordIdInput.value.trim();
  if (!id) {
    ElMessage.warning('请输入记录 ID');
    return;
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(id)) {
    ElMessage.warning('记录 ID 格式不正确，应为 0x 开头的 64 位十六进制');
    return;
  }

  loading.value = true;
  result.value = null;
  try {
    const response = await fetch(buildApiUrl(`/api/verify/${id}`));
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || '验证请求失败');
    }
    result.value = data;
  } catch (error) {
    ElMessage.error(error.message || '验证请求失败');
  } finally {
    loading.value = false;
  }
}

async function handleTamper() {
  if (!result.value || !result.value.found) return;
  const token = auth.loginResult.value?.token;
  if (!token) {
    ElMessage.warning('请先登录管理员账号');
    return;
  }

  tamperLoading.value = true;
  try {
    const response = await fetch(
      buildApiUrl(`/api/verify/admin/tamper-demo/${result.value.recordSummary.recordId}`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '篡改操作失败');
    ElMessage.success(data.message || '篡改成功，请重新验证');
    await handleVerify();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    tamperLoading.value = false;
  }
}

async function handleRestore() {
  if (!result.value || !result.value.found) return;
  const token = auth.loginResult.value?.token;
  if (!token) {
    ElMessage.warning('请先登录管理员账号');
    return;
  }

  restoreLoading.value = true;
  try {
    const response = await fetch(
      buildApiUrl(`/api/verify/admin/restore-demo/${result.value.recordSummary.recordId}`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '恢复操作失败');
    ElMessage.success(data.message || '恢复成功，请重新验证');
    await handleVerify();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    restoreLoading.value = false;
  }
}

async function handleExportPdf() {
  if (!result.value || !result.value.found) return;
  pdfLoading.value = true;
  try {
    const id = result.value.recordSummary.recordId;
    const response = await fetch(buildApiUrl(`/api/verify/${id}/pdf`));
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'PDF 导出失败');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maintenance-report-${id.slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('PDF 导出成功');
  } catch (error) {
    ElMessage.error(error.message || 'PDF 导出失败');
  } finally {
    pdfLoading.value = false;
  }
}

onMounted(() => {
  const qr = route.query.recordId;
  if (qr) {
    recordIdInput.value = qr;
    handleVerify();
  }
});
</script>

<template>
  <div class="verify-shell">
    <div class="bg-animation">
      <div class="plane"></div>
      <div class="plane"></div>
      <div class="plane"></div>
    </div>

    <div class="verify-container">
      <!-- Header -->
      <div class="verify-header">
        <img class="verify-logo" src="/favicon-128x128.png" alt="AE" />
        <h1 class="verify-title">Aero Evidence</h1>
        <p class="verify-subtitle">检修记录公开验证门户</p>
      </div>

      <!-- Input -->
      <div class="verify-card">
        <div class="verify-input-section">
          <label class="verify-input-label">输入记录 ID（0x 开头的链上记录标识）</label>
          <div class="verify-input-row">
            <el-input
              v-model="recordIdInput"
              placeholder="0x..."
              class="verify-input"
              clearable
              @keyup.enter="handleVerify"
            />
            <el-button
              type="primary"
              :loading="loading"
              @click="handleVerify"
              class="verify-btn"
            >
              验证
            </el-button>
          </div>
          <div class="verify-hint">
            支持通过 URL 参数自动验证：<span class="mono">/verify?recordId=0x...</span>
          </div>
        </div>

        <!-- Not found -->
        <transition name="fade">
          <div v-if="result && !result.found" class="verify-result-banner verify-fail">
            <div class="banner-icon">!</div>
            <div class="banner-text">
              <div class="banner-title">未找到记录</div>
              <div class="banner-detail">{{ result.message }}</div>
            </div>
          </div>
        </transition>

        <!-- Verified / Tampered banner -->
        <transition name="fade">
          <div v-if="result && result.found" class="verify-result-banner" :class="result.verified ? 'verify-pass' : 'verify-fail'">
            <div class="banner-icon">{{ result.verified ? '&#10003;' : '&#10007;' }}</div>
            <div class="banner-text">
              <div class="banner-title">{{ result.verified ? '验证通过 - 数据完整' : '检测到篡改' }}</div>
              <div class="banner-detail">
                {{ result.verified
                  ? '该记录的离链数据与区块链上存储的哈希完全一致，数据未被篡改。'
                  : `检测到 ${result.tamperedFields.length} 项数据不一致：${result.tamperedFields.map(f => result.hashComparisons.find(h => h.name === f)?.label).join('、')}` }}
              </div>
              <div class="banner-time">验证时间：{{ formatDateTime(result.verifiedAt) }}</div>
            </div>
          </div>
        </transition>

        <!-- Record Summary -->
        <transition name="fade">
          <div v-if="result && result.found" class="verify-section">
            <div class="section-title">记录摘要</div>
            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-label">飞机注册号</span>
                <span class="summary-value">{{ result.recordSummary.aircraftRegNo }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">机型</span>
                <span class="summary-value">{{ result.recordSummary.aircraftType || '-' }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">工卡号</span>
                <span class="summary-value mono">{{ result.recordSummary.jobCardNo }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">版本</span>
                <span class="summary-value">R{{ result.recordSummary.revision }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">工作类型</span>
                <span class="summary-value">{{ result.recordSummary.workType }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">ATA 代码</span>
                <span class="summary-value">{{ result.recordSummary.ataCode || '-' }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">执行人</span>
                <span class="summary-value">{{ result.recordSummary.performerName }} ({{ result.recordSummary.performerEmployeeNo }})</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">状态</span>
                <span class="summary-value">{{ STATUS_LABELS[result.recordSummary.status] || result.recordSummary.status }}</span>
              </div>
            </div>
          </div>
        </transition>

        <!-- Hash Comparisons -->
        <transition name="fade">
          <div v-if="result && result.found" class="verify-section">
            <div class="section-title">哈希完整性比对（共 {{ result.hashComparisons.length }} 项）</div>
            <div class="hash-table">
              <div class="hash-row hash-header">
                <span class="hash-cell hash-name">数据项</span>
                <span class="hash-cell hash-status">状态</span>
                <span class="hash-cell hash-value">链上哈希</span>
                <span class="hash-cell hash-value">重算哈希</span>
              </div>
              <div v-for="h in result.hashComparisons" :key="h.name" class="hash-row" :class="{ 'hash-mismatch': !h.match }">
                <span class="hash-cell hash-name">{{ h.label }}</span>
                <span class="hash-cell hash-status">
                  <span class="hash-tag" :class="h.match ? 'tag-pass' : 'tag-fail'">{{ h.match ? '一致' : '不一致' }}</span>
                </span>
                <span class="hash-cell hash-value mono" :title="h.onChain">{{ shortenHash(h.onChain) }}</span>
                <span class="hash-cell hash-value mono" :title="h.recomputed">{{ shortenHash(h.recomputed) }}</span>
              </div>
            </div>
          </div>
        </transition>

        <!-- Signature Chain -->
        <transition name="fade">
          <div v-if="result && result.found && result.signatureChain.length > 0" class="verify-section">
            <div class="section-title">签名链（共 {{ result.signatureCount }} 个签名）</div>
            <el-timeline>
              <el-timeline-item
                v-for="(sig, i) in result.signatureChain"
                :key="i"
                :type="sig.action === 'reject' ? 'danger' : sig.action === 'release' ? 'success' : 'primary'"
                :timestamp="formatDateTime(sig.signedAt)"
                placement="top"
              >
                <div class="sig-card">
                  <div class="sig-action">{{ sig.actionLabel }}</div>
                  <div class="sig-detail">
                    <span class="sig-role">{{ sig.signerRoleLabel }}</span>
                    <span class="sig-emp">{{ sig.signerEmployeeNo }}</span>
                    <span class="sig-bound" :class="sig.addressBound ? 'bound-yes' : 'bound-no'">
                      {{ sig.addressBound ? '✓ 地址已绑定' : '⚠ 地址未绑定' }}
                    </span>
                  </div>
                  <div v-if="sig.addressBound" class="sig-bound-detail">
                    {{ sig.boundName }}（{{ sig.boundEmployeeNo }}）
                  </div>
                  <div class="sig-address mono">{{ shortenHash(sig.signerAddress) }}</div>
                </div>
              </el-timeline-item>
            </el-timeline>
          </div>
        </transition>

        <!-- Export PDF button -->
        <transition name="fade">
          <div v-if="result && result.found" class="verify-section" style="padding-top:1rem;border-top:none;margin-top:0">
            <el-button
              type="primary"
              plain
              :loading="pdfLoading"
              @click="handleExportPdf"
            >
              ↓ 导出检修报告 PDF
            </el-button>
          </div>
        </transition>

        <!-- Admin tamper demo -->
        <transition name="fade">
          <div v-if="result && result.found && isAdmin" class="verify-section admin-section">
            <div class="section-title">篡改演示（仅管理员可见）</div>
            <div class="admin-hint">
              此功能用于答辩演示。点击"模拟篡改"会直接修改数据库中的 workDescription 字段，
              但不会修改链上数据。重新验证后将检测到 formHash 不一致。
            </div>
            <div class="admin-actions">
              <el-button
                type="danger"
                :loading="tamperLoading"
                :disabled="!result.verified"
                @click="handleTamper"
              >
                模拟篡改
              </el-button>
              <el-button
                type="success"
                :loading="restoreLoading"
                :disabled="result.verified"
                @click="handleRestore"
              >
                恢复数据
              </el-button>
            </div>
            <div class="admin-flow">
              演示流程：正常验证 &#10003; &#8594; 点击篡改 &#8594; 自动重新验证 &#10007; &#8594; 点击恢复 &#8594; 自动重新验证 &#10003;
            </div>
          </div>
        </transition>
      </div>

      <!-- Footer -->
      <div class="verify-footer">
        <router-link to="/auth" class="verify-link">返回登录</router-link>
        <span class="verify-footer-sep">|</span>
        <router-link to="/workspace/home" class="verify-link">进入工作台</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.verify-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 30% 20%, #e8f0fe 0%, #f5f7fa 50%, #eef1f5 100%);
  position: relative;
  overflow: hidden;
  padding: 2rem 1rem;
}

.verify-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 820px;
}

.verify-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.verify-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 0.5rem;
}

.verify-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #10243b;
  margin: 0;
  letter-spacing: 1px;
}

.verify-subtitle {
  font-size: 0.95rem;
  color: #607087;
  margin: 0.25rem 0 0;
}

.verify-card {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-radius: 1.25rem;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(16, 36, 59, 0.08);
}

/* ─── Input ─── */

.verify-input-section {
  margin-bottom: 1rem;
}

.verify-input-label {
  display: block;
  font-size: 0.85rem;
  color: #607087;
  margin-bottom: 0.5rem;
}

.verify-input-row {
  display: flex;
  gap: 0.75rem;
}

.verify-input {
  flex: 1;
}

.verify-btn {
  min-width: 80px;
}

.verify-hint {
  font-size: 0.75rem;
  color: #8899aa;
  margin-top: 0.5rem;
}

/* ─── Result banner ─── */

.verify-result-banner {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 0.75rem;
  margin-top: 1.5rem;
}

.verify-pass {
  background: #f0fdf4;
  border: 1px solid #86efac;
}

.verify-fail {
  background: #fef2f2;
  border: 1px solid #fca5a5;
}

.banner-icon {
  font-size: 1.5rem;
  font-weight: 700;
  min-width: 2rem;
  text-align: center;
}

.verify-pass .banner-icon { color: #16a34a; }
.verify-fail .banner-icon { color: #dc2626; }

.banner-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #10243b;
}

.banner-detail {
  font-size: 0.85rem;
  color: #374151;
  margin-top: 0.25rem;
  line-height: 1.5;
}

.banner-time {
  font-size: 0.75rem;
  color: #8899aa;
  margin-top: 0.35rem;
}

/* ─── Sections ─── */

.verify-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: #10243b;
  margin-bottom: 1rem;
}

/* ─── Summary grid ─── */

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.summary-label {
  font-size: 0.75rem;
  color: #8899aa;
}

.summary-value {
  font-size: 0.9rem;
  color: #10243b;
  font-weight: 500;
}

/* ─── Hash table ─── */

.hash-table {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
}

.hash-row {
  display: grid;
  grid-template-columns: 100px 72px 1fr 1fr;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  align-items: center;
  border-bottom: 1px solid #f3f4f6;
}

.hash-row:last-child { border-bottom: none; }

.hash-header {
  background: #f9fafb;
  font-size: 0.78rem;
  color: #607087;
  font-weight: 600;
}

.hash-mismatch {
  background: #fef2f2;
}

.hash-cell {
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hash-name { font-weight: 600; color: #10243b; }
.hash-value { color: #607087; }

.hash-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}

.tag-pass { background: #dcfce7; color: #16a34a; }
.tag-fail { background: #fee2e2; color: #dc2626; }

/* ─── Signature chain ─── */

.sig-card {
  background: #f9fafb;
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
}

.sig-action {
  font-weight: 700;
  font-size: 0.9rem;
  color: #10243b;
}

.sig-detail {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.25rem;
  font-size: 0.82rem;
  color: #607087;
}

.sig-role {
  background: #e0e7ff;
  color: #3730a3;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.72rem;
}

.sig-address {
  font-size: 0.72rem;
  color: #9ca3af;
  margin-top: 0.2rem;
}

.sig-bound {
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.bound-yes { background: #dcfce7; color: #16a34a; }
.bound-no  { background: #fef9c3; color: #92400e; }

.sig-bound-detail {
  font-size: 0.78rem;
  color: #374151;
  margin-top: 0.2rem;
}

/* ─── Admin section ─── */

.admin-section {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-top: 1.5rem;
}

.admin-hint {
  font-size: 0.82rem;
  color: #92400e;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.admin-actions {
  display: flex;
  gap: 0.75rem;
}

.admin-flow {
  font-size: 0.78rem;
  color: #92400e;
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 0.375rem;
}

/* ─── Footer ─── */

.verify-footer {
  text-align: center;
  margin-top: 1.25rem;
  font-size: 0.82rem;
}

.verify-link {
  color: #3b82f6;
  text-decoration: none;
}

.verify-link:hover {
  text-decoration: underline;
}

.verify-footer-sep {
  color: #d1d5db;
  margin: 0 0.5rem;
}

/* ─── Utilities ─── */

.mono {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.82em;
}

/* ─── Transitions ─── */

.fade-enter-active { animation: fadeIn 0.3s ease; }
.fade-leave-active { animation: fadeIn 0.2s ease reverse; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── Responsive ─── */

@media (max-width: 640px) {
  .hash-row {
    grid-template-columns: 1fr 1fr;
  }
  .hash-header .hash-value { display: none; }
  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
