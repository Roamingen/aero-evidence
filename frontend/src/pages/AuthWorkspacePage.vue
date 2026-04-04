<script setup>
import { useRouter } from 'vue-router';

import { useAuthSession } from '../stores/authSession';

const router = useRouter();
const auth = useAuthSession();

async function handleLoginAndGoMaintenance() {
  await auth.handleLogin();
  if (auth.isLoggedIn.value) {
    router.push(auth.getDefaultWorkspaceRoute());
  }
}

async function handleRegisterAndLogin() {
  await auth.handleRegister();
}
</script>

<template>
  <div class="auth-shell">
    <!-- 背景动画 -->
    <div class="bg-animation">
      <div class="plane"></div>
      <div class="plane"></div>
      <div class="plane"></div>
    </div>

    <!-- 认证卡片 -->
    <div class="auth-container">
      <div class="auth-card">
        <!-- 卡片头部 -->
        <div class="auth-header">
          <h1 class="auth-title">Aero Evidence</h1>
          <p class="auth-subtitle">民航检修记录存证系统</p>
        </div>

        <!-- Tab 标签 -->
        <div class="tab-header">
          <button
            v-for="tab in ['login', 'register']"
            :key="tab"
            :class="['tab-button', { active: auth.activeAuthTab.value === tab }]"
            @click="auth.activeAuthTab.value = tab"
          >
            {{ tab === 'login' ? '登录' : '注册' }}
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="tab-content">
          <!-- 登录表单 -->
          <div class="form-panel" :class="{ 'panel-hidden': auth.activeAuthTab.value !== 'login' }">
            <el-form label-position="top" class="auth-form">
              <div class="metamask-hint">
                点击下方按钮连接 MetaMask 钱包，系统将使用您的钱包地址进行身份验证。
              </div>

              <div class="button-group">
                <el-button
                  type="primary"
                  :loading="auth.loginLoading.value"
                  @click="handleLoginAndGoMaintenance"
                  class="primary-btn"
                >
                  连接 MetaMask 登录
                </el-button>
              </div>
            </el-form>

            <!-- 登录结果 -->
            <transition name="fade">
              <div v-if="auth.loginDerivedAddress.value" class="result-section">
                <div class="result-item">
                  <span class="result-label">登录地址</span>
                  <span class="result-value">{{ auth.loginDerivedAddress.value }}</span>
                </div>
              </div>
            </transition>

            <transition name="fade">
              <div v-if="auth.latestLoggedInUser.value" class="user-info">
                <div class="info-title">✓ 登录成功</div>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">工号</span>
                    <span class="info-value">{{ auth.latestLoggedInUser.value.employeeNo }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">姓名</span>
                    <span class="info-value">{{ auth.latestLoggedInUser.value.name }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">部门</span>
                    <span class="info-value">{{ auth.latestLoggedInUser.value.department }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">状态</span>
                    <span class="info-value">{{ auth.latestLoggedInUser.value.status }}</span>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- 注册表单 -->
            <div class="form-panel" :class="{ 'panel-hidden': auth.activeAuthTab.value !== 'register' }">
            <el-form label-position="top" class="auth-form">
              <div class="form-row">
                <div class="form-col">
                  <el-form-item label="工号">
                    <el-input v-model="auth.registerForm.value.employeeNo" placeholder="输入工号" />
                  </el-form-item>
                </div>
                <div class="form-col">
                  <el-form-item label="邀请码">
                    <el-input v-model="auth.registerForm.value.invitationCode" placeholder="输入邀请码" />
                  </el-form-item>
                </div>
              </div>

              <div class="metamask-hint">
                输入工号和邀请码后，点击下方按钮连接 MetaMask 完成账户激活。
              </div>

              <div class="button-group">
                <el-button
                  type="primary"
                  :loading="auth.registerLoading.value"
                  @click="handleRegisterAndLogin"
                  class="primary-btn"
                >
                  连接 MetaMask 注册
                </el-button>
              </div>
            </el-form>

            <!-- 注册结果 -->
            <transition name="fade">
              <div v-if="auth.registerDerivedAddress.value" class="result-section">
                <div class="result-item">
                  <span class="result-label">注册地址</span>
                  <span class="result-value">{{ auth.registerDerivedAddress.value }}</span>
                </div>
              </div>
            </transition>

            <transition name="fade">
              <div v-if="auth.registerResult.value" class="user-info">
                <div class="info-title">✓ 注册成功</div>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">工号</span>
                    <span class="info-value">{{ auth.registerResult.value.user.employeeNo }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">状态</span>
                    <span class="info-value">{{ auth.registerResult.value.user.status }}</span>
                  </div>
                </div>
              </div>
            </transition>
            </div>
        </div>
      </div>

      <div class="auth-footer-link">
        <RouterLink to="/verify" class="auth-verify-link">🔍 公开验证门户</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-footer-link {
  text-align: center;
  margin-top: 1rem;
}

.auth-verify-link {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #607087;
  text-decoration: none;
  padding: 0.4rem 1.1rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(16, 36, 59, 0.15);
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.auth-verify-link:hover {
  color: #10243b;
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(16, 36, 59, 0.3);
  box-shadow: 0 2px 8px rgba(16, 36, 59, 0.1);
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.auth-shell {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle, rgba(16, 36, 59, 0.15) 1px, transparent 1px),
    radial-gradient(circle at top left, rgba(95, 160, 255, 0.35), transparent 35%),
    radial-gradient(circle at bottom right, rgba(255, 156, 102, 0.3), transparent 35%),
    linear-gradient(140deg, #f0f6fb 0%, #f8fafc 45%, #fffaf5 100%);
  background-size: 40px 40px, 100% 100%, 100% 100%, 100% 100%;
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  z-index: 1000;
}

/* 背景动画 */
.bg-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;
}

.plane {
  position: absolute;
  width: 100px;
  height: 100px;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="rgba(16,36,59,0.08)" d="M90 50L10 30V70L90 50Z"/><path fill="rgba(16,36,59,0.12)" d="M90 50L50 40V60L90 50Z"/></svg>') no-repeat center;
  animation: fly 20s linear infinite;
}

.plane:nth-child(1) {
  top: 20%;
  animation-delay: 0s;
  animation-duration: 25s;
}

.plane:nth-child(2) {
  top: 40%;
  animation-delay: -5s;
  animation-duration: 30s;
}

.plane:nth-child(3) {
  top: 60%;
  animation-delay: -10s;
  animation-duration: 20s;
}

@keyframes fly {
  0% {
    transform: translateX(-100px) translateY(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateX(calc(100vw + 100px)) translateY(-50px) rotate(10deg);
    opacity: 0;
  }
}

/* 认证容器 */
.auth-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 480px;
  padding: 20px;
  animation: slideUp 0.8s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.auth-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* 卡片头部 */
.auth-header {
  padding: 40px 32px 30px;
  text-align: center;
  background: linear-gradient(135deg, rgba(16, 36, 59, 0.05) 0%, rgba(24, 58, 93, 0.05) 100%);
  border-bottom: 1px solid rgba(16, 36, 59, 0.1);
  animation: fadeIn 0.8s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
  color: #10243b;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.auth-subtitle {
  font-size: 13px;
  color: #607087;
  font-weight: 500;
  letter-spacing: 1px;
}

/* Tab 标签 */
.tab-header {
  display: flex;
  border-bottom: 2px solid #f0f0f0;
  position: relative;
  padding: 0 32px;
}

.tab-button {
  flex: 1;
  padding: 16px;
  background: none;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: #999;
  cursor: pointer;
  transition: color 0.3s ease;
  position: relative;
}

.tab-button.active {
  color: #10243b;
}

.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: #10243b;
  animation: underlineSlide 0.3s ease-out;
}

@keyframes underlineSlide {
  from {
    width: 0;
    left: 50%;
  }
  to {
    width: 100%;
    left: 0;
  }
}

/* 内容区域 */
.tab-content {
  padding: 32px;
  position: relative;
}

.form-panel {
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
  transition: grid-template-rows 0.35s ease, opacity 0.35s ease;
  opacity: 1;
}

.panel-hidden {
  grid-template-rows: 0fr;
  opacity: 0;
  pointer-events: none;
}

.form-panel > * {
  min-height: 0;
}

.auth-form {
  width: 100%;
}

/* 表单元素 */
:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 600;
  color: #10243b;
  margin-bottom: 8px !important;
}

:deep(.el-input) {
  width: 100%;
}

:deep(.el-input__wrapper) {
  background: #ffffff !important;
  border: 2px solid #e8e8e8 !important;
  border-radius: 8px !important;
  transition: all 0.3s ease !important;
  box-shadow: none !important;
}

:deep(.el-input__wrapper:hover) {
  border-color: #d0d0d0 !important;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #10243b !important;
  box-shadow: 0 0 0 3px rgba(16, 36, 59, 0.1) !important;
}

:deep(.el-input__inner) {
  background: transparent !important;
  border: none !important;
  font-size: 14px !important;
  color: #333 !important;
}

:deep(.el-input__inner::placeholder) {
  color: #999 !important;
}

:deep(.el-textarea__wrapper) {
  background: #ffffff !important;
  border: 2px solid #e8e8e8 !important;
  border-radius: 8px !important;
  transition: all 0.3s ease !important;
  box-shadow: none !important;
  padding: 0 !important;
}

:deep(.el-textarea__wrapper:hover) {
  border-color: #d0d0d0 !important;
}

:deep(.el-textarea__wrapper.is-focus) {
  border-color: #10243b !important;
  box-shadow: 0 0 0 3px rgba(16, 36, 59, 0.1) !important;
}

:deep(.el-textarea__inner) {
  background: transparent !important;
  border: none !important;
  font-size: 14px !important;
  color: #333 !important;
  padding: 12px 14px !important;
}

:deep(.el-textarea__inner::placeholder) {
  color: #999 !important;
}

/* 表单布局 */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 0;
}

.form-col {
  width: 100%;
}

.form-col :deep(.el-form-item) {
  margin-bottom: 0;
}

/* 按钮组 */
.button-group {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.metamask-hint {
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px dashed #d0d5dd;
  font-size: 13px;
  color: #607087;
  line-height: 1.6;
  margin-top: 8px;
}

.primary-btn {
  flex: 1;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #10243b 0%, #183a5d 100%) !important;
  border: none !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 4px 15px rgba(16, 36, 59, 0.3) !important;
}

.primary-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 36, 59, 0.4) !important;
}

.primary-btn:active {
  transform: translateY(0);
}

.secondary-btn {
  height: 44px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  background: #f5f5f5 !important;
  border: 2px solid #e8e8e8 !important;
  color: #333 !important;
  transition: all 0.3s ease !important;
}

.secondary-btn:hover {
  background: #efefef !important;
  border-color: #d8d8d8 !important;
}

/* 结果展示 */
.result-section {
  margin-top: 20px;
  padding: 16px;
  background: #f0f7ff;
  border-radius: 8px;
  border-left: 3px solid #10243b;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-label {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-value {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #333;
  word-break: break-all;
  background: white;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
}

/* 用户信息 */
.user-info {
  margin-top: 24px;
  padding: 20px;
  background: #f0f7ff;
  border-radius: 8px;
  border: 1px solid #b3d9ff;
}

.info-title {
  font-size: 14px;
  font-weight: 700;
  color: #0d47a1;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 11px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.info-value {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式设计 */
@media (max-width: 600px) {
  .auth-container {
    max-width: 100%;
    padding: 12px;
  }

  .auth-card {
    border-radius: 12px;
  }

  .auth-header {
    padding: 24px 20px 16px;
  }

  .auth-title {
    font-size: 22px;
  }

  .tab-header {
    padding: 0 20px;
  }

  .tab-content {
    padding: 20px;
    min-height: auto;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .button-group {
    flex-direction: column;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
