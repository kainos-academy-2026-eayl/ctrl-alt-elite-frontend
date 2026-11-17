FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN HUSKY=0 npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime-base

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app

RUN --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/corporate_ca ]; then \
      cat /run/secrets/corporate_ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi \
    && apk add --no-cache ca-certificates \
    && if [ -s /run/secrets/corporate_ca ]; then \
         cp /run/secrets/corporate_ca /usr/local/share/ca-certificates/corporate.crt; \
         update-ca-certificates; \
       fi

FROM runtime-base AS production-dependencies

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM runtime-base AS runtime

COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/views ./src/views
COPY --from=build /app/src/assets ./src/assets
COPY --from=build /app/product_catalog ./product_catalog

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const response = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); if (!response.ok) throw new Error(`Health check failed: ${response.status}`);"]

CMD ["node", "--use-system-ca", "dist/index.js"]
