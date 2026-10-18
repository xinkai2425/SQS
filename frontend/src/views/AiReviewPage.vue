<script setup>
import { onMounted, onUnmounted, reactive, ref, computed, watch, nextTick, h } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useMessage, useDialog, NButton, NTag, NSelect, NInputNumber, NCascader, NProgress } from 'naive-ui'
import { PlayOutline, AddOutline, TrashOutline, CloseOutline, RefreshOutline, CloudUploadOutline, FunnelOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import { getToken, getUser } from '../auth'
import { useTaskStore } from '../stores/taskStore'
import MathRenderer from '../components/MathRenderer.vue'
import TaskStreamDeck from '../components/TaskStreamDeck.vue'

const message = useMessage()
const dialogApi = useDialog()
const loading = ref(false)
const error = ref('')
const router = useRouter()
const route = useRoute()
const taskStore = useTaskStore()

const subjects = ref([])
const types = ref([])
const difficulties = ref([])
const textbooks = ref([])
const chapters = ref([])
const chapterTree = ref([])
const selectedMainChapters = ref([]) // 选中的大章节ID列表

const gen = reactive({
  subject_id: null,
  textbook_id: null,
  chapter_ids: [],
  chapter_weights: {},
  type_ids: [],
  configs: {},
  create_user: 'ai',
})

const referenceDocuments = ref([])
const useReferenceLibrary = ref(false)
const selectedReferenceDocumentIds = ref([])

const generated = reactive({ items: [], loading: false })
const taskResultCache = reactive({})
const selectedCompletedTaskId = ref(null)
const completedGenerationTasks = computed(() =>
  taskStore.tasks.filter(
    (task) =>
      task.sourcePath === route.path &&
      task.type === 'ai_review' &&
      (task.status === 'done' || task.status === 'error'),
  ),
)
const selectedCompletedTask = computed(
  () =>
    completedGenerationTasks.value.find((task) => task.jobId === selectedCompletedTaskId.value) ||
    completedGenerationTasks.value[0] ||
    null,
)
const resultPagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [5, 10, 20, 50, 100],
  onChange: (page) => { resultPagination.page = page },
  onUpdatePageSize: (pageSize) => { resultPagination.pageSize = pageSize; resultPagination.page = 1 }
})
const detailDialog = reactive({ visible: false, item: null, evidence: [], evidenceLoading: false })

async function openDetail(row) {
  detailDialog.item = row
  detailDialog.evidence = []
  detailDialog.visible = true
  detailDialog.evidenceLoading = true
  try {
    const resp = await http.get(`/reference-library/evidence/questions/${row.question_id}`)
    detailDialog.evidence = resp.data.items || []
  } catch {
    detailDialog.evidence = []
  } finally {
    detailDialog.evidenceLoading = false
  }
}

const modifiedRows = reactive(new Set())
const hasUnsavedChanges = computed(() => modifiedRows.size > 0)
const saving = ref(false)
const abandoning = ref(false)

function handleRowChange(row) { modifiedRows.add(row) }

