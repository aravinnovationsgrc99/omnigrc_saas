-- CreateEnum
CREATE TYPE "RiskControlMitigationType" AS ENUM ('PREVENTATIVE', 'DETECTIVE', 'CORRECTIVE', 'COMPENSATING');

-- CreateTable
CREATE TABLE "risk_controls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "mitigationType" "RiskControlMitigationType" NOT NULL DEFAULT 'PREVENTATIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risks_id_organizationId_key" ON "risks"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "controls_id_organizationId_key" ON "controls"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_controls_riskId_controlId_key" ON "risk_controls"("riskId", "controlId");

-- CreateIndex
CREATE INDEX "risk_controls_organizationId_idx" ON "risk_controls"("organizationId");

-- CreateIndex
CREATE INDEX "risk_controls_riskId_idx" ON "risk_controls"("riskId");

-- CreateIndex
CREATE INDEX "risk_controls_controlId_idx" ON "risk_controls"("controlId");

-- AddForeignKey
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_riskId_organizationId_fkey" FOREIGN KEY ("riskId", "organizationId") REFERENCES "risks"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_controlId_organizationId_fkey" FOREIGN KEY ("controlId", "organizationId") REFERENCES "controls"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
