<script setup>
import { ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthSession } from '../stores/authSession';
import { buildApiUrl } from '../utils/apiBase';

const auth = useAuthSession();
const uploadRef = ref(null);
const fileList = ref([]);
const analyzing = ref(false);
const results = ref([]);

const handleFileChange = (file, files) => {
  fileList.value = files;
  results.value = [];
};

const analyzeImages = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择图片');
    return;
  }

  analyzing.value = true;
  results.value = fileList.value.map(f => ({
    filename: f.name,
    preview: f.url || '',
    yoloStatus: 'loading',
    aiStatus: 'loading',
    analysis: null,
    aiVerdict: null,
    yoloResult: null,
    error: null,
  }));

  await Promise.all(fileList.value.map(async (file, i) => {
    // 阶段一：YOLO
    try {
      const fd1 = new FormData();
      fd1.append('file', file.raw);
      const r1 = await fetch(buildApiUrl('/api/image-detection/detect-only'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.loginResult.value?.token}` },
        body: fd1,
      });
      const yoloData = await r1.json();
      results.value[i] = { ...results.value[i], yoloStatus: 'done', yoloResult: r1.ok ? yoloData : null };
    } catch {
      results.value[i] = { ...results.value[i], yoloStatus: 'error' };
    }

    // 阶段二：AI 分析
    try {
      const fd2 = new FormData();
      fd2.append('file', file.raw);
      if (results.value[i].yoloResult) {
        fd2.append('yoloResult', JSON.stringify(results.value[i].yoloResult));
      }
      const r2 = await fetch(buildApiUrl('/api/image-detection/analyze-full'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.loginResult.value?.token}` },
        body: fd2,
      });
      const aiData = await r2.json();
      if (!r2.ok) throw new Error(aiData.error || 'AI 分析失败');
      results.value[i] = { ...results.value[i], aiStatus: 'done', analysis: aiData.analysis, aiVerdict: aiData.aiVerdict };
    } catch (error) {
      results.value[i] = { ...results.value[i], aiStatus: 'error', error: error.message };
    }
  }));

  analyzing.value = false;
  ElMessage.success('全部分析完成');
};

const clearAll = () => {
  fileList.value = [];
  results.value = [];
  uploadRef.value?.clearFiles();
};
</script>

