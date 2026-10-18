<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { RefreshOutline, PersonOutline, DocumentTextOutline, FileTrayFullOutline, BookOutline } from '@vicons/ionicons5'
import * as echarts from 'echarts'
import { http } from '../api/http'

const message = useMessage()
const loading = ref(false)
const error = ref('')

const subjects = ref([])
const questionTypes = ref([])
const difficulties = ref([])

function getIsDarkMode() {
  return document.documentElement.dataset.theme === 'dark'
}
const isDarkMode = ref(getIsDarkMode())

const stats = ref({
  users: 0,
  subjects: 0,
  textbooks: 0,
  questions: 0,
  papers: 0,
  pending_questions: 0,
  pending_papers: 0
})

const trendChartRef = ref(null)
const pieChartRef = ref(null)

let trendChart = null
let pieChart = null

async function loadDashboard() {
  try {
    const statsResp = await http.get('/dashboard/stats')
    stats.value = statsResp.data || {}

    const trendResp = await http.get('/dashboard/trend')
    renderTrendChart(trendResp.data)

    const distResp = await http.get('/dashboard/distribution')
    renderPieChart(distResp.data.items)
  } catch (e) {
    console.error('Dashboard load failed', e)
  }
}

function renderTrendChart(data) {
  if (!trendChartRef.value) return
  if (trendChart) trendChart.dispose()
  
  trendChart = echarts.init(trendChartRef.value, isDarkMode.value ? 'dark' : null)
  const textColor = isDarkMode.value ? 'rgba(255,255,255,0.87)' : '#303133'
  const option = {
    backgroundColor: 'transparent',
    title: { text: '近30天系统活跃趋势', left: 'left', textStyle: { fontSize: 16, color: textColor } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['题目新增', '试卷生成'], bottom: 0, textStyle: { color: textColor } },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: data.dates, axisLabel: { color: textColor }, axisLine: { lineStyle: { color: isDarkMode.value ? '#4c4d4f' : '#ccc' } } },
    yAxis: { type: 'value', axisLabel: { color: textColor }, axisLine: { lineStyle: { color: isDarkMode.value ? '#4c4d4f' : '#ccc' } }, splitLine: { lineStyle: { color: isDarkMode.value ? '#333' : '#eee' } } },
    series: [
      {
        name: '题目新增',
        type: 'line',
        data: data.questions,
        smooth: true,
        itemStyle: { color: '#2f8f72' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(47,143,114,0.28)' }, { offset: 1, color: 'rgba(47,143,114,0)' }]) }
      },
      {
        name: '试卷生成',
        type: 'line',
        data: data.papers,
        smooth: true,
        itemStyle: { color: '#b87918' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(184,121,24,0.24)' }, { offset: 1, color: 'rgba(184,121,24,0)' }]) }
      }
    ]
  }
  trendChart.setOption(option)
}

function renderPieChart(items) {
  if (!pieChartRef.value) return
  if (pieChart) pieChart.dispose()
  
  pieChart = echarts.init(pieChartRef.value, isDarkMode.value ? 'dark' : null)
  const textColor = isDarkMode.value ? 'rgba(255,255,255,0.87)' : '#303133'
  const option = {
    backgroundColor: 'transparent',
    title: { text: '题库科目分布', left: 'left', textStyle: { fontSize: 16, color: textColor } },
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'right', top: 'center', textStyle: { color: textColor } },
    series: [
      {
        name: '科目',
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: isDarkMode.value ? '#141414' : '#fff', borderWidth: 2 },
        label: { show: false, position: 'center', color: textColor },
        emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold', color: textColor } },
        labelLine: { show: false },
        data: items
      }
    ]
  }
  pieChart.setOption(option)
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    await loadDashboard()
    
    const [s, t, d] = await Promise.all([
      http.get('/dicts/subjects'),
      http.get('/dicts/question-types'),
      http.get('/dicts/difficulties'),
    ])
    subjects.value = s.data.items || []
    questionTypes.value = t.data.items || []
    difficulties.value = d.data.items || []
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

let themeObserver = null

onMounted(() => {
    loadAll()
    window.addEventListener('resize', () => {
        trendChart?.resize()
        pieChart?.resize()
    })

    themeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                isDarkMode.value = getIsDarkMode()
                loadDashboard()
            }
        }
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    })
})

onUnmounted(() => {
    if (themeObserver) {
        themeObserver.disconnect()
        themeObserver = null
    }
})

const subjectColumns = [
  { title: 'ID', key: 'subject_id', width: 80 },
  { title: '名称', key: 'subject_name', width: 150 },
  { title: '编码', key: 'subject_code', width: 100 },
  { title: '年级', key: 'target_grade', width: 120 },
  { title: '类型', key: 'teach_type' }
]

const typeColumns = [
  { title: 'ID', key: 'type_id', width: 80 },
  { title: '名称', key: 'type_name' },
  { title: '编码', key: 'type_code' }
]

const difficultyColumns = [
  { title: 'ID', key: 'difficulty_id', width: 80 },
  { title: '名称', key: 'difficulty_name' },
  { title: '等级', key: 'difficulty_level' }
]
</script>

