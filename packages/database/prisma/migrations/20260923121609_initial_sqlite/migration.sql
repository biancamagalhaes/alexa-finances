-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "treasuryType" TEXT,
    "maturityDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "quotedOn" DATETIME NOT NULL,
    "price" DECIMAL NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "sourceEndpoint" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "publishedOn" DATETIME NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PriceQuote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioDailySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileScope" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "marketValue" DECIMAL NOT NULL,
    "cashBalance" DECIMAL NOT NULL,
    "patrimony" DECIMAL NOT NULL,
    "monthlyResult" DECIMAL,
    "contributions" DECIMAL NOT NULL,
    "income" DECIMAL NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketIngestionRun" (
    "idempotencyKey" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "quotedOn" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "inserted" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "failures" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "type" TEXT NOT NULL,
    "occurredOn" DATETIME NOT NULL,
    "quantity" DECIMAL,
    "unitPrice" DECIMAL,
    "amount" DECIMAL,
    "feeAmount" DECIMAL NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Operation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Operation_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_slug_key" ON "Profile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Instrument_type_idx" ON "Instrument"("type");

-- CreateIndex
CREATE INDEX "PriceQuote_instrumentId_isValid_quotedOn_idx" ON "PriceQuote"("instrumentId", "isValid", "quotedOn");

-- CreateIndex
CREATE INDEX "PriceQuote_quotedOn_idx" ON "PriceQuote"("quotedOn");

-- CreateIndex
CREATE UNIQUE INDEX "PriceQuote_instrumentId_quotedOn_sourceProvider_key" ON "PriceQuote"("instrumentId", "quotedOn", "sourceProvider");

-- CreateIndex
CREATE INDEX "PortfolioDailySnapshot_asOf_idx" ON "PortfolioDailySnapshot"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioDailySnapshot_profileScope_asOf_key" ON "PortfolioDailySnapshot"("profileScope", "asOf");

-- CreateIndex
CREATE INDEX "MarketIngestionRun_quotedOn_kind_idx" ON "MarketIngestionRun"("quotedOn", "kind");

-- CreateIndex
CREATE INDEX "Operation_profileId_occurredOn_idx" ON "Operation"("profileId", "occurredOn");

-- CreateIndex
CREATE INDEX "Operation_instrumentId_occurredOn_idx" ON "Operation"("instrumentId", "occurredOn");

-- CreateIndex
CREATE INDEX "Operation_type_occurredOn_idx" ON "Operation"("type", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_profileId_idempotencyKey_key" ON "Operation"("profileId", "idempotencyKey");
