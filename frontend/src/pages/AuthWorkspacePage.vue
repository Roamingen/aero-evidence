<script setup>
import { useRouter } from 'vue-router';

import { useAuthSession } from '../stores/authSession';

const router = useRouter();
const auth = useAuthSession();

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

async function handleLoginAndGoMaintenance() {
  await auth.handleLogin();
  if (auth.isLoggedIn.value) {
    router.push(auth.getDefaultWorkspaceRoute());
  }
}
</script>

<template>
  <div class="auth-shell">
    <section class="auth-showcase">
      <div class="auth-kicker">Aviation Maintenance Identity</div>
      <h1 class="auth-title">独立认证入口</h1>
      <p class="auth-copy">
        认证页单独存在，只负责预注册、激活和登录。登录完成后进入业务后台，不把账号生命周期和业务模块混在一起。
      </p>

      <div class="auth-highlight-grid">
        <article class="auth-highlight-card">
          <div class="auth-highlight-label">生命周期</div>
          <div class="auth-highlight-value">预注册 / 激活 / 登录</div>
        </article>
        <article class="auth-highlight-card">
          <div class="auth-highlight-label">认证方式</div>
          <div class="auth-highlight-value">钱包签名 + JWT</div>
        </article>
        <article class="auth-highlight-card">
          <div class="auth-highlight-label">进入后台</div>
          <div class="auth-highlight-value">提交 / 查阅 / 人员管理</div>
        </article>
      </div>
    </section>

    <section class="auth-console">
      <div class="auth-console-card">
        <div class="auth-console-header">
          <div>
            <div class="card-title">身份认证</div>
            <div class="card-subtitle">完成登录后自动进入业务工作台</div>
          </div>
        </div>

        <el-tabs v-model="auth.activeAuthTab.value" class="flow-tabs">
          <el-tab-pane label="1. 预注册" name="preregister">
            <el-form label-position="top">
              <el-form-item label="管理员 Bootstrap Key">
                <el-input v-model="auth.preregisterForm.value.bootstrapKey" show-password />
              </el-form-item>

              <div class="form-grid two-col">
                <el-form-item label="工号">
                  <el-input v-model="auth.preregisterForm.value.employeeNo" placeholder="例如 E1001" />
                </el-form-item>
                <el-form-item label="姓名">
                  <el-input v-model="auth.preregisterForm.value.name" placeholder="例如 张工" />
                </el-form-item>
              </div>

              <div class="form-grid two-col">
                <el-form-item label="部门">
                  <el-input v-model="auth.preregisterForm.value.department" placeholder="例如 机务一部" />
                </el-form-item>
                <el-form-item label="角色">
                  <el-select v-model="auth.preregisterForm.value.roleCodes" multiple placeholder="选择角色" style="width: 100%">
                    <el-option label="检修填报工程师" value="engineer_submitter" />
                    <el-option label="放行工程师" value="engineer_approver" />
                    <el-option label="系统管理员" value="admin" />
                  </el-select>
                </el-form-item>
              </div>

              <div class="button-row">
                <el-button type="primary" :loading="auth.preregisterLoading.value" @click="auth.handlePreregister">
                  提交预注册
                </el-button>
              </div>
            </el-form>

            <div v-if="auth.preregisterResult.value" class="result-stack">
              <div class="result-block accent-block">
                <div class="result-label">激活码</div>
                <div class="activation-code">{{ auth.preregisterResult.value.activationCode }}</div>
                <div class="result-subtext">请模拟管理员私下把激活码发给员工。末四位 {{ auth.preregisterResult.value.activationCodeLast4 }}</div>
              </div>

              <div class="result-block">
                <div class="result-label">预注册结果</div>
                <pre class="mono json-box">{{ formatJson(auth.preregisterResult.value) }}</pre>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="2. 激活" name="activate">
            <el-form label-position="top">
              <div class="form-grid two-col">
                <el-form-item label="工号">
                  <el-input v-model="auth.activationForm.value.employeeNo" />
                </el-form-item>
                <el-form-item label="激活码">
                  <el-input v-model="auth.activationForm.value.activationCode" />
                </el-form-item>
              </div>

              <el-form-item label="员工私钥">
                <el-input
                  v-model="auth.activationForm.value.privateKey"
                  type="textarea"
                  :rows="4"
                  resize="none"
                  placeholder="输入员工自持私钥，或点下方按钮生成测试钱包"
                  show-password
                />
              </el-form-item>

              <div class="button-row">
                <el-button @click="auth.generateActivationWallet">生成测试钱包</el-button>
                <el-button type="primary" :loading="auth.activationLoading.value" @click="auth.handleActivate">
                  发起激活并绑定地址
                </el-button>
              </div>
            </el-form>

            <div v-if="auth.activationDerivedAddress.value" class="result-block">
              <div class="result-label">激活使用地址</div>
              <div class="result-value mono">{{ auth.activationDerivedAddress.value }}</div>
            </div>

            <div v-if="auth.activationChallenge.value" class="result-block">
              <div class="result-label">激活挑战消息</div>
              <pre class="mono challenge-box">{{ auth.activationChallenge.value.message }}</pre>
            </div>

            <div v-if="auth.latestActivatedUser.value" class="result-block">
              <div class="result-label">激活结果</div>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="工号">{{ auth.latestActivatedUser.value.employeeNo }}</el-descriptions-item>
                <el-descriptions-item label="地址">{{ auth.latestActivatedUser.value.address }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ auth.latestActivatedUser.value.status }}</el-descriptions-item>
                <el-descriptions-item label="姓名">{{ auth.latestActivatedUser.value.name }}</el-descriptions-item>
                <el-descriptions-item label="部门">{{ auth.latestActivatedUser.value.department }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </el-tab-pane>

          <el-tab-pane label="3. 登录" name="login">
            <el-form label-position="top">
              <el-form-item label="已绑定地址的私钥">
                <el-input
                  v-model="auth.loginForm.value.privateKey"
                  type="textarea"
                  :rows="4"
                  resize="none"
                  placeholder="输入已完成激活的钱包私钥"
                  show-password
                />
              </el-form-item>

              <div class="button-row">
                <el-button @click="auth.generateLoginWallet">生成测试钱包</el-button>
                <el-button type="primary" :loading="auth.loginLoading.value" @click="handleLoginAndGoMaintenance">
                  发起登录
                </el-button>
              </div>
            </el-form>

            <div v-if="auth.loginDerivedAddress.value" class="result-block">
              <div class="result-label">登录地址</div>
              <div class="result-value mono">{{ auth.loginDerivedAddress.value }}</div>
            </div>

            <div v-if="auth.loginChallenge.value" class="result-block">
              <div class="result-label">登录挑战消息</div>
              <pre class="mono challenge-box">{{ auth.loginChallenge.value.message }}</pre>
            </div>

            <div v-if="auth.latestLoggedInUser.value" class="result-stack">
              <div class="result-block">
                <div class="result-label">当前用户</div>
                <el-descriptions :column="1" border>
                  <el-descriptions-item label="工号">{{ auth.latestLoggedInUser.value.employeeNo }}</el-descriptions-item>
                  <el-descriptions-item label="地址">{{ auth.latestLoggedInUser.value.address }}</el-descriptions-item>
                  <el-descriptions-item label="姓名">{{ auth.latestLoggedInUser.value.name }}</el-descriptions-item>
                  <el-descriptions-item label="部门">{{ auth.latestLoggedInUser.value.department }}</el-descriptions-item>
                  <el-descriptions-item label="状态">{{ auth.latestLoggedInUser.value.status }}</el-descriptions-item>
                  <el-descriptions-item label="角色">
                    <el-tag v-for="role in auth.latestLoggedInUser.value.roles" :key="role" class="role-tag">{{ role }}</el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="权限">
                    <el-tag v-for="permission in auth.latestLoggedInUser.value.permissions" :key="permission" type="success" class="role-tag">
                      {{ permission }}
                    </el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </div>

              <div class="result-block">
                <div class="result-label">JWT Token</div>
                <pre class="mono token-box">{{ auth.loginResult.value.token }}</pre>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </section>
  </div>
</template>
