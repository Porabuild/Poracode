FROM node:24-bookworm-slim

# Standalone Poracode server image (V6 D.3). Expects the published tarball
# layout: lib/server.cjs, resources/, and package.json at the image workdir.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/poracode

COPY package.json ./
COPY npm-shrinkwrap.json ./
COPY LICENSE ./
COPY lib ./lib
COPY resources ./resources
# The compatible web client (plan D2) is served by the same host.
COPY renderer ./renderer
COPY native-overlay ./native-overlay
COPY scripts/server-native-overlay.mjs ./scripts/server-native-overlay.mjs
COPY scripts/server-release-install.mjs ./scripts/server-release-install.mjs

# Use the staged bindings; no compiler or install-time native build is needed.
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund \
    && node --input-type=module -e 'import { applyServerNativeOverlay } from "./scripts/server-native-overlay.mjs"; applyServerNativeOverlay({ prefix: process.cwd(), overlayRoot: "native-overlay" });' \
    && mkdir -p /var/lib/poracode \
    && chown node:node /var/lib/poracode

ENV NODE_ENV=production \
    PORACODE_BASE_DIR=/var/lib/poracode/profile \
    PORACODE_REMOTE_ACCESS_HOST=127.0.0.1 \
    PORACODE_REMOTE_ACCESS_PORT=49152

VOLUME ["/var/lib/poracode"]
EXPOSE 49152
USER node
CMD ["node", "lib/server.cjs"]
