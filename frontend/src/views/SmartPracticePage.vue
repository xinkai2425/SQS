<script setup>
import { computed, onMounted, reactive, ref, watch, nextTick, h } from 'vue'
import { useMessage, useDialog, NButton, NTag, NProgress } from 'naive-ui'
import { SearchOutline, AddOutline, RefreshOutline, TrashOutline, CheckmarkOutline, ExpandOutline, PlayOutline, CloseOutline, FunnelOutline, CaretDownOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import { getUser } from '../auth'
import MathRenderer from '../components/MathRenderer.vue'
import TaskStreamDeck from '../components/TaskStreamDeck.vue'
import { useTaskStore } from '../stores/taskStore'
import { useRoute, useRouter } from 'vue-router'

const message = useMessage()
const dialogApi = useDialog()
const loading = ref(false)
const error = ref('')
const taskStore = useTaskStore()
const route = useRoute()
const router = useRouter()

const subjects = ref([])
const textbooks = ref([])
const chapterTree = ref([])
const types = ref([])
const difficulties = ref([])
const selectedMainChapters = ref([])

const filters = reactive({
  q: '',
  question_id: '',
  subject_id: null,
  textbook_id: null,
  publisher: null,
  chapter_ids: [],
  type_ids: [],
  difficulty_ids: [],
  review_status: 1,
  page: 1,
  page_size: 20,
})

const available = reactive({ items: [], total: 0 })
const checkedRowKeys = ref([])
const selectedQuestionIds = ref([])
const filterCollapsed = ref(true)

const picked = ref([])
const dragIndex = ref(-1)
const showPaperDrawer = ref(false)
const isDrawerFullscreen = ref(false)

const detailDialog = reactive({ visible: false, item: null })

function openDetail(row) {
  detailDialog.item = row
  detailDialog.visible = true
}

const publisherOptions = computed(() => {
  const set = new Set()
  for (const t of textbooks.value) {
    if (t.publisher) set.add(t.publisher)
  }
  return Array.from(set).map(p => ({ label: p, value: p }))
})

const pickedTotalScore = computed(() => picked.value.reduce((sum, it) => sum + Number(it.question_score || 0), 0))

function typeName(type_id) {
  const t = types.value.find(x => x.type_id === type_id)
  return t ? t.type_name : getTypeName(type_id)
}

function getTypeRank(type_id) {
  const name = (types.value.find(t => t.type_id === type_id)?.type_name || '').toLowerCase()
  if (name.includes('单选')) return 1
  if (name.includes('多选')) return 2
  if (name.includes('判断')) return 3
  if (name.includes('填空')) return 4
  if (name.includes('简答')) return 5
  if (name.includes('计算')) return 6
  if (name.includes('作文') || name.includes('写作')) return 7
  return 999
}

function getTypeName(type_id) {
  const t = types.value.find(x => x.type_id === type_id)
  if (t) return t.type_name
  const SINGLE_CHOICE = 1
  const JUDGE = 2
  const FILL = 3
  const MULTI_CHOICE = 7
  if (type_id === SINGLE_CHOICE) return '单选题'
  if (type_id === MULTI_CHOICE) return '多选题'
  if (type_id === JUDGE) return '判断题'
  if (type_id === FILL) return '填空题'
  return '简答题'
}

function updateDefaultSubject() {
  if (picked.value.length === 0) {
    filters.subject_id = filters.subject_id || null
    return
  }
  const ids = picked.value.map(x => Number(x.subject_id)).filter(Boolean)
  if (ids.length > 0) {
    const minId = Math.min(...ids)
    filters.subject_id = minId
  }
}

function difficultyName(difficulty_id) {
  const d = difficulties.value.find(x => x.difficulty_id === difficulty_id)
  return d ? d.difficulty_name : String(difficulty_id ?? '')
}

function toggleFilter() {
  filterCollapsed.value = !filterCollapsed.value
}

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
  if (!filters.subject_id) {
    textbooks.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get('/textbooks', {
    params: { subject_id: filters.subject_id },
  })
  textbooks.value = resp.data.items || []
  chapterTree.value = []
}

async function loadChapters() {
  if (!filters.textbook_id) { 
    chapterTree.value = []
    return 
  }
  const resp = await http.get(`/textbooks/${filters.textbook_id}/chapters`)
  chapterTree.value = resp.data.tree || []
}

async function search() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: filters.page,
      page_size: filters.page_size,
      q: filters.q || undefined,
      ids: filters.question_id || undefined,
      subject_id: filters.subject_id || undefined,
      textbook_id: filters.textbook_id || undefined,
      publisher: filters.publisher || undefined,
      chapter_id: filters.chapter_ids.length > 0 ? filters.chapter_ids.join(',') : undefined,
      type_id: filters.type_ids.length > 0 ? filters.type_ids.join(',') : undefined,
      difficulty_id: filters.difficulty_ids.length > 0 ? filters.difficulty_ids.join(',') : undefined,
      review_status: filters.review_status,
    }
    const resp = await http.get('/questions', { params })
    available.items = resp.data.items || []
    available.total = resp.data.total || 0
    const pageIds = new Set(available.items.map(x => Number(x.question_id)))
    checkedRowKeys.value = selectedQuestionIds.value.filter(id => pageIds.has(Number(id)))
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function renumber() {
  const ranks = [1, 2, 3, 4, 5, 6, 7, 999]
  const grouped = []
  for (const r of ranks) {
    const group = picked.value.filter(it => getTypeRank(it.type_id) === r)
    grouped.push(...group)
  }
  grouped.forEach((it, idx) => { it.question_sort = idx + 1 })
  picked.value = grouped
  updateDefaultSubject()
}

