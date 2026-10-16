# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder
WORKDIR /workspace/portal
ENV NEXT_TELEMETRY_DISABLED=1

COPY portal/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund --progress=false

COPY portal/. .
RUN npm run build

FROM nginx:stable-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/portal/out /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
