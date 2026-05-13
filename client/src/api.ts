import type { TaskInfo } from './types/task'

const API_BASE = '/api'
const BACKEND_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:3001')
  : window.location.origin

function toAbsoluteUrl(url?: string): string | undefined {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  return new URL(url, BACKEND_ORIGIN).toString()
}

function normalizeTask(task: TaskInfo): TaskInfo {
  return {
    ...task,
    originalImage: toAbsoluteUrl(task.originalImage),
    resultImage: toAbsoluteUrl(task.resultImage),
  }
}

export async function uploadImage(payload: {
  file: File
  prompt: string
  model?: string
  featureKey?: string
  featureLabel?: string
}): Promise<TaskInfo> {
  const formData = new FormData()
  formData.append('image', payload.file)
  formData.append('prompt', payload.prompt)
  if (payload.model) {
    formData.append('model', payload.model)
  }
  if (payload.featureKey) {
    formData.append('featureKey', payload.featureKey)
  }
  if (payload.featureLabel) {
    formData.append('featureLabel', payload.featureLabel)
  }
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || '上传失败')
  }
  return normalizeTask(await res.json())
}

export async function getTaskStatus(taskId: string): Promise<TaskInfo> {
  const res = await fetch(`${API_BASE}/task/${taskId}`)
  if (!res.ok) throw new Error('查询失败')
  return normalizeTask(await res.json())
}

export async function getTaskList(): Promise<TaskInfo[]> {
  const res = await fetch(`${API_BASE}/tasks`)
  if (!res.ok) throw new Error('获取列表失败')
  return (await res.json()).map(normalizeTask)
}

export async function deleteTask(taskId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || '删除任务失败')
  }
}

export function getDownloadUrl(taskId: string): string {
  return new URL(`${API_BASE}/download/${taskId}`, BACKEND_ORIGIN).toString()
}
