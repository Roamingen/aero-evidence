<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage } from 'element-plus';

import { useAuthSession } from '../stores/authSession';
import { authorizedJsonRequest } from '../utils/apiClient';

const auth = useAuthSession();

const loading = ref(false);
const savingUser = ref(false);
const savingPreregister = ref(false);
const savingAddress = ref(false);
const detailDrawerVisible = ref(false);
const selectedUser = ref(null);
const preregisterResult = ref(null);
const modifyingAddress = ref(false);
const newAddressForm = reactive({
  address: '',
});

const users = ref([]);
const roles = ref([]);
const activationCodes = ref([]);
const permissions = ref([]);
const userPermissions = ref(null);

const preregisterForm = reactive({
  employeeNo: '',
  name: '',
  department: '',
  roleCodes: [],
});

const userForm = reactive({
  employeeNo: '',
  name: '',
  department: '',
  status: 'active',
  roleCodes: [],
});

const canLoad = computed(() => auth.isLoggedIn.value && auth.loginResult.value?.token);

function resetPreregisterForm() {
  preregisterForm.employeeNo = '';
  preregisterForm.name = '';
  preregisterForm.department = '';
  preregisterForm.roleCodes = [];
}

function getActivationCodeForUser(employeeNo) {
  const code = activationCodes.value.find(c => c.employeeNo === employeeNo);
  return code ? {
    codeLast4: code.codeLast4,
    expiresAt: code.expiresAt,
    id: code.id,
  } : null;
}

async function fillUserForm(user) {
  selectedUser.value = user;
  selectedUser.value.activationCode = getActivationCodeForUser(user.employeeNo);
  selectedUser.value.latestActivationCodeFull = null;
  userForm.employeeNo = user.employeeNo;
  userForm.name = user.name;
  userForm.department = user.department;
  userForm.status = user.status;
  userForm.roleCodes = [...(user.roles || [])];
  modifyingAddress.value = false;
  newAddressForm.address = '';
  detailDrawerVisible.value = true;

  // 加载用户权限详情
  try {
    const permData = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${user.employeeNo}/permissions`,
      { method: 'GET' }
    );
    userPermissions.value = permData;
  } catch (error) {
    ElMessage.error('加载用户权限失败：' + (error.message || '未知错误'));
  }
}

async function fetchAdminData() {
  if (!canLoad.value) {
    return;
  }

  try {
    loading.value = true;
    const [usersData, rolesData, codesData, permissionsData] = await Promise.all([
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/users', { method: 'GET' }),
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/roles', { method: 'GET' }),
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/activation-codes', { method: 'GET' }).catch(() => ({ codes: [] })),
      authorizedJsonRequest(auth.loginResult.value.token, '/api/auth/permissions', { method: 'GET' }).catch(() => ({ permissions: [] })),
    ]);

    users.value = usersData.users || [];
    roles.value = rolesData.roles || [];
    activationCodes.value = codesData.codes || [];
    permissions.value = permissionsData.permissions || [];
  } catch (error) {
    ElMessage.error(error.message || '加载人员管理数据失败');
  } finally {
    loading.value = false;
  }
}

async function preregisterUser() {
  if (!preregisterForm.employeeNo || !preregisterForm.name) {
    ElMessage.warning('请填写工号和姓名');
    return;
  }

  try {
    savingPreregister.value = true;
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      '/api/auth/admin/preregister',
      {
        method: 'POST',
        body: JSON.stringify({
          employeeNo: preregisterForm.employeeNo,
          name: preregisterForm.name,
          department: preregisterForm.department,
          roleCodes: preregisterForm.roleCodes,
        }),
      },
    );

    preregisterResult.value = data;
    ElMessage.success('预注册成功');
    resetPreregisterForm();
    await fetchAdminData();
  } catch (error) {
    ElMessage.error(error.message || '预注册失败');
  } finally {
    savingPreregister.value = false;
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

async function regenerateActivationCode(employeeNo) {
  try {
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/activation-codes/${employeeNo}/regenerate`,
      { method: 'POST' },
    );
    ElMessage.success('激活码已重新生成');
    await fetchAdminData();
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      selectedUser.value.activationCode = getActivationCodeForUser(employeeNo);
      // 显示完整激活码给管理员
      selectedUser.value.latestActivationCodeFull = data.activationCode;
    }
  } catch (error) {
    ElMessage.error(error.message || '重新生成激活码失败');
  }
}