function flattenChapters(tree, level = 1) {
  const result = []
  for (const node of tree) {
    result.push({ ...node, level })
    if (node.children && node.children.length > 0) {
      result.push(...flattenChapters(node.children, level + 1))
    }
  }
  return result
}

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

function toggleMainChapter(chapter) {
  const idx = selectedMainChapters.value.indexOf(chapter.chapter_id)
  if (idx >= 0) {
    selectedMainChapters.value.splice(idx, 1)
    if (chapter.children && chapter.children.length > 0) {
      const childIds = chapter.children.map(c => c.chapter_id)
      filters.chapter_ids = filters.chapter_ids.filter(id => !childIds.includes(id))
    }
  } else {
    selectedMainChapters.value.push(chapter.chapter_id)
    if (chapter.children && chapter.children.length > 0) {
      for (const child of chapter.children) {
        if (!filters.chapter_ids.includes(child.chapter_id)) {
          filters.chapter_ids.push(child.chapter_id)
        }
      }
    }
  }
  search()
}

function toggleSubChapter(chapter_id) {
  const idx = filters.chapter_ids.indexOf(chapter_id)
  if (idx >= 0) {
    filters.chapter_ids.splice(idx, 1)
  } else {
    filters.chapter_ids.push(chapter_id)
  }
  search()
}

function toggleType(type_id) {
  const idx = filters.type_ids.indexOf(type_id)
  if (idx >= 0) {
    filters.type_ids.splice(idx, 1)
  } else {
    filters.type_ids.push(type_id)
  }
  search()
}

function toggleDifficulty(difficulty_id) {
  const idx = filters.difficulty_ids.indexOf(difficulty_id)
  if (idx >= 0) {
    filters.difficulty_ids.splice(idx, 1)
  } else {
    filters.difficulty_ids.push(difficulty_id)
  }
  search()
}

function getDifficultyClass(difficulty_id, difficulty_name) {
  const selected = filters.difficulty_ids.includes(difficulty_id)
  const name = difficulty_name?.toLowerCase() || ''
  if (name.includes('简单') || name.includes('easy')) {
    return selected ? 'difficulty-easy-selected' : 'difficulty-easy'
  } else if (name.includes('中等') || name.includes('medium') || name.includes('普通')) {
    return selected ? 'difficulty-medium-selected' : 'difficulty-medium'
  } else if (name.includes('困难') || name.includes('hard') || name.includes('难')) {
    return selected ? 'difficulty-hard-selected' : 'difficulty-hard'
  }
  return selected ? 'difficulty-default-selected' : ''
}

