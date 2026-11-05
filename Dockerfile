FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npx tsc -p tsconfig.worker.json && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DEPLOYMENT_MODE=cloud PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/.worker-build ./.worker-build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts/start-cloud.mjs ./scripts/start-cloud.mjs
COPY --from=build /app/scripts/sync-worker.mjs ./scripts/sync-worker.mjs
EXPOSE 3000
CMD ["node", "scripts/start-cloud.mjs"]