async function revokeActivationCode(employeeNo) {
  try {
    await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/activation-codes/${employeeNo}/revoke`,
      { method: 'POST' },
    );
    ElMessage.success('激活码已撤销');
    await fetchAdminData();
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      selectedUser.value.activationCode = null;
      selectedUser.value.latestActivationCodeFull = null;
    }
  } catch (error) {
    ElMessage.error(error.message || '撤销激活码失败');
  }
}

async function modifyUserAddress(employeeNo) {
  if (!newAddressForm.address) {
    ElMessage.warning('请输入新的区块链地址');
    return;
  }

  try {
    savingAddress.value = true;
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${employeeNo}/modify-address`,
      {
        method: 'POST',
        body: JSON.stringify({
          address: newAddressForm.address,
        }),
      },
    );
    ElMessage.success('用户地址已修改');
    newAddressForm.address = '';
    modifyingAddress.value = false;
    await fetchAdminData();
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      fillUserForm(data.user);
    }
  } catch (error) {
    ElMessage.error(error.message || '修改用户地址失败');
  } finally {
    savingAddress.value = false;
  }
}

async function deleteUserPermissionOverride(employeeNo) {
  try {
    await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${employeeNo}/permissions/override`,
      { method: 'DELETE' },
    );
    ElMessage.success('权限配置已删除');
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      await fillUserForm(selectedUser.value);
    }
  } catch (error) {
    ElMessage.error(error.message || '删除权限配置失败');
  }
}

async function setUserPermissionOverride(employeeNo, permissionCode, effect, reason = '') {
  try {
    await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${employeeNo}/permissions/override`,
      {
        method: 'POST',
        body: JSON.stringify({
          permissionCode,
          effect,
          reason: reason || null,
        }),
      },
    );
    ElMessage.success(`权限已${effect === 'allow' ? '赋予' : '撤销'}`);
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      await fillUserForm(selectedUser.value);
    }
  } catch (error) {
    ElMessage.error(error.message || '设置权限失败');
  }
}

