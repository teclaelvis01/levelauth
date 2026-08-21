<script setup lang="ts">
import { computed } from 'vue'
import { paginationLabel, type PaginationMeta } from '@/lib/pagination'

const props = defineProps<{
  pagination: PaginationMeta
}>()

const emit = defineEmits<{
  change: [page: number]
}>()

const label = computed(() => paginationLabel(props.pagination))
const canPrev = computed(() => props.pagination.page > 1)
const canNext = computed(() => props.pagination.page < props.pagination.totalPages)

const pages = computed(() => {
  const { page, totalPages } = props.pagination
  if (totalPages <= 1) return [] as number[]
  const window = 5
  let start = Math.max(1, page - Math.floor(window / 2))
  let end = Math.min(totalPages, start + window - 1)
  start = Math.max(1, end - window + 1)
  const list: number[] = []
  for (let i = start; i <= end; i++) list.push(i)
  return list
})

function go (page: number) {
  if (page < 1 || page > props.pagination.totalPages || page === props.pagination.page) return
  emit('change', page)
}
</script>

<template>
  <nav
    v-if="pagination.total > 0"
    class="pagination"
    aria-label="Paginación"
  >
    <span class="pagination__label">{{ label }}</span>
    <div
      v-if="pagination.totalPages > 1"
      class="pagination__controls"
    >
      <button
        class="pagination__btn"
        type="button"
        :disabled="!canPrev"
        aria-label="Página anterior"
        @click="go(pagination.page - 1)"
      >
        Anterior
      </button>
      <button
        v-for="p in pages"
        :key="p"
        class="pagination__btn"
        :class="{ 'is-active': p === pagination.page }"
        type="button"
        :aria-current="p === pagination.page ? 'page' : undefined"
        @click="go(p)"
      >
        {{ p }}
      </button>
      <button
        class="pagination__btn"
        type="button"
        :disabled="!canNext"
        aria-label="Página siguiente"
        @click="go(pagination.page + 1)"
      >
        Siguiente
      </button>
    </div>
  </nav>
</template>