function addSelected() {
  if (checkedRowKeys.value.length === 0) { 
    message.warning('未选中任何题目')
    return 
  }
  const existing = new Set(picked.value.map(x => Number(x.question_id)))
  const toAdd = available.items.filter(x => checkedRowKeys.value.some(id => Number(id) === Number(x.question_id)))
  
  for (const q of toAdd) {
    if (existing.has(Number(q.question_id))) continue
    picked.value.push({
      question_id: q.question_id,
      question_sort: picked.value.length + 1,
      question_score: q.question_score ?? 2,
      question_content: q.question_content,
      question_answer: q.question_answer,
      question_analysis: q.question_analysis,
      type_id: q.type_id,
      difficulty_id: q.difficulty_id,
      chapter_id: q.chapter_id,
      subject_id: q.subject_id,
    })
  }
  renumber()
  showPaperDrawer.value = true
  updateDefaultSubject()
}

function removePicked(index) {
  picked.value.splice(index, 1)
  renumber()
  updateDefaultSubject()
}

function clearPicked() {
  picked.value = []
  updateDefaultSubject()
}

function onDragStart(index) { 
  dragIndex.value = index 
}

function onDrop(index) {
  const from = dragIndex.value
  if (from < 0 || from === index) return
  const arr = picked.value.slice()
  const [moved] = arr.splice(from, 1)
  if (arr[index] && moved.type_id !== arr[index].type_id) {
    message.warning('仅允许在同题型内调整顺序')
    dragIndex.value = -1
    return
  }
  arr.splice(index, 0, moved)
  picked.value = arr
  dragIndex.value = -1
  renumber()
  updateDefaultSubject()
}

watch(checkedRowKeys, (val) => {
  const pageIds = new Set(available.items.map(x => Number(x.question_id)))
  const set = new Set(selectedQuestionIds.value.map(id => Number(id)))
  for (const id of pageIds) {
    if (!val.some(v => Number(v) === id)) set.delete(id)
  }
  for (const id of val) set.add(Number(id))
  selectedQuestionIds.value = Array.from(set)
})

function validatePicked() {
  if (!filters.subject_id) { 
    message.error('请先选择科目')
    return false 
  }
  if (picked.value.length === 0) { 
    message.error('请先选择题目开始练习')
    return false 
  }
  return true
}

function startPractice() {
  if (!validatePicked()) return
  
  const sortedQuestions = picked.value.slice().sort((a, b) => {
    const ra = getTypeRank(a.type_id)
    const rb = getTypeRank(b.type_id)
    if (ra !== rb) return ra - rb
    return (a.question_sort || 0) - (b.question_sort || 0)
  })
  
  const practiceData = {
    paper: {
      paper_name: '试题练习',
      subject_id: filters.subject_id,
    },
    questions: sortedQuestions
  }
  
  sessionStorage.setItem('practice_data', JSON.stringify(practiceData))
  
  router.push({ name: 'answer', query: { mode: 'smart' } })
}

const aiDialog = reactive({
  visible: false,
  subject_id: null,
  textbook_id: null,
  description: '',
  total_questions: 0,
  type_counts: {},
  difficulty_ratios: { easy: 30, medium: 50, hard: 20 },
  chapter_ratios: [],
  extra_desc: ''
})
const aiDialogTextbooks = ref([])
const aiDialogChapters = ref([])

function openAiDialog() {
  aiDialog.visible = true
  aiDialog.subject_id = filters.subject_id || null
  aiDialog.textbook_id = filters.textbook_id || null
  aiDialog.description = ''
  aiDialog.total_questions = 0
  aiDialog.type_counts = {}
  for (const t of types.value) {
    aiDialog.type_counts[t.type_id] = 0
  }
  aiDialog.difficulty_ratios = { easy: 30, medium: 50, hard: 20 }
  aiDialog.chapter_ratios = []
  aiDialog.extra_desc = ''
  
  loadAiDialogTextbooks()
  if (aiDialog.textbook_id) loadAiDialogChapters()
}

async function loadAiDialogTextbooks() {
  const resp = await http.get('/textbooks', {
    params: aiDialog.subject_id ? { subject_id: aiDialog.subject_id } : {},
  })
  aiDialogTextbooks.value = resp.data.items || []
}

async function loadAiDialogChapters() {
  if (!aiDialog.textbook_id) {
    aiDialogChapters.value = []
    return
  }
  const resp = await http.get(`/textbooks/${aiDialog.textbook_id}/chapters`)
  aiDialogChapters.value = flattenChapters(resp.data.tree || [])
}

