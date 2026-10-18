<script setup>
import { onMounted, reactive, ref, h, computed } from 'vue'
import { useMessage, useDialog, NButton, NTag, NIcon, NSelect, NCascader } from 'naive-ui'
import { SearchOutline, AddOutline, CreateOutline, TrashOutline, CloudUploadOutline, DownloadOutline, FunnelOutline, ExpandOutline, CaretDownOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import { getToken, getUser } from '../auth'
import MathRenderer from '../components/MathRenderer.vue'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const error = ref('')
 

const filterCollapsed = ref(true)

const subjects = ref([])
const types = ref([])
const difficulties = ref([])
const textbooks = ref([])
const chapters = ref([])
const chapterTree = ref([])
const selectedMainChapters = ref([]) // 选中的大章节ID列表
const reviewers = ref([])
const reviewerQuery = ref('')
const filteredReviewers = computed(() => {
  const q = (reviewerQuery.value || '').trim().toLowerCase()
  if (!q) return reviewers.value
  return reviewers.value.filter(r => String(r || '').toLowerCase().includes(q))
})

const filter = reactive({
  q: '',
  question_id: '',
  subject_id: null,
  textbook_id: null,
  chapter_id: [],
  type_id: [],
  difficulty_id: [],
  review_status: 1,
  reviewer: null,
  page: 1,
  page_size: 20,
})

const data = reactive({
  items: [],
  total: 0,
})

const checkedRowKeys = ref([])

const questionDialog = reactive({
  visible: false,
  mode: 'create',
  form: {
    question_id: null,
    subject_id: null,
    chapter_id: null,
    type_id: null,
    difficulty_id: null,
    question_content: '',
    question_answer: '',
    question_analysis: '',
    question_score: null,
    review_status: 1,
    create_user: 'manual',
    reviewer: '',
  },
})

const dialogTextbookId = ref(null)
const dialogTextbooks = ref([])
const dialogChapterTree = ref([])

async function loadDialogTextbooks() {
  const resp = await http.get('/textbooks', {
    params: questionDialog.form.subject_id ? { subject_id: questionDialog.form.subject_id } : {},
  })
  dialogTextbooks.value = resp.data.items || []
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
  if (!filter.subject_id) {
    textbooks.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get('/textbooks', {
    params: { subject_id: filter.subject_id },
  })
  textbooks.value = resp.data.items || []
  // 切换科目时清空章节
  chapterTree.value = []
}

async function loadChapters() {
  if (!filter.textbook_id) {
    chapters.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get(`/textbooks/${filter.textbook_id}/chapters`)
  chapters.value = resp.data.items || []
  chapterTree.value = resp.data.tree || []
}

async function loadReviewers() {
  try {
    const res = await http.get('/questions/reviewers')
    reviewers.value = res.data.items || []
  } catch (e) {
    // ignore
  }
}

async function loadDialogChapters() {
  if (!dialogTextbookId.value) {
    dialogChapterTree.value = []
    return
  }
  const resp = await http.get(`/textbooks/${dialogTextbookId.value}/chapters`)
  dialogChapterTree.value = resp.data.tree || []
}

// 将章节树扁平化为一维数组，带层级信息
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
    // 取消选择大章节，同时移除其下所有子章节的选中状态
    selectedMainChapters.value.splice(idx, 1)
    if (chapter.children && chapter.children.length > 0) {
      const childIds = chapter.children.map(c => c.chapter_id)
      filter.chapter_id = filter.chapter_id.filter(id => !childIds.includes(id))
    }
  } else {
    // 选择大章节，同时默认选中所有子章节
    selectedMainChapters.value.push(chapter.chapter_id)
    if (chapter.children && chapter.children.length > 0) {
      for (const child of chapter.children) {
        if (!filter.chapter_id.includes(child.chapter_id)) {
          filter.chapter_id.push(child.chapter_id)
        }
      }
    }
  }
  search()
}

// 切换小章节选择
function toggleSubChapter(chapterId) {
  const idx = filter.chapter_id.indexOf(chapterId)
  if (idx >= 0) {
    filter.chapter_id.splice(idx, 1)
  } else {
    filter.chapter_id.push(chapterId)
  }
  search()
}

// 切换题型选择
function toggleTypeId(typeId) {
  const idx = filter.type_id.indexOf(typeId)
  if (idx >= 0) {
    filter.type_id.splice(idx, 1)
  } else {
    filter.type_id.push(typeId)
  }
  search()
}

// 切换难度选择
function toggleDifficultyId(difficultyId) {
  const idx = filter.difficulty_id.indexOf(difficultyId)
  if (idx >= 0) {
    filter.difficulty_id.splice(idx, 1)
  } else {
    filter.difficulty_id.push(difficultyId)
  }
  search()
}

// 获取难度对应的颜色类名
function getDifficultyClass(difficultyId, difficultyName) {
  const selected = filter.difficulty_id.includes(difficultyId)
  const name = difficultyName?.toLowerCase() || ''
  if (name.includes('简单') || name.includes('easy')) {
    return selected ? 'difficulty-easy-selected' : 'difficulty-easy'
  } else if (name.includes('中等') || name.includes('medium') || name.includes('普通')) {
    return selected ? 'difficulty-medium-selected' : 'difficulty-medium'
  } else if (name.includes('困难') || name.includes('hard') || name.includes('难')) {
    return selected ? 'difficulty-hard-selected' : 'difficulty-hard'
  }
  return selected ? 'difficulty-default-selected' : ''
}

async function search() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: filter.page,
      page_size: filter.page_size,
      q: filter.q || undefined,
      ids: filter.question_id || undefined,
      subject_id: filter.subject_id || undefined,
      textbook_id: filter.textbook_id || undefined,
      chapter_id: Array.isArray(filter.chapter_id) && filter.chapter_id.length > 0 ? filter.chapter_id.join(',') : undefined,
      type_id: Array.isArray(filter.type_id) && filter.type_id.length > 0 ? filter.type_id.join(',') : undefined,
      difficulty_id: Array.isArray(filter.difficulty_id) && filter.difficulty_id.length > 0 ? filter.difficulty_id.join(',') : undefined,
      review_status: filter.review_status === null ? undefined : filter.review_status,
      reviewer: filter.reviewer || undefined,
    }
    const resp = await http.get('/questions', { params })
    data.items = resp.data.items || []
    data.total = resp.data.total || 0
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function downloadTemplate() {
  const link = document.createElement('a')
  link.href = '/question_import_template.xlsx'
  link.download = '题目导入模板.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function exportSelected() {
  if (!Array.isArray(checkedRowKeys.value) || checkedRowKeys.value.length === 0) {
    message.warning('请先勾选需要导出的题目')
    return
  }
  try {
    const resp = await http.post('/questions/export/excel', { ids: checkedRowKeys.value }, { responseType: 'blob' })
    const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '题目导出.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    message.success(`已导出 ${checkedRowKeys.value.length} 条题目`)
  } catch (e) {
    let msg = e?.message || '导出失败'
    if (e.response && e.response.data && e.response.data.error) {
      msg = e.response.data.error.message || msg
    }
    message.error(msg)
  }
}

