-- AlterTable: quartier pour filtrage local ; suppression GPS
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "quartier" TEXT;
ALTER TABLE "User" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "User" DROP COLUMN IF EXISTS "longitude";
