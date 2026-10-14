import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant.context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();

    // Attach middleware for row-level tenant scoping at application layer
    this.$use(async (params, next) => {
      const orgId = TenantContext.getOrganizationId();
      const tenantModels = [
        'User',
        'RegionalPod',
        'AuditLogEntry',
        'Asset',
        'Risk',
        'Control',
        'ComplianceTask',
        'Notification',
        'Invitation',
        'Vendor',
        'VendorAssessment',
        'Vulnerability',
        'VulnerabilityAsset',
        'Policy',
        'PolicyVersion',
        'PolicyAttestation',
        'PolicyException',
        'AuditPlan',
        'AuditSchedule',
        'AuditAssessment',
        'AuditCheckItem',
        'AuditEvidence',
        'AuditFinding',
        'AuditCapa',
      ];

      if (orgId && params.model && tenantModels.includes(params.model)) {
        const isWhereScopedAction = [
          'findUnique',
          'findFirst',
          'findMany',
          'count',
          'aggregate',
          'groupBy',
          'update',
          'updateMany',
          'delete',
          'deleteMany',
          'upsert',
        ].includes(params.action);

        if (isWhereScopedAction) {
          params.args = params.args || {};
          params.args.where = params.args.where || {};
          if (!params.args.where.organizationId) {
            const actingViaMsspId = TenantContext.getActingViaMsspId();
            if (params.model === 'User' && actingViaMsspId) {
              const currentUserId = TenantContext.getUserId();
              const isSelf = Boolean(
                currentUserId &&
                (params.args.where.id === currentUserId ||
                  params.args.where.id?.equals === currentUserId)
              );
              const isDisplayNameLookup =
                TenantContext.isDisplayNameLookup() &&
                ['findUnique', 'findFirst', 'findMany'].includes(params.action);

              if (isSelf) {
                // Authenticated self-lookup or self-update (e.g. preferences)
                if (
                  ['findUnique', 'findFirst', 'findMany', 'count'].includes(params.action) ||
                  params.action === 'update'
                ) {
                  params.args.where.organizationId = { in: [orgId, actingViaMsspId] };
                } else {
                  // Self-delete or other operations cannot affect home-org from client context
                  params.args.where.organizationId = orgId;
                }
              } else if (isDisplayNameLookup) {
                // Purpose-specific display-name lookup for DB-stored foreign keys (read-only)
                params.args.where.organizationId = { in: [orgId, actingViaMsspId] };
              } else {
                // Strict client-tenant boundary: Arbitrary user lookups by ID (from params/body/query),
                // mutations on other users, counts, and listings are strictly scoped to the client tenant.
                params.args.where.organizationId = orgId;
              }
            } else {
              params.args.where.organizationId = orgId;
            }
          }
        }

        if (['create', 'createMany'].includes(params.action)) {
          params.args = params.args || {};
          if (params.action === 'create' && params.args.data && !params.args.data.organizationId) {
            params.args.data.organizationId = orgId;
          }
        }

        if (params.action === 'upsert') {
          params.args = params.args || {};
          if (params.args.create && !params.args.create.organizationId) {
            params.args.create.organizationId = orgId;
          }
        }
      }

      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
