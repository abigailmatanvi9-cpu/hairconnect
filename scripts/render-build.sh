#!/usr/bin/env bash
# Build Render : évite migrate deploy si la base a déjà des colonnes (erreur P3018 / 42701).
set -euo pipefail
npm install
npx prisma generate
npx prisma db push --skip-generate
