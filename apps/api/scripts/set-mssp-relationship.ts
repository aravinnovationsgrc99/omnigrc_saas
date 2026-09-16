import { PrismaClient } from '@prisma/client';

/**
 * Internal Administrative Script: Set MSSP Organization Relationship
 * 
 * Usage:
 *   npx ts-node apps/api/scripts/set-mssp-relationship.ts <targetOrgId> <type: STANDALONE|MSSP_PROVIDER|CLIENT_TENANT> [parentOrgId] [actorId]
 * 
 * Examples:
 *   npx ts-node apps/api/scripts/set-mssp-relationship.ts "org-1" "MSSP_PROVIDER"
 *   npx ts-node apps/api/scripts/set-mssp-relationship.ts "org-2" "CLIENT_TENANT" "org-1" "admin-user-id"
 */
async function setMsspRelationship() {
  const args = process.argv.slice(2);
  const targetOrgId = args[0];
  const newType = args[1] as 'STANDALONE' | 'MSSP_PROVIDER' | 'CLIENT_TENANT';
  const parentOrgId = args[2] || null;
  const actorId = args[3] || 'SYSTEM_SCRIPT';

  if (!targetOrgId || !newType) {
    console.error('Usage: npx ts-node apps/api/scripts/set-mssp-relationship.ts <targetOrgId> <type: STANDALONE|MSSP_PROVIDER|CLIENT_TENANT> [parentOrgId] [actorId]');
    process.exit(1);
  }

  const validTypes = ['STANDALONE', 'MSSP_PROVIDER', 'CLIENT_TENANT'];
  if (!validTypes.includes(newType)) {
    console.error(`Invalid org type: ${newType}. Allowed values: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const currentOrg = await prisma.organization.findUnique({
      where: { id: targetOrgId },
    });

    if (!currentOrg) {
      console.error(`Organization with ID "${targetOrgId}" not found.`);
      process.exit(1);
    }

    if (parentOrgId) {
      const parentOrg = await prisma.organization.findUnique({
        where: { id: parentOrgId },
      });

      if (!parentOrg) {
        console.error(`Parent Organization with ID "${parentOrgId}" not found.`);
        process.exit(1);
      }
    }

    // Update target organization
    const updatedOrg = await prisma.organization.update({
      where: { id: targetOrgId },
      data: {
        type: newType,
        parentOrganizationId: parentOrgId,
      },
    });

    // Create immutable audit log entry following AuditLogsService convention
    const auditEntry = await prisma.auditLogEntry.create({
      data: {
        organizationId: targetOrgId,
        actorId: actorId,
        action: 'ORGANIZATION_RELATIONSHIP_UPDATED',
        entityType: 'Organization',
        entityId: targetOrgId,
        metadata: {
          oldType: currentOrg.type,
          newType: updatedOrg.type,
          oldParentOrganizationId: currentOrg.parentOrganizationId,
          newParentOrganizationId: updatedOrg.parentOrganizationId,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    console.log('Successfully updated organization relationship:');
    console.log(`- Org ID: ${updatedOrg.id}`);
    console.log(`- Org Name: ${updatedOrg.name}`);
    console.log(`- Type: ${currentOrg.type} -> ${updatedOrg.type}`);
    console.log(`- Parent Org ID: ${currentOrg.parentOrganizationId || 'NULL'} -> ${updatedOrg.parentOrganizationId || 'NULL'}`);
    console.log(`- Audit Log Entry ID: ${auditEntry.id}`);

  } catch (error) {
    console.error('Error setting organization relationship:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setMsspRelationship();
