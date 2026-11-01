-- Phase 3 WP2: CAPA Transition Attribution on AuditFindingVerificationHistory
-- Narrowly scoped schema addition for automated CAPA-driven status transitions

-- AlterTable
ALTER TABLE "audit_finding_verification_histories" ADD COLUMN IF NOT EXISTS "capa_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_finding_verification_histories_capa_id_idx"
  ON "audit_finding_verification_histories"("capa_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_finding_verification_histories_capa_id_fkey'
  ) THEN
    ALTER TABLE "audit_finding_verification_histories"
      ADD CONSTRAINT "audit_finding_verification_histories_capa_id_fkey"
      FOREIGN KEY ("capa_id") REFERENCES "audit_capas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

