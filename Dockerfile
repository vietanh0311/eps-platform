# Nixpacks trên Coolify hiện ghim 1 bản nixpkgs quá cũ (giữa 2025), không có Node bản nào đạt yêu
# cầu tối thiểu của Prisma 7 (20.19+ / 22.12+ / 24.0+) — dùng Dockerfile tự viết để kiểm soát trực
# tiếp version Node qua image Docker Hub chính thức, không phụ thuộc nixpkgs snapshot của Coolify.

FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
