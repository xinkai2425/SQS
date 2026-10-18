<script setup>
import { computed, ref, watch, nextTick, reactive } from 'vue'
import { useMessage } from 'naive-ui'
import { DownloadOutline, PrintOutline, DocumentOutline, ShareSocialOutline, CopyOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import MathRenderer from './MathRenderer.vue'

const message = useMessage()

const props = defineProps({
  visible: Boolean,
  paper: Object,
  questions: Array,
})

const showAnswers = ref(false)
const paperSize = ref('A4')
const pages = ref([])
const isCalculating = ref(false)
const measureRef = ref(null)
const editableQuestions = ref([])
const layoutTimer = ref(null)
const editDrawerVisible = ref(false)
const typeDict = ref([])
const headerSchool = ref('河南大学')
const sectionCount = ref(0)
const generatedBlocks = ref([])
const headerForm = ref({
  useOverride: false,
  school: '',
  startYear: null,
  endYear: null,
  termText: '',
  paperName: '',
  volume: 'A 卷',
  examStyle: '',
  duration: null,
  total: null
})

// Share Dialog
const shareDialog = reactive({
  visible: false,
  email: '',
  fileType: 'word',
  subject: '',
  message: '',
  shareLink: '',
  loading: false
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// MM to PX conversion (approximate for screen, but we rely on offsetHeight)
const MM_TO_PX = 3.78

function getPageDimensions() {
  if (paperSize.value === 'A3') {
    // A3 Landscape: Height 297mm, Padding 15mm
    // Content Height = 297 - 30 = 267mm
    return {
      totalHeight: 267 * MM_TO_PX, // ~1009px
      colCount: 2
    }
  } else {
    // A4 Portrait: Height 297mm, Padding 25.4mm
    // Content Height = 297 - 50.8 = 246.2mm
    return {
      totalHeight: 246.2 * MM_TO_PX, // ~930px
      colCount: 1
    }
  }
}

function toChineseNumber(n) {
  const map = ['零','一','二','三','四','五','六','七','八','九','十']
  if (n <= 10) return map[n]
  if (n < 20) return '十' + map[n - 10]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return map[tens] + '十' + (ones ? map[ones] : '')
}

function computeAcademicHeader() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  // 第一学期：9-12月与1月；第二学期：2-8月
  const isFirstTerm = (m >= 9) || (m === 1)
  const startYear = (m >= 9) ? y : y - 1
  const endYear = startYear + 1
  const termText = isFirstTerm ? '第一学期' : '第二学期'
  const school = headerSchool.value || '河南大学'
  const titleLine1 = `${school} ${startYear}～${endYear} 学年${termText}期末考试`
  const paperTitle = `《${(props.paper?.paper_name || '试卷').replace(/\s+/g, '')}》 试卷 A 卷`
  const examStyle = props.paper?.is_closed_book ? '闭卷' : '开卷'
  const duration = props.paper?.exam_duration || 0
  const total = props.paper?.total_score || 0
  const metaLine = `考试方式：${examStyle}　考试时间：${duration} 分钟　卷面总分：${total} 分`
  return { titleLine1, paperTitle, metaLine }
}

async function loadHeaderSchool() {
  // Always use "河南大学" as default, do not override from user profile
  headerSchool.value = "河南大学"
}

function initHeaderFormFromDefault() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const isFirstTerm = (m >= 9) || (m === 1)
  const startYear = (m >= 9) ? y : y - 1
  const endYear = startYear + 1
  headerForm.value.school = headerSchool.value
  headerForm.value.startYear = startYear
  headerForm.value.endYear = endYear
  headerForm.value.termText = isFirstTerm ? '第一学期' : '第二学期'
  headerForm.value.paperName = (props.paper?.paper_name || '试卷').replace(/\s+/g, '')
  headerForm.value.volume = 'A 卷'
  headerForm.value.examStyle = props.paper?.is_closed_book ? '闭卷' : '开卷'
  headerForm.value.duration = props.paper?.exam_duration || 0
  headerForm.value.total = props.paper?.total_score || 0
}

const headerDisplay = computed(() => {
  if (headerForm.value.useOverride) {
    const s = headerForm.value
    const titleLine1 = `${s.school || headerSchool.value} ${s.startYear}～${s.endYear} 学年${s.termText}期末考试`
    const paperTitle = `《${s.paperName || (props.paper?.paper_name || '试卷').replace(/\s+/g, '')}》 试卷 ${s.volume || 'A 卷'}`
    const metaLine = `考试方式：${s.examStyle || (props.paper?.is_closed_book ? '闭卷' : '开卷')}　考试时间：${s.duration ?? props.paper?.exam_duration ?? 0} 分钟　卷面总分：${s.total ?? props.paper?.total_score ?? 0} 分`
    return { titleLine1, paperTitle, metaLine }
  }
  // 默认自动
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const isFirstTerm = (m >= 9) || (m === 1)
  const startYear = (m >= 9) ? y : y - 1
  const endYear = startYear + 1
  const termText = isFirstTerm ? '第一学期' : '第二学期'
  const titleLine1 = `${headerSchool.value} ${startYear}～${endYear} 学年${termText}期末考试`
  const paperTitle = `《${(props.paper?.paper_name || '试卷').replace(/\s+/g, '')}》 试卷 A 卷`
  const metaLine = `考试方式：${props.paper?.is_closed_book ? '闭卷' : '开卷'}　考试时间：${props.paper?.exam_duration || 0} 分钟　卷面总分：${props.paper?.total_score || 0} 分`
  return { titleLine1, paperTitle, metaLine }
})
function typeNameOf(q) {
  const id = q.type_id
  const found = typeDict.value.find(t => t.type_id === id)
  return found ? found.type_name : '其他题型'
}

async function calculateLayout() {
  if (!props.visible) return
  isCalculating.value = true
  pages.value = []

  await nextTick()

  const container = measureRef.value
  if (!container) {
    isCalculating.value = false
    return
  }

  // 1. Determine Layout Constants (in Pixels)
  // We use a temporary ruler to get accurate mm->px conversion for current screen
  container.style.cssText = 'position:absolute; visibility:hidden; height:297mm; width:210mm; padding:0; border:none; margin:0;'
  const height297mm = container.offsetHeight

  // A4 Constants
  // Padding 25.4mm (1 inch)
  container.style.height = '25.4mm'
  const paddingA4 = container.offsetHeight
  const contentHeightA4 = height297mm - (paddingA4 * 2)
  const contentWidthA4 = container.offsetWidth - (paddingA4 * 2) // Approx, strictly we need width check

  // A3 Constants
  // Padding 15mm
  container.style.height = '15mm'
  const paddingA3 = container.offsetHeight
  const contentHeightA3 = height297mm - (paddingA3 * 2) // A3 landscape height is 297mm
  // Width: A3 is 420mm wide.
  container.style.width = '420mm'
  const width420mm = container.offsetWidth
  const fullContentWidthA3 = width420mm - (paddingA3 * 2)
  // Columns: Gap 30px
  const gap30px = 30 // CSS px
  const colWidthA3 = (fullContentWidthA3 - gap30px) / 2

  // Clear container styles for measurement
  container.style.cssText = 'position:absolute; visibility:hidden; top:-9999px; left:-9999px;'
  container.className = 'paper-content' // Keep base class for font styles

  // CRITICAL FIX: The class .paper-content has fixed height: 297mm in CSS.
  // We MUST override this to 'auto' to measure the natural height of content.
  // Also reset columns to avoid multi-column rendering during measurement.
  // CRITICAL FIX 2: We must also reset PADDING.
  // The .paper-content class has padding (25.4mm or 15mm).
  // When we set width = colWidth, if padding is present, the inner content width becomes (colWidth - padding*2).
  // This causes text to wrap excessively, making elements much taller than they really are in the column.
  const resetMeasureStyle = () => {
    container.style.height = 'auto'
    container.style.minHeight = '0'
    container.style.maxHeight = 'none'
    container.style.columnCount = 'auto'
    container.style.overflow = 'visible'
    container.style.padding = '0'
    container.style.border = 'none'
    container.style.margin = '0'
  }

  // 2. Measure Header
  // Build blocks first to know section count
  const questions = editableQuestions.value || []
  
  // Group questions by type but KEEP their original relative order
  // Actually, standard paper format usually groups by type.
  // BUT the user requirement is "Order should match the image shown" (which implies user-defined order).
  // If the user manually reordered questions in PapersManagePage, that order is in `props.questions`.
  // We should respect that order primarily.
  // HOWEVER, standard exam papers ARE grouped by type (Section I: Choice, Section II: Fill...).
  // If we just dump them in user-order, we might have mixed types which is weird for "Section Titles".
  // Let's check if we should group or just follow list.
  // If we follow list, we can insert "Section Headers" whenever the type changes.
  
  const blocks = []
  let currentTypeId = null
  let sectionIndex = 0
  
  for (const q of questions) {
      if (q.type_id !== currentTypeId) {
          currentTypeId = q.type_id
          sectionIndex++
          const title = `${toChineseNumber(sectionIndex)}、${typeNameOf(q)}`
          blocks.push({ kind: 'section', title })
      }
      blocks.push({ kind: 'question', data: q })
  }
  
  sectionCount.value = sectionIndex

  const getHeaderLinesHtml = () => {
    const h = headerDisplay.value
    return `
      <div class="header-block">
        <h1 class="header-line1" style="text-align:center;margin-bottom:12px;">${h.titleLine1}</h1>
        <h2 class="header-line2" style="text-align:center;margin-bottom:12px;">${h.paperTitle}</h2>
        <p class="paper-meta" style="margin-bottom: 12px; text-align: center;">${h.metaLine}</p>
      </div>
    `
  }
  const getScoreTableHtml = () => {
    const cols = Array.from({ length: sectionCount.value }, (_, i) => toChineseNumber(i + 1)).map(c => `<th class="score-th">${c}</th>`).join('')
    return `
      <div class="score-wrap">
        <table class="score-table">
          <tr>
            <th class="score-th">题号</th>
            ${cols}
            <th class="score-th">总成绩</th>
            <th class="score-th">合分人</th>
          </tr>
          <tr>
            <td class="score-td">得 分</td>
            ${Array.from({ length: sectionCount.value }).map(() => '<td class="score-td"></td>').join('')}
            <td class="score-td"></td>
            <td class="score-td"></td>
          </tr>
        </table>
      </div>
    `
  }

  // Measure header lines (left column only for A3)
  resetMeasureStyle()
  container.innerHTML = getHeaderLinesHtml()
  if (paperSize.value === 'A3') {
    container.style.width = colWidthA3 + 'px'
  } else {
    container.style.width = contentWidthA4 + 'px'
  }
  const headerHeight = container.offsetHeight

  // 3. Build blocks: section titles + questions grouped by type
  // Already built above in step 2
  generatedBlocks.value = blocks
  const blockHeights = []

  // Set container to Column Width for measuring questions
  resetMeasureStyle()
  if (paperSize.value === 'A3') {
    container.style.width = colWidthA3 + 'px'
  } else {
    container.style.width = contentWidthA4 + 'px'
  }

  for (let b of blocks) {
    if (b.kind === 'section') {
      // Measure section title; in final render it spans columns, so use full width
      resetMeasureStyle()
      if (paperSize.value === 'A3') {
        container.style.width = fullContentWidthA3 + 'px'
      } else {
        container.style.width = contentWidthA4 + 'px'
      }
      container.innerHTML = `<h2 class="section-title">${b.title}</h2>`
      const child = container.firstElementChild
      const style = window.getComputedStyle(child)
      const mt = parseFloat(style.marginTop) || 0
      const mb = parseFloat(style.marginBottom) || 0
      blockHeights.push(child.offsetHeight + mt + mb)
      // Reset width back to column for next items
      resetMeasureStyle()
      if (paperSize.value === 'A3') container.style.width = colWidthA3 + 'px'
      else container.style.width = contentWidthA4 + 'px'
    } else {
      const q = b.data
      container.innerHTML = `
        <div class="q-item" style="margin-bottom: 15px;">
          <p class="q-title">
            <strong>${q.question_sort}. </strong>
            ${q.question_score ? `<span>（${q.question_score}分）</span>` : ''}
          </p>
          <div class="q-content">${formatQuestionContent(q.question_content)}</div>
          ${showAnswers.value ? `
            <div class="q-answer-section" style="margin-top: 8px; padding: 10px;">
              ${q.question_answer ? `<p><strong>答案：</strong>${q.question_answer}</p>` : ''}
              ${q.question_analysis ? `<p><strong>解析：</strong>${q.question_analysis}</p>` : ''}
            </div>
          ` : ''}
        </div>
      `
      const child = container.firstElementChild
      const style = window.getComputedStyle(child)
      const mt = parseFloat(style.marginTop) || 0
      const mb = parseFloat(style.marginBottom) || 0
      blockHeights.push(child.offsetHeight + mt + mb)
    }
  }

  // 4. Simulate Pagination (Column Filling)
  const isA3Mode = paperSize.value === 'A3'
  const maxColHeight = isA3Mode ? contentHeightA3 : contentHeightA4
  const maxColsPerPage = isA3Mode ? 2 : 1

  // Safety buffer (e.g. 5px) to avoid rounding issues causing overflow
  const SAFETY = 5

  let currentPages = []
  let currentPageQuestions = []
  let colsUsedOnPage = 0 // 0-indexed (0 = 1st col)
  let currentColHeight = 0
  let pageIndex = 0

  // Initialize Page 1
  // Page 1 has header
  // Header "consumes" vertical space from ALL columns on the first page?
  // In `column-span: all`, the element sits at the top, and columns start below it.
  // So the effective height of columns on Page 1 is `maxColHeight - headerHeight`.

  const availableHeightFor = (pIdx, cIdx) => {
    if (isA3Mode) {
      // A3: Header only occupies first page's LEFT column
      return (pIdx === 0 && cIdx === 0) ? (maxColHeight - headerHeight - SAFETY) : (maxColHeight - SAFETY)
    } else {
      // A4: single column, header reduces first page column
      return (pIdx === 0) ? (maxColHeight - headerHeight - SAFETY) : (maxColHeight - SAFETY)
    }
  }
  let availableHeightOnPage = availableHeightFor(pageIndex, colsUsedOnPage)
  // If header is huge, it might take whole page, but let's assume it fits.
  if (availableHeightOnPage < 0) availableHeightOnPage = 0

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const h = blockHeights[i]

    // Check if fits in current column
    if (currentColHeight + h <= availableHeightOnPage) {
      // Fits
      currentPageQuestions.push(b)
      currentColHeight += h
    } else {
      // Does not fit in current column.
      // Move to next column?
      colsUsedOnPage++

      if (colsUsedOnPage < maxColsPerPage) {
        // We have another column on this page
        // Reset column height
        currentColHeight = 0
        availableHeightOnPage = availableHeightFor(pageIndex, colsUsedOnPage)
        // Now add question to this new column
        // Does it fit in a fresh column?
        if (h <= availableHeightOnPage) {
          currentPageQuestions.push(b)
          currentColHeight += h
        } else {
          // Question is taller than the entire column space available!
          // Edge case. We must put it here anyway or it will never fit anywhere.
          // Or if it's Page 1 and space is small due to header, maybe move to Page 2?
          if (availableHeightOnPage < maxColHeight && h <= maxColHeight - SAFETY) {
            // It would fit on a full page (Page 2).
            // So skip the rest of Page 1 columns and go to Page 2.
            // Force new page
            currentPages.push({questions: currentPageQuestions, hasHeader: currentPages.length === 0})
            currentPageQuestions = [b]
            colsUsedOnPage = 0
            currentColHeight = h
            availableHeightOnPage = maxColHeight - SAFETY // Page 2 full height
          } else {
            // It's just huge. Put it here.
            currentPageQuestions.push(b)
            currentColHeight += h
          }
        }
      } else {
        // No more columns on this page.
        // Push Page
        currentPages.push({questions: currentPageQuestions, hasHeader: currentPages.length === 0})

        // Start New Page
        currentPages[currentPages.length - 1] && (currentPages[currentPages.length - 1].hasHeader = currentPages.length - 1 === 0)
        currentPageQuestions = [b]
        colsUsedOnPage = 0
        currentColHeight = h
        pageIndex += 1
        availableHeightOnPage = availableHeightFor(pageIndex, colsUsedOnPage)
      }
    }
  }

  // Push final page
  if (currentPageQuestions.length > 0) {
    currentPages.push({questions: currentPageQuestions, hasHeader: currentPages.length === 0})
  }

  pages.value = currentPages
  isCalculating.value = false
}

