<script setup>
import { ref, reactive, nextTick, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { http } from '../api/http'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getToken } from '../auth'
import { PaperPlaneOutline } from '@vicons/ionicons5'

const router = useRouter()
const message = useMessage()

const props = defineProps({
  isDark: { type: Boolean, default: false }
})
const isDark = computed(() => props.isDark)

const visible = ref(true)
const panelOpen = ref(false)
const input = ref('')
const history = reactive([
  {
    role: 'assistant',
    content: '我是AI助手，可以帮你导航或回答问题。你可以问我如何下载试卷、智能组卷、题库导入，也可以直接和我聊天。',
    link: null,
  },
])
const bodyRef = ref(null)
let abortCtrl = null
const loading = ref(false)
const pos = reactive({
  left: Math.max(window.innerWidth - 100, 20),
  top: Math.max(window.innerHeight * 0.2, 20)
})
const contextOpen = ref(false)
let dragging = false
let dragOffsetX = 0
let dragOffsetY = 0
const side = () => (pos.left > window.innerWidth / 2 ? 'left' : 'right')
const dragMoved = ref(false)

const intents = [
  { test: /下载|导出.*试卷|试卷.*下载/, reply: '进入试卷编辑/导出页面，选择试卷并点击导出', link: { path: '/papers', text: '试卷编辑/导出' } },
  { test: /智能.*组卷|AI.*组卷|生成.*试卷/, reply: '在智能组卷页设置参数并生成试卷', link: { path: '/paper-generate', text: '智能组卷' } },
  { test: /题库.*导入|导入模板|Excel.*模板/, reply: '在题库管理页下载导入模板并按字段填写', link: { path: '/questions', text: '题库管理' } }
]

function handleLink(link) {
  router.push(link.path)
}

function onAvatarMouseDown(e) {
  dragging = true
  dragOffsetX = e.clientX - pos.left
  dragOffsetY = e.clientY - pos.top
  window.addEventListener('mousemove', onAvatarMouseMove)
  window.addEventListener('mouseup', onAvatarMouseUp)
}
function onAvatarMouseMove(e) {
  if (!dragging) return
  const nl = Math.min(Math.max(e.clientX - dragOffsetX, 0), window.innerWidth - 60)
  const nt = Math.min(Math.max(e.clientY - dragOffsetY, 0), window.innerHeight - 60)
  if (Math.abs(nl - pos.left) > 2 || Math.abs(nt - pos.top) > 2) dragMoved.value = true
  pos.left = nl
  pos.top = nt
}
function onAvatarMouseUp() {
  dragging = false
  window.removeEventListener('mousemove', onAvatarMouseMove)
  window.removeEventListener('mouseup', onAvatarMouseUp)
}
function onAvatarContext(e) {
  e.preventDefault()
  contextOpen.value = true
  setTimeout(() => { contextOpen.value = false }, 3000)
}
function togglePanel() {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  panelOpen.value = !panelOpen.value
}
function hideAll() {
  panelOpen.value = false
  visible.value = false
  contextOpen.value = false
}

function scrollToBottom() {
  nextTick(() => {
    if (bodyRef.value) {
      bodyRef.value.scrollTop = bodyRef.value.scrollHeight
    }
  })
}

watch(
  () => [history.length, loading.value, panelOpen.value],
  () => scrollToBottom(),
  { flush: 'post' },
)

async function send() {
  const text = (input.value || '').trim()
  if (!text) return
  history.push({ role: 'user', content: text })
  input.value = ''
  scrollToBottom()
  const hit = intents.find(i => i.test.test(text))
  if (hit) {
    history.push({ role: 'assistant', content: hit.reply, link: hit.link })
    scrollToBottom()
    return
  }
  const idx = history.length
  history.push({ role: 'assistant', content: '', link: null })
  const token = getToken()
  const url = `${http.defaults.baseURL}/ai/assistant-chat/stream?q=${encodeURIComponent(text)}`
  abortCtrl = new AbortController()
  loading.value = true
  scrollToBottom()
  try {
    await fetchEventSource(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: abortCtrl.signal,
      onmessage(ev) {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'delta') {
            history[idx].content += data.content
            if (loading.value) loading.value = false
            scrollToBottom()
          } else if (data.type === 'done') {
            if (data.link) history[idx].link = data.link
            loading.value = false
          } else if (data.type === 'error') {
            message.error(data.message || '流式错误')
            loading.value = false
          }
        } catch {}
      },
      onerror(err) {
        throw err
      }
    })
  } catch (e) {
    const msg = e?.message || '请求失败'
    if (msg === 'Network Error') {
      message.error('网络错误：后端未连接或地址不正确')
      history[idx].content = '后端暂不可用。可尝试以下入口：试卷编辑/导出、智能组卷、题库管理。'
    } else {
      message.error(msg)
    }
  } finally {
    abortCtrl = null
    loading.value = false
  }
}

