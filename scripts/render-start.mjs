/**
 * Démarrage Render : synchronise le schéma PostgreSQL puis lance Express.
 * (db push au runtime, pas pendant le build — évite les échecs de déploiement.)
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

async function syncDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[HairConnect] DATABASE_URL absent — synchronisation BDD ignorée.");
    return;
  }
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
  await prisma.$disconnect();

  console.log("[HairConnect] prisma db push…");
  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env
  });
}

try {
  await syncDatabase();
} catch (e) {
  console.error("[HairConnect] Échec synchronisation BDD:", e?.message || e);
  process.exit(1);
}

await import("../server.js");