async function importExcel({ file }) {
  const form = new FormData()
  form.append('file', file.file)
  if (filter.subject_id) form.append('subject_id', String(filter.subject_id))
  if (filter.chapter_id) form.append('chapter_id', String(filter.chapter_id))
  if (filter.type_id) form.append('type_id', String(filter.type_id))
  if (filter.difficulty_id) form.append('difficulty_id', String(filter.difficulty_id))
  form.append('create_user', 'import')
  try {
    const resp = await http.post('/questions/import/excel', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    message.success(`导入完成：新增${resp.data.inserted}，跳过${resp.data.skipped}`)
    await search()
  } catch (e) {
    message.error(e?.message || '导入失败')
  }
}

function openCreate() {
  questionDialog.mode = 'create'
  const user = getUser()
  questionDialog.form = {
    question_id: null,
    subject_id: filter.subject_id || null,
    chapter_id: Array.isArray(filter.chapter_id) ? (filter.chapter_id[0] || null) : filter.chapter_id || null,
    type_id: filter.type_id || null,
    difficulty_id: filter.difficulty_id || null,
    question_content: '',
    question_answer: '',
    question_analysis: '',
    question_score: null,
    create_user: user ? user.name : 'manual',
    reviewer: '',
  }
  dialogTextbookId.value = filter.textbook_id || null
  loadDialogTextbooks()
  loadDialogChapters()
  questionDialog.visible = true
}

async function openEdit(row) {
  questionDialog.mode = 'edit'
  questionDialog.form = {
    question_id: row.question_id,
    subject_id: row.subject_id,
    chapter_id: row.chapter_id,
    type_id: row.type_id,
    difficulty_id: row.difficulty_id,
    question_content: row.question_content,
    question_answer: row.question_answer,
    question_analysis: row.question_analysis,
    question_score: row.question_score,
    review_status: row.review_status,
    create_user: row.create_user || 'manual',
    reviewer: row.reviewer || '',
  }
  dialogTextbookId.value = null
  dialogTextbooks.value = []
  dialogChapterTree.value = []
  try {
    if (row.chapter_id) {
      const meta = await http.get(`/textbooks/chapters/${row.chapter_id}`)
      dialogTextbookId.value = meta.data?.item?.textbook_id || null
      questionDialog.form.subject_id = row.subject_id
      await loadDialogTextbooks()
      await loadDialogChapters()
    }
  } catch {
    // ignore
  }
  questionDialog.visible = true
}

async function approve() {
  try {
    const user = getUser()

    // 1. Save (Update) first
    if (
      !questionDialog.form.subject_id ||
      !questionDialog.form.chapter_id ||
      !questionDialog.form.type_id ||
      !questionDialog.form.difficulty_id ||
      !questionDialog.form.question_content
    ) {
      message.error('科目/章节/题型/难度/题干必填')
      return
    }

    await http.put(`/questions/${questionDialog.form.question_id}`, {
      subject_id: questionDialog.form.subject_id,
      chapter_id: questionDialog.form.chapter_id,
      type_id: questionDialog.form.type_id,
      difficulty_id: questionDialog.form.difficulty_id,
      question_content: questionDialog.form.question_content,
      question_answer: questionDialog.form.question_answer,
      question_analysis: questionDialog.form.question_analysis,
      question_score: questionDialog.form.question_score,
    })

    // 2. Approve
    await http.post('/ai/verify', {
      question_id: questionDialog.form.question_id,
      action: 'approve',
      reviewer: user ? user.name : 'manual'
    })
    message.success('已保存并审核通过')
    questionDialog.visible = false
    await search()
  } catch (e) {
    message.error(e?.message || '操作失败')
  }
}

async function submit() {
  try {
    if (
      !questionDialog.form.subject_id ||
      !questionDialog.form.chapter_id ||
      !questionDialog.form.type_id ||
      !questionDialog.form.difficulty_id ||
      !questionDialog.form.question_content
    ) {
      message.error('科目/章节/题型/难度/题干必填')
      return
    }
    if (questionDialog.mode === 'create') {
      await http.post('/questions', { ...questionDialog.form })
    } else {
      await http.put(`/questions/${questionDialog.form.question_id}`, {
        subject_id: questionDialog.form.subject_id,
        chapter_id: questionDialog.form.chapter_id,
        type_id: questionDialog.form.type_id,
        difficulty_id: questionDialog.form.difficulty_id,
        question_content: questionDialog.form.question_content,
        question_answer: questionDialog.form.question_answer,
        question_analysis: questionDialog.form.question_analysis,
        question_score: questionDialog.form.question_score,
      })
    }
    questionDialog.visible = false
    await search()
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}

async function remove(row) {
  // 1. Check dependencies first
  try {
    const resp = await http.post('/questions/check-dependencies', { ids: [row.question_id] })
    const deps = resp.data.dependencies || []
    
    if (deps.length > 0) {
      // Build warning message
      const paperNames = [...new Set(deps.map(d => d.paper_name))].join('、')
      dialog.warning({
        title: '警告：题目已被使用',
        content: `该题目已被引用在以下试卷中：\n${paperNames}\n\n删除该题目将导致这些试卷中缺少该题。确定要继续删除吗？`,
        positiveText: '仍要删除',
        negativeText: '取消',
        onPositiveClick: async () => {
          await doDelete([row.question_id])
        }
      })
    } else {
      // No dependencies, standard confirm
      dialog.warning({
        title: '提示',
        content: `确认删除题目ID=${row.question_id}？`,
        positiveText: '确认',
        negativeText: '取消',
        onPositiveClick: async () => {
          await doDelete([row.question_id])
        }
      })
    }
  } catch (e) {
     message.error('依赖检查失败: ' + (e?.message || '未知错误'))
  }
}

async function doDelete(ids) {
  try {
    if (ids.length === 1) {
      await http.delete(`/questions/${ids[0]}`)
      message.success('删除成功')
    } else {
      await http.post('/questions/batch-delete', { ids })
      message.success('批量删除成功')
      checkedRowKeys.value = []
    }
    await search()
  } catch (e) {
    message.error(e?.message || '删除失败')
  }
}

async function batchDelete() {
  if (checkedRowKeys.value.length === 0) return
  
  // 1. Check dependencies
  try {
    const resp = await http.post('/questions/check-dependencies', { ids: checkedRowKeys.value })
    const deps = resp.data.dependencies || []
    
    if (deps.length > 0) {
       // Group by paper
       const paperMap = {}
       deps.forEach(d => {
         if (!paperMap[d.paper_name]) paperMap[d.paper_name] = []
         if (!paperMap[d.paper_name].includes(d.question_id)) paperMap[d.paper_name].push(d.question_id)
       })
       
       const details = Object.entries(paperMap).map(([name, qids]) => {
         return `${name} (包含题目ID: ${qids.join(', ')})`
       }).join('\n')
       
       const totalAffected = new Set(deps.map(d => d.question_id)).size
       
       dialog.warning({
        title: '警告：题目已被使用',
        content: `选中的题目中有 ${totalAffected} 个已被引用，涉及试卷详情如下：\n\n${details}\n\n强制删除将导致这些试卷缺少题目。确定要全部删除吗？`,
        positiveText: '仍要删除',
        negativeText: '取消',
        onPositiveClick: async () => {
          await doDelete(checkedRowKeys.value)
        }
      })
    } else {
      dialog.warning({
        title: '提示',
        content: `确认删除选中的 ${checkedRowKeys.value.length} 个题目？`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
          await doDelete(checkedRowKeys.value)
        }
      })
    }
  } catch (e) {
     message.error('依赖检查失败: ' + (e?.message || '未知错误'))
  }
}

const detailDialog = reactive({
  visible: false,
  item: null
})

function openDetail(row) {
  detailDialog.item = row
  detailDialog.visible = true
}

// 已移除：题库管理的 AI智能导入相关脚本逻辑

onMounted(async () => {
  await loadDicts()
  await loadTextbooks()
  await loadReviewers()
  await search()

})

// Computed options
const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))
const textbookOptions = computed(() => textbooks.value.map(t => ({ label: t.textbook_name + (t.author ? '-' + t.author : ''), value: t.textbook_id })))
const typeOptions = computed(() => types.value.map(t => ({ label: t.type_name, value: t.type_id })))
const difficultyOptions = computed(() => difficulties.value.map(d => ({ label: d.difficulty_name, value: d.difficulty_id })))
const dialogTextbookOptions = computed(() => dialogTextbooks.value.map(t => ({ label: t.textbook_name + (t.author ? '-' + t.author : ''), value: t.textbook_id })))
 

