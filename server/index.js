const express = require('express')
const multer = require('multer')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const {
  callImageEdit,
  getDefaultModel,
  getDefaultPrompt,
  getExtensionFromMimeType,
  getProviderInfo,
} = require('./imageProvider')

const app = express()
app.use(cors())
app.use(express.json())

const UPLOAD_DIR = path.join(__dirname, 'uploads')
const OUTPUT_DIR = path.join(__dirname, 'outputs')
const PORT = process.env.PORT || 3000
const tasks = new Map()
const providerState = {
  status: 'idle',
  lastError: null,
  lastCheckedAt: null,
}

ensureDirSync(UPLOAD_DIR)
ensureDirSync(OUTPUT_DIR)

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

app.use('/uploads', express.static(UPLOAD_DIR))
app.use('/outputs', express.static(OUTPUT_DIR))

app.get('/api/health', (_req, res) => {
  const providerInfo = getProviderInfo()
  res.json({
    server: 'ok',
    provider: {
      ...providerInfo,
      status: providerInfo.configured ? providerState.status : 'missing_config',
      lastError: providerState.lastError,
      lastCheckedAt: providerState.lastCheckedAt,
    },
  })
})

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' })
    }

    const taskId = crypto.randomUUID()
    const prompt = normalizeText(req.body?.prompt) || getDefaultPrompt()
    const model = normalizeText(req.body?.model) || getDefaultModel()
    const featureKey = normalizeText(req.body?.featureKey)
    const featureLabel = normalizeText(req.body?.featureLabel)
    const originalUrl = `/uploads/${req.file.filename}`

    tasks.set(taskId, {
      taskId,
      status: 'pending',
      processingStage: 'queued',
      originalImage: originalUrl,
      resultImage: null,
      error: null,
      createdAt: new Date().toISOString(),
      filePath: req.file.path,
      featureKey,
      featureLabel,
      prompt,
      model,
    })

    processTask(taskId, req.file.path, req.file.filename, { prompt, model }).catch(err => {
      const task = tasks.get(taskId)
      providerState.status = 'error'
      providerState.lastError = err.message
      providerState.lastCheckedAt = new Date().toISOString()
      if (task) {
        task.status = 'failed'
        task.processingStage = 'failed'
        task.error = err.message
      }
    })

    res.json(tasks.get(taskId))
  } catch (err) {
    res.status(500).json({ error: err.message || '服务异常' })
  }
})

app.get('/api/task/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) return res.status(404).json({ error: '任务不存在' })
  res.json(task)
})

app.get('/api/tasks', (_req, res) => {
  const list = Array.from(tasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  res.json(list)
})

app.get('/api/download/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task || task.status !== 'success' || !task.resultFilePath) {
    return res.status(404).json({ error: '结果不可用' })
  }

  const ext = path.extname(task.resultFilePath) || '.png'
  res.download(task.resultFilePath, `result_${req.params.taskId.slice(0, 8)}${ext}`)
})

app.delete('/api/task/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) {
    return res.status(404).json({ error: '任务不存在' })
  }

  safeUnlink(task.filePath)
  safeUnlink(task.resultFilePath)
  tasks.delete(req.params.taskId)

  res.json({ success: true })
})

async function processTask(taskId, filePath, filename, { prompt, model }) {
  const task = tasks.get(taskId)
  if (!task) return

  providerState.status = 'processing'
  providerState.lastError = null
  providerState.lastCheckedAt = new Date().toISOString()
  task.status = 'processing'
  task.processingStage = 'provider'

  const imageBuffer = fs.readFileSync(filePath)
  const result = await callImageEdit({
    imageBuffer,
    filename,
    prompt,
    model,
  })

  const ext = getExtensionFromMimeType(result.mimeType)
  const outputFilename = `result_${taskId.slice(0, 8)}${ext}`
  const outputPath = path.join(OUTPUT_DIR, outputFilename)
  fs.writeFileSync(outputPath, result.buffer)

  task.status = 'success'
  task.processingStage = 'done'
  task.resultImage = `/outputs/${outputFilename}`
  task.resultFilePath = outputPath
  providerState.status = 'ready'
  providerState.lastCheckedAt = new Date().toISOString()
}

function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function safeUnlink(filePath) {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (err) {
    console.warn(`[Task Cleanup] 删除文件失败: ${filePath}`, err.message)
  }
}

app.listen(PORT, () => {
  const providerInfo = getProviderInfo()
  console.log(`服务已启动: http://localhost:${PORT}`)
  console.log(`外部图像接口: ${providerInfo.editUrl}`)
  console.log(`默认模型: ${providerInfo.defaultModel}`)
  console.log(`接口密钥: ${providerInfo.configured ? '已配置' : '未配置'}`)
})
