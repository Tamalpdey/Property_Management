FROM node:24-bookworm-slim AS builder

WORKDIR /workspace/frontend/admin-portal

COPY packages/lorne-contracts /workspace/frontend/packages/lorne-contracts
COPY admin-portal/package*.json ./
RUN npm ci --legacy-peer-deps

COPY admin-portal/. .
RUN npm run build -- --configuration production

FROM nginx:1.27-bookworm

RUN rm -rf /etc/nginx/conf.d/default.conf
COPY admin-portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/admin-portal/dist/admin-portal/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
