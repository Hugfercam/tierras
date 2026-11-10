FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_LEGAL_NAME="Pendiente de configurar"
ARG VITE_LEGAL_NIF="Pendiente de configurar"
ARG VITE_LEGAL_ADDRESS="Pendiente de configurar"
ARG VITE_LEGAL_EMAIL="privacidad@ejemplo.com"
ARG VITE_LEGAL_HOSTING="Pendiente de configurar"
ARG VITE_LEGAL_COUNTRY="España"
ENV VITE_LEGAL_NAME=$VITE_LEGAL_NAME
ENV VITE_LEGAL_NIF=$VITE_LEGAL_NIF
ENV VITE_LEGAL_ADDRESS=$VITE_LEGAL_ADDRESS
ENV VITE_LEGAL_EMAIL=$VITE_LEGAL_EMAIL
ENV VITE_LEGAL_HOSTING=$VITE_LEGAL_HOSTING
ENV VITE_LEGAL_COUNTRY=$VITE_LEGAL_COUNTRY
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "server/index.ts"]
