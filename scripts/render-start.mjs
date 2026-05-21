/**
 * Démarrage Render : patches SQL idempotents + db push (sans bloquer le serveur).
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

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
    `ALTER TABLE "MarketOrder" ADD COLUMN IF NOT EXISTS "rendezVousId" TEXT;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "MarketOrder_rendezVousId_key" ON "MarketOrder"("rendezVousId");`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "quartier" TEXT;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "remunerationType" TEXT;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "salaryFcfa" INTEGER;`,
    `ALTER TABLE "Offre" ADD COLUMN IF NOT EXISTS "remunerationNote" TEXT;`
  ];

  for (const sql of patches) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.warn("[HairConnect] Patch SQL:", e?.message || e);
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
    console.log("[HairConnect] prisma db push…");
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd()
    });
    console.log("[HairConnect] Base de données synchronisée (db push).");
  } catch (e) {
    console.warn(
      "[HairConnect] db push non bloquant:",
      e?.message || e,
      "— les patches SQL ont été appliqués, le serveur démarre quand même."
    );
  }
}

await syncDatabase();
await import("../server.js");