function stopStream() {
  if (abortCtrl) abortCtrl.abort()
  loading.value = false
}

function handleShowAssistant() {
  if (visible.value) return
  visible.value = true
  pos.left = Math.max(window.innerWidth - 100, 20)
  pos.top = Math.max(window.innerHeight * 0.2, 20)
}

onMounted(() => {
  window.addEventListener('iqg-show-assistant', handleShowAssistant)
})

onUnmounted(() => {
  window.removeEventListener('iqg-show-assistant', handleShowAssistant)
})
</script>

<template>
  <Teleport to="body">
  <transition name="assistant-enter" appear>
    <div v-if="visible" class="assistant-anchor" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">
      <div class="avatar-wrapper" :class="{ floating: !dragging }">
        <img src="/AI.png" class="assistant-avatar" :class="{ 'avatar-flipped': side() === 'right' }" :draggable="false" @mousedown="onAvatarMouseDown" @contextmenu="onAvatarContext" @click="togglePanel" />
      </div>
      <div v-if="contextOpen" class="context-menu">
        <n-button size="tiny" type="error" round @click="hideAll">隐藏</n-button>
      </div>
    </div>
  </transition>

  <transition name="assistant-panel">
    <div v-if="panelOpen && visible" class="bubble" :class="side() === 'left' ? 'left' : 'right'" :style="{
        left: side() === 'left' ? (pos.left - 372) + 'px' : (pos.left + 72) + 'px',
        top: pos.top + 'px'
      }">
      <n-card style="width:360px;" class="chat-card" :class="{ 'dark-card': isDark }">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:600">AI助手</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <n-button text @click="stopStream">停止</n-button>
            <n-button text @click="panelOpen = false">关闭</n-button>
          </div>
        </div>
        <div ref="bodyRef" class="chat-body">
          <div
            v-for="(m, i) in history"
            :key="i"
            v-show="m.role === 'user' || Boolean(m.content) || !loading"
            class="chat-message"
            :class="m.role === 'user' ? 'user' : 'assistant'"
          >
            <div class="message-meta">{{ m.role === 'user' ? '我' : '助手' }}</div>
            <div class="message-bubble">
              <div class="message-content">{{ m.content }}</div>
              <n-button
                v-if="m.link"
                class="message-link"
                text
                type="primary"
                @click="handleLink(m.link)"
              >
                {{ m.link.text }}
              </n-button>
            </div>
          </div>
          <div v-if="loading" class="chat-message assistant loading-message">
            <div class="message-meta">助手</div>
            <div class="message-bubble loading-bubble">
              <n-spin size="small"></n-spin>
              <span>正在生成回应…</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <n-input v-model:value="input" placeholder="输入问题，如“如何下载试卷”" @keydown.enter.prevent="send" />
          <n-button type="primary" circle @click="send">
            <template #icon>
              <n-icon><PaperPlaneOutline /></n-icon>
            </template>
          </n-button>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <n-button size="tiny" secondary @click="history.push({role:'assistant',content:'进入试卷编辑/导出后，选择试卷预览并点击导出。'},);router.push('/papers')">下载试卷</n-button>
          <n-button size="tiny" secondary @click="router.push('/paper-generate')">智能组卷</n-button>
          <a href="https://xky201225.github.io/xinkai.github.io/" target="_blank" style="text-decoration:none">
          <n-button size="tiny" secondary>开发者介绍</n-button>
          </a>
        </div>
      </n-card>
      <div class="tail" :class="side() === 'left' ? 'left' : 'right'"></div>
    </div>
  </transition>
  </Teleport>
</template>

<style scoped>
.assistant-anchor {
  position: fixed;
  z-index: 2147483647;
  user-select: none;
}
.assistant-avatar {
  width: 80px;
  height: 105px;
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 6px 18px rgba(0,0,0,0);
  transition:
    transform var(--motion-base) var(--ease-out),
    box-shadow var(--motion-base) ease;
}
.avatar-flipped {
  transform: scaleX(-1);
}
.context-menu {
  position: absolute;
  right: 0;
  top: -34px;
}

.assistant-enter-active,
.assistant-enter-leave-active {
  transition:
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 220ms var(--ease-out);
}

.assistant-enter-from,
.assistant-enter-leave-to {
  opacity: 0;
  transform: translate3d(360px, 0, 0);
}

