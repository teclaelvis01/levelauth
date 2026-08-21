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

Docker local:

```bash
docker compose up -d --build
```

Prod (MySQL en Coolify vía `DB_*` estilo Laravel; sin servicio mysql en el compose):

```bash
cp .env.prod.example .env.prod
# rellena DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD + secretos
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## UI

| Ruta | Vista Vue |
|------|-----------|
| `/setup` | Bootstrap primer admin |
| `/login` | Login Google al panel |
| `/authorize` | Consentimiento SSO de apps (`app` + `redirect_uri`) |
| `/sessions` | Tokens activos |
| `/users` | Listado + ficha + foto |

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