function initEditableQuestions() {
  const source = props.questions || []
  editableQuestions.value = source.map((q) => ({
    ...q
  }))
}

function scheduleLayout() {
  if (layoutTimer.value) {
    clearTimeout(layoutTimer.value)
  }
  layoutTimer.value = setTimeout(() => {
    calculateLayout()
  }, 120)
}

watch([() => props.visible, () => props.questions, paperSize, showAnswers], async () => {
  if (props.visible) {
    // Load question types for section titles
    try {
      const r = await http.get('/dicts/question-types')
      typeDict.value = r.data.items || []
    } catch (e) {
      typeDict.value = []
    }
    loadHeaderSchool()
    initHeaderFormFromDefault()
    initEditableQuestions()
    calculateLayout()
  }
}, {immediate: true})

watch(editableQuestions, () => {
  if (props.visible) {
    scheduleLayout()
  }
}, {deep: true})

async function doExportWord() {
  try {
    const resp = await http.post(`/papers/${props.paper.paper_id}/export/word`, {
      paper_size: 'A4',
      include_answer: showAnswers.value,
      blocks: generatedBlocks.value,
      header_override: headerForm.value.useOverride ? headerForm.value : null
    }, {
      responseType: 'blob'
    })

    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })

    const downloadName = props.paper?.paper_name ? `${props.paper.paper_name}.docx` : 'paper_export.docx'
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e) {
    console.error(e)
    let msg = e?.message || '未知错误'
    if (msg === 'Network Error') {
        msg = '网络错误，请检查后端服务是否正常运行，或 Word 是否被其他程序占用'
    } else if (e.response && e.response.data && e.response.data.error) {
        msg = e.response.data.error.message || msg
    }
    message.error('导出失败: ' + msg)
  }
}

