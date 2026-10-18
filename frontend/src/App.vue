<script setup>
import { computed, onMounted, onUnmounted, ref, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NConfigProvider, darkTheme, zhCN, dateZhCN } from 'naive-ui'
import {
  LogOutOutline,
  BookOutline,
  DocumentTextOutline,
  CheckmarkCircleOutline,
  LayersOutline,
  FileTrayFullOutline,
  SettingsOutline,
  CreateOutline,
  CopyOutline,
  DocumentOutline,
  CheckmarkOutline,
  FlashOutline,
  NewspaperOutline,
  RibbonOutline,
  TicketOutline,
  SunnyOutline,
  MoonOutline,
  PersonCircleOutline,
  SyncOutline,
  KeyOutline
} from '@vicons/ionicons5'
import { clearAuth, getUser, getToken } from './auth'
import { useTaskStore } from './stores/taskStore'
import { NProgress } from 'naive-ui'
import AssistantWidget from './components/AssistantWidget.vue'
import ApiConfigModal from './components/ApiConfigModal.vue'

const route = useRoute()
const router = useRouter()
const user = ref(getUser())
const taskStore = useTaskStore()
if (getToken()) taskStore.restoreTasks()

const isDarkMode = ref(false)
const themeMode = ref('auto') // auto | light | dark
const collapsed = ref(false)
const apiConfigVisible = ref(false)
const trialLimitVisible = ref(false)
let themeMediaQuery = null
let themeMediaListener = null

// 主题色 - 蓝色
const primaryColor = '#315fca'

// 主题覆盖配置
const themeOverrides = computed(() => {
  const menuTextColor = isDarkMode.value ? 'rgba(244, 248, 255, 0.98)' : '#48524b'
  const menuIconColor = isDarkMode.value ? 'rgba(226, 234, 247, 0.94)' : '#657066'

  return {
    common: {
      primaryColor: primaryColor,
      primaryColorHover: '#4772d3',
      primaryColorPressed: '#264ea9',
      primaryColorSuppl: primaryColor,
      infoColor: '#2c7f9f',
      infoColorHover: '#3f92b1',
      infoColorPressed: '#246b86',
      successColor: '#1f8f6a',
      successColorHover: '#2aa77d',
      successColorPressed: '#187354',
      warningColor: '#b7791f',
      warningColorHover: '#cc8d31',
      warningColorPressed: '#945f17',
      errorColor: '#b9433b',
      errorColorHover: '#cf564e',
      errorColorPressed: '#97332d',
      borderRadius: '8px',
      fontFamily: 'var(--font-sans)'
    },
    Button: {
      borderRadiusMedium: '8px',
      borderRadiusLarge: '10px'
    },
    Card: {
      borderRadius: '12px'
    },
    Menu: {
      itemBorderRadius: '8px',
      itemHeight: '42px',
      itemTextColor: menuTextColor,
      itemTextColorHover: isDarkMode.value ? '#8fb2ff' : primaryColor,
      itemTextColorActive: primaryColor,
      itemTextColorActiveHover: primaryColor,
      itemTextColorChildActive: primaryColor,
      itemTextColorChildActiveHover: primaryColor,
      itemIconColor: menuIconColor,
      itemIconColorHover: isDarkMode.value ? '#8fb2ff' : primaryColor,
      itemIconColorActive: primaryColor,
      itemIconColorActiveHover: primaryColor,
      itemIconColorChildActive: primaryColor,
      itemIconColorChildActiveHover: primaryColor,
      itemIconColorCollapsed: menuIconColor,
      arrowColor: menuIconColor,
      arrowColorHover: isDarkMode.value ? '#8fb2ff' : primaryColor,
      arrowColorActive: primaryColor,
      itemColorHover: 'rgba(49, 95, 202, 0.08)',
      itemColorActive: 'rgba(49, 95, 202, 0.12)',
      itemColorActiveHover: 'rgba(49, 95, 202, 0.16)'
    }
  }
})

