-- Marketplace : tables manquantes dans l’historique des migrations initiales
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "sellerUid" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceFcfa" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketOrder" (
    "id" TEXT NOT NULL,
    "buyerUid" TEXT NOT NULL,
    "sellerUid" TEXT NOT NULL,
    "sellerName" TEXT,
    "buyerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotalFcfa" INTEGER NOT NULL,
    "platformFeeFcfa" INTEGER NOT NULL,
    "sellerNetFcfa" INTEGER NOT NULL,
    "platformFeeRateBp" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerUid" TEXT NOT NULL,
    "buyerUid" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "unitPriceFcfa" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalFcfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketOrderItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketOrderItem_orderId_fkey'
    ) THEN
        ALTER TABLE "MarketOrderItem"
            ADD CONSTRAINT "MarketOrderItem_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
