# Bygg klient og server
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
RUN npm install
RUN npm --prefix client install
COPY . .
RUN npm --prefix client run build

# Produksjonsimage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
COPY --from=builder /app/client/dist ./client/dist
ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
CMD ["node", "server/index.js"]
