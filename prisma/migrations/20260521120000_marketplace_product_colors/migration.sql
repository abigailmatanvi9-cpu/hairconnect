-- Couleurs sur articles marketplace et choix client sur lignes commande / sélection RDV
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "colors" TEXT;

ALTER TABLE "RdvMarketplaceSelectionLine" ADD COLUMN IF NOT EXISTS "color" TEXT;

ALTER TABLE "MarketOrderItem" ADD COLUMN IF NOT EXISTS "color" TEXT;
