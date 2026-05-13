export interface TaskInfo {
  taskId: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  processingStage?: string
  originalImage?: string
  resultImage?: string
  error?: string
  featureKey?: string
  featureLabel?: string
  prompt?: string
  model?: string
  createdAt: string
}
