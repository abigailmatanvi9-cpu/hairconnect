-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "clientUid" TEXT NOT NULL,
    "proUid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_clientUid_proUid_key" ON "ContactRequest"("clientUid", "proUid");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_clientUid_fkey" FOREIGN KEY ("clientUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_proUid_fkey" FOREIGN KEY ("proUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
