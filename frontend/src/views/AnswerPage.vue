<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { ClockCircleOutlined } from '@vicons/antd'
import { http } from '../api/http'
import MathRenderer from '../components/MathRenderer.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const mode = ref('')
const paperId = ref(null)
const paper = ref(null)
const questions = ref([])
const loading = ref(false)
const submitted = ref(false)
const submitting = ref(false)
const results = ref([])
const totalScore = ref(0)
const totalMaxScore = ref(0)
const accuracy = ref(0)
const wrongCount = ref(0)
const correctCount = ref(0)
const analysisText = ref('')
const analysisLoading = ref(false)
const showAnalysis = ref(false)

const answerArray = ref([])
const loadingProgress = ref(0)
const gradingProgress = ref(0)

// 倒计时相关
const remainingSeconds = ref(0)
const timerId = ref(null)
const showTimeUpDialog = ref(false)

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

function getTypeName(typeId) {
  if (typeId === SINGLE_CHOICE) return '单选题'
  if (typeId === MULTI_CHOICE) return '多选题'
  if (typeId === JUDGE) return '判断题'
  if (typeId === FILL) return '填空题'
  return '简答题'
}

function parseOptions(content) {
  if (!content) return []
  const options = []
  const regex = /([a-zA-Z])[\.、．]\s*(.*)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    options.push({ label: match[1].toUpperCase(), text: match[2].trim() })
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

function isAnswered(index) {
  const a = answerArray.value[index]
  if (a === undefined || a === null) return false
  if (typeof a === 'string') return a.trim() !== ''
  if (Array.isArray(a)) return a.length > 0
  return true
}

const answeredCount = computed(() => questions.value.filter((_, idx) => isAnswered(idx)).length)
const progressPercent = computed(() => {
    if (questions.value.length === 0) return 0
    return Math.round(answeredCount.value / questions.value.length * 100)
})

// 倒计时相关计算属性
const formattedTime = computed(() => {
    const total = remainingSeconds.value
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const isTimeCritical = computed(() => remainingSeconds.value > 0 && remainingSeconds.value <= 300) // 最后5分钟
const isTimeUp = computed(() => remainingSeconds.value <= 0 && !submitted.value)

let progressTimer = null

// 倒计时控制函数
function startTimer(durationMinutes) {
    if (durationMinutes && durationMinutes > 0) {
        remainingSeconds.value = durationMinutes * 60
        stopTimer()
        timerId.value = setInterval(() => {
            if (remainingSeconds.value > 0) {
                remainingSeconds.value--
                if (remainingSeconds.value === 300) {
                    message.warning('⚠️ 答题时间还剩最后5分钟！')
                }
            } else {
                handleTimeUp()
            }
        }, 1000)
    }
}

function stopTimer() {
    if (timerId.value) {
        clearInterval(timerId.value)
        timerId.value = null
    }
}

function handleTimeUp() {
    stopTimer()
    showTimeUpDialog.value = true
}

function confirmTimeUpSubmit() {
    showTimeUpDialog.value = false
    doSubmit()
}

async function loadPaperQuestions() {
    loading.value = true
    loadingProgress.value = 0
    
    const simulateProgress = () => {
        const interval = setInterval(() => {
            if (loadingProgress.value < 90) {
                loadingProgress.value += Math.random() * 12
            }
        }, 150)
        return () => clearInterval(interval)
    }
    
    const clearProgress = simulateProgress()
    
    try {
        const resp = await http.get(`/practice/paper-questions/${paperId.value}`)
        paper.value = resp.data.paper
        questions.value = resp.data.questions || []
        const newAnswers = []
        for (const q of questions.value) {
            const cat = getTypeCategory(q.type_id)
            if (cat === 'multi_choice') {
                newAnswers.push([])
            } else if (cat === 'single_choice' || cat === 'judge') {
                newAnswers.push(null)
            } else {
                newAnswers.push('')
            }
        }
        answerArray.value = newAnswers
        loadingProgress.value = 100
        
        // 启动倒计时
        const examDuration = paper.value?.exam_duration
        if (examDuration) {
            startTimer(examDuration)
        }
        
        await new Promise(resolve => setTimeout(resolve, 400))
    } catch (e) {
        message.error(e?.message || '加载试卷失败')
    } finally {
        clearProgress()
        loading.value = false
        loadingProgress.value = 0
    }
}

async function loadSmartQuestions() {
  loading.value = true
  loadingProgress.value = 0
  
  const simulateProgress = () => {
    const interval = setInterval(() => {
      if (loadingProgress.value < 90) {
        loadingProgress.value += Math.random() * 15
      }
    }, 100)
    return () => clearInterval(interval)
  }
  
  const clearProgress = simulateProgress()
  
  await new Promise(resolve => setTimeout(resolve, 300))
  
  try {
    const raw = sessionStorage.getItem('practice_data')
    if (!raw) {
      message.error('练习数据已过期，请重新开始')
      router.back()
      return
    }
    const data = JSON.parse(raw)
    paper.value = data.paper
    questions.value = data.questions || []
    const newAnswers = []
    for (const q of questions.value) {
      const cat = getTypeCategory(q.type_id)
      if (cat === 'multi_choice') {
        newAnswers.push([])
      } else if (cat === 'single_choice' || cat === 'judge') {
        newAnswers.push(null)
      } else {
        newAnswers.push('')
      }
    }
    answerArray.value = newAnswers
    loadingProgress.value = 100
    await new Promise(resolve => setTimeout(resolve, 200))
  } catch {
    message.error('数据解析失败')
    router.push({ name: 'practice' })
  } finally {
    clearProgress()
    loading.value = false
    loadingProgress.value = 0
  }
}

async function submit() {
  const unanswered = questions.value.filter((_, idx) => !isAnswered(idx))
  if (unanswered.length > 0) {
    dialog.warning({
      title: '提示',
      content: `还有 ${unanswered.length} 道题未作答，确定提交吗？`,
      positiveText: '确定提交',
      negativeText: '继续作答',
      onPositiveClick: doSubmit,
    })
  } else {
    doSubmit()
  }
}

async function doSubmit() {
    stopTimer() // 提交时停止计时器
    submitting.value = true
    gradingProgress.value = 0
    
    let gradingInterval = null
    
    try {
        console.log('answerArray:', answerArray.value)
        const answerList = questions.value.map((q, idx) => {
            const userAnswer = answerArray.value[idx]
            console.log(`Question ${idx} (${q.question_id}) answer:`, userAnswer)
            let answerStr = ''
            if (Array.isArray(userAnswer)) {
                answerStr = userAnswer.sort().join('')
            } else if (userAnswer !== null && userAnswer !== undefined) {
                answerStr = String(userAnswer)
            }
            console.log(`Question ${idx} (${q.question_id}) answerStr:`, answerStr)
            return {
                question_id: q.question_id,
                user_answer: answerStr,
                question_score: q.question_score,
            }
        })
        console.log('answerList to submit:', answerList)
        
        gradingInterval = setInterval(() => {
            if (gradingProgress.value < 90) {
                gradingProgress.value += Math.random() * 15
            }
        }, 200)

        const resp = await http.post('/practice/submit', {
            practice_type: mode.value === 'paper' ? 1 : 2,
            paper_id: mode.value === 'paper' ? paperId.value : null,
            answers: answerList,
        })

        gradingProgress.value = 100
        
        results.value = resp.data.results || []
        totalScore.value = resp.data.total_score || 0
        totalMaxScore.value = resp.data.total_max_score || 0
        accuracy.value = resp.data.accuracy || 0
        wrongCount.value = resp.data.wrong_count || 0
        correctCount.value = resp.data.correct_count || 0
        
        const resultMap = {}
        for (const r of results.value) {
            resultMap[r.question_id] = r
        }
        for (const q of questions.value) {
            const r = resultMap[q.question_id]
            if (r) {
                q._result = r
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 300))
        submitted.value = true
    } catch (e) {
        message.error(e?.message || '提交失败')
    } finally {
        if (gradingInterval) clearInterval(gradingInterval)
        submitting.value = false
        gradingProgress.value = 0
    }
}

async function getAnalysis() {
  if (results.value.length === 0) return
  showAnalysis.value = true
  analysisLoading.value = true
  try {
    const resp = await http.post('/practice/analysis', {
      results: results.value,
    })
    analysisText.value = resp.data.analysis || ''
  } catch (e) {
    message.error(e?.message || '分析失败')
  } finally {
    analysisLoading.value = false
  }
}

function goBack() {
  router.back()
}

function goWrongQuestions() {
  router.push({ name: 'wrong-questions' })
}

onMounted(() => {
  mode.value = route.query.mode || 'paper'
  paperId.value = route.query.paper_id ? Number(route.query.paper_id) : null

  if (mode.value === 'paper' && paperId.value) {
    loadPaperQuestions()
  } else if (mode.value === 'smart') {
    loadSmartQuestions()
  } else {
    message.error('参数错误')
    router.back()
  }
})

onUnmounted(() => {
    stopTimer() // 组件卸载时停止计时器
    if (!submitted.value) {
        sessionStorage.removeItem('practice_data')
    }
})
</script>

<template>
  <div class="answer-page">
    <div v-if="loading" class="loading-state">
      <div class="loading-content">
        <n-spin size="large" />
        <span class="loading-text">加载中...</span>
        <n-progress
          type="line"
          :percentage="loadingProgress"
          :show-indicator="true"
          style="width: 200px; margin-top: 16px"
          status="info"
        />
      </div>
    </div>

    <div v-else-if="submitting" class="grading-state">
      <div class="grading-content">
        <n-spin size="large" />
        <span class="grading-text">正在批改...</span>
        <n-progress
          type="line"
          :percentage="gradingProgress"
          :show-indicator="true"
          style="width: 200px; margin-top: 16px"
          status="success"
        />
      </div>
    </div>

    <template v-else>
      <div class="answer-header">
        <div class="header-left">
          <n-button quaternary @click="goBack">← 返回</n-button>
          <span class="paper-title">{{ paper?.paper_name || '专项练习' }}</span>
        </div>
        <div class="header-right">
          <template v-if="!submitted">
            <!-- 倒计时显示 -->
            <div v-if="paper?.exam_duration" class="timer-container" :class="{ 'timer-critical': isTimeCritical }">
              <n-icon size="20" style="margin-right: 4px">
                <ClockCircleOutlined />
              </n-icon>
              <span class="timer-text">{{ formattedTime }}</span>
            </div>
            <n-progress
              type="line"
              :percentage="progressPercent"
              :show-indicator="true"
              style="width: 160px"
              status="info"
            />
            <span class="progress-text">{{ answeredCount }}/{{ questions.length }}</span>
            <n-button type="primary" :loading="submitting" @click="submit">提交答案</n-button>
          </template>
          <template v-else>
            <n-tag type="success" size="large">总分: {{ totalScore }}/{{ totalMaxScore }}</n-tag>
            <n-tag type="info" size="large">正确率: {{ accuracy }}%</n-tag>
            <n-tag :type="wrongCount > 0 ? 'error' : 'success'" size="large">
              错误: {{ wrongCount }}题
            </n-tag>
            <n-button type="info" @click="getAnalysis" :loading="analysisLoading">作答分析</n-button>
            <n-button @click="goWrongQuestions">查看错题本</n-button>
          </template>
        </div>
      </div>

      <div class="answer-body">
        <div class="questions-list">
          <div
            v-for="(q, idx) in questions"
            :key="q.question_id"
            class="question-card"
            :class="{
              'question-correct': submitted && q._result?.is_correct,
              'question-wrong': submitted && !q._result?.is_correct,
            }"
          >
            <div class="question-header">
              <span class="question-number">{{ q.question_sort || idx + 1 }}</span>
              <n-tag size="small" :bordered="false">{{ q.type_name || getTypeName(q.type_id) }}</n-tag>
              <span class="question-score">{{ q.question_score }}分</span>
              <template v-if="submitted">
                <n-tag v-if="q._result?.is_correct" type="success" size="small">正确</n-tag>
                <n-tag v-else type="error" size="small">错误 ({{ q._result?.user_score }}/{{ q.question_score }})</n-tag>
              </template>
            </div>

            <div class="question-stem">
              <MathRenderer :content="getQuestionStem(q.question_content, q.type_id)" />
            </div>

            <div class="question-answer-area" v-if="!submitted">
              <template v-if="getTypeCategory(q.type_id) === 'single_choice'">
                <n-radio-group v-model:value="answerArray[idx]">
                  <div class="option-list">
                    <n-radio
                      v-for="opt in parseOptions(q.question_content)"
                      :key="opt.label"
                      :value="opt.label"
                      class="option-item"
                    >
                      <span class="option-label">{{ opt.label }}.</span>
                      <MathRenderer :content="opt.text" :inline="true" />
                    </n-radio>
                  </div>
                </n-radio-group>
              </template>

              <template v-else-if="getTypeCategory(q.type_id) === 'multi_choice'">
                <n-checkbox-group v-model:value="answerArray[idx]">
                  <div class="option-list">
                    <n-checkbox
                      v-for="opt in parseOptions(q.question_content)"
                      :key="opt.label"
                      :value="opt.label"
                      class="option-item"
                    >
                      <span class="option-label">{{ opt.label }}.</span>
                      <MathRenderer :content="opt.text" :inline="true" />
                    </n-checkbox>
                  </div>
                </n-checkbox-group>
              </template>

              <template v-else-if="getTypeCategory(q.type_id) === 'judge'">
                <n-radio-group v-model:value="answerArray[idx]">
                  <n-space>
                    <n-radio value="正确">正确</n-radio>
                    <n-radio value="错误">错误</n-radio>
                  </n-space>
                </n-radio-group>
              </template>

              <template v-else-if="getTypeCategory(q.type_id) === 'fill'">
                <n-input
                  v-model:value="answerArray[idx]"
                  placeholder="请输入答案"
                  clearable
                />
              </template>

              <template v-else>
                <n-input
                  v-model:value="answerArray[idx]"
                  type="textarea"
                  placeholder="请输入答案"
                  :rows="4"
                />
              </template>
            </div>

            <div v-if="submitted" class="result-area">
              <div class="result-row">
                <span class="result-label">你的答案：</span>
                <span :class="q._result?.is_correct ? 'text-correct' : 'text-error'">
                  {{ q._result?.user_answer || '' }}
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

        <n-modal v-model:show="showAnalysis" preset="card" title="作答分析" style="max-width: 700px">
          <n-spin :show="analysisLoading" description="AI分析中...">
            <div v-if="analysisText" class="analysis-content" style="white-space: pre-wrap; line-height: 1.8;">
              {{ analysisText }}
            </div>
            <div v-else-if="!analysisLoading" style="color: var(--n-text-color-3); text-align: center; padding: 20px;">
              暂无分析结果
            </div>
          </n-spin>
        </n-modal>
        
        <!-- 时间到对话框 -->
        <n-modal v-model:show="showTimeUpDialog" preset="card" title="⏰ 考试时间到" style="max-width: 500px">
          <div style="text-align: center; padding: 20px 0;">
            <n-icon size="64" color="#d03050">
              <ClockCircleOutlined />
            </n-icon>
            <p style="font-size: 18px; margin-top: 16px; margin-bottom: 8px;">考试时间已结束</p>
            <p style="color: var(--n-text-color-2);">系统将自动提交您的试卷</p>
          </div>
          <template #footer>
            <n-button type="primary" @click="confirmTimeUpSubmit">确认提交</n-button>
          </template>
        </n-modal>
      </div>
    </template>
  </div>
</template>

<style scoped>
.answer-page {
  max-width: 900px;
  margin: 0 auto;
}
.loading-state {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}
.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.loading-text {
  margin-top: 16px;
  color: var(--n-text-color-2);
  font-size: 15px;
}
.grading-state {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}
.grading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.grading-text {
  margin-top: 16px;
  color: var(--n-text-color-2);
  font-size: 15px;
}
.answer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--n-color);
  border-radius: 8px;
  margin-bottom: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.paper-title {
  font-weight: 600;
  font-size: 16px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 倒计时样式 */
.timer-container {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  background-color: rgba(24, 160, 80, 0.1);
  color: #18a050;
  font-weight: 600;
  transition: all 0.3s ease;
}

.timer-container.timer-critical {
  background-color: rgba(208, 48, 80, 0.1);
  color: #d03050;
  animation: pulse 1s infinite;
}

.timer-text {
  font-family: 'Roboto Mono', monospace;
  font-size: 16px;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
.progress-text {
  font-size: 13px;
  color: var(--n-text-color-3);
  white-space: nowrap;
}
.question-card {
  background: var(--n-color);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--n-border-color);
  transition: border-color 0.3s;
}
.question-card.question-correct {
  border-left: 4px solid #18a058;
}
.question-card.question-wrong {
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
  color: var(--n-text-color-1);
  min-width: 28px;
}
.question-score {
  font-size: 13px;
  color: var(--n-text-color-3);
}
.question-stem {
  margin-bottom: 16px;
  line-height: 1.8;
  font-size: 15px;
}
.question-answer-area {
  padding: 12px 16px;
  background: var(--n-color-embedded);
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
  background: var(--n-color-embedded);
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
.text-correct {
  color: #18a058;
  font-weight: 500;
}
.text-wrong {
  color: #d03050;
  font-weight: 500;
}
.error-reason {
  padding: 8px 12px;
  background: rgba(208, 48, 80, 0.06);
  border-radius: 4px;
  margin-top: 4px;
}
.analysis-content {
  font-size: 14px;
}
</style>
