# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./dist/src/generated
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 4000
# On startup: push schema (idempotent) then start the server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/src/server.js"]
