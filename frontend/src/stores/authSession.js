import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { parseJsonResponse } from '../utils/http';
import { buildApiUrl } from '../utils/apiBase';
import { createRandomWallet, createWalletFromPrivateKey } from '../utils/wallet';

function createInitialPreregisterForm() {
  return {
    bootstrapKey: 'change-this-bootstrap-key',
    employeeNo: '',
    name: '',
    department: '机务一部',
    roleCodes: ['engineer_submitter'],
  };
}

function createInitialActivationForm() {
  return {
    employeeNo: '',
    activationCode: '',
    privateKey: '',
  };
}

function createInitialLoginForm() {
  return {
    privateKey: '',
  };
}

const AUTH_SESSION_STORAGE_KEY = 'aero-evidence.auth-session.v1';

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function pickPersistedLoginResult(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  if (!source.token || !source.user) {
    return null;
  }

  return {
    token: source.token,
    user: source.user,
  };
}

function loadPersistedLoginResult() {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    return pickPersistedLoginResult(JSON.parse(rawValue));
  } catch {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

function persistLoginResult(result) {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  if (!result?.token || !result?.user) {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  storage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      token: result.token,
      user: result.user,
    }),
  );
}

const activeAuthTab = ref('preregister');
const preregisterForm = ref(createInitialPreregisterForm());
const activationForm = ref(createInitialActivationForm());
const loginForm = ref(createInitialLoginForm());

const preregisterLoading = ref(false);
const activationLoading = ref(false);
const loginLoading = ref(false);

const preregisterResult = ref(null);
const activationChallenge = ref(null);
const activationResult = ref(null);
const loginResult = ref(loadPersistedLoginResult());
const loginChallenge = ref(null);

const activationDerivedAddress = ref('');
const loginDerivedAddress = ref('');

const latestActivatedUser = computed(() => activationResult.value?.user || null);
const latestLoggedInUser = computed(() => loginResult.value?.user || null);
const isLoggedIn = computed(() => Boolean(loginResult.value?.token && latestLoggedInUser.value));
const currentPermissionCodes = computed(() => latestLoggedInUser.value?.permissions || []);

let initializeAuthSessionPromise = null;

watch(loginResult, (value) => {
  persistLoginResult(value);
}, { deep: true });

function hasPermission(permissionCode) {
  if (!permissionCode) {
    return true;
  }
  return currentPermissionCodes.value.includes(permissionCode);
}

function hasAnyPermission(permissionCodes = []) {
  if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) {
    return true;
  }
  return permissionCodes.some((permissionCode) => hasPermission(permissionCode));
}

function getDefaultWorkspaceRoute() {
  if (hasAnyPermission(['record.create', 'record.submit'])) {
    return '/workspace/submit';
  }
  if (hasAnyPermission(['record.view'])) {
    return '/workspace/records';
  }
  if (hasAnyPermission(['record.approve'])) {
    return '/workspace/approvals';
  }
  if (hasAnyPermission(['user.manage', 'role.manage', 'user.preregister'])) {
    return '/workspace/users';
  }
  return '/auth';
}

function generateActivationWallet() {
  const wallet = createRandomWallet();
  activationForm.value.privateKey = wallet.privateKey;
  activationDerivedAddress.value = wallet.address;
  ElMessage.success('已生成测试钱包');
}

function generateLoginWallet() {
  const wallet = createRandomWallet();
  loginForm.value.privateKey = wallet.privateKey;
  loginDerivedAddress.value = wallet.address;
  ElMessage.success('已生成测试钱包');
}

async function handlePreregister() {
  try {
    preregisterLoading.value = true;
    preregisterResult.value = null;

    const response = await fetch(buildApiUrl('/api/auth/admin/preregister'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-bootstrap-key': preregisterForm.value.bootstrapKey,
      },
      body: JSON.stringify({
        employeeNo: preregisterForm.value.employeeNo,
        name: preregisterForm.value.name,
        department: preregisterForm.value.department,
        roleCodes: preregisterForm.value.roleCodes,
      }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.message || '预注册失败');
    }

    preregisterResult.value = data;
    activationForm.value.employeeNo = data.user.employeeNo;
    activationForm.value.activationCode = data.activationCode;
    activeAuthTab.value = 'activate';
    ElMessage.success('预注册成功，已生成激活码');
  } catch (error) {
    ElMessage.error(error.message || '预注册失败');
  } finally {
    preregisterLoading.value = false;
  }
}

