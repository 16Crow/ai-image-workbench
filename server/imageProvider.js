const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '.env.local') })

const IMAGE_EDIT_API_URL =
  process.env.IMAGE_EDIT_API_URL || 'https://aibibo.com/v1/images/edits'
const IMAGE_API_KEY = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || ''
const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2'
const IMAGE_FIELD_NAME = process.env.IMAGE_FIELD_NAME || 'image[]'
const IMAGE_RESPONSE_FORMAT = process.env.IMAGE_RESPONSE_FORMAT || ''
const DEFAULT_PROMPT =
  process.env.IMAGE_DEFAULT_PROMPT || '请根据这张图片完成高质量图像编辑，保持主体清晰、自然、细节完整。'

function getProviderInfo() {
  return {
    configured: Boolean(IMAGE_API_KEY),
    editUrl: IMAGE_EDIT_API_URL,
    defaultModel: DEFAULT_IMAGE_MODEL,
    imageFieldName: IMAGE_FIELD_NAME,
    responseFormat: IMAGE_RESPONSE_FORMAT || null,
  }
}

function getDefaultPrompt() {
  return DEFAULT_PROMPT
}

function getDefaultModel() {
  return DEFAULT_IMAGE_MODEL
}

function ensureProviderConfigured() {
  if (!IMAGE_API_KEY) {
    throw new Error('未配置外部图像接口密钥，请先设置 IMAGE_API_KEY')
  }
}

async function callImageEdit({ imageBuffer, filename, prompt, model }) {
  ensureProviderConfigured()

  const formData = new FormData()
  formData.append('model', model || DEFAULT_IMAGE_MODEL)
  formData.append('prompt', prompt || DEFAULT_PROMPT)
  formData.append(IMAGE_FIELD_NAME, new Blob([imageBuffer]), filename)

  if (IMAGE_RESPONSE_FORMAT) {
    formData.append('response_format', IMAGE_RESPONSE_FORMAT)
  }

  const res = await fetch(IMAGE_EDIT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IMAGE_API_KEY}`,
    },
    body: formData,
  })

  const payload = await readJsonSafely(res)
  if (!res.ok) {
    const detail = extractErrorMessage(payload) || `HTTP ${res.status}`
    throw new Error(`外部图像接口调用失败: ${detail}`)
  }

  const firstImage = payload?.data?.[0]
  if (!firstImage) {
    throw new Error('外部图像接口未返回图片数据')
  }

  if (firstImage.b64_json) {
    const mimeType = firstImage.mime_type || 'image/png'
    return {
      buffer: Buffer.from(firstImage.b64_json, 'base64'),
      mimeType,
    }
  }

  if (firstImage.url) {
    return downloadResultImage(firstImage.url)
  }

  throw new Error('外部图像接口返回格式无法识别，未找到 url 或 b64_json')
}

async function downloadResultImage(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载外部结果图失败: HTTP ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: res.headers.get('content-type') || 'image/png',
  }
}

async function readJsonSafely(res) {
  const text = await res.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function extractErrorMessage(payload) {
  if (!payload) return ''
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.error?.message === 'string') return payload.error.message
  if (typeof payload.raw === 'string') return payload.raw
  return ''
}

function getExtensionFromMimeType(mimeType) {
  const normalized = (mimeType || '').split(';')[0].trim().toLowerCase()
  const mapping = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  }
  return mapping[normalized] || path.extname('result.png')
}

module.exports = {
  callImageEdit,
  getDefaultModel,
  getDefaultPrompt,
  getExtensionFromMimeType,
  getProviderInfo,
}
