# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

WORKDIR /workspace/frontend/tenant-portal
ENV NG_CLI_ANALYTICS=false

COPY packages/lorne-contracts /workspace/frontend/packages/lorne-contracts
COPY tenant-portal/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline --no-audit --progress=false

COPY tenant-portal/. .
RUN npm run build -- --configuration production

FROM nginx:1.27-bookworm

RUN rm -rf /etc/nginx/conf.d/default.conf
COPY tenant-portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/tenant-portal/dist/tenant-portal/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
