-- Ensure wallet balance columns exist on User.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "balanceFloozFcfa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "balanceMixFcfa" INTEGER NOT NULL DEFAULT 0;
