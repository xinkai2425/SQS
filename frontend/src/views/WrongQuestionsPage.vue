<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, useDialog, NTag, NButton } from 'naive-ui'
import { RefreshOutline, TrashOutline, PlayOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import MathRenderer from '../components/MathRenderer.vue'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const subjectFilter = ref(null)
const practiceTypeFilter = ref(null)

const subjects = ref([])
const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))
const practiceTypeOptions = [
  { label: '全部', value: null },
  { label: '试卷练习', value: 1 },
  { label: '试题练习', value: 2 },
]

const redoMode = ref(false)
const redoQuestions = ref([])
const redoAnswers = reactive({})
const redoSubmitting = ref(false)
const redoResults = ref([])
const redoSubmitted = ref(false)
const redoTotalScore = ref(0)
const redoTotalMaxScore = ref(0)
const redoAccuracy = ref(0)

const SINGLE_CHOICE = 1
const JUDGE = 2
const FILL = 3
const MULTI_CHOICE = 7

function getTypeCategory(typeId) {
  if (typeId === SINGLE_CHOICE) return 'single_choice'
  if (typeId === MULTI_CHOICE) return 'multi_choice'
  if (typeId === JUDGE) return 'judge'
  if (typeId === FILL) return 'fill'
  return 'subjective'
}

function parseOptions(content) {
  if (!content) return []
  const options = []
  const regex = /([A-D])[\.、．]\s*(.*)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    options.push({ label: match[1], text: match[2].trim() })
  }
  return options
}

function getQuestionStem(content, typeId) {
  if (!content) return ''
  if (typeId === SINGLE_CHOICE || typeId === MULTI_CHOICE) {
    const lines = content.split('\n')
    const stemLines = []
    for (const line of lines) {
      if (/^[A-D][\.、．]\s/.test(line.trim())) break
      stemLines.push(line)
    }
    return stemLines.join('\n').trim()
  }
  return content
}

async function loadDicts() {
  try {
    const resp = await http.get('/dicts/subjects')
    subjects.value = resp.data.items || []
  } catch {}
}

async function loadWrongQuestions() {
  loading.value = true
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
    }
    if (subjectFilter.value) params.subject_id = subjectFilter.value
    if (practiceTypeFilter.value) params.practice_type = practiceTypeFilter.value
    const resp = await http.get('/practice/wrong-questions', { params })
    items.value = resp.data.items || []
    total.value = resp.data.total || 0
  } catch (e) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function deleteWrongQuestion(questionId) {
  dialog.warning({
    title: '提示',
    content: '确认从错题本移除该题？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await http.delete(`/practice/wrong-questions/${questionId}`)
        message.success('已移除')
        await loadWrongQuestions()
      } catch (e) {
        message.error(e?.message || '操作失败')
      }
    },
  })
}

function startRedo() {
  if (items.value.length === 0) {
    message.warning('错题本为空')
    return
  }
  redoMode.value = true
  redoSubmitted.value = false
  redoResults.value = []
  redoQuestions.value = items.value.map(item => ({
    question_id: item.question_id,
    type_id: item.type_id,
    type_name: item.type_name,
    question_content: item.question_content,
    question_answer: item.correct_answer,
    question_analysis: item.question_analysis,
    question_score: item.question_score,
    difficulty_name: item.difficulty_name,
  }))
  for (const q of redoQuestions.value) {
    const cat = getTypeCategory(q.type_id)
    if (cat === 'multi_choice') {
      redoAnswers[q.question_id] = []
    } else if (cat === 'single_choice' || cat === 'judge') {
      redoAnswers[q.question_id] = null
    } else {
      redoAnswers[q.question_id] = ''
    }
  }
}

function cancelRedo() {
  redoMode.value = false
  redoQuestions.value = []
  redoSubmitted.value = false
  redoResults.value = []
}

function isRedoAnswered(qId) {
  const a = redoAnswers[qId]
  if (a === undefined || a === null) return false
  if (typeof a === 'string') return a.trim() !== ''
  if (Array.isArray(a)) return a.length > 0
  return true
}

