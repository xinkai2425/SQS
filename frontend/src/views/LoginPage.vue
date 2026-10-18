<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { PersonOutline, LockClosedOutline, KeyOutline, TicketOutline, ArrowForwardOutline, RefreshOutline, MailOutline, PaperPlaneOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import { setToken, setUser } from '../auth'
import poster from '../poster.jpg'

const router = useRouter()
const message = useMessage()
const loading = ref(false)
const mode = ref('login') // login | register | forgot

const form = reactive({
  name: '',
  email: '',
  password: '',
  invitationCode: '',
  captchaText: '',
  emailCode: '',
})

const title = computed(() => {
  if (mode.value === 'login') return '登录'
  if (mode.value === 'register') return '注册'
  return '重置密码'
})

const stats = ref({
  subjects: 0,
  textbooks: 0,
  questions: 0,
  papers: 0,
  users: 0,
})

const captcha = reactive({
  id: '',
  image: '',
})

const typedText = ref('')
const introText =
  '智能组卷系统面向题库管理、章节出题、试卷生成与答题卡配置，提供高效的题目管理、AI辅助出题与多样化导出能力。'
let typingTimer = null

const statItems = computed(() => [
  { label: '已收录科目', value: stats.value.subjects, unit: '类' },
  { label: '教材数量', value: stats.value.textbooks, unit: '本' },
  { label: '题库规模', value: stats.value.questions, unit: '题' },
  { label: '试卷数量', value: stats.value.papers, unit: '份' },
])

// Email Code Logic
const sending = ref(false)
const countdown = ref(0)
let timer = null

async function sendEmailCode() {
  const email = form.email.trim()
  if (!email) {
      message.warning('请输入邮箱')
      return
  }
  // Basic email regex
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('请输入有效的邮箱地址')
      return
  }
  if (!form.captchaText) {
      message.warning('请先输入图片验证码')
      return
  }
  
  sending.value = true
  try {
      let type = 1 // register
      if (mode.value === 'login') type = 2 
      if (mode.value === 'forgot') type = 3
      
      await http.post('/auth/send-code', {
          email: email,
          captchaId: captcha.id,
          captchaText: form.captchaText,
          type: type
      })
      message.success('验证码已发送至邮箱，有效期5分钟')
      countdown.value = 60
      timer = setInterval(() => {
          countdown.value--
          if (countdown.value <= 0) {
              clearInterval(timer)
              timer = null
          }
      }, 1000)
  } catch (e) {
      message.error(e.message || '发送失败')
      await loadCaptcha() // refresh captcha on error
      form.captchaText = ''
  } finally {
      sending.value = false
  }
}

function startTyping() {
  if (typingTimer) clearInterval(typingTimer)
  typedText.value = ''
  let idx = 0
  typingTimer = setInterval(() => {
    typedText.value += introText[idx]
    idx += 1
    if (idx >= introText.length) {
      clearInterval(typingTimer)
      typingTimer = null
    }
  }, 60)
}

async function loadCaptcha() {
  try {
    const resp = await http.get('/auth/captcha')
    captcha.id = resp.data.id || ''
    captcha.image = resp.data.image || ''
  } catch {
    captcha.id = ''
    captcha.image = ''
  }
}

async function loadStats() {
  try {
    const resp = await http.get('/auth/stats')
    stats.value = { ...stats.value, ...(resp.data || {}) }
  } catch {
    stats.value = { ...stats.value }
  }
}

async function submit() {
  if (mode.value === 'forgot') {
      if (!form.email || !form.emailCode || !form.password) {
          message.warning('请完整填写信息')
          return
      }
      loading.value = true
      try {
          await http.post('/auth/reset-password', {
              email: form.email,
              emailCode: form.emailCode,
              newPassword: form.password
          })
          message.success('密码重置成功，请登录')
          mode.value = 'login'
      } catch (e) {
          message.error(e.message || '重置失败')
      } finally {
          loading.value = false
      }
      return
  }

  const name = form.name.trim()
  // For login, name is required. For register, name and email are required.
  if (mode.value === 'login' && !name) {
      message.warning('请输入用户名/邮箱')
      return
  }
  if (mode.value === 'register' && (!name || !form.email)) {
      message.warning('请完整填写信息')
      return
  }
  if (!form.password || !form.captchaText) {
    message.warning('请完整填写信息')
    return
  }
  
  loading.value = true
  try {
    const path = mode.value === 'login' ? '/auth/login' : '/auth/register'
    const payload = {
      name,
      password: form.password,
      captchaId: captcha.id,
      captchaText: form.captchaText,
    }
    if (mode.value === 'register') {
        payload.email = form.email
        payload.emailCode = form.emailCode
        payload.invitationCode = form.invitationCode
    }
    
    const resp = await http.post(path, payload)
    setToken(resp.data.token)
    setUser(resp.data.user)
    if (mode.value === 'register' && resp.data?.user?.invitationCode) {
      message.success(`注册成功，邀请码：${resp.data.user.invitationCode}`)
    }
    await router.replace('/dicts')
  } catch (e) {
    message.error(e?.message || '操作失败')
    await loadCaptcha()
    form.captchaText = ''
  } finally {
    loading.value = false
  }
}

