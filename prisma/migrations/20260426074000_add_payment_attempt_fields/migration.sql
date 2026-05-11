-- Extend payment lifecycle for real provider/webhook flow.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'RendezVous'
  ) THEN
    ALTER TABLE "RendezVous"
      ADD COLUMN IF NOT EXISTS "paymentAttemptId" TEXT,
      ADD COLUMN IF NOT EXISTS "paymentRequestedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "paymentFailureReason" TEXT,
      ADD COLUMN IF NOT EXISTS "paymentFailedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "paymentOperatorTxnId" TEXT;
  END IF;
END $$;
