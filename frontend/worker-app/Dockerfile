FROM node:24-alpine AS builder

WORKDIR /workspace/frontend/worker-app

COPY packages/lorne-contracts /workspace/frontend/packages/lorne-contracts
COPY worker-app/package*.json ./
RUN npm ci --legacy-peer-deps

COPY worker-app/. .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine

RUN rm -rf /etc/nginx/conf.d/default.conf
COPY worker-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/frontend/worker-app/dist/worker-app/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