watch(
  () => mode.value,
  async () => {
    form.name = ''
    form.email = ''
    form.password = ''
    form.captchaText = ''
    form.emailCode = ''
    form.invitationCode = ''
    countdown.value = 0
    if (timer) clearInterval(timer)
    await loadCaptcha()
  },
)

onMounted(async () => {
  await loadCaptcha()
  await loadStats()
  startTyping()
})

onUnmounted(() => {
  if (typingTimer) clearInterval(typingTimer)
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="login-page">
    <div class="hero">
      <n-card class="left-panel">
        <template #header>
          <div class="header">
            <div class="brand-row">
              <img src="/Logo.png" alt="智策题境" class="brand-mark" />
              <div>
                <div class="brand">智策题境</div>
                <div class="title">{{ title }}工作台</div>
              </div>
            </div>
            <p class="form-intro">
              {{ mode === 'login' ? '继续管理题库、组卷和 AI 出题任务。' : mode === 'register' ? '创建账号后即可配置自己的题库工作流。' : '验证邮箱后设置新密码。' }}
            </p>
          </div>
        </template>

        <transition name="form-switch" mode="out-in">
          <n-form :key="mode" label-placement="left" label-width="72px" @keydown.enter.prevent="submit">
            <!-- Login: Name/Email -->
            <n-form-item v-if="mode === 'login'" label="账号">
              <n-input v-model:value="form.name" placeholder="用户名 / 邮箱">
                <template #prefix>
                  <n-icon><PersonOutline /></n-icon>
                </template>
              </n-input>
            </n-form-item>

            <!-- Register: Name -->
            <n-form-item v-if="mode === 'register'" label="用户名">
              <n-input v-model:value="form.name" placeholder="设置用户名">
                <template #prefix>
                  <n-icon><PersonOutline /></n-icon>
                </template>
              </n-input>
            </n-form-item>

            <!-- Register/Forgot: Email -->
            <n-form-item v-if="mode !== 'login'" label="邮箱">
              <n-input v-model:value="form.email" placeholder="请输入邮箱">
                <template #prefix>
                  <n-icon><MailOutline /></n-icon>
                </template>
              </n-input>
            </n-form-item>

            <!-- Password (All modes, for Forgot it's new password) -->
            <n-form-item label="密码">
              <n-input v-model:value="form.password" type="password" show-password-on="click" :placeholder="mode === 'forgot' ? '设置新密码' : '请输入密码'">
                <template #prefix>
                  <n-icon><LockClosedOutline /></n-icon>
                </template>
              </n-input>
            </n-form-item>

            <!-- Image Captcha (All modes) -->
            <n-form-item label="验证码">
              <div class="captcha-row">
                <n-input v-model:value="form.captchaText" placeholder="图片验证码">
                  <template #prefix>
                    <n-icon><KeyOutline /></n-icon>
                  </template>
                </n-input>
                <div class="captcha-box" @click="loadCaptcha">
                  <img v-if="captcha.image" :src="captcha.image" alt="captcha" />
                  <span v-else>加载中</span>
                </div>
              </div>
            </n-form-item>

            <!-- Email Code (Register/Forgot) -->
            <n-form-item v-if="mode !== 'login'" label="邮箱验证">
               <div class="captcha-row">
                <n-input v-model:value="form.emailCode" placeholder="6位验证码">
                  <template #prefix>
                    <n-icon><KeyOutline /></n-icon>
                  </template>
                </n-input>
                <n-button :disabled="countdown > 0 || sending" @click="sendEmailCode" style="width: 120px">
                   <template #icon v-if="!countdown && !sending">
                      <n-icon><PaperPlaneOutline /></n-icon>
                   </template>
                   {{ countdown > 0 ? `${countdown}s` : (sending ? '发送中' : '发送验证码') }}
                </n-button>
               </div>
            </n-form-item>

            <n-form-item v-if="mode === 'register'" label="邀请码">
              <n-input v-model:value="form.invitationCode" placeholder="首位注册可不填">
                <template #prefix>
                  <n-icon><TicketOutline /></n-icon>
                </template>
              </n-input>
            </n-form-item>

            <!-- Forgot Password Link -->
            <div v-if="mode === 'login'" style="display:flex;justify-content:flex-end;margin-top:-10px;margin-bottom:10px;">
               <n-button text type="primary" size="tiny" @click="mode = 'forgot'">忘记密码？</n-button>
            </div>
          </n-form>
        </transition>

        <div class="actions">
          <n-button type="primary" :loading="loading" @click="submit">
            <template #icon>
              <n-icon><ArrowForwardOutline /></n-icon>
            </template>
            {{ title }}
          </n-button>
          <n-button :disabled="loading" @click="() => { mode = mode === 'login' ? 'register' : 'login' }">
            <template #icon>
              <n-icon><RefreshOutline /></n-icon>
            </template>
            {{ mode === 'login' ? '注册新账号' : '返回登录' }}
          </n-button>
        </div>
      </n-card>

      <div class="right-panel" :style="{ backgroundImage: `url(${poster})` }">
        <div class="right-mask"></div>
        <div class="right-content">
          <div class="right-eyebrow">Question generation workspace</div>
          <div class="right-title">资料、题库、试卷在同一处流动</div>
          <div class="right-text">{{ typedText }}</div>
        </div>
      </div>
    </div>

    <div class="stats">
      <div v-for="item in statItems" :key="item.label" class="stat-card">
        <div class="stat-value">
          <span class="number">{{ item.value }}</span>
          <span class="unit">{{ item.unit }}</span>
        </div>
        <div class="stat-label">{{ item.label }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: clamp(18px, 4vw, 42px);
  background:
    radial-gradient(circle at 14% 14%, var(--app-cyan-soft), transparent 28rem),
    radial-gradient(circle at 90% 18%, var(--app-amber-soft), transparent 24rem),
    radial-gradient(circle at 62% 92%, var(--app-mint-soft), transparent 28rem),
    linear-gradient(135deg, #eef1f5 0%, #f8fafc 100%);
  color: #1f2328;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  justify-content: center;
}

:global(html[data-theme="dark"]) .login-page {
  background:
    radial-gradient(circle at 14% 14%, rgba(98, 182, 208, 0.1), transparent 28rem),
    radial-gradient(circle at 90% 18%, rgba(224, 165, 72, 0.1), transparent 24rem),
    radial-gradient(circle at 62% 92%, rgba(100, 199, 165, 0.1), transparent 28rem),
    #18181c;
  color: rgba(255, 255, 255, 0.88);
}

.hero {
  width: min(1060px, 100%);
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(49, 62, 80, 0.1);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  gap: 14px;
  box-shadow: 0 28px 72px rgba(31, 45, 64, 0.14);
  backdrop-filter: blur(18px);
  animation: login-hero-in 680ms var(--ease-out) both;
  will-change: transform, opacity;
}

:global(html[data-theme="dark"]) .hero {
  background: #232327;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
}

.left-panel {
  width: 420px;
  border-radius: 8px;
  box-shadow: none;
  animation: login-panel-in 620ms var(--ease-out) 60ms both;
}

:global(html[data-theme="dark"]) .left-panel {
  background: #1f1f23;
  border: 1px solid #2f2f34;
}
.header {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  box-shadow: 0 10px 22px rgba(49, 95, 202, 0.16);
}

.brand {
  color: #19232d;
  font-size: 20px;
  font-weight: 760;
  line-height: 1.15;
}

:global(html[data-theme="dark"]) .brand {
  color: rgba(255, 255, 255, 0.92);
}
.title {
  margin-top: 3px;
  color: #6d7784;
  font-size: 13px;
  font-weight: 600;
}

:global(html[data-theme="dark"]) .title {
  color: #a6a6ad;
}
.form-intro {
  max-width: 32em;
  margin: 0;
  color: #68737f;
  font-size: 13px;
  line-height: 1.6;
}

.captcha-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.captcha-box {
  width: 120px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid #e0e0e6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  cursor: pointer;
  overflow: hidden;
}

:global(html[data-theme="dark"]) .captcha-box {
  border-color: #4a4a4e;
  background: #3a3a3e;
}

.captcha-box img {
  width: 120px;
  height: 40px;
  object-fit: contain;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 6px;
}

.right-panel {
  flex: 1;
  min-width: 0;
  width: 580px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  min-height: 430px;
  position: relative;
  overflow: hidden;
  animation: login-visual-in 720ms var(--ease-out) 120ms both;
  will-change: transform, opacity;
}

.right-mask {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, rgba(9, 19, 34, 0.86), rgba(44, 127, 159, 0.42), rgba(184, 121, 24, 0.2)),
    linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0));
}

:global(html[data-theme="dark"]) .right-mask,
:root[data-theme="dark"] .right-mask {
  background:
    linear-gradient(120deg, rgba(8, 8, 10, 0.95), rgba(22, 38, 48, 0.9), rgba(44, 32, 18, 0.72));
}

.right-content {
  position: relative;
  z-index: 1;
  padding: clamp(26px, 5vw, 54px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 620px;
  margin: 0;
  text-align: left;
  height: 100%;
  justify-content: center;
}

.right-eyebrow {
  width: fit-content;
  padding: 6px 9px;
  color: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.right-title {
  max-width: 12em;
  color: #fff;
  font-size: clamp(30px, 4vw, 46px);
  font-weight: 780;
  line-height: 1.08;
  text-wrap: balance;
}

:global(html[data-theme="dark"]) .right-title {
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
}
.right-text {
  max-width: 38em;
  font-size: 15px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.82);
  min-height: 104px;
  white-space: pre-wrap;
}

:global(html[data-theme="dark"]) .right-text {
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
}

.stats {
  width: min(1060px, 100%);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  --tone: var(--app-accent);
  --tone-soft: var(--app-accent-soft);
  --float-delay: 0s;
  --enter-delay: 80ms;
  background:
    linear-gradient(135deg, var(--tone-soft), transparent 76%),
    var(--stat-card-bg);
  border: var(--stat-card-border);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 12px 28px rgba(31, 45, 64, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 76px;
  transform: translateY(var(--offset, 0));
  animation:
    stat-card-in 560ms var(--ease-out) both,
    float-y 6s ease-in-out infinite;
  animation-delay: var(--enter-delay), var(--float-delay);
  will-change: transform, box-shadow;
  position: relative;
  overflow: hidden;
}

.stat-card:nth-child(1) { --offset: -8px; --enter-delay: 80ms; --float-delay: 0s; }
.stat-card:nth-child(2) { --offset: 8px;  --enter-delay: 150ms; --float-delay: .8s; --tone: var(--app-mint); --tone-soft: var(--app-mint-soft); }
.stat-card:nth-child(3) { --offset: -6px; --enter-delay: 220ms; --float-delay: 1.6s; --tone: var(--app-amber); --tone-soft: var(--app-amber-soft); }
.stat-card:nth-child(4) { --offset: 10px; --enter-delay: 290ms; --float-delay: 2.4s; --tone: var(--app-cyan); --tone-soft: var(--app-cyan-soft); }

.stat-card::after {
  content: '';
  position: absolute;
  right: 14px;
  bottom: 12px;
  width: 32px;
  height: 3px;
  border-radius: 999px;
  background: var(--tone);
  opacity: .75;
}

.stat-card:hover {
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  transform: translateY(calc(var(--offset, 0) - 4px));
}

@keyframes float-y {
  0%   { transform: translateY(var(--offset, 0)); }
  50%  { transform: translateY(calc(var(--offset, 0) * -1)); }
  100% { transform: translateY(var(--offset, 0)); }
}

@keyframes stat-card-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--offset, 0) + 14px)) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(var(--offset, 0)) scale(1);
  }
}
.stat-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.number {
  font-size: 22px;
  font-weight: 700;
  color: var(--tone);
}

