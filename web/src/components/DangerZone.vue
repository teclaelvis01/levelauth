<script setup lang="ts">
import { shallowRef } from 'vue'

const props = defineProps<{
  title?: string
  description: string
  confirmLabel: string
  requireText: string
  requireHint?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  confirm: []
}>()

const open = shallowRef(false)
const typed = shallowRef('')
const match = () => typed.value.trim().toLowerCase() === props.requireText.trim().toLowerCase()

function start () {
  typed.value = ''
  open.value = true
}

function cancel () {
  open.value = false
  typed.value = ''
}

function submit () {
  if (!match() || props.busy) return
  emit('confirm')
}

defineExpose({ close: cancel })
</script>

<template>
  <div class="danger-zone">
    <div class="danger-zone__head">
      <h2>{{ title || 'Zona de peligro' }}</h2>
      <p>{{ description }}</p>
    </div>

    <div
      v-if="!open"
      class="danger-zone__row"
    >
      <div>
        <strong>{{ confirmLabel }}</strong>
        <p class="muted">
          {{ description }}
        </p>
      </div>
      <button
        class="btn btn--danger"
        type="button"
        :disabled="busy"
        @click="start"
      >
        {{ confirmLabel }}
      </button>
    </div>

    <div
      v-else
      class="danger-zone__confirm"
    >
      <p>
        Escribe <strong class="mono">{{ requireText }}</strong> para confirmar.
      </p>
      <p
        v-if="requireHint"
        class="muted"
      >
        {{ requireHint }}
      </p>
      <input
        v-model="typed"
        type="text"
        autocomplete="off"
        :placeholder="requireText"
        @keydown.enter.prevent="submit"
      >
      <div class="danger-zone__actions">
        <button
          class="btn btn--ghost"
          type="button"
          :disabled="busy"
          @click="cancel"
        >
          Cancelar
        </button>
        <button
          class="btn btn--danger"
          type="button"
          :disabled="!match() || busy"
          @click="submit"
        >
          {{ busy ? 'Eliminando…' : confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
