#!/usr/bin/env bash
# Build Render : génère le client Prisma uniquement (db push au démarrage via render-start.mjs).
set -euo pipefail
npm install
npm run build:render
