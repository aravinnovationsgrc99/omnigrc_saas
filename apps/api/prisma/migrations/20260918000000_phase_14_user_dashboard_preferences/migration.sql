-- CreateTable UserDashboardPreference
CREATE TABLE "user_dashboard_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "user_dashboard_preferences_userId_organizationId_key" ON "user_dashboard_preferences"("userId", "organizationId");
CREATE INDEX "user_dashboard_preferences_organizationId_idx" ON "user_dashboard_preferences"("organizationId");
CREATE INDEX "user_dashboard_preferences_userId_idx" ON "user_dashboard_preferences"("userId");

-- AddForeignKeys
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE "user_dashboard_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_dashboard_preferences_tenant_isolation ON "user_dashboard_preferences" USING ("organizationId"::text = current_setting('app.current_tenant', true));