async function saveChanges() {
  if (modifiedRows.size === 0) return
  saving.value = true
  try {
    const items = Array.from(modifiedRows).map(row => ({
      question_id: row.question_id,
      chapter_id: row.chapter_id,
      difficulty_id: row.difficulty_id
    }))
    const promises = items.map(item => http.put(`/questions/${item.question_id}`, item))
    await Promise.all(promises)
    message.success('保存成功')
    modifiedRows.clear()
  } catch (e) {
    message.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

function abandonGeneration() {
  const ids = generated.items.map((item) => item.question_id).filter(Boolean)
  if (ids.length === 0) return

  dialogApi.warning({
    title: '放弃本次生成',
    content: `本次生成的 ${ids.length} 道题目将从题库中删除，且不会入库。`,
    positiveText: '放弃生成',
    negativeText: '取消',
    onPositiveClick: async () => {
      abandoning.value = true
      try {
        const jobId = selectedCompletedTask.value?.jobId
        await http.post('/questions/batch-delete', { ids })
        generated.items = []
        if (jobId) {
          delete taskResultCache[jobId]
          taskStore.removeTask(jobId)
        }
        modifiedRows.clear()
        message.success('已放弃本次生成结果')
      } catch (e) {
        message.error(e?.message || '放弃生成失败')
      } finally {
        abandoning.value = false
      }
    },
  })
}

const streamBodyRef = ref(null)
let typingTimer = null
let pollingTimer = null
let outputQueue = ''

async function loadDicts() {
  const [s, t, d] = await Promise.all([
    http.get('/dicts/subjects'),
    http.get('/dicts/question-types'),
    http.get('/dicts/difficulties'),
  ])
  subjects.value = s.data.items || []
  types.value = t.data.items || []
  difficulties.value = d.data.items || []
}

async function loadTextbooks() {
  if (!gen.subject_id) {
    textbooks.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get('/textbooks', {
    params: { subject_id: gen.subject_id },
  })
  textbooks.value = resp.data.items || []
  // 切换科目时清空章节
  chapterTree.value = []
}

async function loadChapters() {
  if (!gen.textbook_id) { chapters.value = []; chapterTree.value = []; aiReviewChapterTree.value = []; return }
  const resp = await http.get(`/textbooks/${gen.textbook_id}/chapters`)
  chapters.value = resp.data.items || []
  chapterTree.value = resp.data.tree || []
  if (activeTab.value === 'file') {
    aiReviewChapterTree.value = chapterTree.value
  }
}

const activeTab = ref('text')
const pageTitle = computed(() => {
  const map = {
    'text': 'AI出题',
    'paper': '试卷变式',
    'file': '文档变式',
    'ai-import': 'AI智能导入'
  }
  return map[activeTab.value] || 'AI出题'
})
const papers = ref([])
const sourcePaperId = ref(null)
const uploadFile = ref(null)
const fileList = ref([])
const aiImportFileList = ref([])
const aiConfigDialog = reactive({
  visible: false,
  file: null,
  form: {
    subject_id: null,
    textbook_id: null,
  }
})
const aiDialogTextbooks = ref([])
const aiReviewDialog = reactive({
  visible: false,
  items: [],
  loading: false
})
const aiReviewChapterTree = ref([])
const filterTextbookId = ref(null)
const filterReviewer = ref(null)
const reviewers = ref([])

const loadReviewers = async () => {
  try {
    const res = await http.get('/papers/reviewers')
    reviewers.value = res.data.items || []
  } catch {}
}

async function loadPapers() {
  const params = gen.subject_id ? { subject_id: gen.subject_id } : {}
  if (filterTextbookId.value) params.textbook_id = filterTextbookId.value
  if (filterReviewer.value) params.reviewer = filterReviewer.value
  params.review_status = 1
  const resp = await http.get('/papers', { params })
  papers.value = resp.data.items || []
}

function getTabFromRoute(path) {
  if (path === '/ai-review') return 'text'
  if (!path.startsWith('/ai-review/')) return null
  const seg = path.split('/')[2]
  return seg || 'text'
}

async function loadReferenceDocuments() {
  try {
    const resp = await http.get('/reference-library/documents')
    referenceDocuments.value = resp.data.items || []
    const readyIds = new Set(referenceDocuments.value.filter(item => item.status === 'ready').map(item => item.document_id))
    selectedReferenceDocumentIds.value = selectedReferenceDocumentIds.value.filter(id => readyIds.has(id))
  } catch {
    referenceDocuments.value = []
  }
}

function currentGenerationLabel() {
  const tab = getTabFromRoute(route.path)
  const labels = {
    text: 'AI出题',
    paper: '试卷变式',
    file: '文档变式',
    'ai-import': 'AI智能导入',
  }
  return labels[tab] || 'AI题目生成'
}

watch(activeTab, (val) => {
  const targetPath = `/ai-review/${val}`
  if (route.path !== targetPath) router.push(targetPath)
  if (val === 'paper' && papers.value.length === 0) loadPapers()
})

watch(
  () => route.path,
  (path) => {
    const tab = getTabFromRoute(path)
    if (!tab) return
    if (activeTab.value !== tab) activeTab.value = tab
    if (path === '/ai-review') router.replace('/ai-review/text')
  },
  { immediate: true }
)

function handleFileChange({ file }) {
  const rawFile = file.file
  const isLt10M = rawFile.size / 1024 / 1024 < 10
  const isValidType = /\.(pdf|doc|docx)$/i.test(rawFile.name)
  if (!isValidType) { message.error('只能上传 PDF/Word 文件!'); return false }
  if (!isLt10M) { message.error('文件大小不能超过 10MB!'); return false }
  uploadFile.value = rawFile
  return true
}

function handleAiImportFileChange({ file }) {
  if (!file || !file.file) return false
  const rawFile = file.file
  const isLt10M = rawFile.size / 1024 / 1024 < 10
  const isValidType = /\.(pdf|doc|docx)$/i.test(rawFile.name)
  if (!isValidType) { message.error('只能上传 PDF/Word 文件!'); return false }
  if (!isLt10M) { message.error('文件大小不能超过 10MB!'); return false }
  aiConfigDialog.form.subject_id = gen.subject_id || null
  aiConfigDialog.form.textbook_id = gen.textbook_id || null
  aiConfigDialog.file = rawFile
  aiConfigDialog.visible = true
  if (aiConfigDialog.form.subject_id) {
    loadDialogTextbooksForAi()
  } else {
    aiDialogTextbooks.value = []
  }
  return false
}

async function loadDialogTextbooksForAi() {
  const resp = await http.get('/textbooks', {
    params: aiConfigDialog.form.subject_id ? { subject_id: aiConfigDialog.form.subject_id } : {},
  })
  aiDialogTextbooks.value = resp.data.items || []
}

async function startParsing() {
  if (!aiConfigDialog.form.subject_id || !aiConfigDialog.form.textbook_id) {
    message.error('请选择科目和教材')
    return
  }
  const file = aiConfigDialog.file
  const form = new FormData()
  form.append('file', file)
  form.append('subject_id', String(aiConfigDialog.form.subject_id))
  form.append('chapter_id', '0')
  form.append('type_id', '0')
  form.append('difficulty_id', '0')
  form.append('create_user', 'ai_import')
  aiConfigDialog.visible = false
  try {
    const resp = await http.post('/ai/parse-word', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    taskStore.startTask({
      jobId: resp.data.job_id,
      type: 'parsing',
      label: 'AI智能导入',
      sourcePath: route.path,
      context: {
        subject_id: aiConfigDialog.form.subject_id,
        textbook_id: aiConfigDialog.form.textbook_id
      }
    })
  } catch (e) {
    message.error(e?.message || '启动解析失败')
  }
}

async function openReviewDialog(items) {
  const ctx = taskStore.task.context || {}
  const subjectId = ctx.subject_id || aiConfigDialog.form.subject_id
  const textbookId = ctx.textbook_id || aiConfigDialog.form.textbook_id

  aiReviewDialog.items = items.map(it => ({
    ...it,
    subject_id: subjectId,
    chapter_id: it.chapter_id || null,
    type_id: it.type_id || null,
    difficulty_id: it.difficulty_id || null,
    _error: false
  }))

  if (textbookId) {
    const resp = await http.get(`/textbooks/${textbookId}/chapters`)
    aiReviewChapterTree.value = resp.data.tree || []
  } else {
    aiReviewChapterTree.value = []
  }
  aiReviewDialog.visible = true
}

async function saveParsedQuestions() {
  let hasError = false
  for (const item of aiReviewDialog.items) {
    if (!item.chapter_id || !item.type_id || !item.difficulty_id) {
      item._error = true
      hasError = true
    } else {
      item._error = false
    }
  }
  if (hasError) {
    message.error('请为所有题目设置章节、题型和难度（标红项）')
    return
  }
  aiReviewDialog.loading = true
  try {
    const resp = await http.post('/questions/batch-create', { items: aiReviewDialog.items })
    message.success(`成功入库 ${resp.data.inserted_count} 道题目`)
    aiReviewDialog.visible = false
    taskStore.removeTask(taskStore.task.jobId)
  } catch (e) {
    message.error(e?.message || '保存失败')
  } finally {
    aiReviewDialog.loading = false
  }
}

const batchSet = reactive({
  chapter_id: null,
  type_id: null,
  difficulty_id: null
})

function applyBatchSet() {
  for (const item of aiReviewDialog.items) {
    if (batchSet.chapter_id) item.chapter_id = batchSet.chapter_id
    if (batchSet.type_id) item.type_id = batchSet.type_id
    if (batchSet.difficulty_id) item.difficulty_id = batchSet.difficulty_id
  }
  message.success('已应用批量设置')
}

const rootSelectedChapters = computed(() => {
  const selectedSet = new Set(gen.chapter_ids)
  const roots = []
  const isSelected = (node) => {
    if (selectedSet.has(node.chapter_id)) return true
    if (node.children && node.children.length > 0) return node.children.every(child => isSelected(child))
    return false
  }
  const traverse = (nodes) => {
    for (const node of nodes) {
      if (isSelected(node)) roots.push(node.chapter_id)
      else if (node.children && node.children.length > 0) traverse(node.children)
    }
  }
  traverse(chapterTree.value)
  return roots.sort((a, b) => a - b)
})

const totalWeight = computed(() => {
  if (gen.chapter_ids.length === 0) return 0
  let sum = 0
  for (const cid of rootSelectedChapters.value) sum += (gen.chapter_weights[cid] || 0)
  return sum
})

async function generate() {
  if (!gen.subject_id) { message.warning('请选择科目'); return }
  if (activeTab.value === 'text' && gen.chapter_ids.length === 0) { message.warning('请至少选择一个章节'); return }

  const finalWeights = {}
  if (gen.chapter_ids.length > 0) {
    if (totalWeight.value !== 100) { message.warning(`章节权重总和必须为 100%，当前为 ${totalWeight.value}%`); return }
    for (const cid of rootSelectedChapters.value) {
      if (gen.chapter_weights[cid] !== undefined) finalWeights[cid] = gen.chapter_weights[cid]
    }
  }

  loading.value = true
  error.value = ''
  generated.items = []

  try {
    let resp
    if (activeTab.value === 'text') {
      if (gen.type_ids.length === 0) { message.warning('请至少选择一个题型'); loading.value = false; return }
      const rules = []
      for (const tid of gen.type_ids) {
        const cfg = gen.configs[tid]
        if (!cfg || !Array.isArray(cfg.rules) || cfg.rules.length === 0) { message.warning('请为每个题型至少配置一种难度与数量'); loading.value = false; return }
        for (const r of cfg.rules) {
          if (!r || !r.difficulty_id || !r.count) continue
          rules.push({ type_id: tid, difficulty_id: r.difficulty_id, count: r.count })
        }
      }
      if (rules.length === 0) { message.warning('请完善题型配置'); loading.value = false; return }
      resp = await http.post('/ai/generate-questions', {
        subject_id: gen.subject_id, chapter_ids: gen.chapter_ids, chapter_weights: finalWeights, rules, create_user: gen.create_user,
        use_reference_library: useReferenceLibrary.value,
        reference_document_ids: useReferenceLibrary.value ? selectedReferenceDocumentIds.value : [],
      })
    } else if (activeTab.value === 'paper') {
      if (!sourcePaperId.value) { message.warning('请选择来源试卷'); loading.value = false; return }
      resp = await http.post('/ai/generate-from-paper', {
        paper_id: sourcePaperId.value, subject_id: gen.subject_id, chapter_ids: gen.chapter_ids, create_user: gen.create_user,
      })
    } else if (activeTab.value === 'file') {
      if (!uploadFile.value) { message.warning('请上传文件'); loading.value = false; return }
      const formData = new FormData()
      formData.append('file', uploadFile.value)
      formData.append('subject_id', gen.subject_id)
      formData.append('create_user', gen.create_user)
      resp = await http.post('/ai/generate-from-file', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    message.success('已提交生成（后台生成中）')
    taskStore.startTask({
      jobId: resp.data.job_id,
      type: 'ai_review',
      label: currentGenerationLabel(),
      sourcePath: route.path,
      context: {
          textbook_id: gen.textbook_id
      }
    })
  } catch (e) {
    error.value = e?.message || '生成失败'
  } finally {
    loading.value = false
  }
}

async function loadGeneratedQuestions(ids, jobId = null) {
  if (!ids || ids.length === 0) return
  generated.loading = true
  try {
    const resp = await http.get('/questions', { params: { ids: ids.join(','), page_size: 1000 } })
    const items = resp.data.items || []
    generated.items = items
    if (jobId) taskResultCache[jobId] = items
    resultPagination.page = 1
  } catch {} finally { generated.loading = false }
}

async function fetchJobDetails(jobId) {
  try {
    const resp = await http.get(`/ai/jobs/${jobId}`)
    const job = resp.data.job
    if (job && job.question_ids && job.question_ids.length > 0) await loadGeneratedQuestions(job.question_ids, jobId)
  } catch {}
}

function switchCompletedTask(task) {
  if (!task) return
  selectedCompletedTaskId.value = task.jobId
  modifiedRows.clear()

  if (taskResultCache[task.jobId]) {
    generated.items = taskResultCache[task.jobId]
    resultPagination.page = 1
    return
  }

  if (Array.isArray(task.questionIds) && task.questionIds.length) {
    loadGeneratedQuestions(task.questionIds, task.jobId)
  } else {
    fetchJobDetails(task.jobId)
  }
}

function formatTaskTime(timestamp) {
  if (!timestamp) return '时间未知'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const now = new Date()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

watch(
  () => completedGenerationTasks.value.map((task) => task.jobId).join(','),
  () => {
    if (!completedGenerationTasks.value.length) {
      selectedCompletedTaskId.value = null
      generated.items = []
      return
    }

    const latest = completedGenerationTasks.value[completedGenerationTasks.value.length - 1]
    if (!completedGenerationTasks.value.some((task) => task.jobId === selectedCompletedTaskId.value)) {
      selectedCompletedTaskId.value = latest.jobId
    }

    const selected = selectedCompletedTask.value
    if (selected && !taskResultCache[selected.jobId]) {
      switchCompletedTask(selected)
    }
  },
  { immediate: true },
)

watch(
  () => generated.items.length,
  (length) => {
    if (length > 0) {
      nextTick(() => {
        document.getElementById('generated-result-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    }
  },
)

watch(() => taskStore.task.lines.length, () => {
  if (taskStore.showPanel && streamBodyRef.value) {
    nextTick(() => { if (streamBodyRef.value) streamBodyRef.value.scrollTop = streamBodyRef.value.scrollHeight })
  }
})

watch(() => taskStore.task.output.length, () => {
  if (taskStore.showPanel && streamBodyRef.value) {
    nextTick(() => { if (streamBodyRef.value) streamBodyRef.value.scrollTop = streamBodyRef.value.scrollHeight })
  }
})

watch(() => taskStore.task.status, (newStatus) => {
  if (newStatus === 'done' && taskStore.task.type === 'ai_review') {
      const jobId = taskStore.task.jobId
      selectedCompletedTaskId.value = jobId
      fetchJobDetails(jobId)
      nextTick(() => {
          const el = document.getElementById('generated-result-card')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      setTimeout(() => {
        taskStore.showPanel = false
      }, 1000)
  } else if (newStatus === 'done' && taskStore.task.type === 'parsing') {
      const jobId = taskStore.task.jobId
      if (taskStore.task.items.length === 0) {
        message.warning('未能解析出题目')
        setTimeout(() => {
          taskStore.showPanel = false
        }, 1000)
      } else if (taskStore.showPanel && !aiReviewDialog.visible) {
        setTimeout(() => {
          taskStore.showPanel = false
        }, 1000)
        openReviewDialog(taskStore.task.items)
      }
  } else if (newStatus === 'error') {
      message.error(taskStore.task.error || '生成失败')
  }
})

// 计算当前可见的小章节（按大章节分组）
const visibleSubChapterGroups = computed(() => {
  const groups = []
  for (const chapter of chapterTree.value) {
    if (selectedMainChapters.value.includes(chapter.chapter_id)) {
      if (chapter.children && chapter.children.length > 0) {
        groups.push({
          parent: chapter,
          children: chapter.children
        })
      }
    }
  }
  return groups
})

// 切换大章节选择
function toggleMainChapter(chapter) {
  const idx = selectedMainChapters.value.indexOf(chapter.chapter_id)
  if (idx >= 0) {
    selectedMainChapters.value.splice(idx, 1)
    if (chapter.children && chapter.children.length > 0) {
      const childIds = chapter.children.map(c => c.chapter_id)
      gen.chapter_ids = gen.chapter_ids.filter(id => !childIds.includes(id))
    }
  } else {
    // 选择大章节，同时默认选中所有子章节
    selectedMainChapters.value.push(chapter.chapter_id)
    if (chapter.children && chapter.children.length > 0) {
      for (const child of chapter.children) {
        if (!gen.chapter_ids.includes(child.chapter_id)) {
          gen.chapter_ids.push(child.chapter_id)
        }
      }
    }
  }
  handleChapterChange(gen.chapter_ids)
}

// 切换小章节选择
function toggleSubChapter(chapterId) {
  const idx = gen.chapter_ids.indexOf(chapterId)
  if (idx >= 0) {
    gen.chapter_ids.splice(idx, 1)
  } else {
    gen.chapter_ids.push(chapterId)
  }
  handleChapterChange(gen.chapter_ids)
}

// 切换题型选择
function toggleTypeId(typeId) {
  const idx = gen.type_ids.indexOf(typeId)
  if (idx >= 0) {
    gen.type_ids.splice(idx, 1)
  } else {
    gen.type_ids.push(typeId)
  }
  handleTypeChange(gen.type_ids)
}

// 获取难度对应的颜色类名
function getDifficultyClass(difficultyId, difficultyName, isSelected) {
  const name = difficultyName?.toLowerCase() || ''
  if (name.includes('简单') || name.includes('easy')) {
    return isSelected ? 'difficulty-easy-selected' : 'difficulty-easy'
  } else if (name.includes('中等') || name.includes('medium') || name.includes('普通')) {
    return isSelected ? 'difficulty-medium-selected' : 'difficulty-medium'
  } else if (name.includes('困难') || name.includes('hard') || name.includes('难')) {
    return isSelected ? 'difficulty-hard-selected' : 'difficulty-hard'
  }
  return isSelected ? 'difficulty-default-selected' : ''
}

function handleTypeChange(val) {
  const selected = new Set(val || [])
  Object.keys(gen.configs).forEach(k => { if (!selected.has(Number(k))) delete gen.configs[k] })
  ;(val || []).forEach(tid => {
    if (!gen.configs[tid]) gen.configs[tid] = { rules: [{ difficulty_id: null, count: 5 }] }
    else if (!Array.isArray(gen.configs[tid].rules) || gen.configs[tid].rules.length === 0) gen.configs[tid].rules = [{ difficulty_id: null, count: 5 }]
  })
}

function getTypeName(tid) {
  const t = types.value.find(x => x.type_id === tid)
  return t ? t.type_name : `题型${tid}`
}

function addDifficultyRule(tid) {
  const cfg = gen.configs[tid]
  if (!cfg) return
  if (!Array.isArray(cfg.rules)) cfg.rules = []
  if (cfg.rules.length >= 3) {
    message.warning('每个题型最多添加 3 条难度规则')
    return
  }
  cfg.rules.push({ difficulty_id: null, count: 5 })
}

function removeDifficultyRule(tid, index) {
  const cfg = gen.configs[tid]
  if (!cfg || !Array.isArray(cfg.rules)) return
  cfg.rules.splice(index, 1)
  if (cfg.rules.length === 0) {
    delete gen.configs[tid]
    const pos = gen.type_ids.indexOf(tid)
    if (pos >= 0) gen.type_ids.splice(pos, 1)
  }
}

function getChapterName(cid) {
  const find = (list) => {
    for (const c of list) {
      if (c.chapter_id === cid) return c.chapter_name
      if (c.children) { const name = find(c.children); if (name) return name }
    }
    return null
  }
  return find(chapters.value) || `章节${cid}`
}

function distributeChapterWeights() {
  const roots = rootSelectedChapters.value
  const count = roots.length
  if (count === 0) return
  const base = Math.floor(100 / count)
  const remainder = 100 % count
  roots.forEach((cid, index) => gen.chapter_weights[cid] = base + (index < remainder ? 1 : 0))
}

function handleChapterChange(val) {
  const validRoots = new Set(rootSelectedChapters.value)
  Object.keys(gen.chapter_weights).forEach(k => { if (!validRoots.has(Number(k))) delete gen.chapter_weights[k] })
  validRoots.forEach(cid => { if (gen.chapter_weights[cid] === undefined) gen.chapter_weights[cid] = 10 })
  distributeChapterWeights()
}

onMounted(async () => {
  await loadDicts()
  await loadTextbooks()
  await loadReviewers()
  await loadReferenceDocuments()
  window.addEventListener('beforeunload', checkUnsaved)
  
  if (taskStore.task.status === 'done' && taskStore.task.type === 'ai_review' && taskStore.showPanel) {
    if (activeTab.value === 'file' && taskStore.task.context && taskStore.task.context.textbook_id) {
      gen.textbook_id = taskStore.task.context.textbook_id
      await loadChapters()
    }
    const jobId = taskStore.task.jobId
    fetchJobDetails(jobId)
    setTimeout(() => {
      taskStore.showPanel = false
    }, 800)
  }
  if (taskStore.task.status === 'done' && taskStore.task.type === 'parsing' && taskStore.showPanel && !aiReviewDialog.visible && taskStore.task.items.length > 0) {
    const jobId = taskStore.task.jobId
    taskStore.showPanel = false
    await openReviewDialog(taskStore.task.items)
  }
})

watch(
  () => taskStore.task.items.length,
  (length) => {
    if (
      length > 0 &&
      taskStore.showPanel &&
      taskStore.task.status === 'done' &&
      taskStore.task.type === 'parsing' &&
      !aiReviewDialog.visible
    ) {
      const jobId = taskStore.task.jobId
      taskStore.showPanel = false
      openReviewDialog(taskStore.task.items)
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('beforeunload', checkUnsaved)
})

// Computed options
const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))
const textbookOptions = computed(() => textbooks.value.map(t => ({ label: t.textbook_name + (t.author ? '-' + t.author : ''), value: t.textbook_id })))
const typeOptions = computed(() => types.value.map(t => ({ label: t.type_name, value: t.type_id })))
const orderedTypeIds = computed(() => {
  const selected = new Set(gen.type_ids || [])
  return types.value
    .map(t => t.type_id)
    .filter(id => selected.has(id))
})
const difficultyOptions = computed(() => difficulties.value.map(d => ({ label: d.difficulty_name, value: d.difficulty_id })))
const paperOptions = computed(() => papers.value.map(p => ({ label: p.paper_name, value: p.paper_id })))
const reviewerOptions = computed(() => reviewers.value.map(r => ({ label: r, value: r })))
const aiDialogTextbookOptions = computed(() => aiDialogTextbooks.value.map(t => ({ label: t.textbook_name + (t.author ? '-' + t.author : ''), value: t.textbook_id })))
const readyReferenceDocuments = computed(() => referenceDocuments.value.filter(item => item.status === 'ready'))
const referenceDocumentOptions = computed(() => readyReferenceDocuments.value.map(item => ({
  label: `${item.file_name}（引用 ${item.reference_count || 0} 次）`,
  value: item.document_id,
})))
const renderFullLabel = (option) => h('div', { style: { whiteSpace: 'normal', lineHeight: '1.4' } }, option.label)

function treeToOptions(tree) {
  return tree.map(node => ({
    label: node.chapter_name, value: node.chapter_id,
    children: node.children && node.children.length > 0 ? treeToOptions(node.children) : undefined
  }))
}
const chapterCascaderOptions = computed(() => treeToOptions(chapterTree.value))
const aiReviewChapterCascaderOptions = computed(() => treeToOptions(aiReviewChapterTree.value))

const resultTableColumns = computed(() => {
  const isEditable = activeTab.value === 'file'
  return [
    { title: 'ID', key: 'question_id', width: 80 },
    { title: '科目', key: 'subject_name', width: 120 },
    { 
      title: '章节', 
      key: 'chapter_id', 
      width: 200, 
      render: (row) => {
        if (isEditable) {
           return h(NCascader, {
             value: row.chapter_id,
             options: chapterCascaderOptions.value,
             placeholder: '请选择章节',
             checkStrategy: 'child',
             size: 'small',
             showPath: true,
             onUpdateValue: (v, opt) => {
               row.chapter_id = v
               row.chapter_name = opt ? opt.label : ''
               handleRowChange(row)
             }
           })
        }
        return h('span', {}, row.chapter_name || '未设置')
      }
    },
    { title: '题型', key: 'type_name', width: 100 },
    { 
      title: '难度', 
      key: 'difficulty_id', 
      width: 120, 
      render: (row) => {
        if (isEditable) {
           return h(NSelect, {
             value: row.difficulty_id,
             options: difficultyOptions.value,
             placeholder: '请选择难度',
             size: 'small',
             onUpdateValue: (v, opt) => {
               row.difficulty_id = v
               row.difficulty_name = opt ? opt.label : ''
               handleRowChange(row)
             }
           })
        }
        return h('span', {}, row.difficulty_name || '未设置')
      }
    },
    { title: '题目内容', key: 'question_content', ellipsis: { tooltip: true }, render: row => {
      const content = row.question_content || ''
      const preview = content.length > 50 ? content.substring(0, 50) + '...' : content
      return h('div', { 
        style: { cursor: 'pointer', maxHeight: '60px', overflow: 'hidden' }, 
        onClick: () => openDetail(row) 
      }, h(MathRenderer, { content: preview, inline: true }))
    }},
    { title: '状态', key: 'review_status', width: 100, render: row => {
      if (row.review_status === 0) return h(NTag, { type: 'warning' }, { default: () => '待校验' })
      if (row.review_status === 1) return h(NTag, { type: 'success' }, { default: () => '已通过' })
      return h(NTag, { type: 'error' }, { default: () => '已拒绝' })
    }}
  ]
})

const checkUnsaved = (e) => {
  const hasIncomplete = activeTab.value === 'file' && generated.items.some(item => !item.chapter_id || !item.difficulty_id)
  if (hasUnsavedChanges.value || (hasIncomplete && generated.items.length > 0)) {
    e.preventDefault()
    e.returnValue = ''
  }
}



onBeforeRouteLeave((to, from, next) => {
  const hasIncomplete = activeTab.value === 'file' && generated.items.some(item => !item.chapter_id || !item.difficulty_id)
  if (hasUnsavedChanges.value || (hasIncomplete && generated.items.length > 0)) {
    dialogApi.warning({
      title: '提示',
      content: '当前有未保存的修改或未设置章节/难度的题目，确定要离开吗？',
      positiveText: '离开',
      negativeText: '取消',
      onPositiveClick: () => { next() },
      onNegativeClick: () => { next(false) }
    })
  } else {
    next()
  }
})
</script>

<template>
  <div class="page">
    <n-card>
      <template #header>
        <div class="header">
          <div>{{ pageTitle }}</div>
          <n-button v-if="activeTab !== 'ai-import'" type="primary" :loading="loading" @click="generate">
            <template #icon><n-icon><PlayOutline /></n-icon></template>
            生成
          </n-button>
        </div>
      </template>
      <n-alert v-if="error" type="error" :title="error" style="margin-bottom: 12px" />
      <div class="filter-section">
        <div class="filter-section-header">
          <n-icon size="16" color="#64748b"><FunnelOutline /></n-icon>
          <span>条件筛选</span>
        </div>
          <div class="filter-row">
            <div class="filter-label">科目</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="s in subjects"
                :key="s.subject_id"
                :bordered="false"
                :class="['filter-tag', gen.subject_id === s.subject_id ? 'tag-selected' : '']"
                @click="async () => {
                  gen.subject_id = gen.subject_id === s.subject_id ? null : s.subject_id;
                  gen.textbook_id = null;
                  gen.chapter_ids = [];
                  selectedMainChapters = [];
                  filterTextbookId = null;
                  await loadTextbooks();
                  if (activeTab === 'paper') await loadPapers()
                }"
              >
                {{ s.subject_name }}
              </n-tag>
            </div>
          </div>

          <div class="filter-row" v-if="activeTab !== 'paper'">
            <div class="filter-label">教材</div>
            <div class="filter-content filter-tags">
              <template v-if="textbooks.length > 0">
                <n-tag
                  v-for="t in textbooks"
                  :key="t.textbook_id"
                  :bordered="false"
                  :class="['filter-tag', gen.textbook_id === t.textbook_id ? 'tag-selected' : '']"
                  @click="async () => {
                    gen.textbook_id = gen.textbook_id === t.textbook_id ? null : t.textbook_id;
                    gen.chapter_ids = [];
                    selectedMainChapters = [];
                    await loadChapters()
                  }"
                >
                  {{ t.textbook_name }}{{ t.author ? ' - ' + t.author : '' }}
                </n-tag>
              </template>
              <span v-else class="empty-hint">{{ gen.subject_id ? '暂无教材' : '请先选择科目' }}</span>
            </div>
          </div>

          <!-- 大章节选择 -->
          <div class="filter-row" v-if="activeTab === 'text'">
            <div class="filter-label">章节</div>
            <div class="filter-content filter-tags">
              <template v-if="chapterTree.length > 0">
                <n-tag
                  v-for="chapter in chapterTree"
                  :key="chapter.chapter_id"
                  :bordered="false"
                  :class="['filter-tag', 'chapter-main', selectedMainChapters.includes(chapter.chapter_id) ? 'chapter-main-selected' : '']"
                  @click="toggleMainChapter(chapter)"
                >
                  {{ chapter.chapter_name }}
                </n-tag>
              </template>
              <span v-else class="empty-hint">{{ gen.textbook_id ? '暂无章节' : '请先选择教材' }}</span>
            </div>
          </div>

          <!-- 小章节选择（按大章节分组显示） -->
          <div class="filter-row sub-chapters-row" v-if="visibleSubChapterGroups.length > 0 && activeTab === 'text'">
            <div class="filter-label">小节</div>
            <div class="filter-content">
              <div class="sub-chapters-container">
                <div v-for="group in visibleSubChapterGroups" :key="group.parent.chapter_id" class="sub-chapter-group">
                  <span class="sub-chapter-group-label">{{ group.parent.chapter_name }}：</span>
                  <div class="sub-chapter-tags">
                    <n-tag
                      v-for="sub in group.children"
                      :key="sub.chapter_id"
                      :bordered="false"
                      :class="['filter-tag', 'chapter-sub', gen.chapter_ids.includes(sub.chapter_id) ? 'chapter-sub-selected' : '']"
                      @click="toggleSubChapter(sub.chapter_id)"
                    >
                      {{ sub.chapter_name }}
                    </n-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="filter-row" v-if="activeTab === 'text'">
            <div class="filter-label">知识库</div>
            <div class="filter-content reference-setting">
              <n-switch v-model:value="useReferenceLibrary" />
              <span class="reference-status">使用我的参考资料作为生成依据</span>
              <n-select
                v-if="useReferenceLibrary"
                v-model:value="selectedReferenceDocumentIds"
                multiple
                clearable
                filterable
                :options="referenceDocumentOptions"
                placeholder="全部可用资料"
                style="min-width: 320px; max-width: 620px"
              />
              <span v-if="useReferenceLibrary && readyReferenceDocuments.length === 0" class="empty-hint">
                暂无可用资料，请先到知识库上传并完成处理
              </span>
            </div>
          </div>
      </div>


      <div style="margin-top: 16px">
        <div v-if="activeTab === 'text'">
          <div class="filter-section" style="margin-top: 0;">
            <div class="filter-row">
              <div class="filter-label">题型</div>
              <div class="filter-content filter-tags">
                <n-tag
                  v-for="t in types"
                  :key="t.type_id"
                  :bordered="false"
                  :class="['filter-tag', gen.type_ids.includes(t.type_id) ? 'tag-selected' : '']"
                  @click="toggleTypeId(t.type_id)"
                >
                  {{ t.type_name }}
                </n-tag>
              </div>
            </div>
          </div>
          <div class="config-layout" v-if="activeTab === 'text' && (gen.type_ids.length > 0 || gen.chapter_ids.length > 0)">
         <div class="config-column" style="flex: 2" v-if="gen.type_ids.length > 0">
                <div class="config-list">
                  <div class="config-header">题型规则配置</div>
                  <div v-for="tid in orderedTypeIds" :key="tid" class="config-item">
                    <div class="type-name">{{ getTypeName(tid) }}</div>
                    <div class="rules">
                      <div v-for="(r, idx) in gen.configs[tid]?.rules" :key="idx" class="rule-row">
                        <div class="difficulty-tags">
                          <n-tag
                            v-for="d in difficulties"
                            :key="d.difficulty_id"
                            :bordered="false"
                            :class="['filter-tag', 'difficulty-tag', getDifficultyClass(d.difficulty_id, d.difficulty_name, r.difficulty_id === d.difficulty_id)]"
                            @click="() => {
                              if (r.difficulty_id === d.difficulty_id) return;
                              if (gen.configs[tid].rules.some(rule => rule !== r && rule.difficulty_id === d.difficulty_id)) {
                                message.warning('该难度已存在，请勿重复添加');
                                return;
                              }
                              r.difficulty_id = d.difficulty_id;
                            }"
                          >
                            {{ d.difficulty_name }}
                          </n-tag>
                        </div>
                        <n-input-number v-model:value="r.count" :min="1" :max="50" style="width: 100px" placeholder="数量" />
                        <span class="count-unit">题</span>
                        <n-button size="small" type="error" @click="removeDifficultyRule(tid, idx)">删除</n-button>
                      </div>
                      <n-button size="small" @click="addDifficultyRule(tid)"><template #icon><n-icon><AddOutline /></n-icon></template>添加难度</n-button>
                    </div>
                  </div>
                </div>
             </div>
             
             <div class="config-column" style="flex: 1" v-if="gen.chapter_ids.length > 0">
                <div class="config-list" style="height: 100%">
                  <div class="config-header">
                    章节权重设置
                    <span :style="{ color: totalWeight === 100 ? '#18a058' : '#d03050', fontSize: '14px', fontWeight: 'normal', marginLeft: '10px' }">
                      (当前总和: {{ totalWeight }}%)
                    </span>
                    <n-button size="small" style="margin-left: 8px" @click="distributeChapterWeights">平均分配</n-button>
                  </div>
                  <div class="weight-grid">
                    <div v-for="cid in rootSelectedChapters" :key="cid" class="weight-item">
                      <span class="weight-label" :title="getChapterName(cid)">{{ getChapterName(cid) }}</span>
                      <n-input-number v-model:value="gen.chapter_weights[cid]" :min="0" :max="100" class="percent-input" />
                      <span class="weight-unit">%</span>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>

        <div v-if="activeTab === 'paper'">
          <div style="margin-bottom: 12px; display: flex; gap: 8px">
            <n-select v-model:value="filterTextbookId" :options="textbookOptions" clearable placeholder="筛选教材" class="textbook-select" :render-label="renderFullLabel" style="width: 280px" @update:value="loadPapers" />
            <n-select v-model:value="filterReviewer" :options="reviewerOptions" clearable placeholder="筛选审核人" style="width: 180px" @update:value="loadPapers" />
            <n-button @click="loadPapers"><template #icon><n-icon><RefreshOutline /></n-icon></template></n-button>
          </div>
          <n-select v-model:value="sourcePaperId" :options="paperOptions" filterable placeholder="请选择参考试卷" style="width: 100%" />
          <div class="tip-text">系统将分析选中试卷的题型、难度与风格，为您生成类似的变式题目。</div>
        </div>

        <div v-if="activeTab === 'file'">
          <n-upload v-model:file-list="fileList" action="" :max="1" :default-upload="false" @change="handleFileChange" accept=".pdf,.doc,.docx">
            <n-upload-dragger>
              <div style="margin-bottom: 12px"><n-icon size="48"><CloudUploadOutline /></n-icon></div>
              <n-text>拖拽文件到此处或点击上传</n-text>
              <n-p depth="3" style="margin: 8px 0 0 0">支持 PDF/Word 文件。系统将分析文档内容生成相关题目。</n-p>
            </n-upload-dragger>
          </n-upload>
        </div>
        
        <div v-if="activeTab === 'ai-import'">
          <n-upload v-model:file-list="aiImportFileList" action="" :max="1" :default-upload="false" @change="handleAiImportFileChange" accept=".pdf,.doc,.docx">
            <n-upload-dragger>
              <div style="margin-bottom: 12px"><n-icon size="48"><CloudUploadOutline /></n-icon></div>
              <n-text>拖拽文件到此处或点击上传</n-text>
              <n-p depth="3" style="margin: 8px 0 0 0">支持 PDF/Word 文件。由AI进行题目识别然后入库。</n-p>
            </n-upload-dragger>
          </n-upload>
        </div>
      </div>

      <div v-if="gen.chapter_ids.length > 0 && activeTab === 'text'" class="config-list" style="margin-top: 16px; display: none;">
        <div class="config-header">
          章节权重设置
          <span :style="{ color: totalWeight === 100 ? '#18a058' : '#d03050', fontSize: '14px', fontWeight: 'normal', marginLeft: '10px' }">
            (当前总和: {{ totalWeight }}%)
          </span>
          <n-button size="small" style="margin-left: 8px" @click="distributeChapterWeights">平均分配</n-button>
        </div>
        <div class="weight-grid">
          <div v-for="cid in rootSelectedChapters" :key="cid" class="weight-item">
            <span class="weight-label" :title="getChapterName(cid)">{{ getChapterName(cid) }}</span>
            <n-input-number v-model:value="gen.chapter_weights[cid]" :min="0" :max="100" class="percent-input" />
            <span class="weight-unit">%</span>
          </div>
        </div>
      </div>
    </n-card>

    <n-modal v-model:show="detailDialog.visible" preset="card" title="题目详情" style="width: 600px">
      <div v-if="detailDialog.item">
        <n-descriptions :column="1" bordered>
          <n-descriptions-item label="题干">
            <MathRenderer :content="detailDialog.item.question_content" />
          </n-descriptions-item>
          <n-descriptions-item label="答案">
            <MathRenderer :content="detailDialog.item.question_answer" />
          </n-descriptions-item>
          <n-descriptions-item label="解析">
            <MathRenderer :content="detailDialog.item.question_analysis" />
          </n-descriptions-item>
          <n-descriptions-item label="生成依据">
            <div v-if="detailDialog.evidenceLoading" class="evidence-loading">正在加载依据...</div>
            <div v-else-if="detailDialog.evidence.length === 0" class="empty-hint">本题未使用知识库资料</div>
            <div v-else class="evidence-list">
              <div v-for="item in detailDialog.evidence" :key="item.evidence_id" class="evidence-item">
                <div class="evidence-title">
                  <span>{{ item.file_name }}</span>
                  <n-tag size="small" type="info">相似度 {{ Number(item.similarity_score || 0).toFixed(3) }}</n-tag>
                </div>
                <div class="evidence-excerpt">{{ item.excerpt }}</div>
              </div>
            </div>
          </n-descriptions-item>
        </n-descriptions>
      </div>
      <template #footer><n-button @click="detailDialog.visible = false">关闭</n-button></template>
    </n-modal>

    <n-modal v-model:show="aiConfigDialog.visible" preset="card" title="AI导入设置" style="width: 500px">
      <n-form label-placement="left" label-width="80px">
        <n-form-item label="已选文件">
          <div>{{ aiConfigDialog.file?.name }}</div>
        </n-form-item>
        <n-form-item label="科目">
          <n-select
            v-model:value="aiConfigDialog.form.subject_id"
            :options="subjectOptions"
            placeholder="请选择科目"
            @update:value="async () => {
              aiConfigDialog.form.textbook_id = null
              await loadDialogTextbooksForAi()
            }"
          />
        </n-form-item>
        <n-form-item label="教材">
          <n-select
            v-model:value="aiConfigDialog.form.textbook_id"
            :options="aiDialogTextbookOptions"
            placeholder="请选择教材"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="aiConfigDialog.visible = false">取消</n-button>
          <n-button type="primary" @click="startParsing">开始解析</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="aiReviewDialog.visible" preset="card" title="AI解析结果确认" style="width: 90%" :close-on-esc="false" :mask-closable="false">
      <div style="margin-bottom: 10px; padding: 10px; background: var(--n-color-modal); border-radius: 4px; display: flex; align-items: center; gap: 10px;">
        <span style="font-weight: bold; font-size: 14px;">批量设置：</span>
        <n-select v-model:value="batchSet.type_id" :options="typeOptions" placeholder="题型" style="width: 120px" clearable />
        <n-select v-model:value="batchSet.difficulty_id" :options="difficultyOptions" placeholder="难度" style="width: 120px" clearable />
        <n-cascader
          v-model:value="batchSet.chapter_id"
          :options="aiReviewChapterCascaderOptions"
          check-strategy="child"
          placeholder="章节"
          style="width: 200px"
          clearable
        />
        <n-button type="primary" text @click="applyBatchSet">应用到所有</n-button>
      </div>

      <n-data-table
        :columns="[
          { type: 'index', title: '#', width: 50 },
          { title: '题干', key: 'question_content', ellipsis: { tooltip: true } },
          { title: '答案', key: 'question_answer', width: 150 },
          { title: '解析', key: 'question_analysis', width: 200 },
          { title: '分值', key: 'question_score', width: 80 },
          { title: '题型', key: 'type_id', width: 130, render: (row) => h(NSelect, { value: row.type_id, options: typeOptions, size: 'small', status: (row._error && !row.type_id) ? 'error' : undefined, onUpdateValue: (v) => row.type_id = v }) },
          { title: '难度', key: 'difficulty_id', width: 110, render: (row) => h(NSelect, { value: row.difficulty_id, options: difficultyOptions, size: 'small', status: (row._error && !row.difficulty_id) ? 'error' : undefined, onUpdateValue: (v) => row.difficulty_id = v }) },
          { title: '章节', key: 'chapter_id', width: 200, render: (row) => h(NCascader, { value: row.chapter_id, options: aiReviewChapterCascaderOptions, checkStrategy: 'child', size: 'small', status: (row._error && !row.chapter_id) ? 'error' : undefined, onUpdateValue: (v) => row.chapter_id = v }) }
        ]"
        :data="aiReviewDialog.items"
        :max-height="500"
        striped
      />

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>共 {{ aiReviewDialog.items.length }} 题</span>
          <div style="display: flex; gap: 8px;">
            <n-button @click="aiReviewDialog.visible = false">取消</n-button>
            <n-button type="primary" :loading="aiReviewDialog.loading" @click="saveParsedQuestions">确认入库</n-button>
          </div>
        </div>
      </template>
    </n-modal>

    <TaskStreamDeck :allowed-types="['ai_review', 'parsing']" />

    <div v-if="completedGenerationTasks.length > 1" class="generated-task-switcher">
      <button
        v-for="task in completedGenerationTasks"
        :key="task.jobId"
        type="button"
        class="generated-task-switch"
        :class="{ 'is-selected': selectedCompletedTask?.jobId === task.jobId }"
        @click="switchCompletedTask(task)"
      >
        {{ task.label || 'AI题目生成' }} · {{ formatTaskTime(task.createdAt) }}
      </button>
    </div>

    <n-card v-if="generated.items.length > 0" id="generated-result-card">
      <template #header>
        <div class="header">
          <span>本次生成结果 ({{ generated.items.length }})</span>
          <div style="display: flex; gap: 8px">
            <n-button v-if="hasUnsavedChanges" type="success" :loading="saving" @click="saveChanges">保存修改</n-button>
            <n-button type="error" secondary :loading="abandoning" @click="abandonGeneration">
              <template #icon><n-icon><TrashOutline /></n-icon></template>
              放弃生成
            </n-button>
            <n-button text type="primary" @click="router.push('/question-verify')">前往校验页面 &gt;</n-button>
          </div>
        </div>
      </template>
      <n-data-table :columns="resultTableColumns" :data="generated.items" :loading="generated.loading" :pagination="resultPagination" />
    </n-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; align-items: center; justify-content: space-between; }
.reference-setting { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.reference-status { color: var(--n-text-color-2); font-size: 13px; }
.evidence-list { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow: auto; }
.evidence-item { padding: 10px; border: 1px solid var(--n-border-color); border-radius: 8px; }
.evidence-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 6px; }
.evidence-excerpt { color: var(--n-text-color-2); font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.evidence-loading { color: var(--n-text-color-3); }

:deep(.n-button) {
  border-radius: 14px;
}

:deep(.n-data-table) {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

:deep(.n-data-table .n-data-table-th) {
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.9));
  font-weight: 600;
  color: #334155;
}

:deep(.n-data-table .n-data-table-td),
:deep(.n-data-table .n-data-table-th) {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

:deep(.n-data-table .n-data-table-tr:nth-child(even) .n-data-table-td) {
  background: rgba(248, 250, 252, 0.7);
}

:deep(.n-data-table .n-data-table-tr:hover .n-data-table-td) {
  background: rgba(226, 232, 240, 0.6);
}

/* 标签式筛选区域样式 */
.filter-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--n-color-embedded);
  border-radius: 12px;
}

.filter-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(100, 116, 139, 0.15);
  line-height: 1;
}

.filter-section-toggle {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 6px 8px;
}

.filter-section-toggle:hover {
  background: rgba(100,116,139,0.06);
  border-radius: 8px;
}

.filter-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.filter-label {
  flex-shrink: 0;
  width: 60px;
  font-size: 13px;
  font-weight: 600;
  color: var(--n-text-color-2);
  line-height: 28px;
  text-align: right;
}

.filter-content {
  flex: 1;
  display: flex;
  align-items: center;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filter-tag {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 10px !important;
  padding: 4px 14px !important;
  font-size: 13px !important;
  background: rgba(100, 116, 139, 0.08) !important;
  color: #475569 !important;
  border: 1px solid rgba(100, 116, 139, 0.2) !important;
}

.filter-tag:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* 统一选中样式 - 深蓝色渐变 */
.tag-selected {
  background: linear-gradient(135deg, #1a5fb4 0%, #2563eb 100%) !important;
  color: white !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(26, 95, 180, 0.4) !important;
}

.empty-hint {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
  line-height: 28px;
}

.textbook-select .n-base-selection-label__rendered {
  white-space: normal;
  line-height: 1.2;
}

/* 小节分组容器 */
.sub-chapters-row .filter-content {
  align-items: flex-start;
}

.sub-chapters-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.sub-chapter-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sub-chapter-group-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #1a5fb4;
  line-height: 26px;
  min-width: 100px;
}

.sub-chapter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* 大章节 - 深蓝色 */
.chapter-main {
  font-weight: 600 !important;
  background: rgba(32, 128, 240, 0.1) !important;
  color: #1a5fb4 !important;
  border: 1px solid rgba(32, 128, 240, 0.3) !important;
}

.chapter-main-selected {
  background: linear-gradient(135deg, #1a5fb4 0%, #2563eb 100%) !important;
  color: white !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(26, 95, 180, 0.4) !important;
}

/* 子章节 - 浅蓝色 */
.chapter-sub {
  font-size: 12px !important;
  padding: 3px 10px !important;
  background: rgba(96, 165, 250, 0.08) !important;
  color: #3b82f6 !important;
  border: 1px solid rgba(96, 165, 250, 0.25) !important;
}

.chapter-sub-selected {
  background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%) !important;
  color: white !important;
  border: none !important;
  box-shadow: 0 2px 6px rgba(96, 165, 250, 0.35) !important;
}

/* 难度颜色 */
.difficulty-tags {
  display: flex;
  gap: 6px;
}

.difficulty-tag {
  font-weight: 500 !important;
  padding: 2px 10px !important;
  font-size: 12px !important;
}

.difficulty-easy {
  color: #18a058 !important;
  border-color: #18a058 !important;
  background: rgba(24, 160, 88, 0.08) !important;
}

.difficulty-easy-selected {
  background: linear-gradient(135deg, #18a058 0%, #36ad6a 100%) !important;
  color: white !important;
  border: none !important;
}

.difficulty-medium {
  color: #f0a020 !important;
  border-color: #f0a020 !important;
  background: rgba(240, 160, 32, 0.08) !important;
}

.difficulty-medium-selected {
  background: linear-gradient(135deg, #f0a020 0%, #fcb040 100%) !important;
  color: white !important;
  border: none !important;
}

.difficulty-hard {
  color: #d03050 !important;
  border-color: #d03050 !important;
  background: rgba(208, 48, 80, 0.08) !important;
}

.difficulty-hard-selected {
  background: linear-gradient(135deg, #d03050 0%, #e88080 100%) !important;
  color: white !important;
  border: none !important;
}

.difficulty-default-selected {
  background: linear-gradient(135deg, #2080f0 0%, #409eff 100%) !important;
  color: white !important;
  border: none !important;
}

.count-unit {
  color: var(--n-text-color-3);
  font-size: 13px;
}

.config-layout {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  align-items: flex-start;
}

.config-column {
  min-width: 0;
}

.config-list { margin-top: 0; display: flex; flex-direction: column; gap: 10px; background-color: var(--n-color-embedded); padding: 16px; border-radius: 12px; }
.config-header { font-weight: bold; color: var(--n-primary-color); margin-bottom: 8px; }
.config-item { display: flex; gap: 12px; }
.type-name { width: 100px; text-align: right; font-weight: 700; padding-top: 6px; color: var(--n-text-color-1); }
.rules { display: flex; flex-direction: column; gap: 8px; }
.rule-row { display: flex; align-items: center; gap: 10px; }
.weight-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.weight-item { display: flex; align-items: center; gap: 8px; }
.weight-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.percent-input { width: 112px; flex: 0 0 112px; }
.weight-unit { color: var(--n-text-color-3); }
.tip-text { margin-top: 12px; color: var(--n-text-color-3); font-size: 13px; }
.generated-task-switcher {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.generated-task-switch {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-solid);
  color: var(--app-text-soft);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 6px 10px;
  transition:
    transform 120ms var(--ease-out),
    background-color 140ms ease,
    color 140ms ease;
}

.generated-task-switch:active {
  transform: scale(0.97);
}

.generated-task-switch.is-selected {
  border-color: color-mix(in srgb, var(--app-primary) 34%, transparent);
  background: var(--app-primary);
  color: #fff;
}

@media (hover: hover) and (pointer: fine) {
  .generated-task-switch:hover {
    background: var(--app-primary-soft);
  }

  .generated-task-switch.is-selected:hover {
    background: var(--app-primary-hover);
  }
}

.streamPanel {
  position: fixed;
  right: 18px;
  top: 86px;
  width: 520px;
  height: 70vh;
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  z-index: 2000;
  overflow: hidden;
  background-color: transparent;
}

.streamPanel::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  backdrop-filter: blur(26px) saturate(130%);
  -webkit-backdrop-filter: blur(26px) saturate(130%);
  background: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}

.streamHeader,
.streamProgress,
.streamBody {
  position: relative;
  z-index: 1;
}
.streamHeader { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--n-border-color); }
.streamTitle { display: flex; flex-direction: column; gap: 2px; }
.streamMeta { color: var(--n-text-color-3); font-size: 12px; }
.streamActions { display: flex; gap: 8px; }
.streamProgress { padding: 10px 12px; border-bottom: 1px solid var(--n-border-color); display: flex; flex-direction: column; gap: 6px; }
.progress-info { display: flex; justify-content: space-between; font-size: 13px; }
.stage-text { font-weight: 500; color: var(--n-primary-color); }
.count-text { color: var(--n-text-color-3); }
.progress-percent { margin-left: 6px; color: var(--n-primary-color); font-weight: 600; }
.streamBody { padding: 10px 12px; overflow: auto; flex: 1; }
.streamLines { font-family: monospace; font-size: 12px; white-space: pre-wrap; margin-bottom: 12px; }
.streamHint { color: var(--n-text-color-3); font-size: 12px; }
.streamOutputTitle { font-weight: 700; margin-bottom: 6px; }
.streamOutputPre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 12px; }
</style>
