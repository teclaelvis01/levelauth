export type PaginationInput = {
  page: number
  pageSize: number
  skip: number
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export function parsePagination (
  query: { page?: string, pageSize?: string },
  defaults: { pageSize?: number } = {}
): PaginationInput {
  const rawPage = Number(query.page || 1)
  const rawSize = Number(query.pageSize || defaults.pageSize || DEFAULT_PAGE_SIZE)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : DEFAULT_PAGE_SIZE)
  )
  return { page, pageSize, skip: (page - 1) * pageSize }
}

export function paginationMeta (input: PaginationInput, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / input.pageSize) || 1)
  const page = Math.min(input.page, totalPages)
  return {
    page,
    pageSize: input.pageSize,
    total,
    totalPages
  }
}