async function doExportPdf() {
  if (!props.paper || !props.paper.paper_id) {
    message.error('试卷ID缺失，无法导出')
    console.error('Export PDF failed: paper_id is missing', props.paper)
    return
  }
  
  try {
    console.log('Exporting PDF for paper:', props.paper.paper_id)
    const resp = await http.post(`/papers/${props.paper.paper_id}/export/pdf`, {
      paper_size: 'A4',
      include_answer: showAnswers.value,
      blocks: generatedBlocks.value,
      header_override: headerForm.value.useOverride ? headerForm.value : null
    }, {
      responseType: 'blob'
    })

    const blob = new Blob([resp.data], {
      type: 'application/pdf'
    })

    const downloadName = props.paper?.paper_name ? `${props.paper.paper_name}.pdf` : 'paper_export.pdf'
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e) {
    console.error(e)
    let msg = e?.message || '未知错误'
    if (msg === 'Network Error') {
        msg = '网络错误，请检查后端服务是否正常运行，或 Word 是否被其他程序占用'
    } else if (e.response) {
        if (e.response.status === 404) {
             msg = '请求的资源不存在 (404)，请检查试卷ID是否正确'
        } else if (e.response.data) {
             // Try to parse blob if responseType is blob
             if (e.response.data instanceof Blob) {
                 try {
                    const text = await e.response.data.text()
                    const json = JSON.parse(text)
                    if (json.error) msg = json.error.message
                 } catch (err) {
                    // ignore
                 }
             } else if (e.response.data.error) {
                 msg = e.response.data.error.message || msg
             }
        }
    }
    message.error('导出失败: ' + msg)
  }
}