async function resetUserToPending(employeeNo) {
  try {
    const data = await authorizedJsonRequest(
      auth.loginResult.value.token,
      `/api/auth/users/${employeeNo}/reset-pending`,
      { method: 'POST' },
    );
    ElMessage.success(`用户已重置为待激活，新激活码：${data.activationCode}`);
    await fetchAdminData();
    if (selectedUser.value && selectedUser.value.employeeNo === employeeNo) {
      selectedUser.value.activationCode = getActivationCodeForUser(employeeNo);
      userForm.status = 'pending_activation';
    }
  } catch (error) {
    ElMessage.error(error.message || '重置用户失败');
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
    <!-- 统计卡片 -->
    <section class="module-grid card-grid-three">
      <article class="module-panel member-card">
        <div class="module-title">人员总数</div>
        <div class="member-card-count">{{ users.length }}</div>
        <div class="module-subtitle">已激活的用户数量</div>
      </article>
      <article class="module-panel member-card">
        <div class="module-title">角色目录</div>
        <div class="member-card-count">{{ roles.length }}</div>
        <div class="module-subtitle">系统中定义的角色</div>
      </article>
      <article class="module-panel member-card">
        <div class="module-title">待激活</div>
        <div class="member-card-count">{{ activationCodes.length }}</div>
        <div class="module-subtitle">已生成的激活码</div>
      </article>
    </section>

    <!-- 预注册功能 -->
    <section class="module-panel">
      <div class="module-header-row">
        <div>
          <div class="module-title">预注册新员工</div>
          <div class="module-subtitle">生成激活码，员工使用激活码完成注册</div>
        </div>
      </div>

      <el-form label-position="top" class="preregister-form">
        <div class="form-grid two-col">
          <el-form-item label="工号">
            <el-input v-model="preregisterForm.employeeNo" placeholder="例如 E1001" />
          </el-form-item>
          <el-form-item label="姓名">
            <el-input v-model="preregisterForm.name" placeholder="例如 张三" />
          </el-form-item>
        </div>

        <div class="form-grid two-col">
          <el-form-item label="部门">
            <el-input v-model="preregisterForm.department" placeholder="例如 机务一部" />
          </el-form-item>
          <el-form-item label="角色">
            <el-select v-model="preregisterForm.roleCodes" multiple placeholder="选择角色" style="width: 100%">
              <el-option v-for="role in roles" :key="role.code" :label="`${role.name} (${role.code})`" :value="role.code" />
            </el-select>
          </el-form-item>
        </div>

        <div class="button-row">
          <el-button type="primary" :loading="savingPreregister" @click="preregisterUser">
            生成激活码
          </el-button>
        </div>
      </el-form>

      <!-- 预注册结果 -->
      <transition name="fade">
        <div v-if="preregisterResult" class="preregister-result">
          <div class="result-header">
            <div class="result-title">✓ 预注册成功</div>
            <el-button text type="primary" @click="preregisterResult = null">关闭</el-button>
          </div>

          <div class="result-item">
            <span class="result-label">员工工号</span>
            <span class="result-value">{{ preregisterResult.user.employeeNo }}</span>
          </div>

          <div class="result-item">
            <span class="result-label">员工姓名</span>
            <span class="result-value">{{ preregisterResult.user.name }}</span>
          </div>

          <div class="result-item">
            <span class="result-label">激活码</span>
            <div class="activation-code-display">
              <span class="code mono">{{ preregisterResult.activationCode }}</span>
              <el-button size="small" @click="() => navigator.clipboard.writeText(preregisterResult.activationCode)">
                复制
              </el-button>
            </div>
            <div class="code-hint">请将此激活码发送给员工</div>
          </div>

          <div class="result-item">
            <span class="result-label">有效期至</span>
            <span class="result-value">{{ new Date(preregisterResult.activationCodeExpiresAt).toLocaleString('zh-CN') }}</span>
          </div>
        </div>
      </transition>
    </section>

    <!-- 人员管理功能 -->
    <section class="module-panel">
      <div class="module-header-row">
        <div>
          <div class="module-title">人员管理</div>
          <div class="module-subtitle">点击人员可编辑信息、查看激活码</div>
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
    </section>
  </div>

  <!-- 用户详情抽屉 -->
  <el-drawer v-model="detailDrawerVisible" size="40%" title="用户详情">
    <div v-if="selectedUser" class="module-stack">
      <!-- 基础信息 -->
      <section class="module-panel">
        <div class="module-title">基础信息</div>
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

          <el-form-item label="权限">
            <div v-if="userPermissions" class="permissions-list">
              <div class="permission-row">
                <span class="permission-label">角色权限：</span>
                <div class="permission-tags">
                  <el-tag v-for="perm in userPermissions.permissions" :key="perm" style="margin-right: 0.5rem; margin-bottom: 0.5rem;">
                    {{ perm }}
                  </el-tag>
                </div>
              </div>

              <div v-if="userPermissions.permissionOverrides && userPermissions.permissionOverrides.length > 0" class="override-row">
                <span class="permission-label">权限覆盖：</span>
                <div class="override-list">
                  <div v-for="override in userPermissions.permissionOverrides" :key="override.id" class="override-item">
                    <span class="override-code">{{ override.permissionCode }}</span>
                    <el-tag :type="override.effect === 'allow' ? 'success' : 'danger'" size="small">
                      {{ override.effect === 'allow' ? '允许' : '拒绝' }}
                    </el-tag>
                    <el-button size="small" text type="danger" @click="deleteUserPermissionOverride(selectedUser.employeeNo)">
                      删除
                    </el-button>
                  </div>
                </div>
              </div>

              <div class="add-override">
                <el-select placeholder="选择权限添加覆盖" size="small" style="width: 200px;">
                  <el-option v-for="perm in permissions" :key="perm.code" :label="`${perm.name} (${perm.code})`" :value="perm.code" />
                </el-select>
                <el-select placeholder="选择效果" size="small" style="width: 100px; margin-left: 0.5rem;">
                  <el-option label="允许" value="allow" />
                  <el-option label="拒绝" value="deny" />
                </el-select>
              </div>
            </div>
            <div v-else class="empty-state">
              <p>加载权限中...</p>
            </div>
          </el-form-item>

          <div class="button-row">
            <el-button type="primary" :loading="savingUser" @click="saveUser">保存用户</el-button>
          </div>
        </el-form>
      </section>

      <!-- 区块链地址管理 -->
      <section class="module-panel">
        <div class="module-title">区块链地址</div>
        <div class="address-section">
          <div v-if="selectedUser.address" class="address-item">
            <div class="address-label">当前地址</div>
            <div class="address-value mono">{{ selectedUser.address }}</div>
            <div class="address-hint">绑定于 {{ new Date(selectedUser.addressBoundAt).toLocaleString('zh-CN') }}</div>
            <div class="address-actions">
              <el-button size="small" @click="() => { newAddressForm.address = selectedUser.address; modifyingAddress = !modifyingAddress; }">
                修改地址
              </el-button>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>该用户尚未绑定地址</p>
          </div>

          <!-- 修改地址表单 -->
          <transition name="fade">
            <div v-if="modifyingAddress" class="modify-address-form">
              <el-form label-position="top">
                <el-form-item label="新地址">
                  <el-input v-model="newAddressForm.address" placeholder="输入新的区块链地址 (0x开头)" />
                </el-form-item>
                <div class="form-actions">
                  <el-button type="primary" :loading="savingAddress" @click="modifyUserAddress(selectedUser.employeeNo)">
                    确认修改
                  </el-button>
                  <el-button @click="modifyingAddress = false; newAddressForm.address = ''">
                    取消
                  </el-button>
                </div>
              </el-form>
            </div>
          </transition>
        </div>
      </section>

      <!-- 激活码管理 (仅在用户为pending时显示) -->
      <section v-if="selectedUser.status !== 'active'" class="module-panel">
        <div class="module-title">激活码管理</div>
        <div class="activation-code-section">
          <div v-if="selectedUser.activationCode" class="activation-code-item">
            <div class="code-label">当前激活码</div>
            <div class="code-value mono">{{ selectedUser.latestActivationCodeFull }}</div>
            <div class="code-hint">有效期至 {{ new Date(selectedUser.activationCode.expiresAt).toLocaleString('zh-CN') }}</div>
            <div class="code-actions">
              <el-button size="small" type="primary" @click="regenerateActivationCode(selectedUser.employeeNo)">
                重新生成
              </el-button>
              <el-button size="small" type="danger" @click="revokeActivationCode(selectedUser.employeeNo)">
                撤销激活码
              </el-button>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>该用户暂无有效激活码</p>
            <el-button size="small" type="primary" @click="regenerateActivationCode(selectedUser.employeeNo)">
              生成激活码
            </el-button>
          </div>
        </div>
      </section>

      <!-- 用户重置 -->
      <section class="module-panel">
        <div class="module-title">用户重置</div>
        <div class="reset-section">
          <p class="reset-hint">将用户状态重置为待激活，清除现有地址绑定，并生成新的激活码。</p>
          <div class="reset-actions">
            <el-button type="warning" @click="resetUserToPending(selectedUser.employeeNo)">
              重置为待激活
            </el-button>
          </div>
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.preregister-form {
  margin-top: 1rem;
}

.preregister-result {
  margin-top: 1.5rem;
  padding: 1.2rem;
  background: linear-gradient(135deg, rgba(16, 36, 59, 0.08), rgba(24, 58, 93, 0.08));
  border-radius: 0.95rem;
  border: 1px solid rgba(16, 36, 59, 0.15);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(16, 36, 59, 0.1);
}

.result-title {
  font-size: 1rem;
  font-weight: 700;
  color: #10243b;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.result-item {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.result-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #6e7f95;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.result-value {
  font-size: 0.95rem;
  color: #10243b;
  font-weight: 500;
}

.activation-code-display {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.code {
  flex: 1;
  padding: 0.75rem;
  background: white;
  border-radius: 0.6rem;
  border: 2px solid rgba(16, 36, 59, 0.15);
  font-size: 0.95rem;
  color: #10243b;
  font-weight: 700;
  letter-spacing: 0.05em;
  word-break: break-all;
}

.code-hint {
  font-size: 0.8rem;
  color: #999;
  margin-top: 0.3rem;
}

.activation-code-section {
  margin-top: 1rem;
}

.activation-code-item {
  padding: 1rem;
  background: rgba(16, 36, 59, 0.05);
  border-radius: 0.95rem;
  border: 1px solid rgba(16, 36, 59, 0.1);
}

.code-label {
  font-size: 0.84rem;
  color: #6e7f95;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.code-value {
  font-size: 1.1rem;
  color: #10243b;
  font-weight: 700;
  padding: 0.75rem;
  background: white;
  border-radius: 0.6rem;
  border: 1px solid rgba(16, 36, 59, 0.1);
  margin-bottom: 0.75rem;
  word-break: break-all;
}

.code-actions {
  display: flex;
  gap: 0.5rem;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  color: #999;
}

.address-section {
  margin-top: 1rem;
}

.address-item {
  padding: 1rem;
  background: rgba(16, 36, 59, 0.05);
  border-radius: 0.95rem;
  border: 1px solid rgba(16, 36, 59, 0.1);
}

.address-label {
  font-size: 0.84rem;
  color: #6e7f95;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.address-value {
  font-size: 0.9rem;
  color: #10243b;
  font-weight: 700;
  padding: 0.75rem;
  background: white;
  border-radius: 0.6rem;
  border: 1px solid rgba(16, 36, 59, 0.1);
  margin-bottom: 0.5rem;
  word-break: break-all;
  font-family: 'Courier New', monospace;
}

.address-hint {
  font-size: 0.8rem;
  color: #999;
  margin-bottom: 0.75rem;
}

.address-actions {
  display: flex;
  gap: 0.5rem;
}

.modify-address-form {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(95, 160, 255, 0.05);
  border-radius: 0.95rem;
  border: 1px solid rgba(95, 160, 255, 0.2);
  animation: slideDown 0.3s ease-out;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.permissions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.permission-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.permission-label {
  font-size: 0.84rem;
  font-weight: 600;
  color: #6e7f95;
}

.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.override-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(255, 152, 0, 0.05);
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 152, 0, 0.1);
}

.override-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.override-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  padding: 0.5rem;
  background: white;
  border-radius: 0.4rem;
  border: 1px solid rgba(255, 152, 0, 0.15);
}

.override-code {
  font-weight: 500;
  color: #10243b;
  flex: 1;
}

.add-override {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.reset-section {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 152, 0, 0.05);
  border-radius: 0.95rem;
  border: 1px solid rgba(255, 152, 0, 0.2);
}

.reset-hint {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 1rem;
  line-height: 1.5;
}

.reset-actions {
  display: flex;
  gap: 0.5rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:deep(.el-drawer__body) {
  padding: 1.2rem;
  overflow-y: auto;
}
</style>
