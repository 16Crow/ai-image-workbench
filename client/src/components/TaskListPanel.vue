<template>
  <el-card class="panel task-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="card-title">
          <el-icon><List /></el-icon>
          <span>处理任务</span>
        </div>
        <el-button text type="primary" @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </template>

    <el-empty v-if="tasks.length === 0" description="暂无任务，请先上传并框选主花型" />

    <div v-else class="task-list">
      <div v-for="task in tasks" :key="task.taskId" class="task-item">
        <div class="thumb-column">
          <div class="thumb-block compact">
            <div class="thumb-label">原</div>
            <el-image v-if="task.originalImage" :src="task.originalImage" fit="cover" class="thumb-img compact" />
            <div v-else class="thumb-empty">
              <el-icon><Picture /></el-icon>
            </div>
          </div>
          <div class="thumb-block compact">
            <div class="thumb-label">结</div>
            <el-image
              v-if="task.resultImage"
              :src="task.resultImage"
              fit="contain"
              class="thumb-img compact result-thumb"
              :preview-src-list="[task.resultImage]"
            />
            <div v-else class="thumb-empty">
              <el-icon><MagicStick /></el-icon>
            </div>
          </div>
        </div>

        <div class="task-main">
          <div class="task-topline">
            <div class="task-heading">
              <div class="task-id">任务 #{{ task.taskId.slice(0, 8) }}</div>
              <div class="task-time">{{ formatTime(task.createdAt) }}</div>
            </div>
            <el-tag :type="statusTagType(task.status)" effect="dark" round>
              {{ statusText(task.status) }}
            </el-tag>
          </div>
          <div class="task-note" v-if="task.status === 'success'">
            已完成外部模型处理
          </div>
          <div class="task-note" v-if="task.prompt">
            指令：{{ task.prompt }}
          </div>
          <div class="task-actions">
            <el-button
              v-if="task.status === 'success'"
              type="success"
              size="small"
              @click="emit('download', task.taskId)"
            >
              <el-icon><Download /></el-icon>
              下载
            </el-button>
            <el-button
              v-if="task.status === 'failed'"
              type="danger"
              size="small"
              plain
              @click="emit('showError', task.error)"
            >
              <el-icon><Warning /></el-icon>
              查看错误
            </el-button>
            <el-button type="danger" size="small" plain @click="emit('delete', task.taskId)">
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { TaskInfo } from '../types/task'

defineProps<{
  tasks: TaskInfo[]
}>()

const emit = defineEmits<{
  refresh: []
  download: [taskId: string]
  delete: [taskId: string]
  showError: [error?: string]
}>()

function statusText(status: string) {
  const map: Record<string, string> = {
    pending: '排队中',
    processing: '处理中',
    success: '已完成',
    failed: '失败',
  }
  return map[status] || status
}

function statusTagType(status: string) {
  const map: Record<string, string> = {
    pending: 'info',
    processing: 'warning',
    success: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}
</script>

<style scoped>
.panel {
  border-radius: 22px;
  border: 1px solid rgba(20, 83, 45, 0.08);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.06);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #10241a;
}

.task-list {
  display: grid;
  gap: 10px;
}

.task-item {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(252, 253, 252, 0.92);
  border: 1px solid rgba(20, 83, 45, 0.07);
  box-shadow: 0 10px 28px rgba(16, 36, 26, 0.04);
}

.thumb-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-content: center;
}

.thumb-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thumb-block.compact {
  align-items: center;
}

.thumb-label {
  font-size: 11px;
  font-weight: 700;
  color: #6c7f73;
  letter-spacing: 0.08em;
}

.thumb-img,
.thumb-empty {
  width: 100%;
  height: 112px;
  border-radius: 14px;
  overflow: hidden;
  background: #eaf0eb;
}

.thumb-img.compact,
.thumb-block.compact .thumb-empty {
  width: 50px;
  height: 50px;
  border-radius: 12px;
}

.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8fa095;
}

.result-thumb {
  border: 2px solid #14532d;
}

.task-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.task-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.task-heading {
  min-width: 0;
}

.task-id {
  font-size: 16px;
  font-weight: 700;
  color: #10241a;
  line-height: 1.2;
}

.task-time {
  margin-top: 4px;
  font-size: 12px;
  color: #7b8b82;
}

.task-note {
  margin-top: 8px;
  font-size: 12px;
  color: #5c7264;
  line-height: 1.5;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

@media (max-width: 1080px) {
  .task-item {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .thumb-column {
    grid-template-columns: 1fr;
  }
}
</style>