async function handleActivate() {
  try {
    activationLoading.value = true;
    activationResult.value = null;

    const wallet = createWalletFromPrivateKey(activationForm.value.privateKey);
    activationDerivedAddress.value = wallet.address;

    const challengeResponse = await fetch(buildApiUrl('/api/auth/activate/challenge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeNo: activationForm.value.employeeNo,
        activationCode: activationForm.value.activationCode,
        address: wallet.address,
      }),
    });

    const challengeData = await parseJsonResponse(challengeResponse);
    if (!challengeResponse.ok) {
      throw new Error(challengeData.message || '获取激活挑战失败');
    }

    activationChallenge.value = challengeData;
    const signature = await wallet.signMessage(challengeData.message);

    const verifyResponse = await fetch(buildApiUrl('/api/auth/activate/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeNo: activationForm.value.employeeNo,
        address: wallet.address,
        signature,
      }),
    });

    const verifyData = await parseJsonResponse(verifyResponse);
    if (!verifyResponse.ok) {
      throw new Error(verifyData.message || '激活失败');
    }

    activationResult.value = {
      ...verifyData,
      signature,
    };
    loginForm.value.privateKey = activationForm.value.privateKey;
    loginDerivedAddress.value = wallet.address;
    activeAuthTab.value = 'login';
    ElMessage.success('账户已激活，可以直接登录');
  } catch (error) {
    ElMessage.error(error.message || '激活失败');
  } finally {
    activationLoading.value = false;
  }
}

async function handleLogin() {
  try {
    loginLoading.value = true;
    loginResult.value = null;

    const wallet = createWalletFromPrivateKey(loginForm.value.privateKey);
    loginDerivedAddress.value = wallet.address;

    const nonceResponse = await fetch(buildApiUrl('/api/auth/nonce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });

    const nonceData = await parseJsonResponse(nonceResponse);
    if (!nonceResponse.ok) {
      throw new Error(nonceData.message || '获取登录挑战失败');
    }

    loginChallenge.value = nonceData;
    const signature = await wallet.signMessage(nonceData.message);

    const verifyResponse = await fetch(buildApiUrl('/api/auth/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        signature,
      }),
    });

    const verifyData = await parseJsonResponse(verifyResponse);
    if (!verifyResponse.ok) {
      throw new Error(verifyData.message || '登录失败');
    }

    const meResponse = await fetch(buildApiUrl('/api/auth/me'), {
      headers: {
        Authorization: `Bearer ${verifyData.token}`,
      },
    });

    const meData = await parseJsonResponse(meResponse);
    if (!meResponse.ok) {
      throw new Error(meData.message || '获取当前用户失败');
    }

    loginResult.value = {
      token: verifyData.token,
      user: meData.user,
      signature,
    };
    ElMessage.success('登录成功');
  } catch (error) {
    ElMessage.error(error.message || '登录失败');
  } finally {
    loginLoading.value = false;
  }
}

async function initializeAuthSession() {
  if (initializeAuthSessionPromise) {
    return initializeAuthSessionPromise;
  }

  initializeAuthSessionPromise = (async () => {
    if (!loginResult.value?.token) {
      return null;
    }

    try {
      const meResponse = await fetch(buildApiUrl('/api/auth/me'), {
        headers: {
          Authorization: `Bearer ${loginResult.value.token}`,
        },
      });

      const meData = await parseJsonResponse(meResponse);
      if (!meResponse.ok) {
        throw new Error(meData.message || '恢复登录态失败');
      }

      loginResult.value = {
        ...loginResult.value,
        user: meData.user,
      };
      return loginResult.value;
    } catch {
      loginResult.value = null;
      return null;
    } finally {
      initializeAuthSessionPromise = null;
    }
  })();

  return initializeAuthSessionPromise;
}

function resetAuthSession() {
  preregisterForm.value = createInitialPreregisterForm();
  activationForm.value = createInitialActivationForm();
  loginForm.value = createInitialLoginForm();
  preregisterResult.value = null;
  activationChallenge.value = null;
  activationResult.value = null;
  loginResult.value = null;
  loginChallenge.value = null;
  activationDerivedAddress.value = '';
  loginDerivedAddress.value = '';
  activeAuthTab.value = 'preregister';
}

export function useAuthSession() {
  return {
    activeAuthTab,
    activationChallenge,
    activationDerivedAddress,
    activationForm,
    activationLoading,
    activationResult,
    generateActivationWallet,
    generateLoginWallet,
    handleActivate,
    handleLogin,
    handlePreregister,
    hasAnyPermission,
    hasPermission,
    initializeAuthSession,
    isLoggedIn,
    latestActivatedUser,
    latestLoggedInUser,
    currentPermissionCodes,
    loginChallenge,
    loginDerivedAddress,
    loginForm,
    loginLoading,
    loginResult,
    preregisterForm,
    preregisterLoading,
    preregisterResult,
    getDefaultWorkspaceRoute,
    resetAuthSession,
  };
}