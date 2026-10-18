<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, useDialog, NTag, NButton } from 'naive-ui'
import { SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { http } from '../api/http'
import MathRenderer from '../components/MathRenderer.vue'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

function goToSmartPractice() {
  router.push({ name: 'smart-practice' })
}

const subjects = ref([])
const subjectOptions = computed(() => subjects.value.map(s => ({ label: s.subject_name, value: s.subject_id })))

async function loadDicts() {
  const [s] = await Promise.all([http.get('/dicts/subjects')])
  subjects.value = s.data.items || []
}

const paperFilter = reactive({ subject_id: null, q: '' })
const paperLoading = ref(false)
const papers = ref([])
const paperTotal = ref(0)
const paperPage = ref(1)
const paperPageSize = ref(10)

async function loadPapers() {
  paperLoading.value = true
  try {
    const params = {
      page: paperPage.value,
      page_size: paperPageSize.value,
    }
    if (paperFilter.subject_id) params.subject_id = paperFilter.subject_id
    const resp = await http.get('/practice/reviewed-papers', { params })
    papers.value = resp.data.items || []
    paperTotal.value = resp.data.total || 0
  } catch (e) {
    message.error(e?.message || '加载失败')
  } finally {
    paperLoading.value = false
  }
}

function startPaperPractice(paperId) {
  router.push({ name: 'answer', query: { mode: 'paper', paper_id: paperId } })
}

const paperColumns = computed(() => [
  { title: 'ID', key: 'paper_id', width: 80 },
  { title: '试卷名称', key: 'paper_name', ellipsis: { tooltip: true } },
  { title: '总分', key: 'total_score', width: 80 },
  { title: '时长(分钟)', key: 'exam_duration', width: 100 },
  {
    title: '操作', key: 'actions', width: 120,
    render(row) {
      return h(NButton, {
        type: 'primary', size: 'small',
        onClick: () => startPaperPractice(row.paper_id),
      }, { default: () => '开始练习' })
    },
  },
])

onMounted(async () => {
  await loadDicts()
  await loadPapers()
})
</script>

<template>
  <div class="practice-page">
    <n-card>
      <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
        <n-button type="warning" @click="goToSmartPractice">试题练习</n-button>
      </div>
      <div class="filter-bar">
        <n-select
          v-model:value="paperFilter.subject_id"
          :options="subjectOptions"
          placeholder="筛选科目"
          clearable
          style="width: 200px"
          @update:value="loadPapers"
        />
        <n-button @click="loadPapers">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          刷新
        </n-button>
      </div>
      <n-data-table
        :columns="paperColumns"
        :data="papers"
        :loading="paperLoading"
        :pagination="{
          page: paperPage,
          pageSize: paperPageSize,
          itemCount: paperTotal,
          onChange: (p) => { paperPage = p; loadPapers() },
          onUpdatePageSize: (s) => { paperPageSize = s; paperPage = 1; loadPapers() },
        }"
        :bordered="false"
        striped
      />
    </n-card>
  </div>
</template>

<style scoped>
.practice-page {
  max-width: 1200px;
  margin: 0 auto;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}
</style>