async function doShareEmail() {
  if (!shareDialog.email) {
    message.warning('请输入收件人邮箱')
    return
  }
  
  shareDialog.loading = true
  try {
    await http.post(`/papers/${props.paper.paper_id}/share/email`, {
      email: shareDialog.email,
      file_type: shareDialog.fileType,
      include_answer: showAnswers.value,
      blocks: generatedBlocks.value,
      header_override: headerForm.value.useOverride ? headerForm.value : null,
      subject: shareDialog.subject || `试卷分享：${props.paper?.paper_name}`,
      message: shareDialog.message
    })
    message.success('邮件发送成功')
    shareDialog.visible = false
  } catch (e) {
    console.error(e)
    message.error('发送失败: ' + (e?.message || '未知错误'))
  } finally {
    shareDialog.loading = false
  }
}

async function copyShareLink() {
  if (!shareDialog.shareLink) return
  try {
    await navigator.clipboard.writeText(shareDialog.shareLink)
    message.success('链接已复制')
  } catch {
    message.error('复制失败')
  }
}

function openShareDialog() {
  shareDialog.email = ''
  shareDialog.fileType = 'word'
  shareDialog.subject = `试卷分享：${props.paper?.paper_name || '未命名试卷'}`
  shareDialog.message = ''
  // Use public download endpoint
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
  const downloadUrl = `${baseUrl}/papers/${props.paper?.paper_id}/public/download?type=${shareDialog.fileType}`
  shareDialog.shareLink = downloadUrl
  shareDialog.visible = true
}

