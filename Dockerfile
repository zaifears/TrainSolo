# Production Dockerfile for TrainSolo Unified Service
# Stage 1: Build Client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY trainsolo-client/package*.json ./
RUN npm ci || npm install
COPY trainsolo-client/ ./
RUN npm run build

# Stage 2: Build Server
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY trainsolo-server/package*.json ./
RUN npm ci || npm install
COPY trainsolo-server/ ./
RUN npm run build

# Stage 3: Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV SHOHOZ_BASE_API=https://railspaapi.shohoz.com/v1.0/web

COPY trainsolo-server/package*.json ./
RUN npm ci --only=production || npm install --production

COPY --from=server-builder /app/server/dist ./dist
COPY --from=client-builder /app/client/dist ./trainsolo-client/dist

EXPOSE 5000

CMD ["node", "dist/server.js"]
