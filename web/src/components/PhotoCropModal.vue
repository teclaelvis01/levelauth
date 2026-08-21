<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

const OUTPUT_SIZE = 150
const CROP_SIZE = 200
const MAX_OUTPUT_BYTES = 400 * 1024
const JPEG_QUALITY_START = 0.92
const JPEG_QUALITY_MIN = 0.45
const JPEG_QUALITY_STEP = 0.07

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  file: File | null
}>()
const emit = defineEmits<{
  cropped: [file: File]
  cancel: []
}>()

const cropImage = shallowRef<HTMLImageElement | null>(null)
const stageEl = shallowRef<HTMLElement | null>(null)
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
const exporting = shallowRef(false)
const ready = shallowRef(false)

const currentScale = computed(() => baseScale.value * zoom.value)
const zoomPercent = computed(() => Math.round(((zoom.value - 1) / 2) * 100))

const imageStyle = computed(() => ({
  width: `${naturalW.value * currentScale.value}px`,
  height: `${naturalH.value * currentScale.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
}))

const blurImageStyle = computed(() => {
  const size = viewportSize()
  return {
    width: `${naturalW.value * currentScale.value}px`,
    height: `${naturalH.value * currentScale.value}px`,
    left: `calc(50% - ${size / 2}px)`,
    top: `calc(50% - ${size / 2}px)`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(1.06)`
  }
})

const stageStyle = computed(() => {
  const size = viewportSize()
  return {
    '--crop-size': `${size}px`
  } as Record<string, string>
})

function viewportSize () {
  return Math.round(viewportEl.value?.getBoundingClientRect().width || CROP_SIZE)
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
  ready.value = false
  revokeSource()
  document.body.classList.remove('photo-crop-open')
  emit('cancel')
}

async function openWithFile (file: File) {
  error.value = ''
  ready.value = false
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
    ready.value = true
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
      ready.value = false
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
  if (!ready.value || !stageEl.value) return
  dragging.value = true
  dragStartX.value = ev.clientX
  dragStartY.value = ev.clientY
  originX.value = offsetX.value
  originY.value = offsetY.value
  stageEl.value.setPointerCapture(ev.pointerId)
}

function onPointerMove (ev: PointerEvent) {
  if (!dragging.value) return
  offsetX.value = originX.value + (ev.clientX - dragStartX.value)
  offsetY.value = originY.value + (ev.clientY - dragStartY.value)
  clampOffsets()
}

function onPointerUp (ev: PointerEvent) {
  if (!dragging.value || !stageEl.value) return
  dragging.value = false
  try {
    stageEl.value.releasePointerCapture(ev.pointerId)
  } catch {
    /* ignore */
  }
}

function canvasToJpeg (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

async function encodeUnderLimit (canvas: HTMLCanvasElement): Promise<Blob | null> {
  let quality = JPEG_QUALITY_START
  let best: Blob | null = null
  while (quality >= JPEG_QUALITY_MIN - 0.001) {
    const blob = await canvasToJpeg(canvas, quality)
    if (!blob) break
    best = blob
    if (blob.size <= MAX_OUTPUT_BYTES) return blob
    quality -= JPEG_QUALITY_STEP
  }
  return best && best.size <= MAX_OUTPUT_BYTES ? best : null
}

async function applyCrop () {
  if (!cropImage.value || exporting.value || !ready.value) return
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

  exporting.value = true
  error.value = ''
  try {
    const blob = await encodeUnderLimit(canvas)
    if (!blob) {
      error.value = 'No se pudo generar una foto de 150×150 bajo 400 KB.'
      return
    }
    const file = new File([blob], 'avatar-150x150.jpg', { type: 'image/jpeg' })
    open.value = false
    ready.value = false
    revokeSource()
    document.body.classList.remove('photo-crop-open')
    emit('cropped', file)
  } finally {
    exporting.value = false
  }
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
          <p>Ajusta el recorte a 150×150 como en setlists · máx. 400 KB</p>
        </div>

        <p
          v-if="error"
          class="flash flash--error"
        >
          {{ error }}
        </p>

        <div
          ref="stageEl"
          class="photo-crop-stage"
          :class="{ 'is-ready': ready, 'is-dragging': dragging }"
          :style="stageStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <img
            v-if="sourceUrl"
            class="photo-crop-image photo-crop-image--blur"
            :src="sourceUrl"
            alt=""
            draggable="false"
            :style="blurImageStyle"
          >
          <div
            class="photo-crop-veil"
            aria-hidden="true"
          />
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
            >
            <div
              v-if="!ready || !dragging"
              class="photo-crop-hint"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 2v20" />
                <path d="m15 19-3 3-3-3" />
                <path d="m19 9 3 3-3 3" />
                <path d="M2 12h20" />
                <path d="m5 9-3 3 3 3" />
                <path d="m9 5 3-3 3 3" />
              </svg>
            </div>
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
            :style="{ '--zoom-fill': `${zoomPercent}%` }"
            @input="onZoomInput"
          >
        </label>

        <div class="photo-crop-modal__actions">
          <button
            class="btn btn--plain"
            type="button"
            @click="close"
          >
            Cancelar
          </button>
          <button
            class="btn"
            type="button"
            :disabled="exporting || !ready"
            @click="applyCrop"
          >
            {{ exporting ? 'Comprimiendo…' : 'Usar foto' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
