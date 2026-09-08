import { PrismaClient, Role, PodRegion, PodStatus, FrameworkCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OMNiGRC foundation database...');

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
  await prisma.user.upsert({
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

  console.log('Seeding complete successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
