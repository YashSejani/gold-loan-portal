-- CreateEnum
CREATE TYPE "RepaymentType" AS ENUM ('BULLET', 'EMI');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('FORM', 'AGENT');

-- CreateTable
CREATE TABLE "LoanScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualRateBps" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "maxLtvBps" INTEGER NOT NULL,
    "repaymentType" "RepaymentType" NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    -- Hand-edited: generated from id, never written by the app.
    "applicationId" TEXT NOT NULL GENERATED ALWAYS AS ('GL-' || "id"::text) STORED,
    "fullName" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "grossWeightMg" INTEGER NOT NULL,
    "netWeightMg" INTEGER NOT NULL,
    "karat" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "rate24kPaisePerGram" INTEGER NOT NULL,
    "appliedLtvBps" INTEGER NOT NULL,
    "pureGoldMg" DECIMAL(14,3) NOT NULL,
    "goldValuePaise" BIGINT NOT NULL,
    "eligibleLoanRupees" INTEGER NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'SUBMITTED',
    "channel" "Channel" NOT NULL DEFAULT 'FORM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_applicationId_key" ON "Lead"("applicationId");

-- CreateIndex
CREATE INDEX "Lead_mobileNumber_createdAt_idx" ON "Lead"("mobileNumber", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LoanScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-edited: constraints Prisma cannot express (CLAUDE.md §4.1, §7)
ALTER TABLE "LoanScheme" ADD CONSTRAINT "LoanScheme_maxLtvBps_check" CHECK ("maxLtvBps" > 0 AND "maxLtvBps" <= 7500);

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_netWeightMg_positive_check" CHECK ("netWeightMg" > 0);
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_net_le_gross_check" CHECK ("netWeightMg" <= "grossWeightMg");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_grossWeightMg_max_check" CHECK ("grossWeightMg" <= 1000000);
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_karat_check" CHECK ("karat" IN (18, 22, 24));

-- Hand-edited: application ids start at GL-1001. START WITH too, so TRUNCATE ... RESTART IDENTITY goes back to 1001.
ALTER SEQUENCE "Lead_id_seq" START WITH 1001 RESTART WITH 1001;
