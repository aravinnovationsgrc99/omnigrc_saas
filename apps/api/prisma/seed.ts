import { PrismaClient, Role, PodRegion, PodStatus, FrameworkCode, AssetType, AssetCriticality } from '@prisma/client';
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

  // Seed Frameworks (schema only, no clause data yet per Phase 1 spec)
  const frameworks = [
    { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022 Information Security' },
    { code: FrameworkCode.SOC2, name: 'SOC 2 Type II Trust Services Criteria' },
    { code: FrameworkCode.GDPR, name: 'General Data Protection Regulation (EU GDPR)' },
    { code: FrameworkCode.DPDP, name: 'Digital Personal Data Protection Act (India DPDP 2023)' },
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

  // Seed 7 Realistic Demo Assets across types & criticality levels
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

  console.log('Seeding completed successfully with 7 demo assets.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