watch(() => shareDialog.fileType, (val) => {
  if (shareDialog.visible) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    shareDialog.shareLink = `${baseUrl}/papers/${props.paper?.paper_id}/public/download?type=${val}`
  }
})

function formatQuestionContent(content) {
  if (!content) return ''
  const withBreaks = content.replace(/\r?\n/g, '<br>')
  return withBreaks
}
</script>

<template>
  <n-modal
    v-model:show="dialogVisible"
    :mask-closable="false"
    :close-on-esc="false"
    :auto-focus="false"
    class="preview-modal"
  >
    <div class="preview-container">
      <div class="preview-header">
        <div class="header-left">
          <n-icon class="icon">
            <DocumentOutline />
          </n-icon>
          <span class="title">导出预览</span>
        </div>
        <div class="header-right">
          <div class="answer-toggle">
            <n-switch v-model:value="showAnswers" size="small" />
            <span class="toggle-text">{{ showAnswers ? '显示答案/解析' : '隐藏答案/解析' }}</span>
          </div>
          <n-button @click="editDrawerVisible = true">编辑内容</n-button>
          <n-button class="preview-action" @click="doExportWord">
            <template #icon>
              <n-icon><DownloadOutline /></n-icon>
            </template>
            导出 Word
          </n-button>
          <n-button class="preview-action" @click="doExportPdf">
            <template #icon>
              <n-icon><PrintOutline /></n-icon>
            </template>
            导出 PDF (打印)
          </n-button>
          <n-button class="preview-action" @click="openShareDialog">
            <template #icon>
              <n-icon><ShareSocialOutline /></n-icon>
            </template>
            分享
          </n-button>
          <n-button @click="dialogVisible = false" type="primary">关闭</n-button>
        </div>
      </div>

      <div class="preview-wrapper">
        <div ref="measureRef" class="measure-box paper-content" :class="{ 'is-a3': paperSize === 'A3' }"></div>

        <div id="print-area">
          <div
            v-for="(page, index) in pages"
            :key="index"
            class="paper-content page-sheet"
            :class="[{ 'is-a3': paperSize === 'A3' }, { 'is-a3-scale': paperSize === 'A3' }]"
          >
            <template v-if="page.hasHeader">
              <div class="header-block">
                <h1 class="header-line1" style="text-align: center; margin-bottom: 12px;">{{ headerDisplay.titleLine1 }}</h1>
                <h2 class="header-line2" style="text-align: center; margin-bottom: 12px;">{{ headerDisplay.paperTitle }}</h2>
                <p v-if="paper" class="paper-meta" style="margin-bottom: 12px; text-align: center;">{{ headerDisplay.metaLine }}</p>
              </div>
              <div class="score-wrap">
                <table class="score-table">
                  <tr>
                    <th class="score-th">题号</th>
                    <th v-for="i in sectionCount" :key="'h'+i" class="score-th">{{ toChineseNumber(i) }}</th>
                    <th class="score-th">总成绩</th>
                    <th class="score-th">合分人</th>
                  </tr>
                  <tr>
                    <td class="score-td">得 分</td>
                    <td v-for="i in sectionCount" :key="'b'+i" class="score-td"></td>
                    <td class="score-td"></td>
                    <td class="score-td"></td>
                  </tr>
                </table>
              </div>
            </template>

            <div v-for="(q, index) in page.questions" :key="q.question_id" class="q-item">
              <template v-if="q.kind === 'section'">
                <h2 class="section-title">{{ q.title }}</h2>
              </template>
              <template v-else>
                <div class="q-title">
                  <strong>{{ q.data.question_sort }}. </strong>
                  <span v-if="q.data.question_score">（{{ q.data.question_score }}分）</span>
                </div>
                <div class="q-content">
                  <MathRenderer :content="q.data.question_content" :inline="false" />
                </div>
                <div v-if="showAnswers && (q.data.question_answer || q.data.question_analysis)" class="q-answer-section">
                  <div v-if="q.data.question_answer">
                    <strong>答案：</strong>
                    <MathRenderer :content="q.data.question_answer" :inline="true" />
                  </div>
                  <div v-if="q.data.question_analysis">
                    <strong>解析：</strong>
                    <MathRenderer :content="q.data.question_analysis" :inline="true" />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>

  <!-- Share Email Dialog -->
  <n-modal v-model:show="shareDialog.visible" preset="card" title="通过邮件分享试卷" style="width: 500px">
    <n-form label-placement="left" label-width="80px">
      <n-form-item label="收件人">
        <n-input v-model:value="shareDialog.email" placeholder="请输入对方邮箱" />
      </n-form-item>
      <n-form-item label="文件格式">
        <n-radio-group v-model:value="shareDialog.fileType">
          <n-space>
            <n-radio value="word">Word 文档 (.docx)</n-radio>
            <n-radio value="pdf">PDF 文档 (.pdf)</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="包含答案">
        <n-switch v-model:value="showAnswers" disabled>
          <template #checked>是</template>
          <template #unchecked>否</template>
        </n-switch>
        <span style="font-size: 12px; color: #999; margin-left: 8px">(跟随预览设置)</span>
      </n-form-item>
      <n-form-item label="邮件主题">
        <n-input v-model:value="shareDialog.subject" placeholder="邮件主题" />
      </n-form-item>
      <n-form-item label="附加信息">
        <n-input v-model:value="shareDialog.message" type="textarea" placeholder="想对收件人说的话..." :rows="3" />
      </n-form-item>
      <n-form-item label="分享链接">
        <n-input-group>
          <n-input :value="shareDialog.shareLink" readonly placeholder="生成中..." />
          <n-button type="primary" ghost @click="copyShareLink">
            <template #icon><n-icon><CopyOutline /></n-icon></template>
            复制
          </n-button>
        </n-input-group>
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="shareDialog.visible = false">取消</n-button>
        <n-button type="primary" @click="doShareEmail" :loading="shareDialog.loading">
          <template #icon><n-icon><ShareSocialOutline /></n-icon></template>
          发送邮件
        </n-button>
      </div>
    </template>
  </n-modal>

  <n-drawer v-model:show="editDrawerVisible" placement="right" width="520">
      <n-drawer-content title="编辑预览内容">
        <div class="editor-header">
          <div class="editor-title">试卷头部</div>
          <div class="editor-fields">
            <div class="field"><span class="label">手动编辑</span><n-switch v-model:value="headerForm.useOverride" /></div>
            <div class="field"><span class="label">学校</span><n-input v-model:value="headerForm.school" placeholder="学校名称" /></div>
            <div class="field"><span class="label">学年</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <n-input-number v-model:value="headerForm.startYear" :min="2000" :max="2100" style="width:110px" />
                <span>～</span>
                <n-input-number v-model:value="headerForm.endYear" :min="2000" :max="2100" style="width:110px" />
                <n-select style="margin-left:8px;width:140px" v-model:value="headerForm.termText" :options="[{label:'第一学期',value:'第一学期'},{label:'第二学期',value:'第二学期'}]" />
              </div>
            </div>
            <div class="field"><span class="label">试卷名</span><n-input v-model:value="headerForm.paperName" placeholder="试卷名称（不含书名号与“试卷”字样）" /></div>
            <div class="field"><span class="label">卷别</span><n-input v-model:value="headerForm.volume" style="width:120px" /></div>
            <div class="field"><span class="label">考试方式</span><n-select v-model:value="headerForm.examStyle" :options="[{label:'闭卷',value:'闭卷'},{label:'开卷',value:'开卷'}]" style="width:140px" /></div>
            <div class="field"><span class="label">考试时间</span><n-input-number v-model:value="headerForm.duration" :min="0" style="width:160px" /> 分钟</div>
            <div class="field"><span class="label">卷面总分</span><n-input-number v-model:value="headerForm.total" :min="0" style="width:160px" /> 分</div>
            <div style="display:flex;justify-content:flex-end;">
              <n-button size="small" @click="() => { headerForm.value.useOverride = false; initHeaderFormFromDefault() }">恢复自动</n-button>
            </div>
          </div>
        </div>
      <div class="editor-list">
        <div v-for="q in editableQuestions" :key="q.question_id" class="editor-item">
          <div class="editor-title">第 {{ q.question_sort }} 题</div>
          <n-input v-model:value="q.question_content" type="textarea" autosize />
          <div class="editor-subtitle">答案</div>
          <n-input v-model:value="q.question_answer" type="textarea" autosize />
          <div class="editor-subtitle">解析</div>
          <n-input v-model:value="q.question_analysis" type="textarea" autosize />
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--n-color-modal);
  border-bottom: 1px solid var(--n-border-color);
  color: var(--n-text-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left .icon {
  font-size: 20px;
  color: var(--n-primary-color);
}

.header-left .title {
  font-size: 18px;
  font-weight: 600;
  color: var(--n-text-color);
}

.header-left .subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header) {
  background: #111827 !important;
  border-bottom: 1px solid #1f2937 !important;
  color: #e5e7eb !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-button) {
  color: #f9fafb !important;
  background: #1f2937 !important;
  border-color: #374151 !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-button .n-button__content),
:global(:root[data-theme="dark"] .preview-modal .preview-header .n-button .n-button__icon) {
  color: #f9fafb !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-button--primary) {
  color: #ffffff !important;
  background: #2563eb !important;
  border-color: #2563eb !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-radio-button) {
  color: #e5e7eb !important;
  background: #1f2937 !important;
  border-color: #374151 !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-radio-button .n-radio-button__label) {
  color: #e5e7eb !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .n-radio-button.n-radio-button--checked) {
  color: #ffffff !important;
  background: #2563eb !important;
  border-color: #2563eb !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .preview-action) {
  color: #f9fafb !important;
  background: #1f2937 !important;
  border-color: #374151 !important;
}

:global(:root[data-theme="dark"] .preview-modal .preview-header .preview-action:hover) {
  background: #374151 !important;
  border-color: #4b5563 !important;
}

.answer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 10px;
}

