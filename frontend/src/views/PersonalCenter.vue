<script setup>
import { ref, reactive, computed, h, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog, NButton, NTag, NIcon } from 'naive-ui'
import { SearchOutline, EyeOutline, ExpandOutline, CheckmarkOutline, TrashOutline, ReorderFourOutline, FunnelOutline, CaretDownOutline, ShieldCheckmarkOutline, PaperPlaneOutline, CopyOutline, KeyOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import { getUser, setUser } from '../auth'
import ExportPreview from '../components/ExportPreview.vue'
import MathRenderer from '../components/MathRenderer.vue'

const message = useMessage()
const dialog = useDialog()
const user = getUser()
const reviewer = user ? user.name : ''
const userInfo = reactive({
  id: user?.id || null,
  name: user?.name || '',
  img: user?.img || '',
  Identity: '',
  School: '',
  Introduction: '',
  email: '',
  invitationCode: user?.invitationCode || ''
})

const editDialog = reactive({
  visible: false,
  form: { img: '', Identity: '', School: '', Introduction: '' }
})

function openEdit() {
  editDialog.form = {
    img: userInfo.img || '',
    Identity: userInfo.Identity || '',
    School: userInfo.School || '',
    Introduction: userInfo.Introduction || ''
  }
  editDialog.visible = true
}

const securityDialog = reactive({
  visible: false,
  tab: 'password', // password | email
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
  newEmail: '',
  emailCode: '',
  countdown: 0,
  sending: false,
  oldEmailVerified: false,
  step: 1
})
let securityTimer = null

function openSecurity() {
  securityDialog.visible = true
  securityDialog.tab = 'password'
  securityDialog.oldPassword = ''
  securityDialog.newPassword = ''
  securityDialog.confirmPassword = ''
  securityDialog.newEmail = ''
  securityDialog.emailCode = ''
  securityDialog.countdown = 0
  securityDialog.sending = false
  securityDialog.oldEmailVerified = false
  securityDialog.step = 1
  if (securityTimer) clearInterval(securityTimer)
}

async function sendSecurityCode() {
  if (securityDialog.sending || securityDialog.countdown > 0) return
  
  if (securityDialog.tab === 'email' && securityDialog.step === 2 && !securityDialog.newEmail) {
      message.warning('请输入新邮箱')
      return
  }
  
  // For change password: type 4
  // For change email step 1 (verify old): type 6
  // For change email step 2 (verify new): type 5
  let type = 4
  if (securityDialog.tab === 'email') {
      type = securityDialog.step === 1 ? 6 : 5
  }
  
  // Determine email target
  let email = userInfo.email
  if (securityDialog.tab === 'email' && securityDialog.step === 2) {
      email = securityDialog.newEmail
  }
  
  if (!email) {
      message.warning(type === 5 ? '请输入新邮箱' : '当前账号未绑定邮箱')
      return
  }

  if (!securityDialog.captchaText) {
      message.warning('请输入图片验证码')
      return
  }

  securityDialog.sending = true
  try {
      await http.post('/auth/send-code', {
          email: email,
          captchaId: captcha.id,
          captchaText: securityDialog.captchaText,
          type: type
      })
      message.success('验证码已发送至 ' + email)
      securityDialog.countdown = 60
      securityTimer = setInterval(() => {
          securityDialog.countdown--
          if (securityDialog.countdown <= 0) {
              clearInterval(securityTimer)
          }
      }, 1000)
  } catch (e) {
      message.error(e?.message || '发送失败')
      loadCaptcha()
      securityDialog.captchaText = ''
  } finally {
      securityDialog.sending = false
  }
}

async function submitSecurity() {
  if (!securityDialog.emailCode) {
      message.warning('请输入邮箱验证码')
      return
  }
  
  if (securityDialog.tab === 'password') {
      if (!securityDialog.oldPassword || !securityDialog.newPassword || !securityDialog.confirmPassword) {
          message.warning('请完整填写')
          return
      }
      if (securityDialog.newPassword !== securityDialog.confirmPassword) {
          message.warning('两次输入密码不一致')
          return
      }
      try {
          await http.post('/auth/change-password', {
              oldPassword: securityDialog.oldPassword,
              newPassword: securityDialog.newPassword,
              emailCode: securityDialog.emailCode
          })
          message.success('密码修改成功，请重新登录')
          securityDialog.visible = false
          // Logout logic
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.reload()
      } catch (e) {
          message.error(e?.message || '修改失败')
      }
  } else {
      // Change Email Logic
      if (securityDialog.step === 1) {
          // Verify old email first
          try {
              await http.post('/auth/verify-old-email', {
                  emailCode: securityDialog.emailCode
              })
              message.success('原邮箱验证通过，请输入新邮箱')
              securityDialog.step = 2
              securityDialog.emailCode = ''
              securityDialog.captchaText = ''
              securityDialog.countdown = 0
              if (securityTimer) clearInterval(securityTimer)
              loadCaptcha()
          } catch (e) {
              message.error(e?.message || '验证失败')
          }
      } else {
          // Verify new email and change
          if (!securityDialog.newEmail) {
              message.warning('请输入新邮箱')
              return
          }
          try {
              const resp = await http.post('/auth/change-email', {
                  newEmail: securityDialog.newEmail,
                  emailCode: securityDialog.emailCode
              })
              message.success('邮箱修改成功')
              userInfo.email = resp.data.email
              securityDialog.visible = false
          } catch (e) {
              message.error(e?.message || '修改失败')
          }
      }
  }
}

// Captcha for security dialog
const captcha = reactive({ id: '', image: '' })
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

function onAvatarUpload({ file }) {
  const f = file?.file
  if (!f) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const result = String(e.target?.result || '')
    const base64 = result.replace(/^data:image\/\w+;base64,/, '')
    editDialog.form.img = base64
  }
  reader.readAsDataURL(f)
}

