<script setup>
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { NButton, useDialog, useMessage } from 'naive-ui'
import { CloudUploadOutline, RefreshOutline, TrashOutline } from '@vicons/ionicons5'
import { http } from '../api/http'

const message = useMessage()
const dialog = useDialog()
const documents = ref([])
const loading = ref(false)
const uploadLoading = ref(false)
const referenceType = ref('material')
let refreshTimer = null

const statusMap = {
  processing: { label: '处理中', type: 'info' },
  ready: { label: '可用', type: 'success' },
  failed: { label: '失败', type: 'error' },
}

const readyCount = computed(() => documents.value.filter(item => item.status === 'ready').length)
const referenceTypeOptions = [
  { label: '参考资料', value: 'material' },
  { label: '历史试题', value: 'question' },
]

async function loadDocuments({ silent = false } = {}) {
  if (!silent) loading.value = true
  try {
    const resp = await http.get('/reference-library/documents')
    documents.value = resp.data.items || []
  } catch (error) {
    if (!silent) message.error(error?.message || '加载知识库失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function uploadReference({ file, onFinish, onError }) {
  if (!file?.file) return
  const rawFile = file.file
  if (!/\.(pdf|docx|txt|md|xlsx)$/i.test(rawFile.name)) {
    message.error('仅支持 PDF、DOCX、TXT、Markdown、XLSX 文件')
    onError?.(new Error('文件类型不支持'))
    return
  }
  if (rawFile.size > 30 * 1024 * 1024) {
    message.error('文件大小不能超过 30MB')
    onError?.(new Error('文件大小超出限制'))
    return
  }
  const form = new FormData()
  form.append('file', rawFile)
  form.append('reference_type', referenceType.value)
  uploadLoading.value = true
  try {
    await http.post('/reference-library/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    message.success('资料已上传，正在后台解析和向量化')
    onFinish?.()
    await loadDocuments()
  } catch (error) {
    message.error(error?.message || '上传失败')
    onError?.(error)
  } finally {
    uploadLoading.value = false
  }
}

function removeDocument(row) {
  dialog.warning({
    title: '删除知识库资料',
    content: `确认删除“${row.file_name}”？删除后不会再参与 AI 出题。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await http.delete(`/reference-library/documents/${row.document_id}`)
        message.success('已删除')
        await loadDocuments()
      } catch (error) {
        message.error(error?.message || '删除失败')
      }
    },
  })
}

async function reprocess(row) {
  try {
    await http.post(`/reference-library/documents/${row.document_id}/reprocess`)
    message.success('已重新提交处理')
    await loadDocuments()
  } catch (error) {
    message.error(error?.message || '提交失败')
  }
}

function formatSize(size) {
  if (!size) return '-'
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatType(type) {
  return type === 'question' ? '历史试题' : '参考资料'
}

function renderStatus(row) {
  const status = statusMap[row.status]?.label || row.status
  if (row.status !== 'processing') {
    return h('span', { class: `status-${row.status}`, title: row.error_message || '' }, status)
  }
  return h('div', { class: 'processing-status', title: '正在解析文字并生成向量' }, [
    h('span', { class: 'status-processing' }, status),
    h('span', { class: 'processing-bar' }, h('span', { class: 'processing-bar-fill' })),
  ])
}

const columns = [
  { title: '资料名称', key: 'file_name', ellipsis: { tooltip: true } },
  { title: '类型', key: 'reference_type', width: 110, render: row => formatType(row.reference_type) },
  { title: '状态', key: 'status', width: 140, render: renderStatus },
  { title: '文本块', key: 'chunk_count', width: 90 },
  { title: '引用次数', key: 'reference_count', width: 100 },
  { title: '大小', key: 'file_size', width: 100, render: row => formatSize(row.file_size) },
  {
    title: '操作', key: 'actions', width: 150,
    render: row => h('div', { class: 'row-actions' }, [
      row.status === 'failed' ? h(NButton, {
        size: 'small', type: 'warning', secondary: true, onClick: () => reprocess(row),
      }, { default: () => '重试' }) : null,
      h(NButton, {
        size: 'small', type: 'error', secondary: true, onClick: () => removeDocument(row),
      }, { default: () => '删除' }),
    ]),
  },
]

onMounted(async () => {
  await loadDocuments()
  refreshTimer = window.setInterval(() => {
    if (documents.value.some(item => item.status === 'processing')) loadDocuments({ silent: true })
  }, 4000)
})

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="page">
    <n-card title="我的知识库">
      <template #header-extra>
        <div class="header-actions">
          <n-tag type="info" :bordered="false">{{ readyCount }} 份可用资料</n-tag>
          <n-button :loading="loading" @click="loadDocuments">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            刷新
          </n-button>
        </div>
      </template>
      <div class="upload-bar">
        <n-select v-model:value="referenceType" :options="referenceTypeOptions" style="width: 150px" />
        <n-upload :show-file-list="false" :custom-request="uploadReference" accept=".pdf,.docx,.txt,.md,.xlsx">
          <n-button type="primary" :loading="uploadLoading">
            <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
            上传资料
          </n-button>
        </n-upload>
        <span class="upload-hint">支持文字版 PDF、DOCX、TXT、Markdown、XLSX，单个文件不超过 30MB</span>
      </div>
      <n-alert type="info" :bordered="false" style="margin-bottom: 14px">
        知识库仅属于当前登录用户。AI 出题时可选择使用，资料会先解析并向量化，处理完成后才会参与检索。
      </n-alert>
      <n-data-table :columns="columns" :data="documents" :loading="loading" :row-key="row => row.document_id" striped />
    </n-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.header-actions, .upload-bar, .row-actions { display: flex; align-items: center; gap: 10px; }
.upload-bar { margin-bottom: 14px; flex-wrap: wrap; }
.upload-hint { color: var(--n-text-color-3); font-size: 12px; }
.status-processing { color: #2c7f9f; }
.status-ready { color: #1f8f6a; }
.status-failed { color: #b9433b; }
.processing-status { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 92px; }
.processing-bar { display: block; width: 84px; height: 3px; overflow: hidden; border-radius: 2px; background: rgba(44, 127, 159, 0.16); }
.processing-bar-fill { display: block; width: 42%; height: 100%; border-radius: inherit; background: #2c7f9f; animation: processing-slide 1.25s ease-in-out infinite; }
@keyframes processing-slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(250%); } }
</style>
