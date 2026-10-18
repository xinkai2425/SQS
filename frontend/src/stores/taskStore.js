import { defineStore } from 'pinia'
import { http } from '../api/http'

const STORAGE_KEY = 'iqg-background-tasks-v1'
const pollingTimers = new Map()
const typingTimers = new Map()
const outputQueues = new Map()

function createEmptyTask() {
  return {
    jobId: null,
    type: null,
    status: 'idle',
    progress: 0,
    generatedCount: 0,
    totalCount: 0,
    currentStage: '',
    label: '',
    questionIds: [],
    output: '',
    lines: [],
    items: [],
    result: null,
    sourcePath: '',
    context: {},
    error: null,
    createdAt: 0,
  }
}

function persistableTask(task) {
  return {
    jobId: task.jobId,
    type: task.type,
    status: task.status,
    progress: task.progress,
    generatedCount: task.generatedCount,
    totalCount: task.totalCount,
    currentStage: task.currentStage,
    label: task.label,
    questionIds: task.questionIds || [],
    sourcePath: task.sourcePath,
    context: task.context || {},
    error: task.error,
    createdAt: task.createdAt,
  }
}

export const useTaskStore = defineStore('task', {
  state: () => ({
    task: createEmptyTask(),
    tasks: [],
    showPanel: false,
  }),

  getters: {
    sortedTasks: (state) => {
      return [...state.tasks].sort((a, b) => {
        const aRunning = a.status === 'running' || a.status === 'queued' ? 0 : 1
        const bRunning = b.status === 'running' || b.status === 'queued' ? 0 : 1
        if (aRunning !== bRunning) return aRunning - bRunning
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
    },
  },

  actions: {
    findTask(jobId) {
      return this.tasks.find((task) => task.jobId === jobId) || null
    },

    persist() {
      try {
        const payload = {
          activeJobId: this.task.jobId,
          showPanel: this.showPanel,
          tasks: this.tasks.map(persistableTask),
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // Storage can be unavailable or full; the in-memory list still works.
      }
    },

    restoreTasks() {
      if (this.tasks.length > 0) return

      let saved = null
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) saved = JSON.parse(raw)
      } catch {
        saved = null
      }

      if (!saved || !Array.isArray(saved.tasks) || saved.tasks.length === 0) return

      for (const summary of saved.tasks) {
        const task = createEmptyTask()
        Object.assign(task, summary, {
          output: '',
          lines: [],
          items: [],
          result: null,
        })
        this.tasks.push(task)
      }

      const active =
        this.tasks.find((task) => task.jobId === saved.activeJobId) ||
        this.tasks.find((task) => task.status === 'running' || task.status === 'queued') ||
        null

      this.task = active || createEmptyTask()
      this.showPanel = Boolean(active && saved.showPanel)

      for (const task of [...this.tasks]) {
        this.startPolling(task.jobId)
      }
    },

    clearAll() {
      for (const task of [...this.tasks]) {
        this.stopPolling(task.jobId)
        this.stopTyping(task.jobId)
      }
      this.tasks = []
      this.task = createEmptyTask()
      this.showPanel = false
      this.persist()
    },

    startTask({ jobId, type, sourcePath, context = {}, label = '' }) {
      const task = createEmptyTask()
      task.jobId = jobId
      task.type = type
      task.label = label
      task.sourcePath = sourcePath
      task.context = context
      task.status = 'running'
      task.currentStage = '准备中...'
      task.createdAt = Date.now()

      this.tasks.push(task)
      this.task = task
      this.showPanel = true
      this.pushLine(`任务已创建：${jobId}`, task)
      this.startPolling(jobId)
      this.persist()
    },

    resetTask() {
      this.task = createEmptyTask()
      this.showPanel = false
      this.persist()
    },

    removeTask(jobId) {
      this.stopPolling(jobId)
      this.stopTyping(jobId)

      const index = this.tasks.findIndex((task) => task.jobId === jobId)
      if (index >= 0) this.tasks.splice(index, 1)

      if (this.task.jobId === jobId) {
        this.task = createEmptyTask()
        this.showPanel = false
      }

      this.persist()
    },

    selectTask(jobId) {
      const task = this.findTask(jobId)
      if (!task) return false
      this.task = task
      this.showPanel = true
      this.persist()
      return true
    },

    pushLine(text, task = this.task) {
      if (!task || !task.jobId || !text) return
      task.lines.push(text)
      if (task.lines.length > 2000) {
        task.lines.splice(0, task.lines.length - 2000)
      }
    },

    enqueueOutput(text, task = this.task) {
      if (!text || !task || !task.jobId) return

      outputQueues.set(task.jobId, (outputQueues.get(task.jobId) || '') + text)

      if (typingTimers.has(task.jobId)) return

      const timer = setInterval(() => {
        const queue = outputQueues.get(task.jobId)
        if (!queue) {
          this.stopTyping(task.jobId)
          return
        }

        const backlog = queue.length
        const step = Math.min(60, Math.max(1, Math.floor(backlog / 120)))
        const chunk = queue.slice(0, step)
        outputQueues.set(task.jobId, queue.slice(step))

        task.output += chunk
        if (task.output.length > 200000) {
          task.output = task.output.slice(task.output.length - 200000)
        }

        if (task.totalCount > 0) {
          const matches = task.output.match(/"question_analysis"/g)
          const count = matches ? matches.length : 0
          task.generatedCount = Math.min(task.totalCount, Math.max(task.generatedCount, count))
          task.progress = Math.min(100, Math.floor((task.generatedCount / task.totalCount) * 100))
        }
      }, 16)

      typingTimers.set(task.jobId, timer)
    },

    stopPolling(jobId) {
      const timer = pollingTimers.get(jobId)
      if (timer) {
        clearInterval(timer)
        pollingTimers.delete(jobId)
      }
    },

    stopTyping(jobId) {
      const timer = typingTimers.get(jobId)
      if (timer) {
        clearInterval(timer)
        typingTimers.delete(jobId)
      }

      const task = this.findTask(jobId)
      const queue = outputQueues.get(jobId)
      if (task && queue) {
        task.output += queue
        outputQueues.delete(jobId)
      } else if (queue) {
        outputQueues.delete(jobId)
      }
    },

    startPolling(jobId) {
      if (!jobId || pollingTimers.has(jobId)) return

      const cursor = { lastEventId: 0 }
      const timer = setInterval(async () => {
        await this.pollJob(jobId, cursor)
      }, 1000)

      pollingTimers.set(jobId, timer)
      this.pollJob(jobId, cursor)
    },

    async pollJob(jobId, cursor) {
      try {
        const resp = await http.get(`/ai/jobs/${jobId}`)
        const job = resp.data.job
        const task = this.findTask(jobId)
        if (!job || !task) return

        this.applySnapshot(task, job)

        const events = job.events || []
        const newEvents = events
          .filter((event) => (event.id || 0) > cursor.lastEventId)
          .sort((a, b) => (a.id || 0) - (b.id || 0))

        for (const event of newEvents) {
          cursor.lastEventId = event.id || cursor.lastEventId
          this.applyEvent(task, event)
        }

        if (task.status === 'done' || task.status === 'error') {
          this.stopPolling(jobId)
          this.stopTyping(jobId)
          if (task.status === 'done') task.progress = 100
        }

        this.persist()
      } catch (error) {
        // Keep polling; a temporary network failure should not erase the task list.
        if (error?.status === 404) {
          this.stopPolling(jobId)
        }
      }
    },

    applySnapshot(task, job) {
      task.status = job.status || task.status
      task.error = job.error || task.error
      task.items = Array.isArray(job.items) ? job.items : task.items
      task.result = job.result || task.result
      if (Array.isArray(job.question_ids)) {
        task.questionIds = job.question_ids
      }

      if (job.inserted !== undefined) {
        task.generatedCount = Number(job.inserted) || 0
      }

      if (task.status === 'running' && job.total_count !== undefined) {
        task.totalCount = Number(job.total_count) || task.totalCount
      }

      if (task.status === 'done') {
        task.progress = 100
      } else if (task.totalCount > 0 && task.status === 'running') {
        task.progress = Math.min(100, Math.floor((task.generatedCount / task.totalCount) * 100))
      }
    },

    applyEvent(task, event) {
      if (!event) return

      if (event.type === 'ai_delta') {
        const text = event?.data?.text || ''
        task.currentStage = '正在解析...'
        if (this.task.jobId === task.jobId && this.showPanel) {
          this.enqueueOutput(text, task)
        } else {
          task.output += text
        }
        return
      }

      const ts = event.ts ? `【${event.ts}】` : ''
      const msg = event.message ? ` ${event.message}` : ''
      this.pushLine(`${ts}${event.type}${msg}`, task)

      if (event.type === 'job_start') {
        if (event.data && event.data.total_count) {
          task.totalCount = Number(event.data.total_count) || 0
        }
      } else if (event.type === 'job_done') {
        task.status = 'done'
        task.currentStage = task.type === 'parsing' ? '解析完成' : '生成完成'
        task.items = task.items || []
        task.result = event.data

        if (task.type === 'parsing') {
          task.generatedCount = task.items.length
          task.totalCount = task.items.length
          task.progress = 100
        } else {
          const requestedTotal = Number(task.totalCount) || 0
          if (event.data && event.data.inserted !== undefined) {
            task.generatedCount = event.data.inserted
          } else if (task.items.length > 0) {
            task.generatedCount = task.items.length
          }

          if (requestedTotal > 0) {
            task.generatedCount = Math.min(requestedTotal, Number(task.generatedCount) || 0)
            task.totalCount = requestedTotal
          } else {
            task.totalCount = Number(task.generatedCount) || 0
          }
          task.progress = task.totalCount > 0
            ? Math.min(100, Math.floor((task.generatedCount / task.totalCount) * 100))
            : 100
        }
      } else if (event.type === 'job_error') {
        task.status = 'error'
        task.currentStage = task.type === 'parsing' ? '解析出错' : '生成出错'
        task.error = event.message || '未知错误'
      } else if (event.type === 'progress') {
        if (event.data && event.data.inserted !== undefined) {
          const inserted = Number(event.data.inserted) || 0
          task.generatedCount = task.totalCount > 0 ? Math.min(task.totalCount, inserted) : inserted
          if (task.totalCount > 0) {
            task.progress = Math.min(100, Math.floor((task.generatedCount / task.totalCount) * 100))
          }
        }
      }
    },
  },
})
