import { PrismaClient } from '@prisma/client';
import { Role, PodRegion, PodStatus, FrameworkCode, AssetType, AssetCriticality, RiskStatus } from '@omnigrc/shared';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OMNiGRC database...');

  // Create demo Organization
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Meridian Health Pvt. Ltd.',
      primaryRegion: 'India',
    },
  });

  // Create ADMIN user
  const passwordHash = await bcrypt.hash('Admin@123456', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@meridian.com' },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Priya Nair',
      email: 'admin@meridian.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // Seed 4 RegionalPods (India = ACTIVE, others = INACTIVE)
  const pods = [
    { region: PodRegion.INDIA, status: PodStatus.ACTIVE },
    { region: PodRegion.UK, status: PodStatus.INACTIVE },
    { region: PodRegion.EU, status: PodStatus.INACTIVE },
    { region: PodRegion.AUSTRALIA, status: PodStatus.INACTIVE },
  ];

  for (const pod of pods) {
    await prisma.regionalPod.upsert({
      where: {
        organizationId_region: {
          organizationId: org.id,
          region: pod.region,
        },
      },
      update: { status: pod.status },
      create: {
        organizationId: org.id,
        region: pod.region,
        status: pod.status,
      },
    });
  }

  // Seed Frameworks
  // TODO: confirm and add pending framework — see correction note
  const frameworks = [
    { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022 Information Security' },
    { code: FrameworkCode.ISO42001, name: 'ISO/IEC 42001:2023 Artificial Intelligence Management System' },
    { code: FrameworkCode.SOC2, name: 'SOC 2 Type II Trust Services Criteria' },
    { code: FrameworkCode.GDPR, name: 'General Data Protection Regulation (EU GDPR)' },
    { code: FrameworkCode.DPDP, name: 'Digital Personal Data Protection Act (India DPDP 2023)' },
    { code: FrameworkCode.HIPAA, name: 'Health Insurance Portability and Accountability Act (HIPAA)' },
  ];

  for (const fw of frameworks) {
    await prisma.framework.upsert({
      where: { code: fw.code },
      update: { name: fw.name },
      create: {
        code: fw.code,
        name: fw.name,
      },
    });
  }

  // Seed 7 Realistic Demo Assets
  const demoAssets = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'AWS Production Cloud Infrastructure',
      type: AssetType.SOFTWARE,
      description: 'Primary cloud hosting environment for patient portal and API services.',
      owner: 'DevOps Team',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Amazon Web Services',
      dataResidencyRegion: 'India (ap-south-1)',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Patient Health Records DB (PostgreSQL)',
      type: AssetType.DATA_STORE,
      description: 'Encrypted relational database containing electronic health records (EHR).',
      owner: 'Data Engineering',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Amazon RDS',
      dataResidencyRegion: 'India (Mumbai)',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000003',
      name: 'Razorpay Payment Gateway Integration',
      type: AssetType.VENDOR,
      description: 'Third-party payment processor for online patient consultations.',
      owner: 'Finance & Operations',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Razorpay Software Pvt Ltd',
      dataResidencyRegion: 'India',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000004',
      name: 'Corporate Laptops & MacBooks',
      type: AssetType.HARDWARE,
      description: 'Employee workstations managed via MDM with disk encryption enabled.',
      owner: 'IT Support',
      criticality: AssetCriticality.MEDIUM,
      vendorName: 'Apple / Dell',
      dataResidencyRegion: 'On-Premise / Remote',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000005',
      name: 'HubSpot Sales & Marketing CRM',
      type: AssetType.VENDOR,
      description: 'Customer relationship management platform for patient outreach.',
      owner: 'Marketing Team',
      criticality: AssetCriticality.MEDIUM,
      vendorName: 'HubSpot Inc.',
      dataResidencyRegion: 'United States',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000006',
      name: 'Slack & Team Communication Hub',
      type: AssetType.SOFTWARE,
      description: 'Internal messaging tool for healthcare providers and operations staff.',
      owner: 'Internal IT',
      criticality: AssetCriticality.LOW,
      vendorName: 'Slack Technologies',
      dataResidencyRegion: 'United States',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000007',
      name: 'Office CCTV & NVR Systems',
      type: AssetType.HARDWARE,
      description: 'Physical security cameras and network video recorder in Bangalore HQ.',
      owner: 'Physical Security',
      criticality: AssetCriticality.LOW,
      vendorName: 'Hikvision',
      dataResidencyRegion: 'India (Bangalore)',
    },
  ];

  for (const asset of demoAssets) {
    await prisma.asset.upsert({
      where: { id: asset.id },
      update: {
        name: asset.name,
        type: asset.type,
        description: asset.description,
        owner: asset.owner,
        criticality: asset.criticality,
        vendorName: asset.vendorName,
        dataResidencyRegion: asset.dataResidencyRegion,
      },
      create: {
        id: asset.id,
        organizationId: org.id,
        name: asset.name,
        type: asset.type,
        description: asset.description,
        owner: asset.owner,
        criticality: asset.criticality,
        vendorName: asset.vendorName,
        dataResidencyRegion: asset.dataResidencyRegion,
        createdById: adminUser.id,
      },
    });
  }

  // Seed 11 Realistic Demo Risks across likelihood x impact grid (1-5) and statuses
  const demoRisks = [
    {
      id: 'r0000000-0000-0000-0000-000000000001',
      title: 'Unencrypted Patient Health Data in Transit',
      description: 'Legacy internal API endpoints communicating over unencrypted HTTP.',
      likelihood: 4,
      impact: 5,
      status: RiskStatus.OPEN,
      owner: 'SecOps Team',
      assetId: 'a0000000-0000-0000-0000-000000000002',
      treatmentPlan: 'Enforce mandatory TLS 1.3 across all internal and public services by Q3.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000002',
      title: 'AWS S3 Bucket Public Access Misconfiguration',
      description: 'Risk of diagnostic images being stored in publicly accessible cloud buckets.',
      likelihood: 3,
      impact: 5,
      status: RiskStatus.IN_TREATMENT,
      owner: 'DevOps Lead',
      assetId: 'a0000000-0000-0000-0000-000000000001',
      treatmentPlan: 'Enable AWS S3 Block Public Access globally and deploy automated guardrails.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000003',
      title: 'Payment Gateway Integration Outage',
      description: 'Downtime in payment gateway processing during peak consultation hours.',
      likelihood: 3,
      impact: 4,
      status: RiskStatus.OPEN,
      owner: 'Finance & Ops',
      assetId: 'a0000000-0000-0000-0000-000000000003',
      treatmentPlan: 'Implement secondary backup gateway failover (BillDesk / PayU).',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000004',
      title: 'Unpatched OS Vulnerabilities on Workstations',
      description: 'Outdated operating system patches on employee laptops exposing endpoints to malware.',
      likelihood: 4,
      impact: 3,
      status: RiskStatus.IN_TREATMENT,
      owner: 'IT Support',
      assetId: 'a0000000-0000-0000-0000-000000000004',
      treatmentPlan: 'Configure automated patch management via MDM with 7-day enforcement window.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000005',
      title: 'Insufficient Data Audit Retention for DPDP Compliance',
      description: 'Audit logs retained for only 90 days instead of mandatory 1-year compliance window.',
      likelihood: 2,
      impact: 4,
      status: RiskStatus.ACCEPTED,
      owner: 'Compliance Officer',
      treatmentPlan: 'Formal risk acceptance signed off by CISO pending cloud log archive deployment.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000006',
      title: 'Stale User Access Permissions in Marketing CRM',
      description: 'Former sales employees retaining active CRM login credentials.',
      likelihood: 3,
      impact: 3,
      status: RiskStatus.IN_TREATMENT,
      owner: 'Sales Ops',
      assetId: 'a0000000-0000-0000-0000-000000000005',
      treatmentPlan: 'Enforce automated Okta SAML de-provisioning sync.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000007',
      title: 'Missing Multi-Factor Authentication on Slack Workspace',
      description: 'Sub-contractors accessing team communication channels without mandatory 2FA.',
      likelihood: 2,
      impact: 3,
      status: RiskStatus.ACCEPTED,
      owner: 'Internal IT',
      assetId: 'a0000000-0000-0000-0000-000000000006',
      treatmentPlan: 'Temporary risk acceptance until enterprise SSO migration completes.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000008',
      title: 'Physical Tampering of HQ Camera Storage Recorder',
      description: 'Unrestricted physical access to server rack housing CCTV video recorder.',
      likelihood: 1,
      impact: 3,
      status: RiskStatus.CLOSED,
      owner: 'Physical Security',
      assetId: 'a0000000-0000-0000-0000-000000000007',
      treatmentPlan: 'Installed biometric access lock on HQ server room. Risk resolved.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000009',
      title: 'Phishing & Executive Impersonation Campaign',
      description: 'Targeted spear-phishing attempts soliciting wire transfers.',
      likelihood: 4,
      impact: 4,
      status: RiskStatus.OPEN,
      owner: 'SecOps Team',
      treatmentPlan: 'Deploy email security filtering and conduct quarterly simulated phishing tests.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000010',
      title: 'Ransomware Infection via Email Attachment',
      description: 'Malicious attachment execution locking local hospital file shares.',
      likelihood: 3,
      impact: 5,
      status: RiskStatus.IN_TREATMENT,
      owner: 'Infrastructure Lead',
      treatmentPlan: 'Deploy CrowdStrike EDR agents across all enterprise endpoints.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000011',
      title: 'API Rate Limiting Absence on Public Auth Endpoints',
      description: 'Lack of IP throttling on authentication endpoints leading to brute-force risks.',
      likelihood: 2,
      impact: 2,
      status: RiskStatus.CLOSED,
      owner: 'DevOps Team',
      treatmentPlan: 'Deployed NestJS ThrottlerGuard on all public API routes. Closed.',
    },
  ];

  for (const risk of demoRisks) {
    const score = risk.likelihood * risk.impact;
    await prisma.risk.upsert({
      where: { id: risk.id },
      update: {
        title: risk.title,
        description: risk.description,
        likelihood: risk.likelihood,
        impact: risk.impact,
        score,
        status: risk.status,
        owner: risk.owner,
        assetId: risk.assetId || null,
        treatmentPlan: risk.treatmentPlan,
      },
      create: {
        id: risk.id,
        organizationId: org.id,
        title: risk.title,
        description: risk.description,
        likelihood: risk.likelihood,
        impact: risk.impact,
        score,
        status: risk.status,
        owner: risk.owner,
        assetId: risk.assetId || null,
        treatmentPlan: risk.treatmentPlan,
        createdById: adminUser.id,
      },
    });
  }

  console.log('Seeding completed successfully with 7 assets and 11 demo risks.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
