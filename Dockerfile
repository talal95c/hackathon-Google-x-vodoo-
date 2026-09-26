# Serveur Course Royale (WebSocket) + build statique du jeu.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_RACE_SERVER
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist DATA_FILE=/data/progress.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server/index.js"]