.toggle-text {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.editor-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.editor-header { padding-bottom: 12px; border-bottom: 1px solid var(--n-border-color); margin-bottom: 12px; }
.editor-fields { display: flex; flex-direction: column; gap: 10px; }
.editor-fields .field { display:flex; align-items:center; gap:10px; }
.editor-fields .label { width:80px; color: var(--n-text-color-3); font-size: 13px; }

.editor-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.editor-title {
  font-weight: 600;
  color: var(--n-text-color);
}

.editor-subtitle {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.preview-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.preview-wrapper {
  background-color: #525659; /* Darker background for better contrast like PDF viewers */
  padding: 40px 0;
  display: flex;
  justify-content: center;
  min-height: 100%;
  overflow-y: auto;
  flex: 1;
}

.paper-content {
  background: white;
  width: 210mm; /* A4 width */
  height: 297mm; /* Changed from min-height to fixed height for pagination */
  padding: 25.4mm; /* Standard 1 inch margins */
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
  outline: none;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #333;
  box-sizing: border-box;
  overflow: hidden; /* Hide overflow */
  position: relative;
}

/* Ensure Math Renderer inside paper content looks good */
.paper-content :deep(.math-renderer) {
  font-family: 'Times New Roman', serif;
  display: inline-block;
}
.paper-content :deep(.katex) {
  font-size: 1.0em; 
}

.paper-content.is-a3 {
  width: 420mm; /* A3 width */
  height: 297mm; /* A3 height (landscape) */
  padding: 15mm;
  column-count: 2;
  column-gap: 30px;
  column-rule: 1px solid #ccc;
  column-fill: auto; /* Prevent balancing columns, fill first then second */
}

.measure-box {
  visibility: hidden;
  position: absolute;
  top: -9999px;
  left: -9999px;
  z-index: -1;
  overflow: visible;
}

.page-sheet {
  margin-bottom: 20px;
}

.page-sheet.is-a3-scale {
  transform: scale(0.7);
  transform-origin: top center;
  margin-bottom: -140px;
}

/* Ensure title spans across columns in A3 preview mode */
.paper-content.is-a3 .section-title {
  column-span: all;
}
.section-title {
  font-weight: 700;
  font-size: 18px;
  margin: 12px 0;
}

.q-item {
  margin-bottom: 15px;
  break-inside: avoid; /* Prevent splitting inside a question */
}

.q-answer-section {
  margin-top: 8px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
.q-content {
  margin-top: 4px;
  line-height: 1.6;
}
.header-line1 { font-size: 20px; font-weight: 700; }
.header-line2 { font-size: 18px; font-weight: 700; }
.score-wrap { margin: 6px 0 14px; }
.score-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.score-th, .score-td {
  border: 1px solid #000;
  text-align: center;
  padding: 4px 6px;
}
.header-block { break-inside: avoid-column; }
.paper-content.is-a3 .score-wrap { column-span: all; }

@media print {
  :global(html), :global(body) {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }

  .preview-wrapper {
    padding: 0;
    background: white;
    overflow: visible !important;
  }

  .paper-content {
    box-shadow: none;
    width: 210mm;
    min-height: auto;
    margin: 0;
  }

  .preview-header {
    display: none !important;
  }
}
</style>