const aiTotalQuestions = computed(() => {
  let sum = 0
  for (const tid in aiDialog.type_counts) {
    sum += Number(aiDialog.type_counts[tid] || 0)
  }
  return sum
})

async function startAiGeneration() {
  if (!aiDialog.subject_id || !aiDialog.textbook_id) {
    message.error('请选择科目和教材')
    return
  }
  
  if (aiTotalQuestions.value <= 0) {
    message.error('请设置题目数量')
    return
  }
  
  const diffSum = Number(aiDialog.difficulty_ratios.easy) + Number(aiDialog.difficulty_ratios.medium) + Number(aiDialog.difficulty_ratios.hard)
  if (diffSum !== 100) {
    message.error(`难度占比总和必须为100% (当前${diffSum}%)`)
    return
  }
  
  let chapterDesc = ''
  if (aiDialog.chapter_ratios.length > 0) {
    const chapSum = aiDialog.chapter_ratios.reduce((s, c) => s + Number(c.ratio || 0), 0)
    if (chapSum !== 100) {
      message.error(`章节占比总和必须为100% (当前${chapSum}%)`)
      return
    }
    const chapParts = []
    for (const c of aiDialog.chapter_ratios) {
      const chapName = aiDialogChapters.value.find(x => x.chapter_id === c.chapter_id)?.chapter_name || `Chapter#${c.chapter_id}`
      chapParts.push(`${chapName}: ${c.ratio}%`)
    }
    chapterDesc = `4. 章节覆盖：\n   - ${chapParts.join('\n   - ')}`
  } else {
    chapterDesc = `4. 章节覆盖：全书综合`
  }
  
  const typeParts = []
  for (const tid in aiDialog.type_counts) {
    const count = aiDialog.type_counts[tid]
    if (count > 0) {
      const tName = types.value.find(x => x.type_id === Number(tid))?.type_name || `Type#${tid}`
      typeParts.push(`${tName}: ${count}题`)
    }
  }
  
  const desc = `请生成一份试题练习，要求如下：
1. 题目总数：${aiTotalQuestions.value}题。
2. 题型分布：${typeParts.join(', ')}。
3. 难度分布：简单 ${aiDialog.difficulty_ratios.easy}%, 中等 ${aiDialog.difficulty_ratios.medium}%, 困难 ${aiDialog.difficulty_ratios.hard}%.
${chapterDesc}
5. 其他要求：${aiDialog.extra_desc || '无'}`

  aiDialog.description = desc
  
  aiDialog.visible = false
  loading.value = true
  try {
    const user = getUser()
    const resp = await http.post('/ai/generate-smart-paper', {
      subject_id: aiDialog.subject_id,
      textbook_id: aiDialog.textbook_id,
      description: aiDialog.description,
      create_user: user ? user.name : 'user'
    })
    
    taskStore.startTask({
      jobId: resp.data.job_id,
      type: 'paper_gen',
      label: '智能组卷',
      sourcePath: route.path,
      context: {
        ai_dialog: { ...aiDialog }
      }
    })
    loading.value = false
  } catch (e) {
    message.error(e?.message || '请求失败')
    loading.value = false
  }
}

const streamBodyRef = ref(null)

watch(() => taskStore.task.lines.length, () => {
  if (taskStore.showPanel && streamBodyRef.value) {
    nextTick(() => { 
      if (streamBodyRef.value) streamBodyRef.value.scrollTop = streamBodyRef.value.scrollHeight 
    })
  }
})

watch(() => taskStore.task.output.length, () => {
  if (taskStore.showPanel && streamBodyRef.value) {
    nextTick(() => { 
      if (streamBodyRef.value) streamBodyRef.value.scrollTop = streamBodyRef.value.scrollHeight 
    })
  }
})

watch(() => taskStore.task.status, (newStatus) => {
  if (newStatus === 'done' && taskStore.task.type === 'paper_gen') {
    const jobId = taskStore.task.jobId
    applyAiResult(taskStore.task.result)
    taskStore.showPanel = false
  } else if (newStatus === 'error') {
    message.error(taskStore.task.error || '生成失败')
  }
})

