const express = require('express')
const multer = require('multer')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn, spawnSync } = require('child_process')
const {
  uploadImageToComfyUI,
  queuePrompt,
  waitForCompletion,
  getImageFromComfyUI,
  checkComfyUIReachable,
} = require('./comfyui')

const app = express()
app.use(cors())
app.use(express.json())

const UPLOAD_DIR = path.join(__dirname, 'uploads')
const OUTPUT_DIR = path.join(__dirname, 'outputs')
const PREPROCESS_DIR = path.join(OUTPUT_DIR, 'preprocessed')
const WORKFLOW_PATH = path.join(__dirname, '..', 'comfyui', 'workflow-print-extract.json')
const PREPROCESS_SCRIPT_PATH = path.join(__dirname, 'preprocess_pattern.py')
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188'
const COMFYUI_DIR = process.env.COMFYUI_DIR || 'E:\\myprojects\\ComfyUI'
const COMFYUI_PYTHON =
  process.env.COMFYUI_PYTHON || path.join(COMFYUI_DIR, 'venv', 'Scripts', 'python.exe')
const COMFYUI_AUTOSTART = process.env.COMFYUI_AUTOSTART !== 'false'
const TRANSPARENT_BACKGROUND_FILE_PATH =
  process.env.TRANSPARENT_BACKGROUND_FILE_PATH || 'E:\\models'
const COMFYUI_STARTUP_TIMEOUT_MS = Number(process.env.COMFYUI_STARTUP_TIMEOUT_MS || 120000)
const COMFYUI_POLL_INTERVAL_MS = Number(process.env.COMFYUI_POLL_INTERVAL_MS || 2000)

const tasks = new Map()
const comfyState = {
  status: 'unknown',
  reachable: false,
  autostart: COMFYUI_AUTOSTART,
  url: COMFYUI_URL,
  startupMode: process.env.COMFYUI_ARGS ? 'manual_args' : 'auto_detect',
  args: [],
  lastError: null,
  lastCheckedAt: null,
}
let comfyBootstrapPromise = null

ensureDirSync(UPLOAD_DIR)
ensureDirSync(OUTPUT_DIR)
ensureDirSync(PREPROCESS_DIR)

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

app.get('/api/health', async (_req, res) => {
  const reachable = await isComfyUIReachable()
  res.json({
    server: 'ok',
    comfyui: {
      ...comfyState,
      reachable,
      lastCheckedAt: new Date().toISOString(),
    },
  })
})

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    await ensureComfyUIReady()

    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' })
    }

    const taskId = crypto.randomUUID()
    const originalUrl = `/uploads/${req.file.filename}`

    tasks.set(taskId, {
      taskId,
      status: 'pending',
      originalImage: originalUrl,
      resultImage: null,
      error: null,
      createdAt: new Date().toISOString(),
      filePath: req.file.path,
    })

    processTask(taskId, req.file.path, req.file.filename).catch(err => {
      const task = tasks.get(taskId)
      if (task) {
        task.status = 'failed'
        task.processingStage = 'failed'
        task.error = err.message
      }
    })

    res.json(tasks.get(taskId))
  } catch (err) {
    const message = err.message || '服务异常'
    const statusCode = /ComfyUI.+未就绪|ComfyUI.+不可用/.test(message) ? 503 : 500
    res.status(statusCode).json({ error: message })
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
  res.download(task.resultFilePath, `print_${req.params.taskId.slice(0, 8)}.png`)
})

app.delete('/api/task/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) {
    return res.status(404).json({ error: '任务不存在' })
  }

  safeUnlink(task.filePath)
  safeUnlink(task.preprocessedFilePath)
  safeUnlink(task.resultFilePath)
  tasks.delete(req.params.taskId)

  res.json({ success: true })
})

