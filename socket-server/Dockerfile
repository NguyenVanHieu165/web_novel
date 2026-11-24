FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY auth ./auth
COPY handlers ./handlers
COPY importer ./importer
COPY jobs ./jobs
COPY rooms ./rooms
COPY tts ./tts
COPY server.ts ./
COPY worker.ts ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY supervisor.mjs ./
USER node
EXPOSE 3001
CMD ["npm", "start"]
