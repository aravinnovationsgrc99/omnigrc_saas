-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETE');

-- CreateTable
CREATE TABLE "compliance_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "owner" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "controlId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "compliance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_tasks_organizationId_idx" ON "compliance_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "compliance_tasks_deletedAt_idx" ON "compliance_tasks"("deletedAt");

-- CreateIndex
CREATE INDEX "compliance_tasks_status_idx" ON "compliance_tasks"("status");

-- CreateIndex
CREATE INDEX "compliance_tasks_dueDate_idx" ON "compliance_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "compliance_tasks_controlId_idx" ON "compliance_tasks"("controlId");

-- AddForeignKey
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