function ensureThemeListener() {
  if (!themeMediaQuery) {
    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  }
  if (!themeMediaListener) {
    themeMediaListener = (e) => {
      if (themeMode.value !== 'auto') return
      applyThemeByMode('auto', e.matches)
    }
    themeMediaQuery.addEventListener('change', themeMediaListener)
  }
}

function removeThemeListener() {
  if (themeMediaQuery && themeMediaListener) {
    themeMediaQuery.removeEventListener('change', themeMediaListener)
    themeMediaListener = null
  }
}

function applyThemeByMode(mode, systemIsDark = null) {
  let nextIsDark = false
  if (mode === 'dark') nextIsDark = true
  else if (mode === 'light') nextIsDark = false
  else {
    if (!themeMediaQuery) {
      themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    }
    nextIsDark = systemIsDark ?? themeMediaQuery.matches
  }

  isDarkMode.value = nextIsDark
  const applied = nextIsDark ? 'dark' : 'light'
  document.documentElement.dataset.theme = applied
  localStorage.setItem('theme', mode)
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]')
  if (metaColorScheme) {
    metaColorScheme.content = applied
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark' || saved === 'light' || saved === 'auto') {
    themeMode.value = saved
  } else {
    themeMode.value = 'light'
  }

  if (themeMode.value === 'auto') {
    ensureThemeListener()
  } else {
    removeThemeListener()
  }

  applyThemeByMode(themeMode.value)
}

function toggleTheme() {
  const next =
    themeMode.value === 'auto'
      ? 'light'
      : themeMode.value === 'light'
        ? 'dark'
        : 'auto'
  themeMode.value = next

  if (next === 'auto') {
    ensureThemeListener()
  } else {
    removeThemeListener()
  }

  applyThemeByMode(next)
}

function handleLogoDoubleClick() {
  window.dispatchEvent(new CustomEvent('iqg-show-assistant'))
}

const nextThemeMode = computed(() => {
  return themeMode.value === 'auto'
    ? 'light'
    : themeMode.value === 'light'
      ? 'dark'
      : 'auto'
})

const themeToggleText = computed(() => {
  if (nextThemeMode.value === 'auto') return '切换到自动'
  if (nextThemeMode.value === 'light') return '切换到亮色'
  return '切换到暗色'
})

const isLoginPage = computed(() => route.path === '/login')
const isLandingPage = computed(() => route.path === '/landing')
const isFullPage = computed(() => isLoginPage.value || isLandingPage.value)
const pageTitle = computed(() => route.meta?.title || '工作台')
const pageCaption = computed(() => {
  if (route.path.startsWith('/ai-review')) return '从资料、文档或文本生成可校验题目'
  if (route.path.startsWith('/paper')) return '组卷、审核与导出在同一工作流内完成'
  if (route.path.startsWith('/practice')) return '面向练习与错题追踪的学生端流程'
  if (route.path === '/dicts') return '科目、题型、难度与系统概览'
  return '个人信息'
})

const taskMenuVisible = ref(false)
const taskRunningCount = computed(() =>
  taskStore.tasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
)
const taskCenterTasks = computed(() =>
  taskStore.sortedTasks.filter(
    (task) =>
      !(task.status === 'done' || task.status === 'error') ||
      task.sourcePath !== route.path,
  ),
)

function taskTitle(task) {
  if (task.label) return task.label
  if (task.type === 'parsing') return '文档解析'
  if (task.type === 'paper_gen') return '智能组卷'
  if (task.type === 'ai_review') return 'AI题目生成'
  if (task.type === 'smart_paper') return '智能组卷'
  return 'AI任务'
}

