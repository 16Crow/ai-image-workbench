export interface TaskInfo {
  taskId: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  originalImage?: string
  resultImage?: string
  error?: string
  createdAt: string
}
