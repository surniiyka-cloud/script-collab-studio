FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @studio/api build
EXPOSE 3001 3002
CMD ["pnpm", "--filter", "@studio/api", "start"]
