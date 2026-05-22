-- Statut de traitement des candidatures par le salon
ALTER TABLE "Candidature" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Candidature" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Candidature" SET "status" = 'pending' WHERE "status" IS NULL OR TRIM("status") = '';