function applyAiResult(result) {
  const ctx = taskStore.task.context || {}
  const aiCtx = ctx.ai_dialog || aiDialog

  if (aiCtx.subject_id) {
    filters.subject_id = aiCtx.subject_id
    loadTextbooks()
    if (aiCtx.textbook_id) { 
      filters.textbook_id = aiCtx.textbook_id
      loadChapters() 
    }
  }
  
  picked.value = []
  const questions = result.questions || []
  if (questions.length === 0) { 
    message.warning('未找到符合条件的题目')
    return 
  }
  for (const q of questions) {
    picked.value.push({
      question_id: q.question_id, 
      question_sort: picked.value.length + 1, 
      question_score: q.question_score ?? 2,
      question_content: q.question_content, 
      question_answer: q.question_answer, 
      question_analysis: q.question_analysis,
      type_id: q.type_id, 
      difficulty_id: q.difficulty_id, 
      chapter_id: q.chapter_id
    })
  }
  renumber()
  showPaperDrawer.value = true
  message.success(`AI组卷完成，共生成 ${questions.length} 题，点击「开始答题」进入练习`)
}

onMounted(async () => {
  await loadDicts()
  await loadTextbooks()
  await search()
  
  if (taskStore.task.status === 'done' && taskStore.task.type === 'paper_gen' && taskStore.showPanel) {
    const jobId = taskStore.task.jobId
    taskStore.showPanel = false
    applyAiResult(taskStore.task.result)
  }
})

watch(
  () => taskStore.task.result,
  (result) => {
    if (
      taskStore.showPanel &&
      taskStore.task.status === 'done' &&
      taskStore.task.type === 'paper_gen' &&
      result?.questions
    ) {
      const jobId = taskStore.task.jobId
      applyAiResult(result)
      taskStore.showPanel = false
    }
  },
)

const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))
const textbookOptions = computed(() => textbooks.value.map(t => ({ label: t.textbook_name + (t.author ? ' - ' + t.author : ''), value: t.textbook_id })))
const typeOptions = computed(() => types.value.map(t => ({ label: t.type_name, value: t.type_id })))
const difficultyOptions = computed(() => difficulties.value.map(d => ({ label: d.difficulty_name, value: d.difficulty_id })))
const aiDialogTextbookOptions = computed(() => aiDialogTextbooks.value.map(t => ({ label: t.textbook_name + (t.author ? ' - ' + t.author : ''), value: t.textbook_id })))

function treeToOptions(tree) {
  return tree.map(node => ({
    label: node.chapter_name, 
    value: node.chapter_id,
    children: node.children && node.children.length > 0 ? treeToOptions(node.children) : undefined
  }))
}
const chapterCascaderOptions = computed(() => treeToOptions(chapterTree.value))

const tableColumns = [
  { type: 'selection' },
  { title: 'ID', key: 'question_id', width: 90 },
  { title: '章节', key: 'chapter_name', width: 150, ellipsis: { tooltip: true } },
  { title: '题型', key: 'type_id', width: 110, render: row => typeName(row.type_id) },
  { title: '难度', key: 'difficulty_id', width: 110, render: row => difficultyName(row.difficulty_id) },
  {
    title: '题干',
    key: 'question_content',
    ellipsis: { tooltip: true },
    render(row) {
      const content = row.question_content || ''
      const preview = content.length > 50 ? content.substring(0, 50) + '...' : content
      return h('div', {
        style: { cursor: 'pointer', maxHeight: '60px', overflow: 'hidden' },
        onClick: () => openDetail(row)
      }, h(MathRenderer, { content: preview, inline: true }))
    }
  }
]

function handlePageChange(page) { 
  filters.page = page
  search() 
}
function handlePageSizeChange(pageSize) { 
  filters.page_size = pageSize
  filters.page = 1
  search() 
}
</script>

