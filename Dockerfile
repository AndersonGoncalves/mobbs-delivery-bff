FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Sem isso, `tsc` estoura o heap default do V8 em hosts com pouca RAM (ex. EC2 t3.micro, 1GB) —
# achado provisionando produção.
RUN NODE_OPTIONS="--max-old-space-size=1536" npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
