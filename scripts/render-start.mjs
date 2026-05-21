/**
 * Démarrage Render : synchronise le schéma PostgreSQL puis lance Express.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Colonnes récentes — SQL idempotent si migrate deploy / db push ont échoué. */
async function applyCriticalSchemaPatches() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      DELETE FROM "Candidature" a
      USING "Candidature" b
      WHERE a."offerId" = b."offerId"
        AND a."coiffeurUid" = b."coiffeurUid"
        AND a."createdAt" > b."createdAt";
    `);
  } catch (e) {
    console.warn("[HairConnect] Nettoyage doublons candidatures:", e?.message || e);
  }

  const patches = [
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "colors" TEXT;`,
    `ALTER TABLE "RdvMarketplaceSelectionLine" ADD COLUMN IF NOT EXISTS "color" TEXT;`,
    `ALTER TABLE "MarketOrderItem" ADD COLUMN IF NOT EXISTS "color" TEXT;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "quartier" TEXT;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "remunerationType" TEXT;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "salaryFcfa" INTEGER;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "remunerationNote" TEXT;`
  ];

  for (const sql of patches) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.warn("[HairConnect] Patch SQL ignoré:", e?.message || e);
    }
  }

  await prisma.$disconnect();
}

async function syncDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[HairConnect] DATABASE_URL absent — synchronisation BDD ignorée.");
    return;
  }

  await applyCriticalSchemaPatches();

  try {
    console.log("[HairConnect] prisma migrate deploy…");
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env
    });
  } catch (e) {
    console.warn("[HairConnect] migrate deploy (non bloquant):", e?.message || e);
  }

  console.log("[HairConnect] prisma db push…");
  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env
  });
  console.log("[HairConnect] Base de données synchronisée.");
}

try {
  await syncDatabase();
} catch (e) {
  console.error("[HairConnect] Échec synchronisation BDD:", e?.message || e);
  process.exit(1);
}

await import("../server.js");
