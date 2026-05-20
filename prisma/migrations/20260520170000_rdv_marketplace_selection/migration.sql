-- CreateTable
CREATE TABLE "RdvMarketplaceSelection" (
    "id" TEXT NOT NULL,
    "rendezVousId" TEXT NOT NULL,
    "clientUid" TEXT NOT NULL,
    "proUid" TEXT NOT NULL,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "itemsSubtotalFcfa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdvMarketplaceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdvMarketplaceSelectionLine" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "unitPriceFcfa" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalFcfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdvMarketplaceSelectionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RdvMarketplaceSelection_rendezVousId_key" ON "RdvMarketplaceSelection"("rendezVousId");

-- CreateIndex
CREATE INDEX "RdvMarketplaceSelection_clientUid_idx" ON "RdvMarketplaceSelection"("clientUid");

-- CreateIndex
CREATE INDEX "RdvMarketplaceSelection_proUid_idx" ON "RdvMarketplaceSelection"("proUid");

-- CreateIndex
CREATE INDEX "RdvMarketplaceSelectionLine_selectionId_idx" ON "RdvMarketplaceSelectionLine"("selectionId");

-- AddForeignKey
ALTER TABLE "RdvMarketplaceSelection" ADD CONSTRAINT "RdvMarketplaceSelection_rendezVousId_fkey" FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdvMarketplaceSelection" ADD CONSTRAINT "RdvMarketplaceSelection_clientUid_fkey" FOREIGN KEY ("clientUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdvMarketplaceSelection" ADD CONSTRAINT "RdvMarketplaceSelection_proUid_fkey" FOREIGN KEY ("proUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdvMarketplaceSelectionLine" ADD CONSTRAINT "RdvMarketplaceSelectionLine_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "RdvMarketplaceSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