function formatTaskTime(timestamp) {
  if (!timestamp) return '创建时间未知'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '创建时间未知'
  const now = new Date()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

function taskStatusText(task) {
  if (task.status === 'queued') return '排队中'
  if (task.status === 'running') return task.currentStage || '处理中'
  if (task.status === 'done') return '已完成'
  if (task.status === 'error') return task.error || '生成失败'
  return '等待中'
}

function openTask(task) {
  taskMenuVisible.value = false
  if (!taskStore.selectTask(task.jobId)) return

  const path = task.sourcePath || '/dicts'
  const target = {
    path,
    query: {
      task: task.jobId,
      ts: Date.now(),
    },
  }

  if (router.currentRoute.value.path === path) {
    router.replace(target)
  } else {
    router.push(target)
  }
}

async function logout() {
  taskStore.clearAll()
  clearAuth()
  user.value = null
  await router.push('/login')
}

const renderIcon = (icon) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = computed(() => [
  {
    label: '基础信息',
    key: '/dicts',
    icon: renderIcon(SettingsOutline)
  },
  {
    label: '智能题目入库',
    key: '/ai-review',
    icon: renderIcon(FlashOutline),
    children: [
      { label: 'AI出题', key: '/ai-review/text', icon: renderIcon(CreateOutline) },
      { label: '文档变式', key: '/ai-review/file', icon: renderIcon(DocumentOutline) },
      { label: 'AI智能导入', key: '/ai-review/ai-import', icon: renderIcon(DocumentOutline) },
      { label: '题目校验', key: '/question-verify', icon: renderIcon(CheckmarkOutline) }
    ]
  },
  {
    label: '教材管理',
    key: '/textbooks',
    icon: renderIcon(BookOutline)
  },
  {
    label: '知识库',
    key: '/reference-library',
    icon: renderIcon(BookOutline)
  },
  {
    label: '题库管理',
    key: '/questions',
    icon: renderIcon(DocumentTextOutline)
  },
  {
    label: '试卷管理',
    key: 'paper-management',
    icon: renderIcon(FileTrayFullOutline),
    children: [
      { label: '智能组卷', key: '/paper-generate', icon: renderIcon(LayersOutline) },
      { label: '试卷编辑/导出', key: '/papers', icon: renderIcon(NewspaperOutline) },
      { label: '试卷审核', key: '/paper-review', icon: renderIcon(RibbonOutline) }
    ]
  },
  // {
  //   label: '答题卡',
  //   key: '/answer-sheets',
  //   icon: renderIcon(TicketOutline)
  // },
  {
    label: '专项练习',
    key: 'practice-module',
    icon: renderIcon(CreateOutline),
    children: [
      { label: '试卷练习', key: '/practice/paper', icon: renderIcon(NewspaperOutline) },
      { label: '试题练习', key: '/practice/temporary', icon: renderIcon(FlashOutline) }
    ]
  },
  {
    label: '个人中心',
    key: '/me',
    icon: renderIcon(PersonCircleOutline)
  }
])

const activeKey = computed(() => route.path)

function handleMenuUpdate(key) {
  if (!key.startsWith('/')) return
  router.push(key)
}

onMounted(() => {
  initTheme()
  const refreshUser = () => {
    user.value = getUser()
    if (getToken()) {
      taskStore.restoreTasks()
    } else {
      taskStore.clearAll()
    }
  }
  const showTrialLimit = () => { trialLimitVisible.value = true }
  window.addEventListener('iqg-user-updated', refreshUser)
  window.addEventListener('iqg-trial-limit', showTrialLimit)
  // 保存以便卸载时移除
  window.__iqg_refreshUser = refreshUser
  window.__iqg_showTrialLimit = showTrialLimit
})

onUnmounted(() => {
  removeThemeListener()
  try {
    if (window.__iqg_refreshUser) {
      window.removeEventListener('iqg-user-updated', window.__iqg_refreshUser)
      delete window.__iqg_refreshUser
    }
    if (window.__iqg_showTrialLimit) {
      window.removeEventListener('iqg-trial-limit', window.__iqg_showTrialLimit)
      delete window.__iqg_showTrialLimit
    }
  } catch {}
})

function openApiConfig() {
  trialLimitVisible.value = false
  apiConfigVisible.value = true
}
</script>

<template>
  <n-config-provider :theme="isDarkMode ? darkTheme : null" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <div v-if="isFullPage" class="landing-layout">
          <router-view v-slot="{ Component, route: currentRoute }">
            <transition name="page" mode="out-in" appear>
              <component :is="Component" :key="currentRoute.fullPath" />
            </transition>
          </router-view>
        </div>

        <n-layout v-else class="layout app-shell" has-sider>
          <n-layout-sider
            v-model:collapsed="collapsed"
            class="side-panel"
            bordered
            collapse-mode="width"
            :collapsed-width="64"
            :width="220"
            show-trigger
            content-style="display: flex; flex-direction: column; height: 100%; overflow: hidden;"
          >
            <div class="logo" :class="{ 'logo-collapsed': collapsed }" @dblclick="handleLogoDoubleClick" style="cursor: pointer; user-select: none;">
              <img class="logo-img" src="/Logo.png" alt="Logo" />
              <span class="logo-text" v-if="!collapsed">慧题通</span>
            </div>
            <div class="menu-scroll">
              <n-menu
                :options="menuOptions"
                :value="activeKey"
                :collapsed="collapsed"
                @update:value="handleMenuUpdate"
                :collapsed-width="64"
                :collapsed-icon-size="22"
              />
            </div>
            <div class="aside-footer">
              <!-- 主题切换按钮 -->
              <n-tooltip v-if="collapsed" placement="right">
                <template #trigger>
                  <div class="footer-item" @click="toggleTheme">
                    <n-icon size="18" class="footer-icon">
                      <SyncOutline v-if="nextThemeMode === 'auto'" />
                      <SunnyOutline v-else-if="nextThemeMode === 'light'" />
                      <MoonOutline v-else />
                    </n-icon>
                  </div>
                </template>
                {{ themeToggleText }}
              </n-tooltip>
              <div v-else class="footer-item" @click="toggleTheme">
                <n-icon size="18" class="footer-icon">
                  <SyncOutline v-if="nextThemeMode === 'auto'" />
                  <SunnyOutline v-else-if="nextThemeMode === 'light'" />
                  <MoonOutline v-else />
                </n-icon>
                <span class="footer-text">{{ themeToggleText }}</span>
              </div>

              <n-tooltip :disabled="!collapsed" placement="right">
                <template #trigger>
                  <button class="footer-item api-item" type="button" @click="openApiConfig">
                    <n-icon size="18" class="footer-icon"><KeyOutline /></n-icon>
                    <span v-if="!collapsed" class="footer-text">API 配置</span>
                  </button>
                </template>
                API 配置
              </n-tooltip>
            </div>
          </n-layout-sider>

          <n-layout class="workspace">
            <n-layout-header bordered class="header">
              <div class="header-left">
                <div class="page-kicker">Workspace</div>
                <div class="page-title">{{ pageTitle }}</div>
                <div class="page-caption">{{ pageCaption }}</div>
              </div>
              <div class="right">
                <div
                  v-if="taskCenterTasks.length"
                  class="task-center"
                  @mouseenter="taskMenuVisible = true"
                  @mouseleave="taskMenuVisible = false"
                >
                  <div class="task-trigger" :class="{ 'task-trigger--active': taskMenuVisible }">
                    <span class="task-trigger-icon">
                      <n-progress
                        v-if="taskRunningCount"
                        type="circle"
                        :percentage="taskCenterTasks[0]?.progress || 0"
                        :status="taskCenterTasks[0]?.status === 'error' ? 'error' : 'default'"
                        :stroke-width="5"
                        :show-indicator="false"
                        style="width: 20px; height: 20px"
                      />
                      <n-icon v-else size="18"><SyncOutline /></n-icon>
                    </span>
                    <span class="task-trigger-text">AI任务 {{ taskCenterTasks.length }}</span>
                    <span v-if="taskRunningCount" class="task-trigger-count">{{ taskRunningCount }} 进行中</span>
                  </div>

                  <transition name="task-list">
                    <div v-if="taskMenuVisible" class="task-popover">
                      <div class="task-popover-header">
                        <span>后台生成任务</span>
                        <span class="task-popover-sub">悬停查看，点击跳转</span>
                      </div>
                      <div class="task-popover-list">
                        <button
                          v-for="task in taskCenterTasks"
                          :key="task.jobId"
                          type="button"
                          class="task-item"
                          @click="openTask(task)"
                        >
                          <span class="task-item-status" :class="`is-${task.status}`">
                            <n-progress
                              v-if="task.status === 'running' || task.status === 'queued'"
                              type="circle"
                              :percentage="task.progress"
                              :status="task.status === 'error' ? 'error' : 'default'"
                              :stroke-width="5"
                              :show-indicator="false"
                              style="width: 24px; height: 24px"
                            />
                            <n-icon v-else-if="task.status === 'done'" size="18"><CheckmarkCircleOutline /></n-icon>
                            <n-icon v-else size="18"><FlashOutline /></n-icon>
                          </span>
                          <span class="task-item-main">
                            <span class="task-item-title">{{ taskTitle(task) }}</span>
                            <span class="task-item-meta">
                              {{ formatTaskTime(task.createdAt) }} · 
                              {{ taskStatusText(task) }}
                              <template v-if="task.status === 'running' || task.status === 'queued'">
                                · {{ task.progress }}%
                              </template>
                            </span>
                          </span>
                          <span class="task-item-chevron">›</span>
                        </button>
                      </div>
                    </div>
                  </transition>
                </div>

                <div v-if="user" class="user">
                  <img v-if="user?.img" :src="'data:image/png;base64,' + user.img" class="user-avatar" @click="router.push('/me')" />
                  <span class="userName">{{ user.name }}</span>
                  <n-button size="small" @click="logout">
                    <template #icon>
                      <n-icon><LogOutOutline /></n-icon>
                    </template>
                    退出登录
                  </n-button>
                </div>
              </div>
            </n-layout-header>

            <n-layout-content class="main" content-style="padding: 0;">
              <main class="main-inner">
                <router-view v-slot="{ Component, route: currentRoute }">
                  <transition name="page" mode="out-in" appear>
                    <component :is="Component" :key="currentRoute.fullPath" />
                  </transition>
                </router-view>
              </main>
            </n-layout-content>
          </n-layout>
        </n-layout>
      </n-dialog-provider>
      <AssistantWidget v-if="!isFullPage" :isDark="isDarkMode" />
      <ApiConfigModal v-model:show="apiConfigVisible" />
      <n-modal v-model:show="trialLimitVisible" preset="card" class="trial-limit-modal" :bordered="false">
        <div class="trial-limit-content">
          <div class="trial-limit-icon"><n-icon size="24"><KeyOutline /></n-icon></div>
          <h2>今日试用额度已用完</h2>
          <p>系统内置 DeepSeek API 每个自然日可调用 5 次。配置你自己的 API 后即可继续生成，且不受试用次数限制。</p>
          <div class="trial-limit-actions">
            <n-button @click="trialLimitVisible = false">稍后处理</n-button>
            <n-button type="primary" @click="openApiConfig">前往 API 配置</n-button>
          </div>
        </div>
      </n-modal>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.layout {
  height: 100dvh;
  background:
    radial-gradient(circle at 14% -10%, var(--app-amber-soft), transparent 34rem),
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary) 8%, transparent), transparent 28rem),
    var(--app-bg);
}
.landing-layout {
  height: 100dvh;
  overflow-y: auto;
}