async function processTask(taskId, filePath, filename) {
  const task = tasks.get(taskId)
  if (!task) return

  task.status = 'processing'
  task.processingStage = 'preprocess'

  const { outputPath: preprocessedPath, outputUrl: preprocessedUrl } = preprocessPatternImage(
    filePath,
    taskId
  )
  task.preprocessedImage = preprocessedUrl
  task.preprocessedFilePath = preprocessedPath
  task.processingStage = 'comfyui'

  const imageBuffer = fs.readFileSync(preprocessedPath)
  const comfyFilename = `preprocessed_${path.parse(filename).name}.png`
  const comfyImageName = await uploadImageToComfyUI(imageBuffer, comfyFilename)

  const workflowTemplate = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'))
  const workflow = JSON.parse(
    JSON.stringify(workflowTemplate).replace(/\{\{INPUT_IMAGE_NAME\}\}/g, comfyImageName)
  )

  const promptId = await queuePrompt(workflow)
  const result = await waitForCompletion(promptId)

  const outputs = result.outputs || {}
  let resultFilename = null
  let resultSubfolder = ''
  let resultType = 'output'

  for (const nodeId of Object.keys(outputs)) {
    const nodeOutput = outputs[nodeId]
    if (nodeOutput.images && nodeOutput.images.length > 0) {
      const img = nodeOutput.images[0]
      resultFilename = img.filename
      resultSubfolder = img.subfolder || ''
      resultType = img.type || 'output'
      break
    }
  }

  if (!resultFilename) {
    throw new Error('ComfyUI 未返回结果图片')
  }

  const resultBuffer = await getImageFromComfyUI(resultFilename, resultSubfolder, resultType)
  const outputFilename = `result_${taskId.slice(0, 8)}.png`
  const outputPath = path.join(OUTPUT_DIR, outputFilename)
  fs.writeFileSync(outputPath, resultBuffer)

  task.status = 'success'
  task.processingStage = 'done'
  task.resultImage = `/outputs/${outputFilename}`
  task.resultFilePath = outputPath
}

function preprocessPatternImage(inputPath, taskId) {
  if (!fs.existsSync(PREPROCESS_SCRIPT_PATH)) {
    throw new Error(`预处理脚本不存在: ${PREPROCESS_SCRIPT_PATH}`)
  }

  const outputFilename = `preprocess_${taskId.slice(0, 8)}.png`
  const outputPath = path.join(PREPROCESS_DIR, outputFilename)
  const result = spawnSync(
    COMFYUI_PYTHON,
    [PREPROCESS_SCRIPT_PATH, '--input', inputPath, '--output', outputPath],
    {
      cwd: __dirname,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90000,
      env: {
        ...process.env,
        TRANSPARENT_BACKGROUND_FILE_PATH,
      },
    }
  )

  if (result.error) {
    throw new Error(`预处理执行失败: ${result.error.message}`)
  }

  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    const stderr = (result.stderr || '').trim()
    const stdout = (result.stdout || '').trim()
    const detail = stderr || stdout || `退出码 ${result.status}`
    throw new Error(`预处理失败: ${detail}`)
  }

  return {
    outputPath,
    outputUrl: `/outputs/preprocessed/${outputFilename}`,
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

async function isComfyUIReachable() {
  const reachable = await checkComfyUIReachable()
  comfyState.reachable = reachable
  comfyState.lastCheckedAt = new Date().toISOString()
  if (reachable) {
    comfyState.status = 'ready'
    comfyState.lastError = null
  }
  return reachable
}

function isLocalComfyUI(urlString) {
  try {
    const url = new URL(urlString)
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname)
  } catch {
    return false
  }
}

function getComfyUIPort() {
  try {
    const url = new URL(COMFYUI_URL)
    return url.port || '8188'
  } catch {
    return '8188'
  }
}

function getConfiguredComfyUIArgs() {
  if (process.env.COMFYUI_ARGS) {
    return process.env.COMFYUI_ARGS.split(' ').map(arg => arg.trim()).filter(Boolean)
  }

  if (!fs.existsSync(COMFYUI_PYTHON)) {
    return ['--cpu']
  }

  const probe = spawnSync(
    COMFYUI_PYTHON,
    [
      '-c',
      "import torch; print('gpu' if torch.cuda.is_available() else 'cpu')",
    ],
    {
      cwd: COMFYUI_DIR,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    }
  )

  const mode = (probe.stdout || '').trim().toLowerCase()
  return mode === 'gpu' ? [] : ['--cpu']
}

