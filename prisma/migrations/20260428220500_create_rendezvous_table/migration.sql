-- Create missing RendezVous table when absent.
CREATE TABLE IF NOT EXISTS "RendezVous" (
    "id" TEXT NOT NULL,
    "proUid" TEXT NOT NULL,
    "clientUid" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "prestation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "proRating" INTEGER,
    "proComment" TEXT,
    "reminder24hSentAt" TIMESTAMP(3),
    "priceFcfa" INTEGER,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentAttemptId" TEXT,
    "paymentProvider" TEXT,
    "paymentRequestedAt" TIMESTAMP(3),
    "paymentFailureReason" TEXT,
    "paymentFailedAt" TIMESTAMP(3),
    "paymentOperatorTxnId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RendezVous_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'RendezVous'
      AND constraint_name = 'RendezVous_proUid_fkey'
  ) THEN
    ALTER TABLE "RendezVous"
      ADD CONSTRAINT "RendezVous_proUid_fkey"
      FOREIGN KEY ("proUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'RendezVous'
      AND constraint_name = 'RendezVous_clientUid_fkey'
  ) THEN
    ALTER TABLE "RendezVous"
      ADD CONSTRAINT "RendezVous_clientUid_fkey"
      FOREIGN KEY ("clientUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
