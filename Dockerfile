FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install

# Copy source
COPY tsconfig.base.json .
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build shared
RUN npm run build:shared

# Build client
RUN npm run build:client

# Build server
RUN npm run build:server

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/package.json .
COPY --from=base /app/shared/package.json shared/
COPY --from=base /app/server/package.json server/
COPY --from=base /app/client/package.json client/
COPY --from=base /app/node_modules node_modules/
COPY --from=base /app/shared/dist shared/dist/
COPY --from=base /app/server/dist server/dist/
COPY --from=base /app/client/dist client/dist/

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
