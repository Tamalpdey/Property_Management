FROM node:24-alpine AS builder

WORKDIR /workspace/frontend/tenant-portal

COPY packages/lorne-contracts /workspace/frontend/packages/lorne-contracts
COPY tenant-portal/package*.json ./
RUN npm ci --legacy-peer-deps

COPY tenant-portal/. .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine

RUN rm -rf /etc/nginx/conf.d/default.conf
COPY tenant-portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/tenant-portal/dist/tenant-portal/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
