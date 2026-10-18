<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '../stores/taskStore'

const props = defineProps({
  allowedTypes: {
    type: Array,
    default: () => [],
  },
})

const route = useRoute()
const taskStore = useTaskStore()
const activeIndex = ref(0)
const deckRef = ref(null)
const bodyRefs = new Map()

const visibleTasks = computed(() => {
  return taskStore.sortedTasks.filter((task) => {
    if (task.sourcePath !== route.path) return false
    if (task.status !== 'running' && task.status !== 'queued') return false
    if (props.allowedTypes.length > 0 && !props.allowedTypes.includes(task.type)) return false
    return true
  })
})

const activeTask = computed(() => visibleTasks.value[activeIndex.value] || null)

watch(
  () => visibleTasks.value.map((task) => task.jobId).join(','),
  () => {
    if (visibleTasks.value.length === 0) {
      activeIndex.value = 0
    } else if (activeIndex.value >= visibleTasks.value.length) {
      activeIndex.value = visibleTasks.value.length - 1
    }
  },
  { immediate: true },
)

watch(
  () => visibleTasks.value.length,
  (length, previous) => {
    if (length > 0 && length !== previous) {
      nextTick(() => {
        deckRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  },
  { immediate: true },
)

watch(
  () => [activeIndex.value, activeTask.value?.output.length, activeTask.value?.lines.length],
  () => {
    nextTick(() => {
      const el = bodyRefs.get(activeTask.value?.jobId)
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

function taskTitle(task) {
  if (task.label) return task.label
  if (task.type === 'parsing') return 'AI智能导入'
  if (task.type === 'ai_review') return 'AI题目生成'
  if (task.type === 'paper_gen') return '智能组卷'
  return 'AI任务'
}

function taskStatusText(task) {
  if (task.status === 'queued') return '排队中'
  if (task.status === 'running') return task.currentStage || '处理中'
  return '处理中'
}

function cardStyle(index) {
  const distance = index - activeIndex.value
  return {
    '--stack-y': `${distance * 12}px`,
    '--stack-scale': Math.max(0.92, 1 - Math.abs(distance) * 0.025),
    '--stack-opacity': distance === 0 ? 1 : Math.max(0.22, 0.76 - Math.abs(distance) * 0.18),
    zIndex: 1000 - Math.abs(distance),
    pointerEvents: distance === 0 ? 'auto' : 'none',
  }
}

function setBodyRef(jobId, el) {
  if (el) {
    bodyRefs.set(jobId, el)
  } else {
    bodyRefs.delete(jobId)
  }
}

function handleWheel(event) {
  const total = visibleTasks.value.length
  if (total <= 1) return
  event.preventDefault()
  const direction = event.deltaY > 0 ? 1 : -1
  activeIndex.value = (activeIndex.value + direction + total) % total
}

function clearTask(task) {
  task.output = ''
  task.lines = []
  taskStore.persist()
}

onBeforeUnmount(() => {
  for (const task of taskStore.tasks.filter((item) => item.sourcePath === route.path)) {
    if (task.status === 'done' || task.status === 'error') {
      taskStore.removeTask(task.jobId)
    }
  }
})
</script>

<template>
  <div ref="deckRef" class="task-stream-wrap">
    <TransitionGroup
      v-if="visibleTasks.length"
      name="stream-card"
      tag="div"
      class="stream-deck"
      @wheel="handleWheel"
    >
      <section
        v-for="(task, index) in visibleTasks"
        :key="task.jobId"
        class="stream-card"
        :class="{ 'is-active': index === activeIndex }"
        :style="cardStyle(index)"
      >
        <div class="stream-card-header">
          <div class="stream-card-title">
            <strong>{{ taskTitle(task) }}</strong>
            <span>{{ task.jobId }} · {{ taskStatusText(task) }}</span>
          </div>
          <button class="stream-card-clear" type="button" @click="clearTask(task)">清空</button>
        </div>

        <div class="stream-card-progress">
          <div class="stream-card-progress-meta">
            <span>{{ task.currentStage || '准备中...' }}</span>
            <span v-if="task.type === 'parsing'">已解析入库 {{ task.generatedCount }} 题</span>
            <span v-else>已生成 {{ task.generatedCount }} / {{ task.totalCount }} · {{ task.progress }}%</span>
          </div>
          <div class="stream-card-progress-track">
            <i :style="{ width: `${task.progress}%` }"></i>
          </div>
        </div>

        <div :ref="(el) => setBodyRef(task.jobId, el)" class="stream-card-body">
          <div v-if="task.lines.length" class="stream-card-lines">
            <div v-for="(line, index) in task.lines" :key="index">{{ line }}</div>
          </div>
          <div v-else class="stream-card-empty">等待事件流…</div>
          <pre v-if="task.output" class="stream-card-output">{{ task.output }}</pre>
        </div>
      </section>
    </TransitionGroup>

  </div>
</template>

<style scoped>
.task-stream-wrap {
  display: flex;
  flex-direction: column;
}

.stream-deck {
  position: relative;
  height: 320px;
  margin-top: 14px;
}

.stream-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-surface-solid);
  box-shadow: var(--app-shadow-card);
  opacity: var(--stack-opacity, 1);
  transform: translate3d(0, var(--stack-y, 0), 0) scale(var(--stack-scale, 1));
  transition:
    opacity 180ms var(--ease-out),
    transform 280ms var(--ease-out),
    box-shadow 220ms ease;
  will-change: transform, opacity;
}

.stream-card.is-active {
  box-shadow: var(--app-shadow-lift);
}

.stream-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border-soft);
}

.stream-card-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.stream-card-title strong {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.stream-card-title span {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stream-card-clear {
  flex: 0 0 auto;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-soft);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  transition:
    transform 120ms var(--ease-out),
    background-color 120ms ease;
}

.stream-card-clear:active {
  transform: scale(0.97);
}

.stream-card-progress {
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border-soft);
}

.stream-card-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--app-text-soft);
  font-size: 12px;
}

.stream-card-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-border-soft);
}

.stream-card-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--app-primary), var(--app-mint));
  transition: width 260ms var(--ease-out);
}

.stream-card-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.stream-card-lines {
  margin-bottom: 10px;
  color: var(--app-text-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.stream-card-empty {
  color: var(--app-text-muted);
  font-size: 12px;
}

.stream-card-output {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.stream-card-enter-active,
.stream-card-leave-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 260ms var(--ease-out);
}

.stream-card-enter-from {
  opacity: 0;
  transform: translate3d(0, 16px, 0) scale(0.97);
}

.stream-card-leave-to {
  opacity: 0;
  transform: translate3d(0, -10px, 0) scale(0.98);
}

@media (hover: hover) and (pointer: fine) {
  .stream-card-clear:hover {
    background: var(--app-primary-soft);
  }

}

@media (prefers-reduced-motion: reduce) {
  .stream-card,
  .stream-card-enter-active,
  .stream-card-leave-active {
    transition: none;
  }

  .stream-card-enter-from,
  .stream-card-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
