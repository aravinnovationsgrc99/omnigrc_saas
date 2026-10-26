import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant.context';

export const DIRECT_TENANT_MODELS = [
  // Core Identity & Scoping
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
  'PolicyAttestation',
  'PolicyException',
  'PolicyCategory',
  'Incident',
  'UserDashboardPreference',

  // Business Audits & Findings
  'AuditPlan',
  'AuditSchedule',
  'AuditAssessment',
  'AuditCheckItem',
  'AuditEvidence',
  'AuditFinding',
  'AuditCapa',

  // Hierarchy & Access Control
  'Department',
  'Project',
  'OrganizationMembership',

  // Universal Evidence Vault
  'Evidence',
  'ControlEvidence',
  'RiskEvidence',
  'PolicyEvidence',
  'AuditCheckItemEvidence',
  'AuditFindingEvidence',
  'VendorEvidence',
  'VulnerabilityEvidence',
  'IncidentEvidence',

  // Universal Approval Engine
  'ApprovalWorkflow',
  'ApprovalInstance',
  'ApprovalDecision',
  'ControlApproval',
  'RiskApproval',
  'PolicyApproval',
  'AuditFindingApproval',
  'VendorAssessmentApproval',
  'VulnerabilityApproval',
  'IncidentApproval',
  'PolicyExceptionApproval',
  'EvidenceApproval',

  // Document Intelligence
  'DocumentAnalysis',
  'ExtractedFinding',

  // Cross-Model Associations & Projections
  'RiskControl',
  'OrganizationFrameworkEntitlement',
  'OrganizationControlStateProjection',
  'OrganizationServiceOverrideProjection',
  'Deployment',
  'SystemLicenseState',

  // Phase 2 Workflows: Domain Actions & Vendor Questionnaires
  'IncidentAction',
  'VendorQuestionnaire',
  'VendorQuestionnaireSubmission',
  'VendorAssessmentAction',

  // Phase 2.1 Regulatory Intelligence: Manual Source Intake
  'ManualSourceIntake',

  // Phase 4 Regulatory Applicability Assessment & Profiles
  'OrganizationComplianceProfile',
  'RegulatoryApplicabilityAssessment',
  'RegulatoryApplicabilityHistory',

  // Phase 5 Regulatory Obligation-to-Control Mapping
  'RegulatoryObligationControlMapping',
  'RegulatoryObligationControlMappingHistory',

  // Phase 6 Regulatory Control-Gap Analysis and Evidence Sufficiency
  'RegulatoryControlGapAssessment',
  'RegulatoryControlGapAssessmentHistory',
];

export const CHILD_TENANT_MODELS: Record<string, string> = {
  PolicyVersion: 'policy',
  ApprovalWorkflowStep: 'workflow',
  ApprovalInstanceStep: 'approvalInstance',
  AnalysisRun: 'documentAnalysis',
  ControlFrameworkMapping: 'control',
  AuditPlanFrameworkReference: 'auditPlan',
  EvidenceFrameworkReference: 'evidence',
  UserDepartment: 'department',
  UserProject: 'project',
};

export const TENANT_SCOPED_MODELS = [
  ...DIRECT_TENANT_MODELS,
  ...Object.keys(CHILD_TENANT_MODELS),
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
    if (params.args && params.args.where) {
      // Flatten compound unique selector keys (e.g. organizationId_userId, userId_organizationId, organizationId_capabilityCode)
      for (const key of Object.keys(params.args.where)) {
        const val = params.args.where[key];
        if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
          delete params.args.where[key];
          Object.assign(params.args.where, val);
        }
      }
    }
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
  ].includes(params.action);

  const parentRel = CHILD_TENANT_MODELS[params.model];

  if (parentRel) {
    // Child model relation-based tenant scoping
    if (isWhereScopedAction) {
      params.args = params.args || {};
      params.args.where = params.args.where || {};

      const existingParent = params.args.where[parentRel];
      if (existingParent?.organizationId !== undefined && existingParent?.organizationId !== null) {
        if (existingParent.organizationId !== orgId) {
          throw new ForbiddenException(
            `Cross-tenant access violation: organizationId mismatch for child model "${params.model}".`
          );
        }
      } else {
        params.args.where[parentRel] = {
          ...(typeof existingParent === 'object' ? existingParent : {}),
          organizationId: orgId,
        };
      }
    }

    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
      // Child records do not possess direct organizationId column; do not inject organizationId scalar.
      // If caller explicitly provides an invalid foreign organizationId in data payload, reject it.
      const dataPayload = params.args?.data || params.args?.create;
      if (dataPayload?.organizationId !== undefined && dataPayload?.organizationId !== null) {
        if (dataPayload.organizationId !== orgId) {
          throw new ForbiddenException(
            `Cross-tenant mutation violation: foreign organizationId specified for child model "${params.model}".`
          );
        }
      }
    }

    return next(params);
  }

  // Direct tenant model organizationId scoping
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
    params.args.where = params.args.where || {};
    params.args.create = params.args.create || {};

    // Validate where clause: check compound unique key or top-level organizationId
    let hasCompoundOrgId = false;
    for (const key of Object.keys(params.args.where)) {
      const val = params.args.where[key];
      if (val && typeof val === 'object' && val.organizationId !== undefined && val.organizationId !== null) {
        hasCompoundOrgId = true;
        if (val.organizationId !== orgId) {
          throw new ForbiddenException(
            `Cross-tenant access violation: organizationId mismatch in upsert where for model "${params.model}".`
          );
        }
      }
    }

    if (params.args.where.organizationId !== undefined && params.args.where.organizationId !== null) {
      if (params.args.where.organizationId !== orgId) {
        throw new ForbiddenException(
          `Cross-tenant access violation: organizationId mismatch in upsert where for model "${params.model}".`
        );
      }
    } else if (!hasCompoundOrgId) {
      params.args.where.organizationId = orgId;
    }

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

    return super.$transaction(
      async (tx) => {
        // 1. Establish tenant setting transaction-locally using parameterized query
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant', $1, true);`, orgId);

        // 2. If acting via MSSP, establish acting_mssp_id
        if (actingViaMsspId) {
          await tx.$executeRawUnsafe(`SELECT set_config('app.acting_mssp_id', $1, true);`, actingViaMsspId);
        }

        // 3. Bind tx to TenantContext for transparent query routing
        return TenantContext.runWithTxClient(tx, () => callback(tx));
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );
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
