# authlevel

Auth SSO central de Level Cross — **API Hono** + **Vue 3** (Vite).

Diseño: `dashboard.pen`.

Gestor de paquetes: **pnpm** (workspaces).

## Estructura

```
server/   API Hono + Prisma (JSON)
web/      Vue 3 + Vue Router (sin Pinia salvo que haga falta)
prisma/   schema + migraciones
```

## Scripts

```bash
cp .env.example .env
pnpm install
pnpm db:migrate   # con MySQL arriba
pnpm dev          # API :3100 + Vite :5173
pnpm lint
pnpm test
pnpm build
```

Docker local (hot reload vía Traefik):

```bash
cp .env.example .env
pnpm dev:docker
# http://localhost  (Google OAuth exige localhost, no *.localhost)
```

Prod (MySQL en Coolify vía `DB_*` estilo Laravel; sin servicio mysql en el compose):

```bash
cp .env.prod.example .env.prod
# rellena DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD + secretos
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Coolify: red `coolify`, puerto **3100**, **Custom Container Name vacío** (rolling updates). Alias interno `levelauth` en la red Docker.

### Storage (avatares → Cloudflare R2)

Mismas variables que **leveladmin-api** (mismo bucket; prefijo compartido recomendado):

| Variable | Descripción |
|----------|-------------|
| `STORAGE_DRIVER` | `local` (solo volumen) o `r2` |
| `STORAGE_FALLBACK_LOCAL` | Con `r2`: espejo local + fallback si R2 falla (default `true`) |
| `R2_KEY_PREFIX` | Prefijo en el bucket, p. ej. `levelcross/level-dev/` o `levelcross/level-prod/` |
| `R2_ACCOUNT_ID` | Account ID Cloudflare |
| `R2_ACCESS_KEY_ID` | Access key R2 |
| `R2_SECRET_ACCESS_KEY` | Secret key R2 |
| `R2_BUCKET` | Nombre del bucket |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `UPLOADS_DIR` | Raíz local (default `{cwd}/uploads`; Docker dev: `/app/server/uploads`) |

Objetos AuthLevel: `{R2_KEY_PREFIX}auth/avatars/<file>`. Level Admin usa `{R2_KEY_PREFIX}avatars/`, `gallery/`, etc.

En dev con `pnpm dev:docker`, pasa las `R2_*` en `.env` (el compose las reenvía al contenedor).

## UI

| Ruta | Vista Vue |
|------|-----------|
| `/setup` | Bootstrap primer admin |
| `/login` | Login Google al panel |
| `/authorize` | Consentimiento SSO de apps (`app` + `redirect_uri`) |
| `/sessions` | Tokens activos |
| `/users` | Listado + ficha + foto |

### Apps SSO (`UserAppAccess.app`)

| App | Cliente |
|-----|---------|
| `erp` | leveladmin |
| `games` | Games |
| `setlists` | Setlists |
| `levelweb` | levelweb `/campistas` (líderes vía Google) |

Para Level Web: crea el usuario en AuthLevel, asigna `levelweb` ≥ `viewer`,
y asegúrate de que el mismo email exista en `people` (CRM). El origen de
levelweb debe estar en `CORS_ORIGINS`.

### Tokens (seguridad)

TTLs **fijos en código** (`server/src/lib/token-ttl.ts`), no por `.env`:

| Token | Valor | Uso |
|-------|-------|-----|
| Access JWT | **15 min** | Corto a propósito |
| Refresh | **7 días** | Solo para `/oauth/refresh` |
| Cookie sesión AuthLevel | **168 h** (7 días) | Panel admin |

Los clientes SSO (**leveladmin**, **levelweb**) **deben** renovar el access JWT
caducado con `POST /oauth/refresh` (leveladmin ya lo hace en `apiFetch`;
levelweb en `ensureCamperSession` / `camperAuthFetch`).

Pinia no se usa: el estado de sesión vive en cookie HttpOnly + `fetchStatus()` en `useAuth`.

## Migraciones (Prisma)

Las migraciones viven en `prisma/migrations/` y **deben ir en git**.

En cada despliegue (Coolify / Docker) el entrypoint ejecuta `prisma migrate deploy`
antes de arrancar la API. Si falla, el contenedor no arranca.

### Flujo al cambiar el schema

```bash
# 1. Edita prisma/schema.prisma
# 2. Crea la migración (SQL + carpeta versionada)
pnpm db:migrate:create -- descripcion_del_cambio
# 3. Revisa prisma/migrations/<timestamp>_descripcion_del_cambio/migration.sql
# 4. Aplícala en local
pnpm db:migrate:dev
# o solo deploy de pendientes:
pnpm db:migrate

# 5. Commit schema + carpeta de migración → push → Coolify las aplica solo
```

Estado:

```bash
pnpm db:migrate:status
```

Variables opcionales en deploy:

| Variable | Efecto |
|----------|--------|
| `SKIP_DB_MIGRATE=true` | No corre migraciones al arrancar |
| `DB_MIGRATE_RETRIES` | Reintentos si la DB aún no responde (default 10) |
| `DB_MIGRATE_RETRY_MS` | Espera entre reintentos (default 3000) |