.unit {
  font-size: 12px;
  color: #999;
}

:global(html[data-theme="dark"]) .unit {
  color: #b0b0b6;
}
.stat-label {
  font-size: 13px;
  color: #666;
}

:global(html[data-theme="dark"]) .stat-label {
  color: #aaa;
}

@keyframes login-hero-in {
  from {
    opacity: 0;
    transform: translate3d(0, 16px, 0) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes login-panel-in {
  from {
    opacity: 0;
    transform: translate3d(-14px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes login-visual-in {
  from {
    opacity: 0;
    transform: translate3d(18px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.form-switch-enter-active,
.form-switch-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out);
}

.form-switch-enter-from {
  opacity: 0;
  transform: translate3d(12px, 0, 0);
}

.form-switch-leave-to {
  opacity: 0;
  transform: translate3d(-8px, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .hero,
  .left-panel,
  .right-panel,
  .stat-card {
    animation: none !important;
  }

  .form-switch-enter-active,
  .form-switch-leave-active {
    transition: opacity 120ms ease;
  }

  .form-switch-enter-from,
  .form-switch-leave-to {
    transform: none;
  }
}

@media (max-width: 920px) {
  .hero {
    flex-direction: column;
  }

  .left-panel,
  .right-panel {
    width: 100%;
  }

  .right-panel {
    min-height: 320px;
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .login-page {
    justify-content: flex-start;
  }

  .stats {
    grid-template-columns: 1fr;
  }

  .captcha-row,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }

  .captcha-box,
  .captcha-box img {
    width: 100%;
  }

  .right-panel {
    min-height: 280px;
  }
}
</style>