.app-shell :deep(.n-layout-scroll-container) {
  background: transparent;
}

.side-panel {
  --app-text: #20241f;
  --app-muted: #5f665f;
  --app-menu-text: #48524b;
  --app-menu-icon: #657066;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-surface-solid) 96%, transparent), color-mix(in srgb, var(--app-surface-muted) 86%, transparent)) !important;
  border-right: 1px solid var(--app-border) !important;
  box-shadow: 12px 0 36px rgba(62, 51, 34, 0.08);
  color: var(--app-text);
  position: relative;
  overflow: visible !important;
}

:global(html[data-theme="dark"]) .side-panel {
  --app-text: rgba(244, 248, 255, 0.94);
  --app-muted: rgba(226, 234, 247, 0.9);
  --app-menu-text: rgba(244, 248, 255, 0.96);
  --app-menu-icon: rgba(226, 234, 247, 0.9);
  background: linear-gradient(180deg, rgba(20, 26, 42, 0.98), rgba(15, 21, 35, 0.94)) !important;
  box-shadow: 12px 0 36px rgba(0, 0, 0, 0.26);
}

.side-panel :deep(.n-layout-sider-scroll-container),
.side-panel :deep(.n-layout-toggle-button),
.side-panel :deep(.n-layout-toggle-bar) {
  background: transparent !important;
}

