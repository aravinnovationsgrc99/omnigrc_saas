-- CreateIndex
CREATE INDEX IF NOT EXISTS "control_plane_audit_logs_createdAt_idx" ON "control_plane_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "control_plane_audit_logs_entityType_idx" ON "control_plane_audit_logs"("entityType");
