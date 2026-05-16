-- Colonnes profil / annuaire manquantes sur certaines bases (ex. déploiement Render partiel)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clientele" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "proMetiers" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rechercheMetiers" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "quartier" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tarifMenuPhotoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "balanceFloozFcfa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "balanceMixFcfa" INTEGER NOT NULL DEFAULT 0;