<template>
  <div class="page">
    <n-alert v-if="error" type="error" :title="error" />
    <n-card>
      <template #header>
        <div class="header">
          <div>题目筛选</div>
          <div class="actions">
            <n-button @click="openAiDialog" type="warning">
              <template #icon><n-icon><PlayOutline /></n-icon></template>
              智能组题
            </n-button>
          </div>
        </div>
      </template>
      <div class="filter-section">
        <div class="filter-section-header filter-section-toggle" @click="toggleFilter">
          <n-icon size="16" color="#64748b"><FunnelOutline /></n-icon>
          <span>条件筛选</span>
          <n-icon size="16" style="margin-left: 4px; transition: transform 0.2s;" :style="{ transform: filterCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }"><CaretDownOutline /></n-icon>
        </div>
        <template v-if="!filterCollapsed">
          <div class="filter-row">
            <div class="filter-label">关键词</div>
            <div class="filter-content">
              <n-input v-model:value="filters.q" placeholder="题干/解析" style="width: 200px" clearable @keyup.enter="search" />
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">题目ID</div>
            <div class="filter-content">
              <n-input v-model:value="filters.question_id" placeholder="输入题目ID（多个用逗号分隔）" style="width: 300px" clearable @keyup.enter="search" />
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">科目</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="s in subjects"
                :key="s.subject_id"
                :bordered="false"
                :class="['filter-tag', filters.subject_id === s.subject_id ? 'tag-selected' : '']"
                @click="async () => {
                  filters.subject_id = filters.subject_id === s.subject_id ? null : s.subject_id
                  filters.textbook_id = null
                  filters.chapter_ids = []
                  selectedMainChapters = []
                  await loadTextbooks()
                  await loadChapters()
                  await search()
                }"
              >
                {{ s.subject_name }}
              </n-tag>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">教材</div>
            <div class="filter-content filter-tags">
              <template v-if="textbooks.length > 0">
                <n-tag
                  v-for="t in textbooks"
                  :key="t.textbook_id"
                  :bordered="false"
                  :class="['filter-tag', filters.textbook_id === t.textbook_id ? 'tag-selected' : '']"
                  @click="async () => {
                    filters.textbook_id = filters.textbook_id === t.textbook_id ? null : t.textbook_id
                    filters.chapter_ids = []
                    selectedMainChapters = []
                    await loadChapters()
                    await search()
                  }"
                >
                  {{ t.textbook_name }}{{ t.author ? ' - ' + t.author : '' }}
                </n-tag>
              </template>
              <span v-else class="empty-hint">{{ filters.subject_id ? '暂无教材' : '请先选择科目' }}</span>
            </div>
          </div>

          <div class="filter-row">
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
              <span v-else class="empty-hint">{{ filters.textbook_id ? '暂无章节' : '请先选择教材' }}</span>
            </div>
          </div>

          <div class="filter-row sub-chapters-row" v-if="visibleSubChapterGroups.length > 0">
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
                      :class="['filter-tag', 'chapter-sub', filters.chapter_ids.includes(sub.chapter_id) ? 'chapter-sub-selected' : '']"
                      @click="toggleSubChapter(sub.chapter_id)"
                    >
                      {{ sub.chapter_name }}
                    </n-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">题型</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="t in types"
                :key="t.type_id"
                :bordered="false"
                :class="['filter-tag', filters.type_ids.includes(t.type_id) ? 'tag-selected' : '']"
                @click="toggleType(t.type_id)"
              >
                {{ t.type_name }}
              </n-tag>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">难度</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="d in difficulties"
                :key="d.difficulty_id"
                :bordered="false"
                :class="['filter-tag', 'difficulty-tag', getDifficultyClass(d.difficulty_id, d.difficulty_name)]"
                @click="toggleDifficulty(d.difficulty_id)"
              >
                {{ d.difficulty_name }}
              </n-tag>
            </div>
          </div>
        </template>
      </div>
      
      <div class="table-top-actions">
        <n-button type="primary" :loading="loading" @click="addSelected">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          加入练习
        </n-button>
        <n-button @click="showPaperDrawer = true">已选 ({{ picked.length }})</n-button>
      </div>

      <n-data-table 
        :columns="tableColumns" 
        :data="available.items" 
        :loading="loading" 
        :max-height="560" 
        :row-key="row => row.question_id" 
        v-model:checked-row-keys="checkedRowKeys" 
      />

      <div class="pager">
        <n-pagination 
          v-model:page="filters.page" 
          v-model:page-size="filters.page_size" 
          :item-count="available.total" 
          :page-sizes="[10, 20, 50, 100]" 
          show-size-picker 
          @update:page="handlePageChange" 
          @update:page-size="handlePageSizeChange" 
        />
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
        </n-descriptions>
      </div>
      <template #footer><n-button @click="detailDialog.visible = false">关闭</n-button></template>
    </n-modal>

    <n-drawer v-model:show="showPaperDrawer" :width="isDrawerFullscreen ? '100%' : 500" placement="right">
      <n-drawer-content title="已选题目">
        <template #header-extra>
          <n-button text @click="isDrawerFullscreen = !isDrawerFullscreen"><template #icon><n-icon><ExpandOutline /></n-icon></template></n-button>
        </template>

        <div class="drawer-top-actions">
          <h3>已选题目（{{ picked.length }}）</h3>
          <div class="actions">
            <n-button size="small" @click="renumber"><template #icon><n-icon><RefreshOutline /></n-icon></template>重新排序</n-button>
            <n-button size="small" type="error" @click="clearPicked"><template #icon><n-icon><TrashOutline /></n-icon></template>清空</n-button>
          </div>
        </div>

        <div class="total">总分：{{ pickedTotalScore }}</div>

        <div class="picked-list">
          <div v-if="picked.length === 0" class="empty">从左侧筛选后勾选题目加入</div>
          <div v-for="(it, index) in picked" :key="it.question_id" class="picked-row" draggable="true" @dragstart="onDragStart(index)" @dragover.prevent @drop="onDrop(index)">
            <div class="row-left"><div class="drag-handle">≡</div></div>
            <div class="row-main">
              <div class="info-header">
                <span class="tag">{{ typeName(it.type_id) }}</span>
                <span class="tag">{{ difficultyName(it.difficulty_id) }}</span>
                <span class="qid">#{{ it.question_id }}</span>
              </div>
              <div class="info-body">
                <div class="q-field"><span class="label">【题干】</span><span class="text">{{ it.question_content }}</span></div>
                <div class="q-field" v-if="it.question_answer"><span class="label">【答案】</span><span class="text">{{ it.question_answer }}</span></div>
              </div>
            </div>
            <div class="row-right">
              <div class="control-item"><span class="control-label">序号</span><n-input-number v-model:value="it.question_sort" :min="1" size="small" style="width: 80px" /></div>
              <div class="control-item"><span class="control-label">分值</span><n-input-number v-model:value="it.question_score" :min="0" :step="0.5" size="small" style="width: 80px" /></div>
              <n-button text type="error" size="small" @click="removePicked(index)">移除</n-button>
            </div>
          </div>
        </div>

        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <n-button @click="showPaperDrawer = false">继续选择</n-button>
            <n-button type="primary" :loading="loading" @click="startPractice"><template #icon><n-icon><PlayOutline /></n-icon></template>开始答题</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="aiDialog.visible" preset="card" title="AI智能组题" style="width: 700px">
      <n-form label-placement="left" label-width="100px">
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="科目">
            <n-select 
              v-model:value="aiDialog.subject_id" 
              :options="subjectOptions" 
              placeholder="请选择科目" 
              :disabled="!!filters.subject_id"
              @update:value="async () => { 
                aiDialog.textbook_id = null
                await loadAiDialogTextbooks() 
              }" 
            />
          </n-form-item-gi>
          <n-form-item-gi label="教材">
            <n-select 
              v-model:value="aiDialog.textbook_id" 
              :options="aiDialogTextbookOptions" 
              placeholder="请选择教材" 
              :disabled="!aiDialog.subject_id || !!filters.textbook_id"
              @update:value="loadAiDialogChapters" 
            />
          </n-form-item-gi>
        </n-grid>

        <n-divider title-placement="left" style="margin-top: 0">题型分布（总数: {{ aiTotalQuestions }}）</n-divider>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
          <div v-for="t in types" :key="t.type_id">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">{{ t.type_name }}</div>
            <n-input-number v-model:value="aiDialog.type_counts[t.type_id]" :min="0" size="small" placeholder="数量" />
          </div>
        </div>

        <n-divider title-placement="left">难度占比（总和: {{ Number(aiDialog.difficulty_ratios.easy) + Number(aiDialog.difficulty_ratios.medium) + Number(aiDialog.difficulty_ratios.hard) }}%）</n-divider>
        <n-grid :cols="3" :x-gap="12">
          <n-form-item-gi label="简单 (%)" label-width="70px">
            <n-input-number v-model:value="aiDialog.difficulty_ratios.easy" :min="0" :max="100" />
          </n-form-item-gi>
          <n-form-item-gi label="中等 (%)" label-width="70px">
            <n-input-number v-model:value="aiDialog.difficulty_ratios.medium" :min="0" :max="100" />
          </n-form-item-gi>
          <n-form-item-gi label="困难 (%)" label-width="70px">
            <n-input-number v-model:value="aiDialog.difficulty_ratios.hard" :min="0" :max="100" />
          </n-form-item-gi>
        </n-grid>

        <n-divider title-placement="left">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%">
            <span>章节覆盖</span>
            <n-button size="tiny" secondary type="primary" @click="() => {
              if(!aiDialog.textbook_id) return;
              aiDialog.chapter_ratios.push({ chapter_id: null, ratio: 0 })
            }">+ 添加重点章节</n-button>
          </div>
        </n-divider>
        
        <div v-if="aiDialog.chapter_ratios.length > 0" style="margin-bottom: 16px">
          <div v-for="(item, idx) in aiDialog.chapter_ratios" :key="idx" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
            <n-select 
              v-model:value="item.chapter_id" 
              :options="aiDialogChapters.map(c => ({ label: c.chapter_name, value: c.chapter_id }))" 
              placeholder="选择章节" 
              style="flex: 1" 
              filterable 
            />
            <n-input-number v-model:value="item.ratio" :min="0" :max="100" placeholder="占比%" style="width: 100px">
              <template #suffix>%</template>
            </n-input-number>
            <n-button text type="error" @click="aiDialog.chapter_ratios.splice(idx, 1)"><n-icon size="18"><CloseOutline /></n-icon></n-button>
          </div>
          <div style="font-size: 12px; color: #666; text-align: right">
            当前总占比: {{ aiDialog.chapter_ratios.reduce((s, c) => s + Number(c.ratio || 0), 0) }}%（剩余部分将由系统自动分配或全书随机）
          </div>
        </div>
        <div v-else style="font-size: 13px; color: #999; margin-bottom: 16px; font-style: italic">
          未指定重点章节，将默认覆盖全书内容。
        </div>

        <n-form-item label="其他要求">
          <n-input v-model:value="aiDialog.extra_desc" type="textarea" :rows="2" placeholder="例如：侧重考察基础概念，题目风格活泼..." />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="aiDialog.visible = false">取消</n-button>
          <n-button type="primary" @click="startAiGeneration" :loading="loading">开始生成</n-button>
        </div>
      </template>
    </n-modal>

    <TaskStreamDeck :allowed-types="['paper_gen']" />
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.table-top-actions { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 8px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }

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

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
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
  background: rgba(100, 116, 139, 0.06);
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
.difficulty-tag {
  font-weight: 500 !important;
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

.paper-form { margin-bottom: 10px; }
.total { margin-bottom: 8px; font-weight: 600; }
.hint { margin-bottom: 10px; color: var(--n-text-color-3); font-size: 13px; }
.drawer-top-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.drawer-top-actions h3 { margin: 0; font-size: 16px; font-weight: 600; }
.picked-list { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--n-border-color); padding-top: 10px; }
.empty { color: var(--n-text-color-3); font-size: 13px; }
.picked-row { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--n-border-color); border-radius: 12px; }
.row-left { display: flex; align-items: center; justify-content: center; width: 24px; }
.drag-handle { cursor: grab; color: var(--n-text-color-3); font-size: 18px; }
.row-main { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.info-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qid { font-weight: 600; }
.tag { font-size: 12px; padding: 2px 6px; background: var(--n-fill-color); border-radius: 8px; }
.info-body { display: flex; flex-direction: column; gap: 6px; }
.q-field { font-size: 13px; line-height: 1.5; word-break: break-all; }
.label { font-weight: 600; margin-right: 4px; }
.text { white-space: pre-wrap; }
.row-right { display: flex; flex-direction: column; gap: 8px; width: 100px; border-left: 1px solid var(--n-border-color); padding-left: 10px; justify-content: center; }
.control-item { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.control-label { font-size: 12px; color: var(--n-text-color-3); }
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

.streamHeader, .streamProgress, .streamBody {
  position: relative;
  z-index: 1;
}
</style>
