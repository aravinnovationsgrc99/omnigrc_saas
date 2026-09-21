import { PrismaClient, FrameworkReferenceType, FrameworkVersionStatus } from '@prisma/client';

const prisma = new PrismaClient();

const VERSION_DEFS: Record<string, { version: string; name: string; publisher: string }> = {
  ISO27001: { version: '2022', name: 'ISO/IEC 27001:2022', publisher: 'ISO/IEC' },
  SOC2: { version: '2017', name: 'SOC 2 Trust Services Criteria (2017)', publisher: 'AICPA' },
  GDPR: { version: '2016', name: 'EU General Data Protection Regulation (2016/679)', publisher: 'EU Parliament' },
  DPDP: { version: '2023', name: 'Digital Personal Data Protection Act 2023', publisher: 'Government of India' },
  ISO42001: { version: '2023', name: 'ISO/IEC 42001:2023 Artificial Intelligence', publisher: 'ISO/IEC' },
  HIPAA: { version: '1996', name: 'Health Insurance Portability and Accountability Act', publisher: 'US HHS' },
};

function inferReferenceType(frameworkCode: string, clauseCode: string): FrameworkReferenceType {
  const codeUpper = clauseCode.toUpperCase();
  if (frameworkCode === 'GDPR' || frameworkCode === 'DPDP') {
    if (codeUpper.includes('ART') || codeUpper.includes('ARTICLE') || /^\d+$/.test(clauseCode.trim())) {
      return FrameworkReferenceType.ARTICLE;
    }
    return FrameworkReferenceType.SECTION;
  }
  if (frameworkCode === 'SOC2') {
    if (codeUpper.startsWith('CC') || codeUpper.startsWith('A.')) {
      return FrameworkReferenceType.CRITERION;
    }
    return FrameworkReferenceType.REQUIREMENT;
  }
  if (frameworkCode === 'ISO27001' || frameworkCode === 'ISO42001') {
    if (codeUpper.startsWith('A.') || codeUpper.includes('CONTROL')) {
      return FrameworkReferenceType.CONTROL;
    }
    return FrameworkReferenceType.CLAUSE;
  }
  return FrameworkReferenceType.CLAUSE;
}

