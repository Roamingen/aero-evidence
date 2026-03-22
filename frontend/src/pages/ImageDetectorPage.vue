<script setup>
import { ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthSession } from '../stores/authSession';
import { buildApiUrl } from '../utils/apiBase';

const auth = useAuthSession();
const uploadRef = ref(null);
const fileList = ref([]);
const results = ref([]);
const detecting = ref(false);

const handleFileChange = (file, files) => {
  fileList.value = files;
};

const detectImages = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择图片');
    return;
  }

  detecting.value = true;
  const formData = new FormData();
  fileList.value.forEach(file => {
    formData.append('files', file.raw);
  });

  try {
    const response = await fetch(buildApiUrl('/api/image-detection/detect/batch'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.loginResult.value?.token}` },
      body: formData,
    });

    if (!response.ok) throw new Error('检测请求失败');

    const data = await response.json();
    results.value = data.results.map((result, index) => ({
      ...result,
      preview: fileList.value[index]?.url || '',
    }));

    ElMessage.success('检测完成');
  } catch (error) {
    ElMessage.error(error.message || '检测失败');
  } finally {
    detecting.value = false;
  }
};

const clearAll = () => {
  fileList.value = [];
  results.value = [];
  uploadRef.value?.clearFiles();
};

const normalCount = () => results.value.filter(r => !r.error && r.is_normal).length;
const abnormalCount = () => results.value.filter(r => !r.error && !r.is_normal).length;
const errorCount = () => results.value.filter(r => r.error).length;
</script>

<template>
  <div class="module-stack">

    <section class="module-panel">
      <div class="module-header-row">
        <div>
          <div class="detector-page-title">图像上传</div>
          <div class="module-subtitle">支持 JPG、PNG、BMP、WebP、TIFF 格式，单次最多 20 张。</div>
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
          accept=".jpg,.jpeg,.png,.bmp,.gif,.webp,.tiff,.tif"
          multiple
          :limit="20"
          class="detector-upload"
        >
          <el-icon :size="36"><Plus /></el-icon>
        </el-upload>
      </div>

      <div class="button-row top-gap detector-action-row" style="justify-content: center;">
        <el-button
          type="primary"
          size="large"
          :loading="detecting"
          :disabled="fileList.length === 0"
          @click="detectImages"
        >
          {{ detecting ? '检测中…' : '开始检测' }}
        </el-button>
        <el-button size="large" :disabled="fileList.length === 0" @click="clearAll">清空</el-button>
      </div>
    </section>

    <template v-if="results.length > 0">
      <section class="module-grid card-grid-three">
        <article class="module-panel member-card">
          <div class="module-title">正常</div>
          <div class="member-card-count" style="color: var(--color-success, #67c23a)">{{ normalCount() }}</div>
          <div class="module-subtitle">未检测到异常</div>
        </article>
        <article class="module-panel member-card">
          <div class="module-title">异常</div>
          <div class="member-card-count" style="color: var(--color-danger, #f56c6c)">{{ abnormalCount() }}</div>
          <div class="module-subtitle">检测到潜在损伤</div>
        </article>
        <article class="module-panel member-card">
          <div class="module-title">失败</div>
          <div class="member-card-count">{{ errorCount() }}</div>
          <div class="module-subtitle">无法完成检测</div>
        </article>
      </section>

      <section class="module-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">检测结果</div>
            <div class="module-subtitle">共 {{ results.length }} 张，点击图片可放大查看。</div>
          </div>
          <div class="filter-pills">
            <span class="filter-pill is-active">全部 {{ results.length }}</span>
            <span class="filter-pill" style="color: var(--color-success, #67c23a)">正常 {{ normalCount() }}</span>
            <span class="filter-pill" style="color: var(--color-danger, #f56c6c)">异常 {{ abnormalCount() }}</span>
          </div>
        </div>

        <div class="detector-results-grid">
          <div
            v-for="(result, index) in results"
            :key="index"
            class="detector-result-card"
            :class="{
              'is-normal': !result.error && result.is_normal,
              'is-abnormal': !result.error && !result.is_normal,
              'is-error': result.error,
            }"
          >
            <el-image
              :src="result.preview"
              fit="cover"
              class="detector-result-image"
              :preview-src-list="[result.preview]"
              preview-teleported
            />
            <div class="detector-result-body">
              <div class="detector-result-filename">{{ result.filename }}</div>
              <div class="detector-result-foot">
                <template v-if="!result.error">
                  <span class="status-chip" :class="result.is_normal ? 'chip-success' : 'chip-danger'">
                    {{ result.is_normal ? '正常' : '异常' }}
                  </span>
                  <span class="detector-confidence">置信度 {{ (result.confidence * 100).toFixed(1) }}%</span>
                </template>
                <template v-else>
                  <span class="status-chip">检测失败</span>
                  <span class="detector-error-msg">{{ result.error }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <div v-else-if="!detecting && fileList.length > 0" class="module-panel">
      <div class="module-empty-state">已选择 {{ fileList.length }} 张图片，点击「开始检测」运行分析。</div>
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

.detector-upload {
  width: 100%;
  max-width: 860px;
}

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

.detector-action-row {
  margin-top: 1.8rem;
}

.detector-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.detector-result-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1.5px solid var(--border-color, #e4e7ed);
  background: var(--surface-color, #fff);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.detector-result-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
}

.detector-result-card.is-normal {
  border-color: #b7eb8f;
}

.detector-result-card.is-abnormal {
  border-color: #ffa39e;
}

.detector-result-card.is-error {
  border-color: #d9d9d9;
  opacity: 0.75;
}

.detector-result-image {
  width: 100%;
  height: 180px;
  display: block;
}

.detector-result-body {
  padding: 12px 14px;
}

.detector-result-filename {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detector-result-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip-success {
  background: #f6ffed;
  color: #52c41a;
  border-color: #b7eb8f;
}

.chip-danger {
  background: #fff2f0;
  color: #ff4d4f;
  border-color: #ffa39e;
}

.detector-confidence {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.detector-error-msg {
  font-size: 11px;
  color: #f56c6c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
