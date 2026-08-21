# Migraciones versionadas de Prisma.
# NO borrar ni editar a mano salvo revisión consciente del SQL.
#
# Crear una nueva (local, con DB arriba):
#   pnpm db:migrate:create -- nombre_del_cambio
#
# En Coolify / Docker se aplican solas al arrancar el contenedor
# (docker/entrypoint.sh → scripts/migrate-deploy.mjs → prisma migrate deploy).
