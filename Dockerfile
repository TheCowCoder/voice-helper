# Multi-stage Dockerfile for production
# Builds the Vite app and runs the Express server on port 7860 (Hugging Face Spaces default)

FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (cache package.json / package-lock.json if present)
COPY package*.json ./
RUN npm install

# Copy everything and build
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7860

# Install only production deps (works with or without lockfile)
COPY package*.json ./
RUN npm install --omit=dev

# Copy built assets and server
COPY --from=builder /app/dist ./dist
COPY server.js ./

EXPOSE 7860
CMD ["npm", "start"]