.side-panel :deep(.n-layout-toggle-button) {
  right: -15px !important;
  z-index: 20;
  border: 1px solid var(--app-border);
  background: var(--app-surface-solid) !important;
  color: var(--app-menu-text) !important;
  box-shadow: 0 10px 22px rgba(62, 51, 34, 0.14);
}

.side-panel :deep(.n-layout-toggle-button .n-icon) {
  color: var(--app-menu-text) !important;
}

.workspace {
  background: transparent !important;
}

.logo {
  min-height: 84px;
  padding: 18px 14px;
  font-weight: 750;
  font-size: 17px;
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
  overflow: hidden;
  transition:
    padding var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out),
    background-color var(--motion-base) ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  position: relative;
}

.logo-collapsed {
  padding: 16px 8px;
  justify-content: center;
}

.logo-img {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  box-shadow: 0 10px 22px rgba(49, 95, 202, 0.18);
}
.logo-collapsed .logo-img {
  width: 38px;
  height: 38px;
  border-radius: 10px;
}
.logo-text {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-text);
  letter-spacing: 0;
  text-shadow: none;
}

.header {
  position: relative;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76px;
  padding: 13px 28px 12px;
  background: color-mix(in srgb, var(--app-surface-solid) 86%, transparent) !important;
  backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--app-border) !important;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.page-kicker {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.page-title {
  margin-top: 2px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 760;
  line-height: 1.2;
  text-wrap: balance;
}

.page-caption {
  margin-top: 4px;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.4;
}

.right {
  position: relative;
  z-index: 10;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 6px 5px 10px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-solid) 76%, transparent);
}

