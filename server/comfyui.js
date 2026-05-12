const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188'

async function checkComfyUIReachable() {
  try {
    const res = await fetch(COMFYUI_URL, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

async function uploadImageToComfyUI(imageBuffer, filename) {
  const formData = new FormData()
  const blob = new Blob([imageBuffer])
  formData.append('image', blob, filename)
  formData.append('overwrite', 'true')

  const res = await fetch(`${COMFYUI_URL}/upload/image`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) throw new Error(`ComfyUI 上传图片失败: ${res.status}`)
  const data = await res.json()
  return data.name
}

async function queuePrompt(workflow) {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })

  if (!res.ok) throw new Error(`ComfyUI 提交任务失败: ${res.status}`)
  const data = await res.json()
  return data.prompt_id
}

async function getPromptStatus(promptId) {
  const res = await fetch(`${COMFYUI_URL}/history/${promptId}`)
  if (!res.ok) throw new Error(`ComfyUI 查询状态失败: ${res.status}`)
  const data = await res.json()
  return data[promptId] || null
}

async function getImageFromComfyUI(filename, subfolder, folderType) {
  const params = new URLSearchParams({ filename })
  if (subfolder) params.set('subfolder', subfolder)
  if (folderType) params.set('type', folderType)

  const res = await fetch(`${COMFYUI_URL}/view?${params.toString()}`)
  if (!res.ok) throw new Error(`ComfyUI 获取图片失败: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function waitForCompletion(promptId, timeoutMs = 300000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await getPromptStatus(promptId)
    if (!status) {
      await sleep(2000)
      continue
    }
    if (status.status?.completed === true || status.status?.status_str === 'success') {
      return status
    }
    if (status.status?.status_str === 'error') {
      throw new Error('ComfyUI 处理失败: ' + JSON.stringify(status.status))
    }
    await sleep(2000)
  }
  throw new Error('ComfyUI 处理超时')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  uploadImageToComfyUI,
  queuePrompt,
  getPromptStatus,
  getImageFromComfyUI,
  waitForCompletion,
  checkComfyUIReachable,
}