async function submitEdit() {
  try {
    const resp = await http.put('/auth/me', { ...editDialog.form })
    const u = resp.data.user || {}
    userInfo.img = u.img || userInfo.img
    userInfo.Identity = u.Identity || ''
    userInfo.School = u.School || ''
    userInfo.Introduction = u.Introduction || ''
    setUser({ ...(getUser() || {}), ...u })
    editDialog.visible = false
    message.success('保存成功')
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}
const avatarSrc = computed(() => userInfo.img ? `data:image/png;base64,${userInfo.img}` : '')

async function copyInviteCode() {
  const code = userInfo.invitationCode
  if (!code) {
    message.warning('暂无邀请码')
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    message.success('邀请码已复制')
  } catch {
    message.error('复制失败，请手动复制')
  }
}

const activeTab = ref('questions')

const qLoading = ref(false)
const qError = ref('')
const qFilter = reactive({
  q: '',
  question_id: '',
  subject_id: null,
  textbook_id: null,
  chapter_id: [],
  type_id: [],
  difficulty_id: [],
  page: 1,
  page_size: 20
})
const qData = reactive({ items: [], total: 0 })
const checkedQIds = ref([])
const filterCollapsed = ref(true)
const paperFilterCollapsed = ref(true)

const subjects = ref([])
const difficulties = ref([])
const textbooks = ref([])
const paperTextbooks = ref([])
const chapters = ref([])
const chapterTree = ref([])
const selectedMainChapters = ref([])

async function loadMyQuestions() {
  qLoading.value = true
  qError.value = ''
  try {
    const params = {
      reviewer,
      q: qFilter.q || undefined,
      ids: qFilter.question_id || undefined,
      subject_id: qFilter.subject_id || undefined,
      textbook_id: qFilter.textbook_id || undefined,
      chapter_id: Array.isArray(qFilter.chapter_id) && qFilter.chapter_id.length > 0 ? qFilter.chapter_id.join(',') : undefined,
      type_id: Array.isArray(qFilter.type_id) && qFilter.type_id.length > 0 ? qFilter.type_id.join(',') : undefined,
      difficulty_id: Array.isArray(qFilter.difficulty_id) && qFilter.difficulty_id.length > 0 ? qFilter.difficulty_id.join(',') : undefined,
      page: qFilter.page,
      page_size: qFilter.page_size
    }
    const resp = await http.get('/questions', { params })
    qData.items = resp.data.items || []
    qData.total = resp.data.total || 0
  } catch (e) {
    qError.value = e?.message || '加载失败'
  } finally {
    qLoading.value = false
  }
}

const qDialog = reactive({
  visible: false,
  form: {
    question_id: null,
    subject_id: null,
    chapter_id: null,
    type_id: null,
    difficulty_id: null,
    question_content: '',
    question_answer: '',
    question_analysis: '',
    question_score: null
  }
})

const types = ref([])
const typeOptions = computed(() => types.value.map(t => ({ label: t.type_name, value: t.type_id })))
const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))
const difficultyOptions = computed(() => difficulties.value.map(d => ({ label: d.difficulty_name, value: d.difficulty_id })))

// Dialog textbook/chapter resources
const dialogTextbookId = ref(null)
const dialogTextbooks = ref([])
const dialogChapterTree = ref([])
const dialogTextbookOptions = computed(() => dialogTextbooks.value.map(t => ({ label: t.textbook_name + (t.author ? '-' + t.author : ''), value: t.textbook_id })))

async function loadDialogTextbooks() {
  const resp = await http.get('/textbooks', {
    params: qDialog.form.subject_id ? { subject_id: qDialog.form.subject_id } : {},
  })
  dialogTextbooks.value = resp.data.items || []
}

async function loadDialogChapters() {
  if (!dialogTextbookId.value) {
    dialogChapterTree.value = []
    return
  }
  const resp = await http.get(`/textbooks/${dialogTextbookId.value}/chapters`)
  dialogChapterTree.value = resp.data.tree || []
}

function treeToOptions(tree) {
  return tree.map(node => ({
    label: node.chapter_name,
    value: node.chapter_id,
    children: node.children && node.children.length > 0 ? treeToOptions(node.children) : undefined
  }))
}
const dialogChapterCascaderOptions = computed(() => treeToOptions(dialogChapterTree.value))
async function loadDicts() {
  const [s, t, d] = await Promise.all([
    http.get('/dicts/subjects'),
    http.get('/dicts/question-types'),
    http.get('/dicts/difficulties')
  ])
  subjects.value = s.data.items || []
  types.value = t.data.items || []
  difficulties.value = d.data.items || []
}

async function loadMe() {
  try {
    const resp = await http.get('/auth/me')
    const u = resp.data.user || {}
    userInfo.id = u.id || userInfo.id
    userInfo.name = u.name || userInfo.name
    userInfo.img = u.img || userInfo.img
    userInfo.Identity = u.Identity || ''
    userInfo.School = u.School || ''
    userInfo.Introduction = u.Introduction || ''
    userInfo.email = u.email || ''
    userInfo.invitationCode = u.invitationCode || ''
  } catch {}
}

