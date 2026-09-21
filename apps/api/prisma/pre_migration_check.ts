import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const frameworksCount = await prisma.framework.count();
  const clausesCount = await prisma.frameworkClause.count();
  const mappingsCount = await prisma.controlFrameworkMapping.count();
  const approvedMappingsCount = await prisma.controlFrameworkMapping.count({ where: { status: 'APPROVED' } });
  const suggestedMappingsCount = await prisma.controlFrameworkMapping.count({ where: { status: 'SUGGESTED' } });
  const overriddenMappingsCount = await prisma.controlFrameworkMapping.count({ where: { status: 'OVERRIDDEN' } });
  const rejectedMappingsCount = await prisma.controlFrameworkMapping.count({ where: { status: 'REJECTED' } });
  const withConfidenceCount = await prisma.controlFrameworkMapping.count({ where: { confidenceScore: { not: null } } });
  const tier1Count = await prisma.controlFrameworkMapping.count({ where: { modelTier: 'TIER_1' } });
  const tier2Count = await prisma.controlFrameworkMapping.count({ where: { modelTier: 'TIER_2' } });
  const reviewedCount = await prisma.controlFrameworkMapping.count({ where: { reviewedById: { not: null } } });

  console.log('========================================');
  console.log('       BEFORE MIGRATION STATE           ');
  console.log('========================================');
  console.log(`Framework count:                 ${frameworksCount}`);
  console.log(`FrameworkClause count:           ${clausesCount}`);
  console.log(`ControlFrameworkMapping count:   ${mappingsCount}`);
  console.log(`APPROVED Mappings:               ${approvedMappingsCount}`);
  console.log(`SUGGESTED Mappings:              ${suggestedMappingsCount}`);
  console.log(`OVERRIDDEN Mappings:             ${overriddenMappingsCount}`);
  console.log(`REJECTED Mappings:               ${rejectedMappingsCount}`);
  console.log(`Mappings with confidenceScore:   ${withConfidenceCount}`);
  console.log(`TIER_1 Mappings:                 ${tier1Count}`);
  console.log(`TIER_2 Mappings:                 ${tier2Count}`);
  console.log(`Reviewed Mappings:               ${reviewedCount}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('Error recording BEFORE state:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
