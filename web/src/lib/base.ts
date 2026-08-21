/** Prefijo público de la app (Vite `base`). Ej. `/auth` o ``. */
export function basePath (): string {
  const raw = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  return raw === '/' ? '' : raw
}

/** Path absoluto en el host, incluyendo BASE_PATH. */
export function withBase (pathWithQuery: string): string {
  const [pathname, ...rest] = pathWithQuery.split('?')
  const query = rest.length ? `?${rest.join('?')}` : ''
  let p = pathname || '/'
  if (!p.startsWith('/')) p = `/${p}`
  return `${basePath()}${p}${query}` || '/'
}
