-- Lien commande marketplace ↔ rendez-vous (vente via sélection RDV)
ALTER TABLE "MarketOrder" ADD COLUMN IF NOT EXISTS "rendezVousId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketOrder_rendezVousId_key" ON "MarketOrder"("rendezVousId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketOrder_rendezVousId_fkey'
  ) THEN
    ALTER TABLE "MarketOrder"
      ADD CONSTRAINT "MarketOrder_rendezVousId_fkey"
      FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
