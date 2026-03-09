<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage } from 'element-plus';

import { useAuthSession } from '../stores/authSession';
import { authorizedJsonRequest } from '../utils/apiClient';

const auth = useAuthSession();

const loading = ref(false);
const savingUser = ref(false);
const savingTemplate = ref(false);
const users = ref([]);
const roles = ref([]);
const templates = ref([]);
const selectedTemplateCode = ref('');

const userForm = reactive({
  employeeNo: '',
  name: '',
  department: '',
  status: 'active',
  roleCodes: [],
});

const templateForm = reactive({
  templateCode: '',
  templateName: '',
  workType: '',
  ataCode: '',
  aircraftType: '',
  isActive: true,
  defaultSignersJson: '[\n  {\n    "signerRole": "reviewer",\n    "employeeNo": "E2008",\n    "isRequired": true,\n    "sequenceNo": 0\n  }\n]',
});

const canLoad = computed(() => auth.isLoggedIn.value && auth.loginResult.value?.token);

function fillUserForm(user) {
  userForm.employeeNo = user.employeeNo;
  userForm.name = user.name;
  userForm.department = user.department;
  userForm.status = user.status;
  userForm.roleCodes = [...(user.roles || [])];
}

function fillTemplateForm(template) {
  selectedTemplateCode.value = template?.templateCode || '';
  templateForm.templateCode = template?.templateCode || '';
  templateForm.templateName = template?.templateName || '';
  templateForm.workType = template?.workType || '';
  templateForm.ataCode = template?.ataCode || '';
  templateForm.aircraftType = template?.aircraftType || '';
  templateForm.isActive = template?.isActive ?? true;
  templateForm.defaultSignersJson = JSON.stringify(template?.defaultSigners || [], null, 2);
}

async function fetchAdminData() {
  if (!canLoad.value) {
    return;
  }

  try {
    loading.value = true;
    const [usersData, rolesData, templatesData] = await Promise.all([
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/users', { method: 'GET' }),
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/roles', { method: 'GET' }),
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/signer-templates', { method: 'GET' }),
    ]);

    users.value = usersData.users || [];
    roles.value = rolesData.roles || [];
    templates.value = templatesData.templates || [];

    if (users.value.length > 0) {
      fillUserForm(users.value[0]);
    }
    if (templates.value.length > 0) {
      fillTemplateForm(templates.value[0]);
    }
  } catch (error) {
    ElMessage.error(error.message || '加载人员管理数据失败');
  } finally {
    loading.value = false;
  }
}

async function saveUser() {
  try {
    savingUser.value = true;
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${userForm.employeeNo}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name: userForm.name,
          department: userForm.department,
          status: userForm.status,
          roleCodes: userForm.roleCodes,
        }),
      },
    );

    const targetIndex = users.value.findIndex((item) => item.employeeNo === data.user.employeeNo);
    if (targetIndex >= 0) {
      users.value.splice(targetIndex, 1, data.user);
    }
    fillUserForm(data.user);
    ElMessage.success('用户信息已更新');
  } catch (error) {
    ElMessage.error(error.message || '更新用户失败');
  } finally {
    savingUser.value = false;
  }
}

function createTemplate() {
  fillTemplateForm(null);
}

async function saveTemplate() {
  try {
    savingTemplate.value = true;
    const defaultSigners = JSON.parse(templateForm.defaultSignersJson || '[]');
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/signer-templates/${templateForm.templateCode}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          templateName: templateForm.templateName,
          workType: templateForm.workType,
          ataCode: templateForm.ataCode,
          aircraftType: templateForm.aircraftType,
          isActive: templateForm.isActive,
          defaultSigners,
        }),
      },
    );

    const index = templates.value.findIndex((item) => item.templateCode === data.template.templateCode);
    if (index >= 0) {
      templates.value.splice(index, 1, data.template);
    } else {
      templates.value.unshift(data.template);
    }
    fillTemplateForm(data.template);
    ElMessage.success('签名模板已保存');
  } catch (error) {
    ElMessage.error(error.message || '保存签名模板失败');
  } finally {
    savingTemplate.value = false;
  }
}

onMounted(() => {
  fetchAdminData();
});
</script>