async function submitRedo() {
  const unanswered = redoQuestions.value.filter(q => !isRedoAnswered(q.question_id))
  if (unanswered.length > 0) {
    dialog.warning({
      title: '提示',
      content: `还有 ${unanswered.length} 道题未作答，确定提交吗？`,
      positiveText: '确定提交',
      negativeText: '继续作答',
      onPositiveClick: doSubmitRedo,
    })
  } else {
    doSubmitRedo()
  }
}

async function doSubmitRedo() {
  redoSubmitting.value = true
  try {
    const answerList = redoQuestions.value.map(q => {
      const userAnswer = redoAnswers[q.question_id]
      let answerStr = ''
      if (Array.isArray(userAnswer)) {
        answerStr = userAnswer.sort().join('')
      } else if (userAnswer !== null && userAnswer !== undefined) {
        answerStr = String(userAnswer)
      }
      return {
        question_id: q.question_id,
        user_answer: answerStr,
        question_score: q.question_score,
      }
    })

    const resp = await http.post('/practice/wrong-questions/redo', {
      answers: answerList,
    })

    redoResults.value = resp.data.results || []
    redoTotalScore.value = resp.data.total_score || 0
    redoTotalMaxScore.value = resp.data.total_max_score || 0
    redoAccuracy.value = resp.data.accuracy || 0
    redoSubmitted.value = true

    const resultMap = {}
    for (const r of redoResults.value) {
      resultMap[r.question_id] = r
    }
    for (const q of redoQuestions.value) {
      const r = resultMap[q.question_id]
      if (r) q._result = r
    }
  } catch (e) {
    message.error(e?.message || '提交失败')
  } finally {
    redoSubmitting.value = false
  }
}

function finishRedo() {
  redoMode.value = false
  redoSubmitted.value = false
  redoResults.value = []
  loadWrongQuestions()
}

onMounted(async () => {
  await loadDicts()
  await loadWrongQuestions()
})
</script>