:global(html[data-theme="dark"]) .user {
  background: rgba(15, 21, 35, 0.66);
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  object-fit: cover;
  cursor: pointer;
}

.userName {
  max-width: 8rem;
  overflow: hidden;
  color: var(--app-text-soft);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main {
  overflow-y: auto;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary) 8%, transparent), transparent 26rem),
    var(--app-bg);
}

.main-inner {
  min-height: calc(100dvh - 76px);
  padding: 24px;
}

.aside-footer {
  padding: 10px;
  border-top: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  bottom: 0;
  background: color-mix(in srgb, var(--app-surface-solid) 84%, transparent);
  backdrop-filter: blur(16px);
}

.menu-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.menu-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 11px;
  font-size: 13px;
  color: var(--app-text-soft);
  border-radius: 8px;
  cursor: pointer;
  transition:
    transform var(--motion-base) var(--ease-out),
    background-color var(--motion-base) ease,
    color var(--motion-base) ease;
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
}

.footer-icon {
  flex-shrink: 0;
}

.footer-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.trial-limit-modal) { width: min(460px, calc(100vw - 32px)); }
.trial-limit-content { text-align: center; padding: 12px 8px 4px; }
.trial-limit-icon { width: 52px; height: 52px; margin: 0 auto 18px; display: grid; place-items: center; border-radius: 14px; color: #b7791f; background: rgba(183, 121, 31, 0.12); }
.trial-limit-content h2 { margin: 0 0 10px; font-size: 22px; line-height: 1.3; }
.trial-limit-content p { max-width: 38em; margin: 0 auto; color: var(--n-text-color-3); font-size: 14px; line-height: 1.7; font-weight: 400; }
.trial-limit-actions { display: flex; justify-content: center; gap: 10px; margin-top: 24px; }

.task-center {
  position: relative;
  z-index: 10;
}

.task-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 5px 10px 5px 7px;
  background: var(--app-surface);
  border-radius: 999px;
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--ease-out),
    background-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
  border: 1px solid var(--app-border);
  animation: slideIn 360ms var(--ease-out) both;
  box-shadow: 0 8px 20px rgba(49, 95, 202, 0.1);
}