<template>
  <div class="module-stack">

    <section class="module-panel">
      <div class="module-header-row">
        <div>
          <div class="detector-page-title">AI 图像检修分析</div>
          <div class="module-subtitle">上传飞机部件或机身照片，AI 将自动识别故障并给出检修建议。支持 JPG、PNG、BMP、WebP，单次最多 20 张。</div>
        </div>
        <div class="filter-pills">
          <span class="filter-pill">已选 {{ fileList.length }} 张</span>
        </div>
      </div>

      <div class="detector-upload-wrap">
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :on-change="handleFileChange"
          :file-list="fileList"
          list-type="picture-card"
          accept=".jpg,.jpeg,.png,.bmp,.webp"
          multiple
          :limit="20"
          class="detector-upload"
        >
          <el-icon :size="36"><Plus /></el-icon>
        </el-upload>
      </div>

      <div class="button-row top-gap detector-action-row" style="justify-content: center;">
        <el-button type="primary" size="large" :loading="analyzing" :disabled="fileList.length === 0" @click="analyzeImages">
          {{ analyzing ? 'AI 分析中…' : '开始 AI 分析' }}
        </el-button>
        <el-button size="large" :disabled="fileList.length === 0" @click="clearAll">清空</el-button>
      </div>
    </section>

    <section v-for="(result, index) in results" :key="index" class="module-panel result-panel">
      <div class="result-layout">
        <!-- 左：图片预览 -->
        <div class="result-preview-col">
          <el-image
            v-if="result.preview"
            :src="result.preview"
            fit="cover"
            class="result-preview-img"
            :preview-src-list="[result.preview]"
            preview-teleported
          />
          <div class="result-filename">{{ result.filename }}</div>
        </div>

        <!-- 右：分析结果 -->
        <div class="result-content-col">

          <!-- YOLO 结果（先到） -->
          <div v-if="result.yoloStatus === 'loading'" class="yolo-row yolo-unavailable">
            <span class="yolo-label">YOLO 初检</span>
            <span style="font-size:0.78rem;color:#8899aa">检测中…</span>
          </div>
          <div v-else-if="result.yoloResult" class="yolo-row">
            <span class="yolo-label">YOLO 初检</span>
            <span class="status-chip" :class="result.yoloResult.is_normal ? 'chip-success' : 'chip-danger'">
              {{ result.yoloResult.is_normal ? '正常' : '异常' }}
            </span>
            <span class="yolo-conf">置信度 {{ (result.yoloResult.confidence * 100).toFixed(1) }}%</span>
          </div>
          <div v-else class="yolo-row yolo-unavailable">YOLO 服务不可用</div>

          <!-- AI 判断（后到） -->
          <div v-if="result.aiStatus === 'loading'" class="yolo-row yolo-unavailable">
            <span class="yolo-label">AI 判断</span>
            <span style="font-size:0.78rem;color:#8899aa">AI 分析中…</span>
          </div>
          <div v-else-if="result.aiVerdict !== null" class="yolo-row">
            <span class="yolo-label">AI 判断</span>
            <span class="status-chip" :class="result.aiVerdict === 'normal' ? 'chip-success' : 'chip-danger'">
              {{ result.aiVerdict === 'normal' ? '正常' : '异常' }}
            </span>
          </div>

          <!-- AI 建议 -->
          <template v-if="result.aiStatus === 'done'">
            <div class="analysis-section-title">✈️ AI 检修建议</div>
            <div class="analysis-content">{{ result.analysis }}</div>
          </template>
          <div v-else-if="result.aiStatus === 'error'" class="analysis-error">
            <span class="status-chip">✗ 分析失败</span>
            <span style="font-size:0.85rem;color:#f56c6c;margin-left:0.5rem">{{ result.error }}</span>
          </div>
          <div v-else class="analysis-loading">
            <div class="loading-icon">✈️</div>
            <div class="loading-text">AI 分析中，请稍候…</div>
          </div>

        </div>
      </div>
    </section>

    <div v-if="results.length === 0 && !analyzing && fileList.length > 0" class="module-panel">
      <div class="module-empty-state">已选择 {{ fileList.length }} 张图片，点击「开始 AI 分析」运行分析。</div>
    </div>

  </div>
</template>

<style scoped>
.detector-page-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #17263a;
  line-height: 1.15;
}

.detector-upload-wrap {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
}

.detector-upload { width: 100%; max-width: 860px; }

.detector-upload :deep(.el-upload-list--picture-card) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.detector-upload :deep(.el-upload--picture-card) {
  width: 160px;
  height: 160px;
  border-radius: 14px;
  border: 2px dashed rgba(19, 32, 51, 0.18);
  background: rgba(248, 250, 253, 0.9);
  transition: border-color 0.2s, background 0.2s;
}

.detector-upload :deep(.el-upload--picture-card:hover) {
  border-color: #ce6f2d;
  background: rgba(206, 111, 45, 0.05);
}

.detector-upload :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 160px;
  height: 160px;
  border-radius: 14px;
  margin: 0;
}

.detector-action-row { margin-top: 1.8rem; }
.result-panel { overflow: hidden; }

.result-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 1.5rem;
  align-items: start;
}

.result-preview-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.result-preview-img {
  width: 160px;
  height: 160px;
  border-radius: 10px;
  object-fit: cover;
}

.result-filename {
  font-size: 0.75rem;
  color: #8899aa;
  text-align: center;
  word-break: break-all;
}

.result-content-col { min-width: 0; }

.analysis-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.loading-icon {
  font-size: 1.5rem;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-text { color: #607087; font-size: 0.9rem; }
.analysis-error { display: flex; align-items: center; padding: 0.75rem 0; }

.yolo-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  background: rgba(19, 32, 51, 0.04);
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
}

.yolo-label { font-size: 0.78rem; font-weight: 700; color: #607087; }
.yolo-conf { font-size: 0.78rem; color: #8899aa; margin-left: auto; }
.yolo-unavailable { font-size: 0.78rem; color: #aab; }

.analysis-section-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #374151;
  margin: 0.5rem 0;
}

.analysis-content {
  font-size: 0.92rem;
  color: #17263a;
  line-height: 1.8;
  white-space: pre-wrap;
}

.chip-success { background: #f6ffed; color: #52c41a; }
.chip-danger { background: #fff2f0; color: #ff4d4f; }

@media (max-width: 768px) {
  .result-layout { grid-template-columns: 1fr; }
}
</style>