<template>
  <div class="wrong-questions-page">
    <n-card>
      <template #header>
        <div class="page-header">
          <span>错题本</span>
          <div class="header-actions">
            <n-select
              v-model:value="subjectFilter"
              :options="subjectOptions"
              placeholder="筛选科目"
              clearable
              style="width: 180px"
              @update:value="loadWrongQuestions"
            />
            <n-select
              v-model:value="practiceTypeFilter"
              :options="practiceTypeOptions"
              placeholder="练习类型"
              clearable
              style="width: 140px"
              @update:value="loadWrongQuestions"
            />
            <n-button v-if="!redoMode" type="primary" @click="startRedo" :disabled="items.length === 0">
              <template #icon><n-icon><PlayOutline /></n-icon></template>
              重做错题
            </n-button>
            <n-button v-else @click="cancelRedo">取消重做</n-button>
          </div>
        </div>
      </template>

      <div v-if="!redoMode">
        <div v-if="loading" style="text-align: center; padding: 40px;">
          <n-spin size="large" />
        </div>

        <div v-else-if="items.length === 0" class="empty-state">
          <n-empty description="暂无错题，继续保持！" />
        </div>

        <div v-else>
          <div v-for="item in items" :key="item.wrong_id" class="wrong-item">
            <div class="wrong-item-header">
              <n-tag size="small" :bordered="false">{{ item.type_name || `题型${item.type_id}` }}</n-tag>
              <n-tag v-if="item.difficulty_name" size="small" :bordered="false" type="info">{{ item.difficulty_name }}</n-tag>
              <n-tag size="small" :type="item.practice_type === 1 ? 'warning' : 'default'" :bordered="false">
                {{ item.practice_type === 1 ? '试卷练习' : '试题练习' }}
              </n-tag>
              <span class="wrong-score">{{ item.user_score }}/{{ item.question_score }}分</span>
              <span class="wrong-time">{{ item.update_time }}</span>
            </div>

            <div class="wrong-item-content">
              <MathRenderer :content="item.question_content" />
            </div>

            <div class="wrong-item-detail">
              <div class="detail-row">
                <span class="detail-label">你的答案：</span>
                <span class="text-wrong">{{ item.user_answer || '（未作答）' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">正确答案：</span>
                <span class="text-correct">{{ item.correct_answer }}</span>
              </div>
              <div v-if="item.error_reason" class="detail-row error-reason">
                <span class="detail-label">错误原因：</span>
                <span>{{ item.error_reason }}</span>
              </div>
              <div v-if="item.question_analysis" class="detail-row">
                <span class="detail-label">解析：</span>
                <MathRenderer :content="item.question_analysis" />
              </div>
            </div>

            <div class="wrong-item-actions">
              <n-button size="small" type="error" quaternary @click="deleteWrongQuestion(item.question_id)">
                <template #icon><n-icon><TrashOutline /></n-icon></template>
                移除
              </n-button>
            </div>
          </div>

          <div class="pagination-bar">
            <n-pagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :item-count="total"
              :page-sizes="[10, 20, 50]"
              @update:page="loadWrongQuestions"
              @update:page-size="() => { page = 1; loadWrongQuestions() }"
            />
          </div>
        </div>
      </div>

      <div v-else class="redo-area">
        <div class="redo-header">
          <span class="redo-title">重做错题 ({{ redoQuestions.length }}题)</span>
          <div class="redo-header-actions">
            <template v-if="!redoSubmitted">
              <n-button type="primary" :loading="redoSubmitting" @click="submitRedo">提交答案</n-button>
            </template>
            <template v-else>
              <n-tag type="success" size="large">得分: {{ redoTotalScore }}/{{ redoTotalMaxScore }}</n-tag>
              <n-tag type="info" size="large">正确率: {{ redoAccuracy }}%</n-tag>
              <n-button type="primary" @click="finishRedo">完成</n-button>
            </template>
          </div>
        </div>

        <div v-for="(q, idx) in redoQuestions" :key="q.question_id" class="redo-question-card"
          :class="{
            'question-correct': redoSubmitted && q._result?.is_correct,
            'question-wrong': redoSubmitted && !q._result?.is_correct,
          }"
        >
          <div class="question-header">
            <span class="question-number">{{ idx + 1 }}</span>
            <n-tag size="small" :bordered="false">{{ q.type_name }}</n-tag>
            <span class="question-score">{{ q.question_score }}分</span>
            <template v-if="redoSubmitted">
              <n-tag v-if="q._result?.is_correct" type="success" size="small">正确</n-tag>
              <n-tag v-else type="error" size="small">错误 ({{ q._result?.user_score }}/{{ q.question_score }})</n-tag>
            </template>
          </div>

          <div class="question-stem">
            <MathRenderer :content="getQuestionStem(q.question_content, q.type_id)" />
          </div>

          <div v-if="!redoSubmitted" class="question-answer-area">
            <template v-if="getTypeCategory(q.type_id) === 'single_choice'">
              <n-radio-group v-model:value="redoAnswers[q.question_id]">
                <div class="option-list">
                  <n-radio v-for="opt in parseOptions(q.question_content)" :key="opt.label" :value="opt.label" class="option-item">
                    <span class="option-label">{{ opt.label }}.</span>
                    <MathRenderer :content="opt.text" :inline="true" />
                  </n-radio>
                </div>
              </n-radio-group>
            </template>

            <template v-else-if="getTypeCategory(q.type_id) === 'multi_choice'">
              <n-checkbox-group v-model:value="redoAnswers[q.question_id]">
                <div class="option-list">
                  <n-checkbox v-for="opt in parseOptions(q.question_content)" :key="opt.label" :value="opt.label" class="option-item">
                    <span class="option-label">{{ opt.label }}.</span>
                    <MathRenderer :content="opt.text" :inline="true" />
                  </n-checkbox>
                </div>
              </n-checkbox-group>
            </template>

            <template v-else-if="getTypeCategory(q.type_id) === 'judge'">
              <n-radio-group v-model:value="redoAnswers[q.question_id]">
                <n-space>
                  <n-radio value="正确">正确</n-radio>
                  <n-radio value="错误">错误</n-radio>
                </n-space>
              </n-radio-group>
            </template>

            <template v-else-if="getTypeCategory(q.type_id) === 'fill'">
              <n-input v-model:value="redoAnswers[q.question_id]" placeholder="请输入答案" clearable />
            </template>

            <template v-else>
              <n-input v-model:value="redoAnswers[q.question_id]" type="textarea" placeholder="请输入答案" :rows="4" />
            </template>
          </div>

          <div v-if="redoSubmitted" class="result-area">
            <div class="result-row">
              <span class="result-label">你的答案：</span>
              <span :class="q._result?.is_correct ? 'text-correct' : 'text-wrong'">
                {{ q._result?.user_answer || '（未作答）' }}
              </span>
            </div>
            <div class="result-row">
              <span class="result-label">标准答案：</span>
              <span class="text-correct">{{ q._result?.question_answer || q.question_answer }}</span>
            </div>
            <div v-if="q._result?.question_analysis || q.question_analysis" class="result-row">
              <span class="result-label">解析：</span>
              <MathRenderer :content="q._result?.question_analysis || q.question_analysis" />
            </div>
            <div v-if="q._result?.error_reason" class="result-row error-reason">
              <span class="result-label">错误原因：</span>
              <span>{{ q._result.error_reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.wrong-questions-page {
  max-width: 1000px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.empty-state {
  padding: 60px 0;
}
.wrong-item {
  padding: 16px;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  margin-bottom: 12px;
  border-left: 4px solid #d03050;
}
.wrong-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.wrong-score {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin-left: auto;
}
.wrong-time {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.wrong-item-content {
  margin-bottom: 10px;
  line-height: 1.6;
}
.wrong-item-detail {
  padding: 10px 14px;
  background: var(--n-color-embedded);
  border-radius: 6px;
  font-size: 14px;
}
.detail-row {
  margin-bottom: 6px;
  line-height: 1.6;
}
.detail-row:last-child {
  margin-bottom: 0;
}
.detail-label {
  font-weight: 600;
  color: var(--n-text-color-2);
}
.text-correct {
  color: #18a058;
  font-weight: 500;
}
.text-wrong {
  color: #d03050;
  font-weight: 500;
}
.error-reason {
  padding: 6px 10px;
  background: rgba(208, 48, 80, 0.06);
  border-radius: 4px;
  margin-top: 4px;
}
.wrong-item-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
.redo-area {
  max-width: 900px;
}
.redo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.redo-title {
  font-weight: 600;
  font-size: 16px;
}
.redo-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.redo-question-card {
  background: var(--n-color-embedded);
  border-radius: 8px;
  padding: 18px;
  margin-bottom: 14px;
  border: 1px solid var(--n-border-color);
  transition: border-color 0.3s;
}
.redo-question-card.question-correct {
  border-left: 4px solid #18a058;
}
.redo-question-card.question-wrong {
  border-left: 4px solid #d03050;
}
.question-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.question-number {
  font-weight: 700;
  font-size: 16px;
  min-width: 28px;
}
.question-score {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.question-stem {
  margin-bottom: 14px;
  line-height: 1.8;
  font-size: 15px;
}
.question-answer-area {
  padding: 12px 16px;
  background: var(--n-color);
  border-radius: 6px;
}
.option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.option-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.option-label {
  font-weight: 600;
  margin-right: 4px;
}
.result-area {
  padding: 12px 16px;
  background: var(--n-color);
  border-radius: 6px;
  margin-top: 12px;
}
.result-row {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.6;
}
.result-row:last-child {
  margin-bottom: 0;
}
.result-label {
  font-weight: 600;
  color: var(--n-text-color-2);
}
</style>
