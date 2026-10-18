import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant.context';

export const TENANT_SCOPED_MODELS = [
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
  'PolicyCategory',
  'Incident',
  'UserDashboardPreference',
  'AuditPlan',
  'AuditSchedule',
  'AuditAssessment',
  'AuditCheckItem',
  'AuditEvidence',
  'AuditFinding',
  'AuditCapa',
];

export async function tenantScopingMiddleware(params: any, next: (params: any) => Promise<any>) {
  if (!params.model || !TENANT_SCOPED_MODELS.includes(params.model)) {
    return next(params);
  }

  const isSystem = TenantContext.isSystemContext();
  const orgId = TenantContext.getOrganizationId();
  const actingViaMsspId = TenantContext.getActingViaMsspId();

  if (!isSystem && !orgId) {
    throw new ForbiddenException(
      `Tenant context missing: access to tenant-scoped model "${params.model}" denied.`
    );
  }

  if (isSystem) {
    // Deliberate, restricted system execution context for scheduled jobs and internal tasks.
    return next(params);
  }

  // Active Tenant Scoped Execution:

  // Convert findUnique to findFirst to avoid unique input schema validation failure
  // on models that do not have composite @@unique([id, organizationId]) constraints.
  if (params.action === 'findUnique') {
    params.action = 'findFirst';
  }

  const isWhereScopedAction = [
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

    if (params.args.where.organizationId !== undefined && params.args.where.organizationId !== null) {
      const existingOrgId = params.args.where.organizationId;
      let isPermitted = existingOrgId === orgId;

      if (!isPermitted && params.model === 'User' && actingViaMsspId) {
        const currentUserId = TenantContext.getUserId();
        const isSelf = Boolean(
          currentUserId &&
          (params.args.where.id === currentUserId ||
            params.args.where.id?.equals === currentUserId)
        );
        const isDisplayNameLookup = TenantContext.isDisplayNameLookup();

        if (isSelf || isDisplayNameLookup) {
          if (existingOrgId === actingViaMsspId) {
            isPermitted = true;
          } else if (
            typeof existingOrgId === 'object' &&
            Array.isArray(existingOrgId.in) &&
            existingOrgId.in.every((id: string) => id === orgId || id === actingViaMsspId)
          ) {
            isPermitted = true;
          }
        }
      }

      if (!isPermitted) {
        throw new ForbiddenException(
          `Cross-tenant access violation: organizationId mismatch for model "${params.model}".`
        );
      }
    } else {
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
          if (
            ['findUnique', 'findFirst', 'findMany', 'count'].includes(params.action) ||
            params.action === 'update'
          ) {
            params.args.where.organizationId = { in: [orgId, actingViaMsspId] };
          } else {
            params.args.where.organizationId = orgId;
          }
        } else if (isDisplayNameLookup) {
          params.args.where.organizationId = { in: [orgId, actingViaMsspId] };
        } else {
          params.args.where.organizationId = orgId;
        }
      } else {
        params.args.where.organizationId = orgId;
      }
    }
  }

  if (params.action === 'create') {
    params.args = params.args || {};
    params.args.data = params.args.data || {};
    if (params.args.data.organizationId !== undefined && params.args.data.organizationId !== null) {
      if (params.args.data.organizationId !== orgId) {
        throw new ForbiddenException(
          `Cross-tenant mutation violation: cannot create "${params.model}" for foreign tenant.`
        );
      }
    } else {
      params.args.data.organizationId = orgId;
    }
  }

  if (params.action === 'createMany') {
    params.args = params.args || {};
    if (params.args.data) {
      if (!Array.isArray(params.args.data)) {
        throw new BadRequestException('createMany data must be an array');
      }
      for (const item of params.args.data) {
        if (item && typeof item === 'object') {
          if (item.organizationId !== undefined && item.organizationId !== null) {
            if (item.organizationId !== orgId) {
              throw new ForbiddenException(
                `Cross-tenant mutation violation: createMany on "${params.model}" contains record for foreign tenant.`
              );
            }
          } else {
            item.organizationId = orgId;
          }
        }
      }
    }
  }

  if (params.action === 'update') {
    params.args = params.args || {};
    if (
      params.args.data &&
      params.args.data.organizationId !== undefined &&
      params.args.data.organizationId !== null
    ) {
      if (params.args.data.organizationId !== orgId) {
        throw new ForbiddenException(
          `Cross-tenant mutation violation: cannot reassign "${params.model}" to foreign tenant.`
        );
      }
    }
  }

  if (params.action === 'upsert') {
    params.args = params.args || {};
    params.args.create = params.args.create || {};
    if (
      params.args.create.organizationId !== undefined &&
      params.args.create.organizationId !== null
    ) {
      if (params.args.create.organizationId !== orgId) {
        throw new ForbiddenException(
          `Cross-tenant mutation violation: cannot upsert-create "${params.model}" for foreign tenant.`
        );
      }
    } else {
      params.args.create.organizationId = orgId;
    }

    if (
      params.args.update &&
      params.args.update.organizationId !== undefined &&
      params.args.update.organizationId !== null
    ) {
      if (params.args.update.organizationId !== orgId) {
        throw new ForbiddenException(
          `Cross-tenant mutation violation: cannot upsert-update "${params.model}" to foreign tenant.`
        );
      }
    }
  }

  return next(params);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();

    // Attach middleware for row-level tenant scoping at application layer
    this.$use(tenantScopingMiddleware);

    return new Proxy(this, {
      get(target, prop, receiver) {
        const tx = TenantContext.getTxClient();
        if (tx) {
          if (prop in tx && typeof prop === 'string' && !prop.startsWith('$')) {
            return tx[prop];
          }
          if (
            prop === '$queryRaw' ||
            prop === '$queryRawUnsafe' ||
            prop === '$executeRaw' ||
            prop === '$executeRawUnsafe'
          ) {
            return tx[prop].bind(tx);
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  /**
   * Executes callback within a transaction where the tenant session variable
   * `app.current_tenant` (and `app.acting_mssp_id` if MSSP) is established
   * transaction-locally via parameterized SQL.
   * If already inside an active tenant transaction, reuses it (REQUIRED propagation).
   */
  async withTenantTransaction<T>(callback: (tx?: any) => Promise<T>): Promise<T> {
    const orgId = TenantContext.getOrganizationId();
    const actingViaMsspId = TenantContext.getActingViaMsspId();

    const activeTx = TenantContext.getTxClient();
    if (activeTx) {
      return callback(activeTx);
    }

    if (!orgId || TenantContext.isSystemContext()) {
      return callback();
    }

    return super.$transaction(async (tx) => {
      // 1. Establish tenant setting transaction-locally using parameterized query
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant', $1, true);`, orgId);

      // 2. If acting via MSSP, establish acting_mssp_id
      if (actingViaMsspId) {
        await tx.$executeRawUnsafe(`SELECT set_config('app.acting_mssp_id', $1, true);`, actingViaMsspId);
      }

      // 3. Bind tx to TenantContext for transparent query routing
      return TenantContext.runWithTxClient(tx, () => callback(tx));
    });
  }

  override async $transaction(arg: any, options?: any): Promise<any> {
    const activeTx = TenantContext.getTxClient();
    if (activeTx && typeof arg === 'function') {
      return arg(activeTx);
    }
    return super.$transaction(arg, options);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