<template>
  <div class="page">
    <div class="header">
      <div class="title">基础信息仪表盘</div>
      <n-button :loading="loading" @click="loadAll">
        <template #icon>
          <n-icon><RefreshOutline /></n-icon>
        </template>
        刷新
      </n-button>
    </div>

    <n-alert v-if="error" type="error" :title="error" />

    <!-- 顶部统计卡片 -->
    <div class="stats-grid">
        <div v-reveal="{ delay: 40 }" class="stat-card blue">
            <div class="stat-icon">
              <n-icon size="24"><PersonOutline /></n-icon>
            </div>
            <div class="stat-content">
                <div class="stat-label">总用户数</div>
                <div class="stat-value">{{ stats.users }}</div>
            </div>
        </div>
        <div v-reveal="{ delay: 110 }" class="stat-card green">
            <div class="stat-icon">
              <n-icon size="24"><DocumentTextOutline /></n-icon>
            </div>
            <div class="stat-content">
                <div class="stat-label">题库总量</div>
                <div class="stat-value">{{ stats.questions }} <span class="sub-text">({{ stats.pending_questions }} 待审)</span></div>
            </div>
        </div>
        <div v-reveal="{ delay: 180 }" class="stat-card orange">
            <div class="stat-icon">
              <n-icon size="24"><FileTrayFullOutline /></n-icon>
            </div>
            <div class="stat-content">
                <div class="stat-label">试卷总数</div>
                <div class="stat-value">{{ stats.papers }} <span class="sub-text">({{ stats.pending_papers }} 待审)</span></div>
            </div>
        </div>
        <div v-reveal="{ delay: 250 }" class="stat-card cyan">
            <div class="stat-icon">
              <n-icon size="24"><BookOutline /></n-icon>
            </div>
            <div class="stat-content">
                <div class="stat-label">教材数量</div>
                <div class="stat-value">{{ stats.textbooks }}</div>
            </div>
        </div>
    </div>

    <!-- 图表区域 -->
    <div class="charts-row">
        <n-card v-reveal="{ delay: 120 }" class="chart-card">
            <div ref="trendChartRef" style="width: 100%; height: 350px;"></div>
        </n-card>
        <n-card v-reveal="{ delay: 190 }" class="chart-card">
            <div ref="pieChartRef" style="width: 100%; height: 350px;"></div>
        </n-card>
    </div>

    <!-- 基础字典表格 -->
    <n-card v-reveal title="科目列表">
      <n-data-table
        :columns="subjectColumns"
        :data="subjects"
        :loading="loading"
        :max-height="260"
        striped
      />
    </n-card>

    <div class="grid">
      <n-card v-reveal="{ delay: 80 }" title="题型定义">
        <n-data-table
          :columns="typeColumns"
          :data="questionTypes"
          :loading="loading"
          :max-height="260"
          striped
        />
      </n-card>

      <n-card v-reveal="{ delay: 150 }" title="难度分级">
        <n-data-table
          :columns="difficultyColumns"
          :data="difficulties"
          :loading="loading"
          :max-height="260"
          striped
        />
      </n-card>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px;
  border: 1px solid var(--app-border-soft);
  border-radius: 8px;
  background: var(--app-surface-raised);
  box-shadow: var(--app-shadow);
}

.title {
  color: var(--app-text);
  font-size: 22px;
  font-weight: 760;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

.n-card {
  border-radius: 8px !important;
  box-shadow: var(--app-shadow);
}

.stat-card {
    background:
      linear-gradient(135deg, var(--tone-bg, rgba(255,255,255,0.95)), transparent 72%),
      var(--stat-card-bg);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 15px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: var(--stat-card-border);
    box-shadow: 0 12px 28px rgba(31,45,64,0.08);
    position: relative;
    overflow: hidden;
}

.stat-card:hover {
    transform: translateY(-2px);
}

.stat-card::after {
    content: '';
    position: absolute;
    inset: auto 14px 12px auto;
    width: 38px;
    height: 3px;
    border-radius: 999px;
    background: var(--tone, var(--app-accent));
    opacity: .8;
}

.stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.blue .stat-icon {
    background: var(--app-accent-soft);
    color: var(--app-accent);
}
.green .stat-icon {
    background: var(--app-mint-soft);
    color: var(--app-mint);
}
.orange .stat-icon {
    background: var(--app-amber-soft);
    color: var(--app-amber);
}
.cyan .stat-icon {
    background: var(--app-cyan-soft);
    color: var(--app-cyan);
}

.blue { --tone: var(--app-accent); --tone-bg: var(--app-accent-soft); }
.green { --tone: var(--app-mint); --tone-bg: var(--app-mint-soft); }
.orange { --tone: var(--app-amber); --tone-bg: var(--app-amber-soft); }
.cyan { --tone: var(--app-cyan); --tone-bg: var(--app-cyan-soft); }

.stat-content {
    flex: 1;
}

.stat-label {
    font-size: 14px;
    color: var(--n-text-color-3);
    margin-bottom: 4px;
}

.stat-value {
    font-size: 28px;
    font-weight: 760;
    color: var(--app-text);
}

.sub-text {
    font-size: 13px;
    color: var(--app-muted);
    font-weight: normal;
}

.charts-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
}

.chart-card {
    border-radius: 8px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

:deep(.n-data-table) {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: none;
}

:global(html[data-theme="dark"]) :deep(.stat-card) {
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
:global(html[data-theme="light"]) :deep(.n-card) {
  background: rgba(255,255,255,0.88) !important;
  border: 1px solid var(--app-border-soft);
}

:global(html[data-theme="dark"]) :deep(.n-card) {
  background: linear-gradient(135deg, #1f2024 60%, #24262b 100%) !important;
  border: 1px solid #2f3136;
}

@media (max-width: 1100px) {
  .stats-grid,
  .charts-row,
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .header,
  .stats-grid,
  .charts-row,
  .grid {
    grid-template-columns: 1fr;
  }

  .header {
    align-items: flex-start;
    gap: 12px;
    flex-direction: column;
  }
}
</style>
