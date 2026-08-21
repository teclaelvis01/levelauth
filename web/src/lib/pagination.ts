export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1
}

export function pageFromQuery (raw: unknown, fallback = 1): number {
  const n = Number(raw || fallback)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function paginationLabel (p: PaginationMeta): string {
  if (p.total === 0) return '0 resultados'
  const from = (p.page - 1) * p.pageSize + 1
  const to = Math.min(p.page * p.pageSize, p.total)
  return `${from}–${to} de ${p.total}`
}