.bubble {
  position: fixed;
  z-index: 2147483647;
  will-change: transform, opacity;
}

.bubble.left {
  transform-origin: right top;
}

.bubble.right {
  transform-origin: left top;
}

.bubble.left.assistant-panel-enter-from {
  transform: translate3d(72px, 6px, 0) scale(0.9);
}

.bubble.right.assistant-panel-enter-from {
  transform: translate3d(-72px, 6px, 0) scale(0.9);
}

.bubble.left.assistant-panel-leave-to {
  transform: translate3d(48px, -4px, 0) scale(0.94);
}

.bubble.right.assistant-panel-leave-to {
  transform: translate3d(-48px, -4px, 0) scale(0.94);
}

.assistant-panel-enter-active,
.assistant-panel-leave-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 420ms cubic-bezier(0.34, 1.25, 0.64, 1),
    filter 220ms ease;
}

.assistant-panel-enter-from {
  opacity: 0;
  transform: translate3d(0, 6px, 0) scale(0.9);
  filter: blur(3px);
}

.assistant-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.94);
  filter: blur(2px);
}

.chat-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(220,240,255,0.95), rgba(255,255,255,0.95), rgba(230,230,250,0.95));
  background-size: 400% 400%;
  animation: none;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.6);
  box-shadow: 0 12px 48px rgba(0,0,0,0.15);
}
.dark-card {
  background: #0a0a0d !important;
  background-image: linear-gradient(135deg, #0a0a0d 0%, #18181c 25%, #33333d 50%, #4a4a57 75%, #18181c 100%) !important;
  background-size: 400% 400% !important;
  animation: none !important;
  border-color: rgba(255,255,255,0.1) !important;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6) !important;
  color: rgba(255,255,255,0.9) !important;
}
.dark-card :deep(.n-card-header),
.dark-card :deep(.n-card__content) {
  background-color: transparent !important;
}
.dark-card :deep(.n-card-header__main),
.dark-card :deep(.n-card__content) {
  color: rgba(255,255,255,0.9) !important;
}
@keyframes gradient-bg {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.floating {
  animation: float-y 3.2s ease-in-out infinite;
}
@keyframes float-y {
  0% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
  100% { transform: translateY(0); }
}
.bubble.left .tail {
  position: absolute;
  right: -8px;
  top: 24px;
  width: 16px;
  height: 16px;
  background: var(--n-color-embedded);
  transform: rotate(45deg);
  border: 1px solid var(--n-border-color);
  border-left: none;
  border-top: none;
}
.bubble.right .tail {
  position: absolute;
  left: -8px;
  top: 24px;
  width: 16px;
  height: 16px;
  background: var(--n-color-embedded);
  transform: rotate(45deg);
  border: 1px solid var(--n-border-color);
  border-right: none;
  border-bottom: none;
}
.chat-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  margin-top: 8px;
  overflow-y: auto;
  padding-right: 2px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.chat-message.user {
  align-items: flex-end;
}

.chat-message.assistant {
  align-items: flex-start;
}

.message-meta {
  padding: 0 2px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.message-bubble {
  max-width: 84%;
  padding: 8px 10px;
  border: 1px solid;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-message.user .message-bubble {
  border-color: color-mix(in srgb, var(--app-primary) 72%, #000 12%);
  border-bottom-right-radius: 4px;
  background: var(--app-primary);
  color: #fff;
  box-shadow: 0 6px 16px rgba(49, 95, 202, 0.18);
}

.chat-message.assistant .message-bubble {
  border-color: var(--app-border);
  border-bottom-left-radius: 4px;
  background: var(--app-surface-muted);
  color: var(--app-text);
}

.message-content {
  white-space: pre-wrap;
}

.message-link {
  height: auto;
  margin-top: 4px;
  padding: 0;
  font-size: 12px;
}

.loading-message .message-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-soft);
}

.dark-card .chat-message.user .message-bubble {
  color: #0f1523;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}

.dark-card .chat-message.assistant .message-bubble {
  border-color: rgba(194, 211, 255, 0.14);
  background: #1b2540;
}

@media (prefers-reduced-motion: reduce) {
  .floating {
    animation: none !important;
  }

  .assistant-enter-active,
  .assistant-enter-leave-active,
  .assistant-panel-enter-active,
  .assistant-panel-leave-active {
    transition: opacity 120ms ease;
  }

  .assistant-enter-from,
  .assistant-enter-leave-to,
  .assistant-panel-enter-from,
  .assistant-panel-leave-to {
    filter: none;
    transform: none;
  }
}
</style>
