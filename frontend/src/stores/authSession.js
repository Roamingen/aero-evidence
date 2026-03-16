import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { parseJsonResponse } from '../utils/http';
import { buildApiUrl } from '../utils/apiBase';
import { createRandomWallet, createWalletFromPrivateKey } from '../utils/wallet';

function createInitialRegisterForm() {
  return {
    employeeNo: '',
    invitationCode: '',
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

const activeAuthTab = ref('login');
const registerForm = ref(createInitialRegisterForm());
const loginForm = ref(createInitialLoginForm());

const registerLoading = ref(false);
const loginLoading = ref(false);

const registerChallenge = ref(null);
const registerDerivedAddress = ref('');
const registerResult = ref(null);

const loginResult = ref(loadPersistedLoginResult());
const loginChallenge = ref(null);
const loginDerivedAddress = ref('');

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
    return '/workspace/home';
  }
  if (hasAnyPermission(['record.view'])) {
    return '/workspace/home';
  }
  if (hasAnyPermission(['record.approve'])) {
    return '/workspace/home';
  }
  if (hasAnyPermission(['user.manage', 'role.manage', 'user.preregister'])) {
    return '/workspace/home';
  }
  return '/auth';
}

function generateLoginWallet() {
  const wallet = createRandomWallet();
  loginForm.value.privateKey = wallet.privateKey;
  loginDerivedAddress.value = wallet.address;
  ElMessage.success('已生成测试钱包');
}

function generateRegisterWallet() {
  const wallet = createRandomWallet();
  registerForm.value.privateKey = wallet.privateKey;
  registerDerivedAddress.value = wallet.address;
  ElMessage.success('已生成测试钱包');
}

async function handleRegister() {
  try {
    registerLoading.value = true;
    registerResult.value = null;

    const wallet = createWalletFromPrivateKey(registerForm.value.privateKey);
    registerDerivedAddress.value = wallet.address;

    const challengeResponse = await fetch(buildApiUrl('/api/auth/activate/challenge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeNo: registerForm.value.employeeNo,
        activationCode: registerForm.value.invitationCode,
        address: wallet.address,
      }),
    });

    const challengeData = await parseJsonResponse(challengeResponse);
    if (!challengeResponse.ok) {
      throw new Error(challengeData.message || '获取注册挑战失败');
    }

    registerChallenge.value = challengeData;
    const signature = await wallet.signMessage(challengeData.message);

    const verifyResponse = await fetch(buildApiUrl('/api/auth/activate/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeNo: registerForm.value.employeeNo,
        address: wallet.address,
        signature,
      }),
    });

    const verifyData = await parseJsonResponse(verifyResponse);
    if (!verifyResponse.ok) {
      throw new Error(verifyData.message || '注册失败');
    }

    registerResult.value = {
      ...verifyData,
      signature,
    };
    loginForm.value.privateKey = registerForm.value.privateKey;
    loginDerivedAddress.value = wallet.address;
    activeAuthTab.value = 'login';
    ElMessage.success('账户已注册，请登录');
  } catch (error) {
    ElMessage.error(error.message || '注册失败');
  } finally {
    registerLoading.value = false;
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
  registerForm.value = createInitialRegisterForm();
  loginForm.value = createInitialLoginForm();
  registerResult.value = null;
  registerChallenge.value = null;
  loginResult.value = null;
  loginChallenge.value = null;
  registerDerivedAddress.value = '';
  loginDerivedAddress.value = '';
  activeAuthTab.value = 'login';
}

export function useAuthSession() {
  return {
    activeAuthTab,
    generateLoginWallet,
    generateRegisterWallet,
    handleLogin,
    handleRegister,
    hasAnyPermission,
    hasPermission,
    initializeAuthSession,
    isLoggedIn,
    loginChallenge,
    loginDerivedAddress,
    loginForm,
    loginLoading,
    loginResult,
    latestLoggedInUser,
    currentPermissionCodes,
    getDefaultWorkspaceRoute,
    registerChallenge,
    registerDerivedAddress,
    registerForm,
    registerLoading,
    registerResult,
    resetAuthSession,
  };
}