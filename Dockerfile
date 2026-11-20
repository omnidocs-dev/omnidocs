FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM build AS runtime-dependencies
RUN npm prune --omit=dev --offline

FROM caddy:2-alpine AS frontend
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

FROM node:24-bookworm-slim AS backend
WORKDIR /app
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
RUN install -d -o node -g node -m 0700 /data
USER node
ENV NODE_ENV=production OMNIDOCS_MODE=service OMNIDOCS_SERVICE_DATA=/data OMNIDOCS_HOST=0.0.0.0
EXPOSE 4174
CMD ["node", "--import", "tsx", "server/index.ts", "--production"]
