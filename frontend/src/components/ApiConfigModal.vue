<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { CheckmarkCircleOutline, FlaskOutline, RefreshOutline, TrashOutline } from '@vicons/ionicons5'
import { http } from '../api/http'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show', 'configured'])
const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const detecting = ref(false)
const removing = ref(false)
const refreshingBalance = ref(false)
const providers = ref([])
const models = ref([])
const hasStoredKey = ref(false)
const maskedKey = ref('')
const storedProvider = ref('')
const balance = reactive({ amount: null, currency: 'CNY', error: '' })
const trial = reactive({ is_trial: true, call_count: 0, remaining: 5, limit: 5 })
const form = reactive({
  provider: 'deepseek',
  api_key: '',
  base_url: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  timeout: 30,
  max_concurrency: 2,
  rate_limit_per_minute: 60,
})

const providerOptions = computed(() => providers.value.map(item => ({ label: item.label, value: item.value })))
const modelOptions = computed(() => models.value.map(model => ({ label: model, value: model })))
const selectedProvider = computed(() => providers.value.find(item => item.value === form.provider))
const hasBalanceAmount = computed(() => Number.isFinite(balance.amount))
const isLowBalance = computed(() => hasBalanceAmount.value && balance.amount < 5)
const providerConsoleUrls = {
  deepseek: 'https://platform.deepseek.com/usage',
  openai: 'https://platform.openai.com/usage',
  aliyun: 'https://bailian.console.aliyun.com/',
  baidu: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  tencent: 'https://console.cloud.tencent.com/hunyuan',
  zhipu: 'https://open.bigmodel.cn/usercenter/resourcepack',
  xunfei: 'https://console.xfyun.cn/',
  moonshot: 'https://platform.moonshot.cn/console/account',
}
const balanceConsoleUrl = computed(() => {
  const origin = getUrlOrigin(form.base_url)
  const defaultOrigin = getUrlOrigin(selectedProvider.value?.base_url)
  if (origin && origin !== defaultOrigin) return origin
  return providerConsoleUrls[form.provider] || origin
})
const balanceText = computed(() => {
  if (balance.error) return '余额获取失败'
  if (!hasBalanceAmount.value) return refreshingBalance.value ? '余额刷新中' : '余额 --'
  const symbol = balance.currency === 'CNY' || balance.currency === 'RMB' ? '¥' : `${balance.currency || ''} `
  return `余额 ${symbol}${balance.amount.toFixed(2)}`
})

function close() {
  emit('update:show', false)
}

function getUrlOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function openBalanceConsole() {
  if (!balanceConsoleUrl.value) {
    message.warning('暂未识别到可打开的 API 平台地址')
    return
  }
  window.open(balanceConsoleUrl.value, '_blank', 'noopener,noreferrer')
}

function applyProviderDefaults(provider) {
  const meta = providers.value.find(item => item.value === provider)
  if (!meta) return
  form.base_url = meta.base_url
  form.model = meta.models?.[0] || ''
  models.value = meta.models || []
  if (provider !== storedProvider.value) {
    hasStoredKey.value = false
    maskedKey.value = ''
    form.api_key = ''
  }
}

function requestPayload() {
  return {
    provider: form.provider,
    api_key: form.api_key,
    base_url: form.base_url,
    model: form.model,
    timeout: form.timeout,
    max_concurrency: form.max_concurrency,
    rate_limit_per_minute: form.rate_limit_per_minute,
  }
}

async function loadConfig() {
  loading.value = true
  try {
    const { data } = await http.get('/ai/config')
    providers.value = data.providers || []
    Object.assign(trial, data.trial || {})
    const config = data.config
    if (config) {
      Object.assign(form, {
        provider: config.provider,
        api_key: '',
        base_url: config.base_url,
        model: config.model,
        timeout: config.timeout || 30,
        max_concurrency: config.max_concurrency || 2,
        rate_limit_per_minute: config.rate_limit_per_minute || 60,
      })
      hasStoredKey.value = config.has_api_key
      maskedKey.value = config.api_key_masked || ''
      storedProvider.value = config.provider
      models.value = providers.value.find(item => item.value === config.provider)?.models || [config.model]
    } else {
      hasStoredKey.value = false
      maskedKey.value = ''
      storedProvider.value = ''
      applyProviderDefaults(form.provider)
    }
    if (!trial.is_trial) {
      await refreshBalance(false)
    } else {
      Object.assign(balance, { amount: null, currency: 'CNY', error: '' })
    }
  } catch (error) {
    message.error(error.message)
  } finally {
    loading.value = false
  }
}