function startComfyUIProcess() {
  if (!fs.existsSync(COMFYUI_DIR)) {
    console.warn(`[ComfyUI] 自动启动已跳过，目录不存在: ${COMFYUI_DIR}`)
    comfyState.status = 'error'
    comfyState.lastError = `目录不存在: ${COMFYUI_DIR}`
    return false
  }

  if (!fs.existsSync(COMFYUI_PYTHON)) {
    console.warn(`[ComfyUI] 自动启动已跳过，Python 不存在: ${COMFYUI_PYTHON}`)
    comfyState.status = 'error'
    comfyState.lastError = `Python 不存在: ${COMFYUI_PYTHON}`
    return false
  }

  const comfyArgs = getConfiguredComfyUIArgs()
  const args = ['main.py', '--port', getComfyUIPort(), ...comfyArgs]
  const child = spawn(COMFYUI_PYTHON, args, {
    cwd: COMFYUI_DIR,
    detached: true,
    env: {
      ...process.env,
      TRANSPARENT_BACKGROUND_FILE_PATH,
    },
    stdio: 'ignore',
    windowsHide: true,
  })

  child.unref()
  comfyState.status = 'starting'
  comfyState.args = args
  comfyState.lastError = null
  console.log(`[ComfyUI] 已尝试自动启动，目录: ${COMFYUI_DIR}`)
  console.log(`[ComfyUI] 启动参数: ${args.join(' ')}`)
  console.log(`[ComfyUI] transparent-background 目录: ${TRANSPARENT_BACKGROUND_FILE_PATH}`)
  return true
}

async function waitForComfyUIReady(timeoutMs = COMFYUI_STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isComfyUIReachable()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, COMFYUI_POLL_INTERVAL_MS))
  }
  return false
}

async function bootstrapComfyUI() {
  if (!COMFYUI_AUTOSTART) {
    console.log('[ComfyUI] 已关闭自动启动，可通过 COMFYUI_AUTOSTART=false 控制')
    comfyState.status = 'disabled'
    return
  }

  if (await isComfyUIReachable()) {
    console.log('[ComfyUI] 已检测到运行中的实例')
    return
  }

  if (!isLocalComfyUI(COMFYUI_URL)) {
    console.warn(`[ComfyUI] 当前地址不是本机地址，跳过自动启动: ${COMFYUI_URL}`)
    comfyState.status = 'external'
    return
  }

  const started = startComfyUIProcess()
  if (!started) return

  const ready = await waitForComfyUIReady()
  if (ready) {
    console.log(`[ComfyUI] 已就绪: ${COMFYUI_URL}`)
    comfyState.status = 'ready'
  } else {
    console.warn(`[ComfyUI] 自动启动后仍未就绪，请手动检查: ${COMFYUI_DIR}`)
    comfyState.status = 'error'
    comfyState.lastError = '自动启动后仍未就绪'
  }
}

function bootstrapComfyUIInBackground() {
  if (!comfyBootstrapPromise) {
    comfyBootstrapPromise = bootstrapComfyUI().finally(() => {
      comfyBootstrapPromise = null
    })
  }
  return comfyBootstrapPromise
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

async function ensureComfyUIReady() {
  if (await isComfyUIReachable()) return

  if (COMFYUI_AUTOSTART && isLocalComfyUI(COMFYUI_URL)) {
    await bootstrapComfyUIInBackground()
    if (await isComfyUIReachable()) return
  }

  throw new Error('ComfyUI 服务未就绪，请稍后重试或先手动检查 ComfyUI')
}

const PORT = process.env.PORT || 3000

async function startServer() {
  app.listen(PORT, () => {
    console.log(`服务已启动: http://localhost:${PORT}`)
    console.log(`ComfyUI 地址: ${COMFYUI_URL}`)
    console.log(`ComfyUI 自动启动: ${COMFYUI_AUTOSTART ? '开启' : '关闭'}`)
    console.log(`transparent-background 目录: ${TRANSPARENT_BACKGROUND_FILE_PATH}`)
  })

  bootstrapComfyUIInBackground().catch(err => {
    comfyState.status = 'error'
    comfyState.lastError = err.message
    console.error('[ComfyUI] 自动启动异常:', err)
  })
}

startServer().catch(err => {
  console.error('服务启动失败:', err)
  process.exit(1)
})