async function loadTextbooks() {
  if (!qFilter.subject_id) {
    textbooks.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get('/textbooks', { params: { subject_id: qFilter.subject_id } })
  textbooks.value = resp.data.items || []
  chapterTree.value = []
}

async function loadPaperTextbooks() {
  if (!paperFilter.subject_id) {
    paperTextbooks.value = []
    return
  }
  const resp = await http.get('/textbooks', { params: { subject_id: paperFilter.subject_id } })
  paperTextbooks.value = resp.data.items || []
}

async function loadChapters() {
  if (!qFilter.textbook_id) {
    chapters.value = []
    chapterTree.value = []
    return
  }
  const resp = await http.get(`/textbooks/${qFilter.textbook_id}/chapters`)
  chapters.value = resp.data.items || []
  chapterTree.value = resp.data.tree || []
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
      qFilter.chapter_id = qFilter.chapter_id.filter(id => !childIds.includes(id))
    }
  } else {
    selectedMainChapters.value.push(chapter.chapter_id)
    if (chapter.children && chapter.children.length > 0) {
      for (const child of chapter.children) {
        if (!qFilter.chapter_id.includes(child.chapter_id)) {
          qFilter.chapter_id.push(child.chapter_id)
        }
      }
    }
  }
  loadMyQuestions()
}

function toggleSubChapter(chapterId) {
  const idx = qFilter.chapter_id.indexOf(chapterId)
  if (idx >= 0) {
    qFilter.chapter_id.splice(idx, 1)
  } else {
    qFilter.chapter_id.push(chapterId)
  }
  loadMyQuestions()
}

function toggleTypeId(typeId) {
  const idx = qFilter.type_id.indexOf(typeId)
  if (idx >= 0) {
    qFilter.type_id.splice(idx, 1)
  } else {
    qFilter.type_id.push(typeId)
  }
  loadMyQuestions()
}

function toggleDifficultyId(difficultyId) {
  const idx = qFilter.difficulty_id.indexOf(difficultyId)
  if (idx >= 0) {
    qFilter.difficulty_id.splice(idx, 1)
  } else {
    qFilter.difficulty_id.push(difficultyId)
  }
  loadMyQuestions()
}