async function refreshBalance(showMessage = true) {
  if (trial.is_trial || refreshingBalance.value) return
  refreshingBalance.value = true
  balance.error = ''
  try {
    const { data } = await http.get('/ai/config/balance')
    const nextBalance = data.balance || {}
    const nextAmount = Number(nextBalance.amount)
    Object.assign(balance, {
      amount: Number.isFinite(nextAmount) ? nextAmount : null,
      currency: nextBalance.currency || 'CNY',
      error: Number.isFinite(nextAmount) ? '' : '余额接口响应中没有可识别的余额字段',
    })
    if (balance.error) throw new Error(balance.error)
    if (showMessage) message.success('余额已刷新')
  } catch (error) {
    balance.error = error.message || '余额获取失败'
    if (showMessage) message.error(balance.error)
  } finally {
    refreshingBalance.value = false
  }
}

async function detectModels() {
  detecting.value = true
  try {
    const { data } = await http.post('/ai/config/models', requestPayload())
    models.value = data.models || []
    if (!models.value.includes(form.model)) form.model = models.value[0] || form.model
    message.success(data.source === 'remote' ? '已读取服务端可用模型' : '当前服务未开放模型列表，已载入推荐模型')
  } catch (error) {
    message.error(error.message)
  } finally {
    detecting.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    await http.post('/ai/config/test', requestPayload())
    message.success('连接成功')
  } catch (error) {
    message.error(error.message)
  } finally {
    testing.value = false
  }
}

async function saveConfig() {
  if (!hasStoredKey.value && !form.api_key.trim()) {
    message.warning('请输入 API Key')
    return
  }
  saving.value = true
  try {
    const { data } = await http.put('/ai/config', requestPayload())
    Object.assign(trial, data.trial || {})
    message.success('API 配置已保存')
    emit('configured', data)
    close()
  } catch (error) {
    message.error(error.message)
  } finally {
    saving.value = false
  }
}

async function removeConfig() {
  removing.value = true
  try {
    const { data } = await http.delete('/ai/config')
    Object.assign(trial, data.trial || {})
    message.success('已恢复系统试用 API')
    emit('configured', data)
    await loadConfig()
  } catch (error) {
    message.error(error.message)
  } finally {
    removing.value = false
  }
}

