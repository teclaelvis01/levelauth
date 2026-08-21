# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Prefijo público (Coolify folder). Vacío o `/` = raíz del host.
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@11.21.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY server ./server
COPY web ./web
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=1 pnpm exec prisma generate \
  && pnpm --filter @authlevel/web build \
  && pnpm --filter @authlevel/server build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST=/app/web/dist
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/uploads/avatars \
  && corepack enable && corepack prepare pnpm@11.21.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY prisma ./prisma
# --prod: prisma CLI está en dependencies de @authlevel/server (migrate-deploy).
# El root solo lo tiene en devDependencies → no está disponible con --prod vía `pnpm exec`.
# @prisma/client postinstall genera el client con el schema copiado.
RUN pnpm install --frozen-lockfile --prod --filter @authlevel/server... \
  && node -e "require('node:module').createRequire('/app/server/package.json').resolve('prisma/build/index.js')"
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY scripts ./scripts
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/server
EXPOSE 3100
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
