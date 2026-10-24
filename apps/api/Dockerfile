# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @bayana/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bayana/shared build && pnpm --filter @bayana/api build
# Production dependencies only, with @bayana/shared resolved as a real directory.
RUN pnpm --filter @bayana/api deploy --prod --legacy /out \
 && rm -rf /out/node_modules/@bayana/shared && mkdir -p /out/node_modules/@bayana/shared \
 && cp -r packages/shared/package.json packages/shared/dist /out/node_modules/@bayana/shared/ \
 && rm -rf /out/dist /out/src /out/test /out/sql /out/Dockerfile /out/tsconfig.json /out/vitest.config.ts \
 && cp -r apps/api/dist /out/dist && rm -rf /out/dist/test && cp -r apps/api/sql /out/dist/sql

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
