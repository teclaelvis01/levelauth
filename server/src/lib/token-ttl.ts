/**
 * TTLs fijos de AuthLevel (no se configuran por env).
 * Access JWT corto → los clientes renuevan con POST /oauth/refresh.
 */
export const SESSION_TTL_HOURS = 168
export const ACCESS_TOKEN_TTL_MINUTES = 15
export const REFRESH_TOKEN_TTL_DAYS = 7