<template>
  <div v-if="!canLoad" class="result-block">
    <el-alert
      type="warning"
      :closable="false"
      title="请先登录后再进入人员管理"
      description="当前页面需要管理员登录态和 JWT。"
    />
    <div class="button-row top-gap">
      <RouterLink to="/auth" class="workspace-auth-link">前往认证页</RouterLink>
    </div>
  </div>

  <div v-else class="module-stack" v-loading="loading">
    <section class="module-grid card-grid-three">
      <article class="module-panel member-card">
        <div class="module-title">人员总数</div>
        <div class="member-card-count">{{ users.length }}</div>
        <div class="module-subtitle">来自 /api/auth/users 真实接口</div>
      </article>
      <article class="module-panel member-card">
        <div class="module-title">角色目录</div>
        <div class="member-card-count">{{ roles.length }}</div>
        <div class="module-subtitle">来自 /api/auth/roles 真实接口</div>
      </article>
      <article class="module-panel member-card">
        <div class="module-title">签名模板</div>
        <div class="member-card-count">{{ templates.length }}</div>
        <div class="module-subtitle">支持保存默认指定签名人配置</div>
      </article>
    </section>

    <section class="module-grid two-up-grid users-page-grid">
      <article class="module-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">人员列表</div>
            <div class="module-subtitle">选择人员后可在右侧修改角色、部门和状态。</div>
          </div>
        </div>

        <div class="records-table-shell compact-table-shell">
          <div class="records-table-row records-table-head compact-head">
            <span>工号</span>
            <span>姓名</span>
            <span>部门</span>
            <span>角色</span>
            <span>状态</span>
          </div>

          <button
            v-for="row in users"
            :key="row.employeeNo"
            class="records-table-row compact-head row-button"
            @click="fillUserForm(row)"
          >
            <span class="mono">{{ row.employeeNo }}</span>
            <span>{{ row.name }}</span>
            <span>{{ row.department }}</span>
            <span>{{ row.roles.join(', ') }}</span>
            <span><span class="status-chip">{{ row.status }}</span></span>
          </button>
        </div>
      </article>

      <article class="module-panel accent-panel">
        <div class="module-title">用户编辑</div>

        <el-form label-position="top">
          <div class="form-grid two-col">
            <el-form-item label="工号">
              <el-input v-model="userForm.employeeNo" disabled />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="userForm.status" style="width: 100%">
                <el-option label="pending_activation" value="pending_activation" />
                <el-option label="active" value="active" />
                <el-option label="disabled" value="disabled" />
                <el-option label="revoked" value="revoked" />
              </el-select>
            </el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="姓名">
              <el-input v-model="userForm.name" />
            </el-form-item>
            <el-form-item label="部门">
              <el-input v-model="userForm.department" />
            </el-form-item>
          </div>

          <el-form-item label="角色">
            <el-select v-model="userForm.roleCodes" multiple style="width: 100%">
              <el-option v-for="role in roles" :key="role.code" :label="`${role.name} (${role.code})`" :value="role.code" />
            </el-select>
          </el-form-item>

          <div class="button-row">
            <el-button type="primary" :loading="savingUser" @click="saveUser">保存用户</el-button>
          </div>
        </el-form>
      </article>
    </section>

    <section class="module-grid two-up-grid users-page-grid">
      <article class="module-panel">
        <div class="module-header-row">
          <div>
            <div class="module-title">签名模板</div>
            <div class="module-subtitle">定义工卡模板的默认指定签名人，不必每次提交都手工填写。</div>
          </div>
          <el-button plain @click="createTemplate">新建模板</el-button>
        </div>

        <div class="tag-flow">
          <button
            v-for="template in templates"
            :key="template.templateCode"
            class="filter-pill button-pill"
            :class="{ 'is-active': selectedTemplateCode === template.templateCode }"
            @click="fillTemplateForm(template)"
          >
            {{ template.templateName }}
          </button>
        </div>
      </article>

      <article class="module-panel accent-panel">
        <div class="module-title">模板编辑</div>
        <el-form label-position="top">
          <div class="form-grid two-col">
            <el-form-item label="模板编码">
              <el-input v-model="templateForm.templateCode" />
            </el-form-item>
            <el-form-item label="模板名称">
              <el-input v-model="templateForm.templateName" />
            </el-form-item>
          </div>

          <div class="form-grid three-col">
            <el-form-item label="工作类型">
              <el-input v-model="templateForm.workType" />
            </el-form-item>
            <el-form-item label="ATA">
              <el-input v-model="templateForm.ataCode" />
            </el-form-item>
            <el-form-item label="机型">
              <el-input v-model="templateForm.aircraftType" />
            </el-form-item>
          </div>

          <el-form-item label="是否启用">
            <div class="switch-wrap">
              <el-switch v-model="templateForm.isActive" />
            </div>
          </el-form-item>

          <el-form-item label="默认指定签名人 JSON">
            <el-input v-model="templateForm.defaultSignersJson" type="textarea" :rows="10" resize="none" />
          </el-form-item>

          <div class="button-row">
            <el-button type="primary" :loading="savingTemplate" @click="saveTemplate">保存模板</el-button>
          </div>
        </el-form>
      </article>
    </section>
  </div>
</template>