.task-trigger--active {
  background: var(--app-primary-soft);
  border-color: color-mix(in srgb, var(--app-primary) 28%, transparent);
}

.task-trigger-icon {
  display: grid;
  place-items: center;
  color: var(--app-primary);
}

.task-trigger-text {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.task-trigger-count {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.task-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 50;
  width: min(360px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-raised);
  box-shadow: var(--app-shadow-lift);
  backdrop-filter: blur(18px);
  transform-origin: top right;
}

.task-list-enter-active,
.task-list-leave-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 220ms var(--ease-out);
}

.task-list-enter-from,
.task-list-leave-to {
  opacity: 0;
  transform: translate3d(0, -8px, 0) scale(0.98);
}

.task-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 13px;
  border-bottom: 1px solid var(--app-border-soft);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
}

.task-popover-sub {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.task-popover-list {
  display: flex;
  flex-direction: column;
  max-height: 360px;
  padding: 7px;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--motion-fast) ease;
}

.task-item:hover {
  background: var(--app-primary-soft);
}

.task-item-status {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--app-primary);
}

.task-item-status.is-done {
  color: var(--app-success);
}

.task-item-status.is-error {
  color: var(--app-danger);
}

.task-item-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.task-item-title {
  overflow: hidden;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-meta {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-chevron {
  color: var(--app-text-muted);
  font-size: 20px;
  line-height: 1;
}

.side-panel :deep(.n-menu-item-content) {
  border-radius: 8px;
  margin: 2px 0;
  transition:
    background-color var(--motion-fast) ease,
    color var(--motion-fast) ease,
    transform var(--motion-fast) var(--ease-out);
}

.side-panel :deep(.n-menu) {
  padding: 10px;
}

:global(html[data-theme="dark"]) .side-panel :deep(.n-menu) {
  --n-item-text-color: rgba(244, 248, 255, 0.94) !important;
  --n-item-text-color-hover: #8fb2ff !important;
  --n-item-text-color-active: var(--app-primary) !important;
  --n-item-text-color-active-hover: var(--app-primary-hover) !important;
  --n-item-text-color-child-active: var(--app-primary) !important;
  --n-item-text-color-child-active-hover: var(--app-primary-hover) !important;
  --n-item-icon-color: rgba(226, 234, 247, 0.9) !important;
  --n-item-icon-color-hover: #8fb2ff !important;
  --n-item-icon-color-active: var(--app-primary) !important;
  --n-item-icon-color-active-hover: var(--app-primary-hover) !important;
  --n-item-icon-color-child-active: var(--app-primary) !important;
  --n-item-icon-color-child-active-hover: var(--app-primary-hover) !important;
  --n-arrow-color: rgba(226, 234, 247, 0.84) !important;
  --n-arrow-color-hover: #8fb2ff !important;
  --n-arrow-color-active: var(--app-primary) !important;
  --n-arrow-color-active-hover: var(--app-primary-hover) !important;
  --n-item-color-hover: rgba(92, 130, 222, 0.18) !important;
  --n-item-color-active: rgba(92, 130, 222, 0.24) !important;
  --n-item-color-active-hover: rgba(92, 130, 222, 0.3) !important;
}

:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item),
:global(html[data-theme="dark"]) .side-panel :deep(.n-submenu) {
  opacity: 1 !important;
}

.side-panel :deep(.n-menu-item-content .n-menu-item-content-header),
.side-panel :deep(.n-menu-item-content .n-menu-item-content-header a),
.side-panel :deep(.n-menu-item-content .n-menu-item-content-header span),
.side-panel :deep(.n-menu-item-content .n-menu-item-content__icon),
.side-panel :deep(.n-menu-item-content .n-menu-item-content__arrow) {
  color: var(--app-menu-text) !important;
  font-weight: 620 !important;
  text-shadow: none;
}

.side-panel :deep(.n-menu-item-content .n-menu-item-content__icon),
.side-panel :deep(.n-menu-item-content .n-menu-item-content__arrow) {
  color: var(--app-menu-icon) !important;
}

:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item-content .n-menu-item-content-header),
:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item-content .n-menu-item-content-header a),
:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item-content .n-menu-item-content-header span) {
  color: rgba(244, 248, 255, 0.94) !important;
  font-weight: 720 !important;
  opacity: 1 !important;
}

:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item-content .n-menu-item-content__icon),
:global(html[data-theme="dark"]) .side-panel :deep(.n-menu-item-content .n-menu-item-content__arrow) {
  color: rgba(226, 234, 247, 0.9) !important;
  opacity: 1 !important;
}

.side-panel .footer-item,
.side-panel .footer-text,
.side-panel .logo-text {
  color: var(--app-menu-text);
  font-weight: 650;
}

:global(html[data-theme="dark"]) .side-panel .footer-item,
:global(html[data-theme="dark"]) .side-panel .footer-text,
:global(html[data-theme="dark"]) .side-panel .logo-text {
  color: rgba(244, 248, 255, 0.92);
  font-weight: 700;
  opacity: 1;
}

:global(html[data-theme="dark"]) .side-panel .footer-icon {
  color: rgba(226, 234, 247, 0.9);
  opacity: 1;
}

.side-panel :deep(.n-menu-item-content.n-menu-item-content--selected) {
  background: var(--app-primary-soft);
  color: var(--app-primary);
  font-weight: 650;
}

.side-panel :deep(.n-menu-item-content.n-menu-item-content--selected .n-menu-item-content-header),
.side-panel :deep(.n-menu-item-content.n-menu-item-content--selected .n-menu-item-content__icon),
.side-panel :deep(.n-menu-item-content.n-menu-item-content--selected .n-menu-item-content__arrow),
.side-panel :deep(.n-menu-item-content:hover .n-menu-item-content-header),
.side-panel :deep(.n-menu-item-content:hover .n-menu-item-content__icon),
.side-panel :deep(.n-menu-item-content:hover .n-menu-item-content__arrow) {
  color: var(--app-primary) !important;
}

@media (hover: hover) and (pointer: fine) {
  .footer-item:hover {
    background: var(--app-primary-soft);
    color: var(--app-primary);
    transform: translateY(-1px);
  }

  .task-trigger:hover {
    background: var(--app-primary-soft);
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(49, 95, 202, 0.14);
  }

  .side-panel :deep(.n-menu-item-content:hover) {
    background: var(--app-primary-soft);
    transform: translateY(-1px);
  }
}

@media (max-width: 760px) {
  .header {
    min-height: auto;
    padding: 12px 16px;
    align-items: flex-start;
    gap: 12px;
  }

  .page-caption,
  .page-kicker {
    display: none;
  }

  .page-title {
    font-size: 18px;
  }

  .main-inner {
    padding: 16px;
  }

  .userName {
    display: none;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
