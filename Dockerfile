FROM oven/bun:1 AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://aclmanager:build-only@localhost:5432/aclmanager

COPY package.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install

COPY . .
RUN bun run --filter @acl-manager/server db:generate
RUN bun run --filter @acl-manager/web build

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
CMD ["sh", "-c", "bun run --filter @acl-manager/server db:deploy && bun run --filter @acl-manager/server start"]
