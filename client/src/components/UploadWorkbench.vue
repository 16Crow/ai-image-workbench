<template>
  <el-card class="panel upload-panel" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="card-title">
          <el-icon><Upload /></el-icon>
          <span>上传与选区</span>
        </div>
        <el-button v-if="selectedFile" text type="primary" @click="cropDialogVisible = true">
          重新框选
        </el-button>
      </div>
    </template>

    <el-upload
      ref="uploadRef"
      class="upload-area"
      drag
      :auto-upload="false"
      :limit="1"
      accept="image/*"
      :show-file-list="false"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
    >
      <el-icon class="el-icon--upload" :size="48" color="#14532d"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽图片到此处，或 <em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip">建议上传正面、图案清晰、褶皱较少的服装图</div>
      </template>
    </el-upload>

    <div v-if="selectedImageUrl" class="selection-preview">
      <div class="selection-card">
        <div class="selection-label">原图预览</div>
        <img :src="selectedImageUrl" alt="原图预览" />
      </div>
      <div class="selection-card">
        <div class="selection-label">当前选区</div>
        <img v-if="croppedPreviewUrl" :src="croppedPreviewUrl" alt="选区预览" />
        <div v-else class="selection-empty">先框选主花型区域</div>
      </div>
    </div>

    <div class="selection-meta" v-if="selectedFile">
      <div class="meta-pill">
        <el-icon><Crop /></el-icon>
        <span>{{ cropConfirmed ? '已框选主花型区域' : '建议先框选主花型区域' }}</span>
      </div>
      <div class="meta-pill" v-if="cropConfirmed && cropSummary">
        <el-icon><Picture /></el-icon>
        <span>{{ cropSummary }}</span>
      </div>
    </div>

    <div class="upload-actions">
      <el-button
        type="primary"
        size="large"
        :loading="uploading"
        :disabled="!selectedFile"
        @click="handleSubmit"
      >
        <el-icon><MagicStick /></el-icon>
        开始提取
      </el-button>
    </div>

    <PatternCropDialog
      v-model="cropDialogVisible"
      :image-url="selectedImageUrl"
      :mime-type="selectedFile?.type || 'image/png'"
      :file-name="cropFileName"
      @confirm="handleCropConfirm"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage, type UploadFile, type UploadInstance, type UploadRawFile } from 'element-plus'
import PatternCropDialog from './PatternCropDialog.vue'

defineProps<{
  uploading: boolean
}>()

const emit = defineEmits<{
  submit: [file: File]
}>()

const uploadRef = ref<UploadInstance>()
const selectedFile = ref<UploadRawFile | null>(null)
const selectedImageUrl = ref('')
const croppedPreviewUrl = ref('')
const croppedFile = ref<File | null>(null)
const cropSummary = ref('')
const cropConfirmed = ref(false)
const cropDialogVisible = ref(false)

const cropFileName = computed(() => {
  const ext = selectedFile.value?.name.split('.').pop() || 'png'
  return `cropped-${Date.now()}.${ext}`
})

function revokeObjectUrl(url?: string) {
  if (url) URL.revokeObjectURL(url)
}

function handleFileChange(file: UploadFile) {
  if (!file.raw) return
  revokeObjectUrl(selectedImageUrl.value)
  revokeObjectUrl(croppedPreviewUrl.value)

  selectedFile.value = file.raw
  selectedImageUrl.value = URL.createObjectURL(file.raw)
  croppedPreviewUrl.value = ''
  croppedFile.value = null
  cropSummary.value = ''
  cropConfirmed.value = false
  cropDialogVisible.value = true
}

function handleExceed() {
  ElMessage.warning('请先移除已选图片再重新选择')
}

function handleCropConfirm(payload: { file: File; previewUrl: string; summary: string }) {
  revokeObjectUrl(croppedPreviewUrl.value)
  croppedFile.value = payload.file
  croppedPreviewUrl.value = payload.previewUrl
  cropSummary.value = payload.summary
  cropConfirmed.value = true
  ElMessage.success('已更新主花型选区')
}

function handleSubmit() {
  if (!selectedFile.value) return
  emit('submit', croppedFile.value || selectedFile.value)
}

function reset() {
  selectedFile.value = null
  croppedFile.value = null
  cropConfirmed.value = false
  cropDialogVisible.value = false
  cropSummary.value = ''
  revokeObjectUrl(selectedImageUrl.value)
  revokeObjectUrl(croppedPreviewUrl.value)
  selectedImageUrl.value = ''
  croppedPreviewUrl.value = ''
  uploadRef.value?.clearFiles()
}

defineExpose({ reset })

onBeforeUnmount(() => {
  reset()
})
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

.upload-area {
  width: 100%;
}

.selection-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.selection-card {
  border-radius: 16px;
  padding: 12px;
  background: #f7fbf8;
  border: 1px solid rgba(20, 83, 45, 0.08);
}

.selection-label {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #3f5b4b;
}

.selection-card img,
.selection-empty {
  width: 100%;
  height: 180px;
  border-radius: 12px;
  object-fit: cover;
  background: #ebf1ec;
}

.selection-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c988f;
  font-size: 13px;
}

.selection-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 999px;
  background: #f3f7f4;
  color: #365244;
  font-size: 13px;
  font-weight: 600;
}

.upload-actions {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}

@media (max-width: 720px) {
  .selection-preview {
    grid-template-columns: 1fr;
  }
}
</style>