async function migrate() {
  console.log('Starting safe, idempotent Framework Reference migration...');

  // 1. Record BEFORE state
  const clausesBeforeCount = await prisma.frameworkClause.count();
  const mappingsBeforeCount = await prisma.controlFrameworkMapping.count();
  const initialMappings = await prisma.controlFrameworkMapping.findMany({
    select: {
      id: true,
      controlId: true,
      frameworkClauseId: true,
      status: true,
      confidenceScore: true,
      modelTier: true,
      reviewedById: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  console.log(`[BEFORE] FrameworkClauses: ${clausesBeforeCount}`);
  console.log(`[BEFORE] Mappings: ${mappingsBeforeCount}`);

  // 2. Fetch all existing frameworks
  const frameworks = await prisma.framework.findMany({
    include: { clauses: true },
  });

  const clauseIdToReferenceIdMap = new Map<string, string>();

  for (const fw of frameworks) {
    const vDef = VERSION_DEFS[fw.code] || {
      version: '1.0',
      name: `${fw.name} Reference Version`,
      publisher: 'System',
    };

    // Upsert FrameworkVersion
    const versionRecord = await prisma.frameworkVersion.upsert({
      where: {
        frameworkId_version: {
          frameworkId: fw.id,
          version: vDef.version,
        },
      },
      update: {
        name: vDef.name,
        publisher: vDef.publisher,
        status: FrameworkVersionStatus.ACTIVE,
      },
      create: {
        frameworkId: fw.id,
        version: vDef.version,
        name: vDef.name,
        publisher: vDef.publisher,
        status: FrameworkVersionStatus.ACTIVE,
        provenance: {
          source: 'Legacy FrameworkClause Seed Migration',
          migratedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`Version '${versionRecord.version}' ready for Framework '${fw.code}' (${fw.name})`);

    // Migrate each FrameworkClause to FrameworkReference
    for (const clause of fw.clauses) {
      const refType = inferReferenceType(fw.code, clause.code);

      const refRecord = await prisma.frameworkReference.upsert({
        where: {
          frameworkVersionId_identifier: {
            frameworkVersionId: versionRecord.id,
            identifier: clause.code,
          },
        },
        update: {
          title: clause.title,
          description: clause.title, // Neutral summary
          type: refType,
        },
        create: {
          frameworkVersionId: versionRecord.id,
          type: refType,
          identifier: clause.code,
          title: clause.title,
          description: clause.title,
          provenance: {
            legacyClauseId: clause.id,
            migratedAt: new Date().toISOString(),
          },
        },
      });

      clauseIdToReferenceIdMap.set(clause.id, refRecord.id);
    }
  }

  console.log(`Mapped ${clauseIdToReferenceIdMap.size} FrameworkClause IDs to FrameworkReference IDs.`);

  // 3. Link existing ControlFrameworkMapping records to FrameworkReference
  let updatedMappingsCount = 0;
  for (const mapping of initialMappings) {
    if (mapping.frameworkClauseId) {
      const refId = clauseIdToReferenceIdMap.get(mapping.frameworkClauseId);
      if (refId) {
        await prisma.controlFrameworkMapping.update({
          where: { id: mapping.id },
          data: {
            frameworkReferenceId: refId,
          },
        });
        updatedMappingsCount++;
      } else {
        console.warn(`No reference found for frameworkClauseId: ${mapping.frameworkClauseId}`);
      }
    }
  }

  console.log(`Updated ${updatedMappingsCount} mappings with frameworkReferenceId.`);

  // 4. AFTER Validation
  const clausesAfterCount = await prisma.frameworkClause.count();
  const mappingsAfterCount = await prisma.controlFrameworkMapping.count();
  const versionsCount = await prisma.frameworkVersion.count();
  const referencesCount = await prisma.frameworkReference.count();
  const mappedReferenceMappingsCount = await prisma.controlFrameworkMapping.count({
    where: { frameworkReferenceId: { not: null } },
  });

  console.log('\n========================================');
  console.log('       POST-MIGRATION VERIFICATION      ');
  console.log('========================================');
  console.log(`FrameworkClause count (BEFORE vs AFTER): ${clausesBeforeCount} vs ${clausesAfterCount} [${clausesBeforeCount === clausesAfterCount ? 'PASSED' : 'FAILED'}]`);
  console.log(`Mapping count (BEFORE vs AFTER):        ${mappingsBeforeCount} vs ${mappingsAfterCount} [${mappingsBeforeCount === mappingsAfterCount ? 'PASSED' : 'FAILED'}]`);
  console.log(`FrameworkVersion count:                ${versionsCount}`);
  console.log(`FrameworkReference count:              ${referencesCount}`);
  console.log(`Mappings linked to FrameworkReference: ${mappedReferenceMappingsCount} / ${mappingsAfterCount}`);

  // Validate AI and metadata integrity
  const finalMappings = await prisma.controlFrameworkMapping.findMany({
    select: {
      id: true,
      controlId: true,
      frameworkClauseId: true,
      frameworkReferenceId: true,
      status: true,
      confidenceScore: true,
      modelTier: true,
      reviewedById: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  let metadataMismatch = 0;
  for (const initial of initialMappings) {
    const finalm = finalMappings.find((m) => m.id === initial.id);
    if (!finalm) {
      metadataMismatch++;
      continue;
    }
    if (
      finalm.controlId !== initial.controlId ||
      finalm.frameworkClauseId !== initial.frameworkClauseId ||
      finalm.status !== initial.status ||
      finalm.confidenceScore !== initial.confidenceScore ||
      finalm.modelTier !== initial.modelTier ||
      finalm.reviewedById !== initial.reviewedById ||
      (finalm.reviewedAt && initial.reviewedAt && finalm.reviewedAt.getTime() !== initial.reviewedAt.getTime()) ||
      finalm.createdAt.getTime() !== initial.createdAt.getTime()
    ) {
      metadataMismatch++;
      console.error(`Metadata mismatch for mapping ${initial.id}!`);
    }
  }

  console.log(`Metadata integrity check: ${metadataMismatch === 0 ? 'PASSED (0 mismatches)' : `FAILED (${metadataMismatch} mismatches)`}`);
  console.log('========================================\n');
}

migrate()
  .catch((err) => {
    console.error('Migration failed with error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
