<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

const OUTPUT_SIZE = 150
const VIEWPORT = 280

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  file: File | null
}>()
const emit = defineEmits<{
  cropped: [file: File]
  cancel: []
}>()

const cropImage = shallowRef<HTMLImageElement | null>(null)
const viewportEl = shallowRef<HTMLElement | null>(null)
const sourceUrl = shallowRef<string | null>(null)
const naturalW = shallowRef(0)
const naturalH = shallowRef(0)
const baseScale = shallowRef(1)
const zoom = shallowRef(1)
const offsetX = shallowRef(0)
const offsetY = shallowRef(0)
const dragging = shallowRef(false)
const dragStartX = shallowRef(0)
const dragStartY = shallowRef(0)
const originX = shallowRef(0)
const originY = shallowRef(0)
const error = shallowRef('')

const currentScale = computed(() => baseScale.value * zoom.value)

const imageStyle = computed(() => ({
  width: `${naturalW.value * currentScale.value}px`,
  height: `${naturalH.value * currentScale.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
}))

function viewportSize () {
  return Math.round(viewportEl.value?.getBoundingClientRect().width || VIEWPORT)
}

function clampOffsets () {
  const size = viewportSize()
  const scale = currentScale.value
  const displayW = naturalW.value * scale
  const displayH = naturalH.value * scale
  const minX = Math.min(0, size - displayW)
  const minY = Math.min(0, size - displayH)
  offsetX.value = Math.min(0, Math.max(minX, offsetX.value))
  offsetY.value = Math.min(0, Math.max(minY, offsetY.value))
}

function revokeSource () {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value)
    sourceUrl.value = null
  }
}

function close () {
  open.value = false
  revokeSource()
  document.body.classList.remove('photo-crop-open')
  emit('cancel')
}

async function openWithFile (file: File) {
  error.value = ''
  revokeSource()
  sourceUrl.value = URL.createObjectURL(file)
  await nextTick()

  const img = new Image()
  img.onload = () => {
    naturalW.value = img.naturalWidth
    naturalH.value = img.naturalHeight
    document.body.classList.add('photo-crop-open')
    const size = viewportSize()
    baseScale.value = size / Math.min(naturalW.value, naturalH.value)
    zoom.value = 1
    offsetX.value = (size - naturalW.value * baseScale.value) / 2
    offsetY.value = (size - naturalH.value * baseScale.value) / 2
    clampOffsets()
  }
  img.onerror = () => {
    error.value = 'No se pudo leer la imagen seleccionada.'
  }
  img.src = sourceUrl.value
}

watch(
  () => [open.value, props.file] as const,
  ([isOpen, file]) => {
    if (isOpen && file) {
      openWithFile(file).catch(() => {
        error.value = 'No se pudo abrir la imagen.'
      })
    }
    if (!isOpen) {
      revokeSource()
      document.body.classList.remove('photo-crop-open')
    }
  }
)

function onZoomInput (ev: Event) {
  const input = ev.target as { value?: string }
  const size = viewportSize()
  const prevScale = currentScale.value
  const centerX = size / 2
  const centerY = size / 2
  const imgX = (centerX - offsetX.value) / prevScale
  const imgY = (centerY - offsetY.value) / prevScale
  zoom.value = Number(input.value) || 1
  const nextScale = currentScale.value
  offsetX.value = centerX - imgX * nextScale
  offsetY.value = centerY - imgY * nextScale
  clampOffsets()
}

function onPointerDown (ev: PointerEvent) {
  if (!cropImage.value) return
  dragging.value = true
  dragStartX.value = ev.clientX
  dragStartY.value = ev.clientY
  originX.value = offsetX.value
  originY.value = offsetY.value
  cropImage.value.setPointerCapture(ev.pointerId)
}

function onPointerMove (ev: PointerEvent) {
  if (!dragging.value) return
  offsetX.value = originX.value + (ev.clientX - dragStartX.value)
  offsetY.value = originY.value + (ev.clientY - dragStartY.value)
  clampOffsets()
}

function onPointerUp (ev: PointerEvent) {
  if (!dragging.value || !cropImage.value) return
  dragging.value = false
  try {
    cropImage.value.releasePointerCapture(ev.pointerId)
  } catch {
    /* ignore */
  }
}

function applyCrop () {
  if (!cropImage.value) return
  const size = viewportSize()
  const scale = currentScale.value
  const sx = -offsetX.value / scale
  const sy = -offsetY.value / scale
  const sSize = size / scale

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cropImage.value, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        error.value = 'No se pudo generar la foto recortada.'
        return
      }
      const file = new File([blob], 'avatar-150x150.jpg', { type: 'image/jpeg' })
      open.value = false
      revokeSource()
      document.body.classList.remove('photo-crop-open')
      emit('cropped', file)
    },
    'image/jpeg',
    0.92
  )
}

function onKeydown (ev: KeyboardEvent) {
  if (ev.key === 'Escape' && open.value) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  revokeSource()
  document.body.classList.remove('photo-crop-open')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="photo-crop-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-crop-title"
    >
      <div
        class="photo-crop-modal__backdrop"
        @click="close"
      />
      <div class="photo-crop-modal__dialog">
        <div class="photo-crop-modal__header">
          <h2 id="photo-crop-title">
            Recortar foto
          </h2>
          <p>Arrastra y ajusta el zoom. Se exporta a 150×150.</p>
        </div>

        <p
          v-if="error"
          class="flash flash--error"
        >
          {{ error }}
        </p>

        <div class="photo-crop-stage">
          <div
            ref="viewportEl"
            class="photo-crop-viewport"
          >
            <img
              v-if="sourceUrl"
              ref="cropImage"
              :src="sourceUrl"
              alt=""
              draggable="false"
              class="photo-crop-image"
              :style="imageStyle"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            >
          </div>
        </div>

        <label class="photo-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            :value="zoom"
            @input="onZoomInput"
          >
        </label>

        <div class="photo-crop-modal__actions">
          <button
            class="btn btn--ghost"
            type="button"
            @click="close"
          >
            Cancelar
          </button>
          <button
            class="btn"
            type="button"
            @click="applyCrop"
          >
            Usar foto
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