watch(() => props.show, visible => {
  if (visible) loadConfig()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="api-config-modal"
    :style="{ width: 'min(760px, calc(100vw - 32px))' }"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <template #header>
      <div class="modal-heading">
        <div>
          <div class="modal-title">API 配置</div>
          <div class="modal-subtitle">连接你自己的模型服务，不受每日试用额度限制</div>
        </div>
        <div class="mode-status" :class="{ custom: !trial.is_trial }">
          <span class="status-dot"></span>
          <span>{{ trial.is_trial ? `系统试用 · 今日剩余 ${trial.remaining ?? 5} 次` : '自定义 API 已启用' }}</span>
          <template v-if="!trial.is_trial">
            <span class="status-separator"></span>
            <button
              class="balance-text"
              :class="{ low: isLowBalance, error: balance.error }"
              type="button"
              :title="balanceConsoleUrl ? '前往 API 平台查看余额和充值' : '暂未识别到 API 平台地址'"
              @click.stop="openBalanceConsole"
            >
              {{ balanceText }}
            </button>
            <n-button
              class="balance-refresh"
              quaternary
              circle
              size="tiny"
              :loading="refreshingBalance"
              :title="balance.error || '刷新余额'"
              @click.stop="refreshBalance()"
            >
              <template #icon><n-icon><RefreshOutline /></n-icon></template>
            </n-button>
          </template>
        </div>
      </div>
    </template>

    <n-spin :show="loading">
      <n-form label-placement="top" :show-feedback="false" class="config-form">
        <div class="form-grid primary-fields">
          <n-form-item label="模型供应商">
            <n-select v-model:value="form.provider" :options="providerOptions" @update:value="applyProviderDefaults" />
          </n-form-item>
          <n-form-item label="API Key">
            <n-input
              v-model:value="form.api_key"
              type="password"
              show-password-on="click"
              :placeholder="hasStoredKey ? `已保存 ${maskedKey}，留空则不修改` : '输入供应商 API Key'"
            />
          </n-form-item>
        </div>

        <n-form-item label="接口地址（Base URL）">
          <n-input v-model:value="form.base_url" placeholder="https://api.example.com/v1" />
        </n-form-item>

        <div class="model-row">
          <n-form-item label="模型名称" class="model-field">
            <n-select v-model:value="form.model" :options="modelOptions" filterable tag placeholder="选择或输入模型名称" />
          </n-form-item>
          <n-button secondary :loading="detecting" @click="detectModels">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            检测模型
          </n-button>
        </div>

        <div class="form-grid limits-grid">
          <n-form-item label="超时时间（秒）">
            <n-input-number v-model:value="form.timeout" :min="5" :max="300" />
          </n-form-item>
          <n-form-item label="最大并发">
            <n-input-number v-model:value="form.max_concurrency" :min="1" :max="20" />
          </n-form-item>
          <n-form-item label="调用速率（次/分钟）">
            <n-input-number v-model:value="form.rate_limit_per_minute" :min="1" :max="10000" />
          </n-form-item>
        </div>
      </n-form>
    </n-spin>

    <template #footer>
      <div class="modal-footer">
        <n-button v-if="!trial.is_trial" quaternary type="error" :loading="removing" @click="removeConfig">
          <template #icon><n-icon><TrashOutline /></n-icon></template>
          移除配置
        </n-button>
        <span v-else></span>
        <div class="footer-actions">
          <n-button :loading="testing" @click="testConnection">
            <template #icon><n-icon><FlaskOutline /></n-icon></template>
            测试连接
          </n-button>
          <n-button type="primary" :loading="saving" @click="saveConfig">
            <template #icon><n-icon><CheckmarkCircleOutline /></n-icon></template>
            保存并启用
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.api-config-modal { border-radius: 10px; overflow: hidden; }
.modal-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.modal-title { font-size: 22px; font-weight: 650; line-height: 1.25; }
.modal-subtitle { margin-top: 5px; color: var(--n-text-color-3); font-size: 13px; font-weight: 400; }
.mode-status { display: flex; align-items: center; gap: 7px; padding-top: 4px; color: #9a6700; font-size: 12px; white-space: nowrap; }
.mode-status.custom { color: #16794b; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent); }
.status-separator { width: 1px; height: 12px; background: color-mix(in srgb, currentColor 28%, transparent); }
.balance-text { padding: 0; border: 0; background: transparent; color: #16794b; cursor: pointer; font: inherit; font-weight: 650; text-decoration: none; }
.balance-text:hover { text-decoration: underline; text-underline-offset: 3px; }
.balance-text.low, .balance-text.error { color: #d03050; }
.balance-refresh { margin-left: -3px; color: currentColor; }
.config-form { padding-top: 8px; }
.form-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 16px; }
.limits-grid { grid-template-columns: repeat(3, 1fr); }
.model-row { display: flex; align-items: flex-end; gap: 12px; }
.model-field { flex: 1; }
.model-row > .n-button { margin-bottom: 1px; }
.modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.footer-actions { display: flex; gap: 10px; }
:deep(.n-card-header) { padding: 26px 28px 12px; }
:deep(.n-card__content) { padding: 0 28px 18px; }
:deep(.n-card__footer) { padding: 18px 28px 26px; }
:deep(.n-form-item) { margin-bottom: 16px; }
:deep(.n-form-item-label) { font-weight: 650; }
:deep(.n-input-number) { width: 100%; }
@media (max-width: 640px) {
  .modal-heading, .modal-footer { align-items: stretch; flex-direction: column; }
  .mode-status { white-space: normal; }
  .form-grid, .limits-grid { grid-template-columns: 1fr; gap: 0; }
  .model-row { align-items: stretch; flex-direction: column; gap: 0; }
  .footer-actions { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