function getDifficultyClass(difficultyId, difficultyName) {
  const selected = qFilter.difficulty_id.includes(difficultyId)
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

function openQEdit(row) {
  qDialog.form = {
    question_id: row.question_id,
    subject_id: row.subject_id,
    chapter_id: row.chapter_id,
    type_id: row.type_id,
    difficulty_id: row.difficulty_id,
    question_content: row.question_content,
    question_answer: row.question_answer,
    question_analysis: row.question_analysis,
    question_score: row.question_score
  }
  dialogTextbookId.value = null
  dialogTextbooks.value = []
  dialogChapterTree.value = []
  // 推断教材：根据章节获取所属教材
  ;(async () => {
    try {
      if (row.chapter_id) {
        const meta = await http.get(`/textbooks/chapters/${row.chapter_id}`)
        dialogTextbookId.value = meta.data?.item?.textbook_id || null
        qDialog.form.subject_id = row.subject_id
        await loadDialogTextbooks()
        await loadDialogChapters()
      }
    } catch {}
  })()
  qDialog.visible = true
}

async function saveQ() {
  try {
    await http.put(`/questions/${qDialog.form.question_id}`, { ...qDialog.form })
    message.success('已保存')
    qDialog.visible = false
    await loadMyQuestions()
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}

async function removeQ(row) {
  dialog.warning({
    title: '提示',
    content: `确认删除题目ID=${row.question_id}？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await http.delete(`/questions/${row.question_id}`)
        message.success('删除成功')
        await loadMyQuestions()
      } catch (e) {
        message.error(e?.message || '删除失败')
      }
    }
  })
}

const detailDialog = reactive({
  visible: false,
  item: null
})
function openDetail(row) {
  detailDialog.item = row
  detailDialog.visible = true
}

const qColumns = [
  { type: 'selection' },
  { title: 'ID', key: 'question_id', width: 80 },
  { title: '科目', key: 'subject_name', width: 120 },
  { title: '章节', key: 'chapter_name', width: 180, ellipsis: { tooltip: true } },
  { title: '题型', key: 'type_name', width: 100 },
  { title: '难度', key: 'difficulty_name', width: 80 },
  { title: '状态', key: 'review_status', width: 90, render(row) {
    if (row.review_status === 1) return h(NTag, { type: 'success' }, { default: () => '已通过' })
    if (row.review_status === 2) return h(NTag, { type: 'error' }, { default: () => '未通过' })
    return h(NTag, { type: 'warning' }, { default: () => '待审核' })
  }},
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
  { title: '操作', key: 'actions', width: 140, render(row) {
    return h('div', { style: { display: 'flex', gap: '6px' } }, [
      h(NButton, { size: 'small', onClick: () => openQEdit(row) }, { default: () => '编辑' }),
      h(NButton, { size: 'small', type: 'error', onClick: () => removeQ(row) }, { default: () => '删除' })
    ])
  }}
]

async function batchDeleteQuestions() {
  if (checkedQIds.value.length === 0) return
  dialog.warning({
    title: '提示',
    content: `确认删除选中的 ${checkedQIds.value.length} 个题目？`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await http.post('/questions/batch-delete', { ids: checkedQIds.value })
        message.success('批量删除成功')
        checkedQIds.value = []
        await loadMyQuestions()
      } catch (e) {
        message.error(e?.message || '操作失败')
      }
    }
  })
}

const pLoading = ref(false)
const pError = ref('')
const papers = ref([])
const selectedPaperId = ref(null)
const paper = ref(null)
const questions = ref([])
const showPaperDrawer = ref(false)
const isDrawerFullscreen = ref(false)
const showPreview = ref(false)
const paperFilter = reactive({
  subject_id: null,
  textbook_id: null
})

async function loadMyPapers() {
  pLoading.value = true
  pError.value = ''
  try {
    const params = {
      reviewer,
      include_export_count: 1
    }
    if (paperFilter.subject_id) params.subject_id = paperFilter.subject_id
    if (paperFilter.textbook_id) params.textbook_id = paperFilter.textbook_id
    const resp = await http.get('/papers', { params })
    papers.value = resp.data.items || []
  } catch (e) {
    pError.value = e?.message || '加载失败'
  } finally {
    pLoading.value = false
  }
}

async function loadPaperDetail(paperId) {
  if (!paperId) {
    paper.value = null
    questions.value = []
    return
  }
  pLoading.value = true
  pError.value = ''
  try {
    const resp = await http.get(`/papers/${paperId}`)
    paper.value = resp.data.paper
    questions.value = resp.data.questions || []
    paperForm.paper_name = paper.value.paper_name || ''
    paperForm.paper_desc = paper.value.paper_desc || ''
    paperForm.exam_duration = paper.value.exam_duration
    showPaperDrawer.value = true
  } catch (e) {
    pError.value = e?.message || '加载失败'
  } finally {
    pLoading.value = false
  }
}

const tableColumns = [
  { title: 'ID', key: 'paper_id', width: 90 },
  { title: '名称', key: 'paper_name' },
  { title: '状态', key: 'review_status', width: 100, render(row) {
    if (row.review_status === 1) return h(NTag, { type: 'success' }, { default: () => '已通过' })
    if (row.review_status === 2) return h(NTag, { type: 'error' }, { default: () => '未通过' })
    return h(NTag, { type: 'warning' }, { default: () => '待审核' })
  }},
  { title: '审核时间', key: 'review_time', width: 160, render(row) {
    return row.review_time ? new Date(row.review_time).toLocaleString() : '-'
  }},
  { title: '下载量', key: 'export_count', width: 90 },
  { title: '操作', key: 'actions', width: 120, render(row) {
    return h(NButton, { size: 'small', onClick: () => { selectedPaperId.value = row.paper_id; loadPaperDetail(row.paper_id) } }, { default: () => '编辑/导出' })
  }}
]

function normalizeSort() {
  const arr = [...questions.value]
  arr.sort((a, b) => {
    const ra = getTypeRank(a.type_id), rb = getTypeRank(b.type_id)
    if (ra !== rb) return ra - rb
    return (a.question_sort || 0) - (b.question_sort || 0)
  })
  arr.forEach((q, idx) => { q.question_sort = idx + 1 })
  questions.value = arr
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

async function saveQuestions() {
  if (!selectedPaperId.value) return
  try {
    normalizeSort()
    await http.put(`/papers/${selectedPaperId.value}/questions`, {
      items: questions.value.map(q => ({ question_id: q.question_id, question_sort: q.question_sort, question_score: q.question_score }))
    })
    message.success('已保存题目顺序/分值')
    await loadPaperDetail(selectedPaperId.value)
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}

const paperForm = reactive({
  paper_name: '',
  paper_desc: '',
  exam_duration: null,
  is_closed_book: null
})

async function savePaper() {
  if (!selectedPaperId.value) return
  try {
    await http.put(`/papers/${selectedPaperId.value}`, { ...paperForm })
    message.success('已保存')
    await loadPaperDetail(selectedPaperId.value)
    await loadMyPapers()
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}

const wrongLoading = ref(false)
const wrongItems = ref([])

async function loadWrongQuestions() {
  wrongLoading.value = true
  try {
    const resp = await http.get('/practice/wrong-questions', { params: { page: 1, page_size: 10 } })
    wrongItems.value = resp.data.items || []
  } catch {} finally {
    wrongLoading.value = false
  }
}

onMounted(async () => {
  await loadMe()
  try {
    await loadDicts()
  } catch {}
  await loadMyQuestions()
  await loadPaperTextbooks()
  await loadMyPapers()
  await loadWrongQuestions()
  loadCaptcha()
})

onUnmounted(() => {
  if (securityTimer) clearInterval(securityTimer)
})
</script>

<template>
  <div class="page">
    <n-card>
      <div class="profileHeader">
        <div class="profileLeft">
          <div class="avatarColumn">
            <img v-if="avatarSrc" :src="avatarSrc" class="profileAvatar" />
            <div style="display:flex;flex-direction:column;gap:8px;">
              <n-button size="small" round class="editProfileBtn" @click="openEdit">编辑资料</n-button>
              <n-button size="small" round type="warning" ghost @click="openSecurity">
                <template #icon><n-icon><ShieldCheckmarkOutline /></n-icon></template>
                安全设置
              </n-button>
            </div>
          </div>
          <div class="profileInfo">
            <div class="profileName">{{ userInfo.name }}</div>
            <div class="profileMeta">
              <span v-if="userInfo.email" style="margin-right: 8px">{{ userInfo.email }}</span>
              <span v-if="userInfo.Identity">{{ userInfo.Identity }}</span>
              <span v-if="userInfo.Identity && userInfo.School" class="dot">·</span>
              <span v-if="userInfo.School">{{ userInfo.School }}</span>
            </div>
            <div class="profileIntro" v-if="userInfo.Introduction">{{ userInfo.Introduction }}</div>
          </div>
        </div>
        <div class="invitePanel">
          <div class="inviteLabel">邀请码</div>
          <div class="inviteCodeRow">
            <span class="inviteCode">{{ userInfo.invitationCode || '--' }}</span>
            <n-button
              quaternary
              circle
              size="small"
              class="inviteCopyBtn"
              :disabled="!userInfo.invitationCode"
              @click="copyInviteCode"
              aria-label="复制邀请码"
            >
              <template #icon><n-icon><CopyOutline /></n-icon></template>
            </n-button>
          </div>
        </div>
      </div>
    </n-card>
    <n-modal v-model:show="editDialog.visible" preset="card" title="编辑资料" style="width: 520px">
      <n-form label-placement="left" label-width="80px">
        <n-form-item label="头像">
          <div style="display:flex;align-items:center;gap:10px;">
            <img v-if="editDialog.form.img" :src="'data:image/png;base64,' + editDialog.form.img" class="profileAvatar" />
            <n-upload :show-file-list="false" accept="image/*" :custom-request="onAvatarUpload">
              <n-button round>上传头像</n-button>
            </n-upload>
          </div>
        </n-form-item>
        <n-form-item label="身份">
          <n-input v-model:value="editDialog.form.Identity" placeholder="身份" />
        </n-form-item>
        <n-form-item label="学校">
          <n-input v-model:value="editDialog.form.School" placeholder="学校" />
        </n-form-item>
        <n-form-item label="简介">
          <n-input v-model:value="editDialog.form.Introduction" type="textarea" :rows="4" placeholder="简介" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <n-button round @click="editDialog.visible = false">取消</n-button>
          <n-button round type="primary" @click="submitEdit">保存</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="securityDialog.visible" preset="card" title="安全设置" style="width: 480px">
      <n-tabs v-model:value="securityDialog.tab" type="segment" animated>
        <n-tab-pane name="password" tab="修改密码">
          <n-form label-placement="left" label-width="80px" style="margin-top: 16px">
            <n-form-item label="原密码">
              <n-input v-model:value="securityDialog.oldPassword" type="password" show-password-on="click" placeholder="请输入原密码" />
            </n-form-item>
            <n-form-item label="新密码">
              <n-input v-model:value="securityDialog.newPassword" type="password" show-password-on="click" placeholder="请输入新密码" />
            </n-form-item>
            <n-form-item label="确认密码">
              <n-input v-model:value="securityDialog.confirmPassword" type="password" show-password-on="click" placeholder="请再次输入新密码" />
            </n-form-item>
            <n-form-item label="验证码">
              <div class="captcha-row">
                <n-input v-model:value="securityDialog.captchaText" placeholder="图片验证码">
                  <template #prefix><n-icon><KeyOutline /></n-icon></template>
                </n-input>
                <div class="captcha-box" @click="loadCaptcha">
                  <img v-if="captcha.image" :src="captcha.image" alt="captcha" />
                  <span v-else>加载中</span>
                </div>
              </div>
            </n-form-item>
            <n-form-item label="邮箱验证">
              <div class="captcha-row" style="align-items: flex-start">
                <div style="display:flex; gap: 10px; flex: 1; align-items: center">
                   <n-input v-model:value="securityDialog.emailCode" placeholder="6位验证码">
                      <template #prefix><n-icon><KeyOutline /></n-icon></template>
                   </n-input>
                   <n-button round :disabled="securityDialog.countdown > 0 || securityDialog.sending" @click="sendSecurityCode" style="width: 120px; white-space: nowrap">
                      <template #icon v-if="!securityDialog.countdown && !securityDialog.sending">
                          <n-icon><PaperPlaneOutline /></n-icon>
                      </template>
                      {{ securityDialog.countdown > 0 ? `${securityDialog.countdown}s` : (securityDialog.sending ? '发送中' : '发送验证码') }}
                   </n-button>
                </div>
                <div style="font-size: 12px; color: #999; margin-left: 10px; width: 140px; line-height: 1.5; margin-top: 6px">验证码将发送至当前绑定邮箱：{{ userInfo.email || '未绑定' }}</div>
              </div>
            </n-form-item>
          </n-form>
        </n-tab-pane>
        <n-tab-pane name="email" tab="修改邮箱">
          <n-form label-placement="left" label-width="80px" style="margin-top: 16px">
            <template v-if="securityDialog.step === 1">
              <div style="margin-bottom: 16px; color: #666; font-size: 14px">第一步：验证原邮箱</div>
              <n-form-item label="验证码">
                <div class="captcha-row">
                  <n-input v-model:value="securityDialog.captchaText" placeholder="图片验证码">
                    <template #prefix><n-icon><KeyOutline /></n-icon></template>
                  </n-input>
                  <div class="captcha-box" @click="loadCaptcha">
                    <img v-if="captcha.image" :src="captcha.image" alt="captcha" />
                    <span v-else>加载中</span>
                  </div>
                </div>
              </n-form-item>
              <n-form-item label="邮箱验证">
                <div class="captcha-row" style="align-items: flex-start">
                  <div style="display:flex; gap: 10px; flex: 1; align-items: center">
                     <n-input v-model:value="securityDialog.emailCode" placeholder="6位验证码">
                        <template #prefix><n-icon><KeyOutline /></n-icon></template>
                     </n-input>
                     <n-button round :disabled="securityDialog.countdown > 0 || securityDialog.sending" @click="sendSecurityCode" style="width: 120px; white-space: nowrap">
                        <template #icon v-if="!securityDialog.countdown && !securityDialog.sending">
                            <n-icon><PaperPlaneOutline /></n-icon>
                        </template>
                        {{ securityDialog.countdown > 0 ? `${securityDialog.countdown}s` : (securityDialog.sending ? '发送中' : '发送验证码') }}
                     </n-button>
                  </div>
                  <div style="font-size: 12px; color: #999; margin-left: 10px; width: 140px; line-height: 1.5; margin-top: 6px">验证码将发送至<b>原邮箱</b>进行验证</div>
                </div>
              </n-form-item>
            </template>
            <template v-else>
              <div style="margin-bottom: 16px; color: #666; font-size: 14px">第二步：绑定新邮箱</div>
              <n-form-item label="新邮箱">
                <n-input v-model:value="securityDialog.newEmail" placeholder="请输入新邮箱地址" />
              </n-form-item>
              <n-form-item label="验证码">
                <div class="captcha-row">
                  <n-input v-model:value="securityDialog.captchaText" placeholder="图片验证码">
                    <template #prefix><n-icon><KeyOutline /></n-icon></template>
                  </n-input>
                  <div class="captcha-box" @click="loadCaptcha">
                    <img v-if="captcha.image" :src="captcha.image" alt="captcha" />
                    <span v-else>加载中</span>
                  </div>
                </div>
              </n-form-item>
              <n-form-item label="邮箱验证">
                <div class="captcha-row" style="align-items: flex-start">
                  <div style="display:flex; gap: 10px; flex: 1; align-items: center">
                     <n-input v-model:value="securityDialog.emailCode" placeholder="6位验证码">
                        <template #prefix><n-icon><KeyOutline /></n-icon></template>
                     </n-input>
                     <n-button round :disabled="securityDialog.countdown > 0 || securityDialog.sending" @click="sendSecurityCode" style="width: 120px; white-space: nowrap">
                        <template #icon v-if="!securityDialog.countdown && !securityDialog.sending">
                            <n-icon><PaperPlaneOutline /></n-icon>
                        </template>
                        {{ securityDialog.countdown > 0 ? `${securityDialog.countdown}s` : (securityDialog.sending ? '发送中' : '发送验证码') }}
                     </n-button>
                  </div>
                  <div style="font-size: 12px; color: #999; margin-left: 10px; width: 140px; line-height: 1.5; margin-top: 6px">验证码将发送至<b>新邮箱</b>进行验证</div>
                </div>
              </n-form-item>
            </template>
          </n-form>
        </n-tab-pane>
      </n-tabs>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <n-button round @click="securityDialog.visible = false">取消</n-button>
          <n-button round type="primary" @click="submitSecurity">
            {{ securityDialog.tab === 'email' && securityDialog.step === 1 ? '下一步' : '确认修改' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-tabs v-model:value="activeTab" type="line">
      <n-tab-pane name="questions" tab="我审核的题目">
        <n-card>
          <template #header>
            <div class="header">
              <div>题目列表</div>
              <div class="actions">
                <n-button type="error" :disabled="checkedQIds.length === 0" @click="batchDeleteQuestions">
                  <template #icon><n-icon><TrashOutline /></n-icon></template>
                  批量删除
                </n-button>
              </div>
            </div>
          </template>
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
                  <n-input v-model:value="qFilter.q" placeholder="题干/解析" style="width: 200px" clearable @keyup.enter="loadMyQuestions" />
                </div>
              </div>

              <div class="filter-row">
                <div class="filter-label">题目ID</div>
                <div class="filter-content">
                  <n-input v-model:value="qFilter.question_id" placeholder="输入题目ID（多个用逗号分隔）" style="width: 200px" clearable @keyup.enter="loadMyQuestions" />
                </div>
              </div>

              <div class="filter-row">
                <div class="filter-label">科目</div>
                <div class="filter-content filter-tags">
                  <n-tag
                    v-for="s in subjects"
                    :key="s.subject_id"
                    :bordered="false"
                    :class="['filter-tag', qFilter.subject_id === s.subject_id ? 'tag-selected' : '']"
                    @click="async () => {
                      qFilter.subject_id = qFilter.subject_id === s.subject_id ? null : s.subject_id;
                      qFilter.textbook_id = null;
                      qFilter.chapter_id = [];
                      selectedMainChapters.value = [];
                      await loadTextbooks();
                      await loadMyQuestions()
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
                      :class="['filter-tag', qFilter.textbook_id === t.textbook_id ? 'tag-selected' : '']"
                      @click="async () => {
                        qFilter.textbook_id = qFilter.textbook_id === t.textbook_id ? null : t.textbook_id;
                        qFilter.chapter_id = [];
                        selectedMainChapters.value = [];
                        await loadChapters()
                      await loadMyQuestions()
                      }"
                    >
                      {{ t.textbook_name }}{{ t.author ? ' - ' + t.author : '' }}
                    </n-tag>
                  </template>
                  <span v-else class="empty-hint">{{ qFilter.subject_id ? '暂无教材' : '请先选择科目' }}</span>
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
                  <span v-else class="empty-hint">{{ qFilter.textbook_id ? '暂无章节' : '请先选择教材' }}</span>
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
                          :class="['filter-tag', 'chapter-sub', qFilter.chapter_id.includes(sub.chapter_id) ? 'chapter-sub-selected' : '']"
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
                    :class="['filter-tag', qFilter.type_id.includes(t.type_id) ? 'tag-selected' : '']"
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
                  <n-button size="small" style="margin-left: 12px" @click="loadMyQuestions">
                    <template #icon><n-icon><SearchOutline /></n-icon></template>
                    查询
                  </n-button>
                </div>
              </div>
            </template>
          </div>
          <n-data-table
            :columns="qColumns"
            :data="qData.items"
            :loading="qLoading"
            :row-key="row => row.question_id"
            v-model:checked-row-keys="checkedQIds"
            :max-height="560"
          />
          <div class="pager">
            <n-pagination
              v-model:page="qFilter.page"
              v-model:page-size="qFilter.page_size"
              :item-count="qData.total"
              :page-sizes="[10,20,50,100]"
              show-size-picker
              @update:page="loadMyQuestions"
              @update:page-size="() => { qFilter.page = 1; loadMyQuestions() }"
            />
          </div>
        </n-card>

        <n-modal v-model:show="qDialog.visible" preset="card" title="编辑题目" style="width: 720px">
          <n-form label-placement="left" label-width="90px">
            <n-form-item label="科目">
              <n-select
                v-model:value="qDialog.form.subject_id"
                :options="subjectOptions"
                placeholder="科目"
                filterable
                @update:value="async () => {
                  dialogTextbookId.value = null
                  qDialog.form.chapter_id = null
                  dialogChapterTree.value = []
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
                  qDialog.form.chapter_id = null
                  await loadDialogChapters()
                }"
              />
            </n-form-item>
            <n-form-item label="章节">
              <n-cascader
                v-model:value="qDialog.form.chapter_id"
                :options="dialogChapterCascaderOptions"
                check-strategy="child"
                clearable
                placeholder="章节"
                :disabled="!dialogTextbookId"
              />
            </n-form-item>
            <n-form-item label="题型">
              <n-select v-model:value="qDialog.form.type_id" :options="typeOptions" placeholder="题型" filterable />
            </n-form-item>
            <n-form-item label="难度">
              <n-select v-model:value="qDialog.form.difficulty_id" :options="difficultyOptions" placeholder="难度" filterable />
            </n-form-item>
            <n-form-item label="题干">
              <n-input v-model:value="qDialog.form.question_content" type="textarea" :rows="5" />
            </n-form-item>
            <n-form-item label="答案">
              <n-input v-model:value="qDialog.form.question_answer" type="textarea" :rows="2" />
            </n-form-item>
            <n-form-item label="解析">
              <n-input v-model:value="qDialog.form.question_analysis" type="textarea" :rows="3" />
            </n-form-item>
            <n-form-item label="分值">
              <n-input-number v-model:value="qDialog.form.question_score" :min="0" :step="0.5" style="width: 100%" />
            </n-form-item>
          </n-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
              <n-button @click="qDialog.visible = false">取消</n-button>
              <n-button type="primary" @click="saveQ">保存</n-button>
            </div>
          </template>
        </n-modal>

        <n-modal v-model:show="detailDialog.visible" preset="card" title="题目详情" style="width: 600px">
          <div v-if="detailDialog.item">
            <n-descriptions :column="1" bordered>
              <n-descriptions-item label="题干">
                <div style="white-space: pre-wrap">{{ detailDialog.item.question_content }}</div>
              </n-descriptions-item>
              <n-descriptions-item label="答案">
                <div style="white-space: pre-wrap">{{ detailDialog.item.question_answer }}</div>
              </n-descriptions-item>
              <n-descriptions-item label="解析">
                <div style="white-space: pre-wrap">{{ detailDialog.item.question_analysis }}</div>
              </n-descriptions-item>
            </n-descriptions>
          </div>
          <template #footer>
            <n-button @click="detailDialog.visible = false">关闭</n-button>
          </template>
        </n-modal>
      </n-tab-pane>

      <n-tab-pane name="papers" tab="我审核的试卷">
        <n-card>
          <template #header>
            <div class="header">
              <div>试卷列表</div>
            </div>
          </template>
          <div class="filter-section">
            <div class="filter-section-header filter-section-toggle" @click="paperFilterCollapsed = !paperFilterCollapsed">
              <n-icon size="16" color="#64748b"><FunnelOutline /></n-icon>
              <span>条件筛选</span>
              <n-icon size="16" style="margin-left: 4px;transition:transform 0.2s;" :style="{transform: paperFilterCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}"><CaretDownOutline /></n-icon>
            </div>
            <template v-if="!paperFilterCollapsed">
              <div class="filter-row">
                <div class="filter-label">科目</div>
                <div class="filter-content filter-tags">
                  <n-tag
                    v-for="s in subjects"
                    :key="s.subject_id"
                    :bordered="false"
                    :class="['filter-tag', paperFilter.subject_id === s.subject_id ? 'tag-selected' : '']"
                    @click="async () => {
                      paperFilter.subject_id = paperFilter.subject_id === s.subject_id ? null : s.subject_id;
                      paperFilter.textbook_id = null;
                      await loadPaperTextbooks();
                      await loadMyPapers()
                    }"
                  >
                    {{ s.subject_name }}
                  </n-tag>
                </div>
              </div>

              <div class="filter-row">
                <div class="filter-label">教材</div>
                <div class="filter-content filter-tags">
                  <template v-if="paperTextbooks.length > 0">
                    <n-tag
                      v-for="t in paperTextbooks"
                      :key="t.textbook_id"
                      :bordered="false"
                      :class="['filter-tag', paperFilter.textbook_id === t.textbook_id ? 'tag-selected' : '']"
                      @click="async () => {
                        paperFilter.textbook_id = paperFilter.textbook_id === t.textbook_id ? null : t.textbook_id;
                        await loadMyPapers()
                      }"
                    >
                      {{ t.textbook_name }}{{ t.author ? ' - ' + t.author : '' }}
                    </n-tag>
                  </template>
                  <span v-else class="empty-hint">{{ paperFilter.subject_id ? '暂无教材' : '请先选择科目' }}</span>
                </div>
              </div>
            </template>
          </div>
          <n-data-table
            :columns="tableColumns"
            :data="papers"
            :loading="pLoading"
            :row-key="row => row.paper_id"
            :max-height="620"
          />
        </n-card>

        <n-drawer v-model:show="showPaperDrawer" :width="isDrawerFullscreen ? '100%' : 800" placement="right">
          <n-drawer-content>
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                <span>试卷编辑与导出</span>
                <div class="header-actions">
                  <n-button :disabled="!selectedPaperId || paper?.review_status !== 1" size="small" round @click="showPreview = true">
                    <template #icon><n-icon><EyeOutline /></n-icon></template>
                    导出预览
                  </n-button>
                  <n-button text @click="isDrawerFullscreen = !isDrawerFullscreen">
                    <template #icon><n-icon><ExpandOutline /></n-icon></template>
                  </n-button>
                </div>
              </div>
            </template>

            <div v-if="paper" class="detail">
              <n-form label-placement="left" label-width="90px" class="paperForm">
                <n-form-item label="试卷名称">
                  <n-input v-model:value="paperForm.paper_name" />
                </n-form-item>
                <n-form-item label="考试时长">
                  <n-input-number v-model:value="paperForm.exam_duration" :min="0" style="width: 100%" />
                </n-form-item>
                <n-form-item label="描述">
                  <n-input v-model:value="paperForm.paper_desc" type="textarea" :rows="3" />
                </n-form-item>
              </n-form>
              <div class="inlineActions">
                <n-button type="primary" round @click="savePaper">
                  <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
                  保存试卷信息
                </n-button>
              </div>

              <n-divider />

              <div class="inlineActions">
                <div class="subTitle">
                  题目顺序与分值
                  <span class="drag-hint">
                    <n-icon><ReorderFourOutline /></n-icon>
                    可拖动调整顺序
                  </span>
                </div>
                <n-button type="primary" round @click="saveQuestions">
                  <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
                  保存顺序/分值
                </n-button>
              </div>
              <div class="question-list">
                <div v-for="(q, index) in questions" :key="q.question_id" class="question-card">
                  <div class="q-main">
                    <div class="q-content">
                      <span class="q-id">#{{ q.question_id }}</span>
                      {{ q.question_content }}
                    </div>
                  </div>
                  <div class="q-controls">
                    <div class="control-item">
                      <span class="label">序号</span>
                      <n-input-number v-model:value="q.question_sort" :min="1" size="small" style="width: 100px" />
                    </div>
                    <div class="control-item">
                      <span class="label">分值</span>
                      <n-input-number v-model:value="q.question_score" :min="0" :step="0.5" size="small" style="width: 100px" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-drawer-content>
        </n-drawer>

        <ExportPreview v-model:visible="showPreview" :paper="paper" :questions="questions" />
      </n-tab-pane>

      <n-tab-pane name="wrong" tab="我的错题本">
        <n-card>
          <template #header>
            <div class="header">
              <div>错题列表</div>
              <div class="actions">
                <n-button type="primary" @click="$router.push('/wrong-questions')">查看完整错题本</n-button>
              </div>
            </div>
          </template>
          <div v-if="wrongLoading" style="text-align: center; padding: 40px;">
            <n-spin />
          </div>
          <div v-else-if="wrongItems.length === 0" style="text-align: center; padding: 40px; color: var(--n-text-color-3);">
            暂无错题
          </div>
          <div v-else>
            <div v-for="item in wrongItems" :key="item.wrong_id" style="padding: 12px; border: 1px solid var(--n-border-color); border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #d03050;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <n-tag size="small" :bordered="false">{{ item.type_name }}</n-tag>
                <span style="font-size: 13px; color: var(--n-text-color-3);">{{ item.user_score }}/{{ item.question_score }}分</span>
              </div>
              <div style="font-size: 14px; line-height: 1.5; margin-bottom: 6px; max-height: 60px; overflow: hidden;">{{ item.question_content }}</div>
              <div style="font-size: 13px;">
                <span style="color: #d03050;">你的答案：{{ item.user_answer }}</span> &nbsp;
                <span style="color: #18a058;">正确答案：{{ item.correct_answer }}</span>
              </div>
              <div v-if="item.error_reason" style="font-size: 12px; color: var(--n-text-color-3); margin-top: 4px;">
                原因：{{ item.error_reason }}
              </div>
            </div>
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.profileHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.profileLeft { display: flex; align-items: center; gap: 16px; }
.avatarColumn { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.editProfileBtn {
  border: 1px solid var(--n-border-color);
  padding: 4px 12px;
}
.profileAvatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--n-border-color);
}
.profileInfo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.profileName {
  font-size: 18px;
  font-weight: 700;
}
.profileMeta {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.dot {
  margin: 0 6px;
}
.profileIntro {
  font-size: 13px;
  color: var(--n-text-color-2);
}
.invitePanel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: center;
  gap: 8px;
  min-width: 220px;
  margin-left: auto;
  padding-right: 40px;
}
.inviteLabel {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.inviteCodeRow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 5px 7px 5px 16px;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background: var(--n-color-embedded);
}
.inviteCode {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26px;
  font-weight: 800;
  color: #18a058;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
.inviteCopyBtn {
  flex: 0 0 auto;
}
@media (max-width: 720px) {
  .profileHeader {
    align-items: flex-start;
    flex-direction: column;
  }
  .invitePanel {
    align-items: flex-start;
    width: 100%;
    min-width: 0;
    padding-right: 0;
  }
  .inviteCodeRow {
    max-width: 100%;
  }
  .inviteCode {
    max-width: min(220px, calc(100vw - 132px));
  }
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}
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
.detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question-card {
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  padding: 10px;
  background-color: var(--n-card-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.q-main { flex: 1; }
.q-content { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.q-id { font-weight: bold; color: var(--n-primary-color); margin-right: 5px; }
.q-controls { display: flex; gap: 20px; align-items: center; padding: 8px; border-radius: 4px; }
.control-item { display: flex; align-items: center; gap: 8px; }
.label { font-size: 12px; color: var(--n-text-color-3); }
.inlineActions { display: flex; align-items: center; justify-content: space-between; }
.subTitle { font-weight: 600; display: flex; align-items: center; }
.drag-hint { font-size: 12px; font-weight: normal; color: var(--n-text-color-3); margin-left: 12px; display: inline-flex; align-items: center; gap: 4px; }
</style>
