import { PrismaClient, EntitlementStatus } from '@prisma/client';
import { generateDevSignedLicenseArtifact } from '@omnigrc/shared';
import { LicenseVerificationService } from '../src/license-verification/license-verification.service';
import { FrameworkEntitlementsService } from '../src/frameworks/framework-entitlements.service';

const prisma = new PrismaClient();

export const ORG_A_ID = '3bda52cd-87d0-46f4-bedc-d13d528e28ba';
export const ORG_B_ID = '3a7590c7-33cf-4b8e-bb56-9c604a7a0acc';

export const DEPLOYMENT_A_ID = 'deploy-org-a-cp-001';
export const DEPLOYMENT_B_ID = 'deploy-org-b-cp-002';

export function getOrgASignedArtifact() {
  return generateDevSignedLicenseArtifact({
    licenseId: 'lic-org-a-signed-101',
    customerId: 'cust-org-a-101',
    commercialAgreementId: 'ca-org-a-101',
    deploymentId: DEPLOYMENT_A_ID,
    organizationId: ORG_A_ID,
    status: 'ACTIVE' as any,
    startsAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    entitlements: [
      { code: 'ISO27001', name: 'ISO/IEC 27001:2022', enabled: true },
      { code: 'SOC2', name: 'SOC 2 Type II', enabled: true },
      { code: 'HIPAA', name: 'HIPAA Security Rule', enabled: true },
    ],
  });
}

export function getOrgBSignedArtifact() {
  return generateDevSignedLicenseArtifact({
    licenseId: 'lic-org-b-signed-102',
    customerId: 'cust-org-b-102',
    commercialAgreementId: 'ca-org-b-102',
    deploymentId: DEPLOYMENT_B_ID,
    organizationId: ORG_B_ID,
    status: 'ACTIVE' as any,
    startsAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    entitlements: [
      { code: 'ISO27001', name: 'ISO/IEC 27001:2022', enabled: true },
      { code: 'SOC2', name: 'SOC 2 Type II', enabled: true },
      { code: 'NIST_CSF', name: 'NIST Cybersecurity Framework', enabled: true },
    ],
  });
}

export async function reconcileOrgs() {
  console.log('Starting Canonical Control Plane ↔ Data Plane Licensing Reconciliation...');

  const frameworkEntitlementsService = new FrameworkEntitlementsService(prisma as any);
  const licenseVerificationService = new LicenseVerificationService(prisma as any, frameworkEntitlementsService);

  // 1. Ensure Org A and Deployment exist
  await prisma.organization.upsert({
    where: { id: ORG_A_ID },
    update: { name: 'Org A (Alpha Enterprises)' },
    create: { id: ORG_A_ID, name: 'Org A (Alpha Enterprises)', primaryRegion: 'India' },
  });

  await prisma.deployment.upsert({
    where: { controlPlaneDeploymentId: DEPLOYMENT_A_ID },
    update: { organizationId: ORG_A_ID, status: 'ACTIVE' },
    create: {
      organizationId: ORG_A_ID,
      controlPlaneDeploymentId: DEPLOYMENT_A_ID,
      modelType: 'SAAS_MULTI_TENANT',
      status: 'ACTIVE',
    },
  });

  // 2. Save verified state and reconcile entitlements for Org A
  const artifactA = getOrgASignedArtifact();
  await licenseVerificationService.saveVerifiedStateForOrganization(ORG_A_ID, DEPLOYMENT_A_ID, artifactA);
  console.log(`Org A (${ORG_A_ID}) successfully reconciled against Control Plane Ed25519 signed artifact.`);

  // 3. Ensure Org B and Deployment exist
  await prisma.organization.upsert({
    where: { id: ORG_B_ID },
    update: { name: 'Org B (Beta Solutions)' },
    create: { id: ORG_B_ID, name: 'Org B (Beta Solutions)', primaryRegion: 'India' },
  });

  await prisma.deployment.upsert({
    where: { controlPlaneDeploymentId: DEPLOYMENT_B_ID },
    update: { organizationId: ORG_B_ID, status: 'ACTIVE' },
    create: {
      organizationId: ORG_B_ID,
      controlPlaneDeploymentId: DEPLOYMENT_B_ID,
      modelType: 'SAAS_MULTI_TENANT',
      status: 'ACTIVE',
    },
  });

  // 4. Save verified state and reconcile entitlements for Org B
  const artifactB = getOrgBSignedArtifact();
  await licenseVerificationService.saveVerifiedStateForOrganization(ORG_B_ID, DEPLOYMENT_B_ID, artifactB);
  console.log(`Org B (${ORG_B_ID}) successfully reconciled against Control Plane Ed25519 signed artifact.`);

  // 5. Query & Log Effective Entitlements
  const entA = await prisma.organizationFrameworkEntitlement.findMany({
    where: { organizationId: ORG_A_ID },
    include: { framework: true },
  });

  const entB = await prisma.organizationFrameworkEntitlement.findMany({
    where: { organizationId: ORG_B_ID },
    include: { framework: true },
  });

  console.log('\n--- Org A Reconciled Entitlements ---');
  entA.forEach((e) => console.log(` - Framework: ${e.framework.code}, Status: ${e.status}`));

  console.log('\n--- Org B Reconciled Entitlements ---');
  entB.forEach((e) => console.log(` - Framework: ${e.framework.code}, Status: ${e.status}`));
}

if (require.main === module) {
  reconcileOrgs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Reconciliation Error:', err);
      process.exit(1);
    });
}
