<template>
  <div class="app-shell">
    <header class="hero">
      <div class="hero-badge">
        <el-icon><MagicStick /></el-icon>
        <span>AI Image Workbench</span>
      </div>
      <h1>先框选主体，再做 AI 图片处理</h1>
      <p>当前版本直接调用外部图像编辑模型，保留上传、任务轮询和结果下载这套工作流。</p>
    </header>

    <main class="layout">
      <section class="left-column">
        <UploadWorkbench ref="workbenchRef" :uploading="uploading" @submit="handleUpload" />

        <el-card class="panel tips-panel" shadow="never">
          <template #header>
            <div class="card-title">
              <el-icon><InfoFilled /></el-icon>
              <span>当前阶段</span>
            </div>
          </template>
          <div class="tips-copy">
            <p>1. 先框选真正需要处理的主体区域。</p>
            <p>2. 在左侧输入清晰的处理指令，告诉模型你想怎么改。</p>
            <p>3. 上传后由后端转调外部图片编辑接口并返回结果。</p>
          </div>
        </el-card>
      </section>

      <section class="right-column">
        <TaskListPanel
          :tasks="tasks"
          @refresh="refreshTasks"
          @download="downloadResult"
          @delete="handleDeleteTask"
          @showError="showError"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteTask, getDownloadUrl, getTaskList, getTaskStatus, uploadImage } from './api'
import UploadWorkbench from './components/UploadWorkbench.vue'
import TaskListPanel from './components/TaskListPanel.vue'
import type { TaskInfo } from './types/task'

const uploading = ref(false)
const tasks = ref<TaskInfo[]>([])
const workbenchRef = ref<InstanceType<typeof UploadWorkbench> | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function handleUpload(payload: { file: File; prompt: string }) {
  uploading.value = true
  try {
    const task = await uploadImage(payload.file, payload.prompt)
    tasks.value.unshift(task)
    ElMessage.success('上传成功，开始处理...')
    workbenchRef.value?.reset()
    startPolling()
  } catch (e: any) {
    ElMessage.error(e?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function refreshTasks() {
  try {
    tasks.value = await getTaskList()
  } catch {
    ElMessage.error('刷新失败')
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    const pending = tasks.value.filter(t => t.status === 'pending' || t.status === 'processing')
    if (pending.length === 0) {
      stopPolling()
      return
    }

    for (const task of pending) {
      try {
        const updated = await getTaskStatus(task.taskId)
        const idx = tasks.value.findIndex(t => t.taskId === task.taskId)
        if (idx !== -1) tasks.value[idx] = updated
      } catch {}
    }
  }, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function downloadResult(taskId: string) {
  window.open(getDownloadUrl(taskId), '_blank')
}

async function handleDeleteTask(taskId: string) {
  try {
    await ElMessageBox.confirm('删除后将移除任务记录以及对应图片文件，是否继续？', '删除任务', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })

    await deleteTask(taskId)
    tasks.value = tasks.value.filter(task => task.taskId !== taskId)
    ElMessage.success('任务已删除')
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.message || '删除失败')
  }
}

function showError(error?: string) {
  ElMessage.error(error || '处理失败，请重试')
}

onMounted(() => {
  refreshTasks()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  max-width: 1480px;
  margin: 0 auto;
  padding: 28px 22px 40px;
}

.hero {
  margin-bottom: 24px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(20, 83, 45, 0.1);
  color: #166534;
  font-size: 13px;
  font-weight: 700;
}

.hero h1 {
  margin-top: 14px;
  font-size: 36px;
  line-height: 1.08;
  letter-spacing: -1px;
  color: #10241a;
}

.hero p {
  margin-top: 8px;
  font-size: 15px;
  color: #5b6b62;
}

.layout {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 22px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel {
  border-radius: 22px;
  border: 1px solid rgba(20, 83, 45, 0.08);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.06);
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #10241a;
}

.tips-copy {
  display: grid;
  gap: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: #526259;
}

@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .app-shell {
    padding: 18px 14px 28px;
  }

  .hero h1 {
    font-size: 28px;
  }
}
</style>
