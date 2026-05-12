<template>
  <el-dialog
    :model-value="modelValue"
    title="框选主花型区域"
    width="960px"
    top="4vh"
    destroy-on-close
    @open="handleOpen"
    @closed="handleClosed"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="crop-dialog">
      <div class="crop-copy">
        <div>使用成熟裁切组件框出主花型区域，避开袖子、领口、项链和大片纯色区域。</div>
        <div>支持拖拽移动、缩放、滚轮缩放，交互会比手写选框稳定很多。</div>
      </div>

      <div class="crop-stage">
        <img
          ref="imageRef"
          :key="imageUrl"
          :src="imageUrl"
          alt="待裁切图片"
          class="crop-image"
          @load="initCropper"
        />
      </div>

      <div class="crop-toolbar">
        <div class="crop-stats">
          <span v-if="cropSummary">{{ cropSummary }}</span>
          <span>输出建议：保留主体花型，少留无关边缘</span>
        </div>
        <div class="crop-buttons">
          <el-button @click="resetCropper">重置</el-button>
          <el-button type="primary" @click="confirmSelection">使用当前选区</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import Cropper from 'cropperjs'
import { ElMessage } from 'element-plus'
import { nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  modelValue: boolean
  imageUrl: string
  mimeType?: string
  fileName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { file: File; previewUrl: string; summary: string }]
}>()

const imageRef = ref<HTMLImageElement | null>(null)
const cropper = ref<any>(null)
const cropSummary = ref('')
const pendingInit = ref(false)

function destroyCropper() {
  cropper.value?.destroy()
  cropper.value = null
}

async function handleOpen() {
  await nextTick()
  pendingInit.value = true
  initCropper()
}

function initCropper() {
  const image = imageRef.value
  if (!props.modelValue || !image) return
  if (!image.complete || image.naturalWidth === 0) return
  if (!pendingInit.value && cropper.value) return

  destroyCropper()
  cropper.value = new Cropper(image, {
    viewMode: 1,
    dragMode: 'crop',
    aspectRatio: NaN,
    autoCropArea: 0.72,
    background: false,
    responsive: true,
    restore: false,
    guides: true,
    center: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
    wheelZoomRatio: 0.08,
    ready: () => {
      pendingInit.value = false
      updateCropSummary()
    },
    crop: updateCropSummary,
  })
}

function handleClosed() {
  destroyCropper()
  cropSummary.value = ''
}

function updateCropSummary() {
  if (!cropper.value) return
  const data = cropper.value.getData(true)
  cropSummary.value = `选区尺寸：${Math.round(data.width)} × ${Math.round(data.height)}`
}

function resetCropper() {
  cropper.value?.reset()
  cropper.value?.crop()
  updateCropSummary()
}

function confirmSelection() {
  if (!cropper.value || typeof cropper.value.getCroppedCanvas !== 'function') {
    ElMessage.error('裁切组件初始化失败，请关闭弹窗后重试；如仍异常，请重启前端开发服务')
    return
  }

  const canvas = cropper.value.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  })
  if (!canvas) return

  canvas.toBlob((blob: Blob | null) => {
    if (!blob) return
    const type = blob.type || props.mimeType || 'image/png'
    const ext = type.split('/')[1] || 'png'
    const file = new File([blob], props.fileName || `cropped-${Date.now()}.${ext}`, { type })
    const previewUrl = URL.createObjectURL(blob)
    emit('confirm', {
      file,
      previewUrl,
      summary: cropSummary.value,
    })
    emit('update:modelValue', false)
  }, props.mimeType || 'image/png', 0.98)
}

onBeforeUnmount(() => {
  destroyCropper()
})
</script>

<style scoped>
.crop-dialog {
  display: grid;
  gap: 16px;
}

.crop-copy {
  display: grid;
  gap: 6px;
  font-size: 14px;
  color: #59695f;
  line-height: 1.5;
}

.crop-stage {
  overflow: hidden;
  border-radius: 18px;
  background: #101915;
  min-height: 520px;
}

.crop-image {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 70vh;
}

.crop-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.crop-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #526259;
}

.crop-buttons {
  display: flex;
  gap: 10px;
}

@media (max-width: 720px) {
  .crop-stage {
    min-height: 340px;
  }

  .crop-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .crop-buttons {
    width: 100%;
  }

  .crop-buttons :deep(.el-button) {
    flex: 1;
  }
}
</style>