const reviewStatusOptions = [
  { label: '已通过', value: 1 },
  { label: '待审核', value: 0 },
]

// Chapter tree to cascader options
function treeToOptions(tree) {
  return tree.map(node => ({
    label: node.chapter_name,
    value: node.chapter_id,
    children: node.children && node.children.length > 0 ? treeToOptions(node.children) : undefined
  }))
}

const chapterCascaderOptions = computed(() => treeToOptions(chapterTree.value))
const dialogChapterCascaderOptions = computed(() => treeToOptions(dialogChapterTree.value))
 

// Table columns
const tableColumns = [
  { type: 'selection' },
  { title: 'ID', key: 'question_id', width: 80 },
  { title: '科目', key: 'subject_name', width: 120 },
  { title: '章节', key: 'chapter_name', width: 180, ellipsis: { tooltip: true } },
  { title: '题型', key: 'type_name', width: 100 },
  { title: '难度', key: 'difficulty_name', width: 80 },
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
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h('div', { style: { display: 'flex', gap: '4px' } }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', type: 'error', onClick: () => remove(row) }, { default: () => '删除' })
      ])
    }
  }
]

function handlePageChange(page) {
  filter.page = page
  search()
}

function handlePageSizeChange(pageSize) {
  filter.page_size = pageSize
  filter.page = 1
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
            <n-button @click="downloadTemplate">
              <template #icon><n-icon><DownloadOutline /></n-icon></template>
              下载Excel导入模板
            </n-button>
            <n-upload :custom-request="importExcel" accept=".xlsx,.xls" :show-file-list="false">
              <n-button>
                <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
                Excel导入
              </n-button>
            </n-upload>
            <n-button type="primary" @click="openCreate">
              <template #icon><n-icon><AddOutline /></n-icon></template>
              新增题目
            </n-button>
          </div>
        </div>
      </template>

      <!-- 筛选区域：标签式布局 -->
      <div class="filter-section">
        <div class="filter-section-header filter-section-toggle" @click="filterCollapsed = !filterCollapsed">
          <n-icon size="16" color="#64748b"><FunnelOutline /></n-icon>
          <span>条件筛选</span>
          <n-icon size="16" style="margin-left: 4px;transition:transform 0.2s;" :style="{transform: filterCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}"><CaretDownOutline /></n-icon>
        </div>
        <template v-if="!filterCollapsed">
          <div class="filter-row">
            <div class="filter-label">关键词</div>
            <div class="filter-content">
              <n-input v-model:value="filter.q" placeholder="题干/解析" style="width: 200px" clearable @keyup.enter="search" />
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">题目ID</div>
            <div class="filter-content">
              <n-input v-model:value="filter.question_id" placeholder="输入题目ID（多个用逗号分隔）" style="width:300px" clearable @keyup.enter="search" />
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">科目</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="s in subjects"
                :key="s.subject_id"
                :bordered="false"
                :class="['filter-tag', filter.subject_id === s.subject_id ? 'tag-selected' : '']"
                @click="async () => {
                  filter.subject_id = filter.subject_id === s.subject_id ? null : s.subject_id;
                  filter.textbook_id = null;
                  filter.chapter_id = [];
                  selectedMainChapters = [];
                  await loadTextbooks();
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
                  :class="['filter-tag', filter.textbook_id === t.textbook_id ? 'tag-selected' : '']"
                  @click="async () => {
                    filter.textbook_id = filter.textbook_id === t.textbook_id ? null : t.textbook_id;
                    filter.chapter_id = [];
                    selectedMainChapters.value = [];
                    await loadChapters()
                    await search()
                  }"
                >
                  {{ t.textbook_name }}{{ t.author ? ' - ' + t.author : '' }}
                </n-tag>
              </template>
              <span v-else class="empty-hint">{{ filter.subject_id ? '暂无教材' : '请先选择科目' }}</span>
            </div>
          </div>

          <!-- 大章节选择 -->
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
              <span v-else class="empty-hint">{{ filter.textbook_id ? '暂无章节' : '请先选择教材' }}</span>
            </div>
          </div>

          <!-- 小章节选择（按大章节分组显示） -->
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
                      :class="['filter-tag', 'chapter-sub', filter.chapter_id.includes(sub.chapter_id) ? 'chapter-sub-selected' : '']"
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
                :class="['filter-tag', filter.type_id.includes(t.type_id) ? 'tag-selected' : '']"
                @click="toggleTypeId(t.type_id)"
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
                @click="toggleDifficultyId(d.difficulty_id)"
              >
                {{ d.difficulty_name }}
              </n-tag>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">状态</div>
            <div class="filter-content filter-tags">
              <n-tag
                v-for="s in reviewStatusOptions"
                :key="s.value"
                :bordered="false"
                :class="['filter-tag', filter.review_status === s.value ? 'tag-selected' : '']"
                @click="() => { filter.review_status = filter.review_status === s.value ? null : s.value; search() }"
              >
                {{ s.label }}
              </n-tag>
              <n-button size="small" style="margin-left: 12px" @click="search">
                <template #icon><n-icon><SearchOutline /></n-icon></template>
                查询
              </n-button>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-label">审核人</div>
            <div class="filter-content filter-tags">
              <n-input v-model:value="reviewerQuery" placeholder="输入姓名筛选" clearable style="width: 180px; margin-right: 8px" />
              <template v-if="filteredReviewers.length > 0">
                <n-tag
                  v-for="r in filteredReviewers"
                  :key="r"
                  :bordered="false"
                  :class="['filter-tag', filter.reviewer === r ? 'tag-selected' : '']"
                  @click="() => { filter.reviewer = filter.reviewer === r ? null : r; search() }"
                >
                  {{ r }}
                </n-tag>
              </template>
              <span v-else class="empty-hint">{{ reviewers.length > 0 ? '无匹配' : '暂无审核人' }}</span>
            </div>
          </div>
        </template>
      </div>

      <div class="table-actions">
        <n-button type="error" :disabled="checkedRowKeys.length === 0" @click="batchDelete">
          <template #icon><n-icon><TrashOutline /></n-icon></template>
          批量删除
        </n-button>
        <n-button type="success" :disabled="checkedRowKeys.length === 0" @click="exportSelected">
          <template #icon><n-icon><DownloadOutline /></n-icon></template>
          批量下载
        </n-button>
      </div>

      <n-data-table
        :columns="tableColumns"
        :data="data.items"
        :loading="loading"
        :max-height="560"
        :row-key="row => row.question_id"
        v-model:checked-row-keys="checkedRowKeys"
      />
      <div class="pager">
        <n-pagination
          v-model:page="filter.page"
          v-model:page-size="filter.page_size"
          :item-count="data.total"
          :page-sizes="[10, 20, 50, 100]"
          show-size-picker
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </n-card>

    <!-- Question Dialog -->
    <n-modal v-model:show="questionDialog.visible" preset="card" :title="questionDialog.mode === 'create' ? '新增题目' : '编辑题目'" style="width: 720px">
      <n-form label-placement="left" label-width="90px">
        <n-form-item label="科目">
          <n-select
            v-model:value="questionDialog.form.subject_id"
            :options="subjectOptions"
            placeholder="科目"
            filterable
            @update:value="async () => {
              dialogTextbookId = null
              questionDialog.form.chapter_id = null
              dialogChapterTree = []
              await loadDialogTextbooks()
            }"
          />
        </n-form-item>
        <n-form-item label="教材">
          <n-select
            v-model:value="dialogTextbookId"
            :options="dialogTextbookOptions"
            placeholder="教材"
            filterable
            clearable
            @update:value="async () => {
              questionDialog.form.chapter_id = null
              await loadDialogChapters()
            }"
          />
        </n-form-item>
        <n-form-item label="章节">
          <n-cascader
            v-model:value="questionDialog.form.chapter_id"
            :options="dialogChapterCascaderOptions"
            check-strategy="child"
            clearable
            placeholder="章节"
            :disabled="!dialogTextbookId"
          />
        </n-form-item>
        <n-form-item label="题型">
          <n-select v-model:value="questionDialog.form.type_id" :options="typeOptions" placeholder="题型" filterable />
        </n-form-item>
        <n-form-item label="难度">
          <n-select v-model:value="questionDialog.form.difficulty_id" :options="difficultyOptions" placeholder="难度" filterable />
        </n-form-item>
        <n-form-item label="分值">
          <n-input-number v-model:value="questionDialog.form.question_score" :min="0" :step="0.5" style="width: 100%" />
        </n-form-item>
        <n-form-item label="题干">
          <n-input v-model:value="questionDialog.form.question_content" type="textarea" :rows="5" />
        </n-form-item>
        <n-form-item label="答案">
          <n-input v-model:value="questionDialog.form.question_answer" type="textarea" :rows="2" />
        </n-form-item>
        <n-form-item label="解析">
          <n-input v-model:value="questionDialog.form.question_analysis" type="textarea" :rows="3" />
        </n-form-item>
        <n-form-item v-if="questionDialog.mode === 'edit'" label="审核人">
          <n-input v-model:value="questionDialog.form.reviewer" disabled />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <n-button @click="questionDialog.visible = false">取消</n-button>
          <n-button v-if="questionDialog.mode === 'edit' && questionDialog.form.review_status === 0" type="success" @click="approve">审核通过</n-button>
          <n-button type="primary" @click="submit">保存</n-button>
        </div>
      </template>
    </n-modal>



    <!-- Detail Dialog -->
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
          <n-descriptions-item label="科目">{{ detailDialog.item.subject_name }}</n-descriptions-item>
          <n-descriptions-item label="章节">{{ detailDialog.item.chapter_name }}</n-descriptions-item>
          <n-descriptions-item label="题型">{{ detailDialog.item.type_name }}</n-descriptions-item>
          <n-descriptions-item label="难度">{{ detailDialog.item.difficulty_name }}</n-descriptions-item>
        </n-descriptions>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button @click="detailDialog.visible = false">关闭</n-button>
          <n-button type="primary" @click="() => { detailDialog.visible = false; openEdit(detailDialog.item) }">修改</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 已移除：AI解析过程面板 -->
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}

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
  margin-bottom: 16px;
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

.empty-hint {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
  line-height: 28px;
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


.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.streamPanel {
  position: fixed;
  right: 18px;
  top: 86px;
  width: 520px;
  height: 70vh;
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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

.streamHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--n-border-color);
}

.streamTitle {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.streamMeta {
  color: var(--n-text-color-3);
  font-size: 12px;
}

.streamActions {
  display: flex;
  gap: 8px;
}

.streamProgress {
  padding: 10px 12px;
  border-bottom: 1px solid var(--n-border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.stage-text {
  font-weight: 500;
  color: var(--n-primary-color);
}

.count-text {
  color: var(--n-text-color-3);
}

.streamBody {
  padding: 10px 12px;
  overflow: auto;
  flex: 1;
}

.streamLines {
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  margin-bottom: 12px;
}

.streamHint {
  color: var(--n-text-color-3);
  font-size: 12px;
}

.streamOutputTitle {
  font-weight: 700;
  margin-bottom: 6px;
}

.streamOutputPre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
  font-size: 12px;
}
</style>
