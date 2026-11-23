# frontend/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# .env.production must exist in this build context (and NOT be in .dockerignore)
RUN npm run build