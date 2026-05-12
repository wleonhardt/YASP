FROM node:26-alpine@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

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
FROM node:26-alpine@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea
WORKDIR /app

# Copy build artifacts and runtime deps. Files retain their default root:root
# ownership with world-readable bits, which is fine because the `node` user
# (uid 1000, baked into the official Node Alpine image) only needs read
# access. The app never writes to /app at runtime — all writes go to /tmp
# (see EC2 `--tmpfs /tmp` in cdk/lib/ec2-origin-bootstrap.ts).
COPY --from=base /app/package.json .
COPY --from=base /app/shared/package.json shared/
COPY --from=base /app/server/package.json server/
COPY --from=base /app/client/package.json client/
COPY --from=base /app/node_modules node_modules/
COPY --from=base /app/shared/dist shared/dist/
COPY --from=base /app/server/dist server/dist/
COPY --from=base /app/client/dist client/dist/

# The runtime container never invokes npm, npx, or corepack. Remove the
# bundled package-manager toolchain so base-image CVEs under
# `/usr/local/lib/node_modules/npm/...` do not ship in production.
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Drop root. The official node:20-alpine image pre-creates a `node` user
# (uid 1000). We don't chown /app — world-read perms are sufficient for a
# read-only runtime and avoid a large COW layer.
USER node

# Docker-level healthcheck. Uses Node's built-in http client so it does not
# depend on busybox `wget` (still present today, but this makes the check
# resilient to base-image minimization). Runs as the `node` user with no
# filesystem writes — compatible with --read-only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

CMD ["node", "server/dist/index.js"]
