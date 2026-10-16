import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ServiceStateEnum, OperatorRole } from '@prisma/control-plane-client';

export interface DatabaseTargetValidation {
  isSafe: boolean;
  isLocal: boolean;
  targetIdentity: string;
  error?: string;
}

export function extractDatabaseTargetIdentity(rawUrl: string): {
  hostname: string;
  projectRef?: string;
  identity: string;
} | null {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname) {
      return null;
    }
    const username = decodeURIComponent(parsed.username || '').trim();

    let projectRef: string | undefined = undefined;
    if (username.includes('.')) {
      const parts = username.split('.');
      if (parts.length >= 2 && parts[1]) {
        projectRef = parts[1].trim();
      }
    }
    if (hostname.endsWith('.supabase.co')) {
      const sub = hostname.replace(/\.supabase\.co$/, '');
      const parts = sub.split('.');
      projectRef = parts[parts.length - 1];
    }

    const identity = projectRef || hostname;
    return { hostname, projectRef, identity };
  } catch {
    return null;
  }
}

export function validateTestDatabaseTarget(
  rawUrl: string | undefined,
  options: {
    nodeEnv?: string;
    allowRemoteTestDb?: boolean;
    approvedTestProjectRef?: string;
  } = {},
): DatabaseTargetValidation {
  if (!rawUrl) {
    return {
      isSafe: false,
      isLocal: false,
      targetIdentity: 'none',
      error: 'FAIL_CLOSED: Missing database connection URL for E2E tests.',
    };
  }

  const target = extractDatabaseTargetIdentity(rawUrl);
  if (!target) {
    return {
      isSafe: false,
      isLocal: false,
      targetIdentity: 'malformed',
      error: 'FAIL_CLOSED: Malformed database connection URL.',
    };
  }

  const { hostname, projectRef, identity } = target;

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === 'host.docker.internal';

  const env = (options.nodeEnv || process.env.NODE_ENV || '').trim().toLowerCase();
  if (env === 'production' || env === 'staging') {
    return {
      isSafe: false,
      isLocal,
      targetIdentity: identity,
      error: 'FAIL_CLOSED: E2E mutating test execution is strictly blocked in production and staging environments.',
    };
  }

  // Local databases (local postgres container or mock) are always safe
  if (isLocal) {
    return {
      isSafe: true,
      isLocal: true,
      targetIdentity: 'localhost',
    };
  }

  // Remote database targets must be explicitly authorized as an approved test database
  const approvedRef =
    options.approvedTestProjectRef ||
    process.env.CONTROL_PLANE_TEST_PROJECT_REF ||
    process.env.APPROVED_CONTROL_PLANE_DEV_PROJECT_REF;

  const isExplicitlyAllowed =
    options.allowRemoteTestDb ??
    (process.env.ALLOW_E2E_REMOTE_TEST_DB === 'true' || Boolean(process.env.CONTROL_PLANE_TEST_DATABASE_URL));

  if (!isExplicitlyAllowed) {
    return {
      isSafe: false,
      isLocal: false,
      targetIdentity: identity,
      error: `FAIL_CLOSED: Target database is remote (${hostname}, project: ${identity}). Mutating tests against remote databases require explicit authorization via CONTROL_PLANE_TEST_DATABASE_URL or ALLOW_E2E_REMOTE_TEST_DB=true.`,
    };
  }

  if (approvedRef && projectRef && projectRef.toLowerCase() !== approvedRef.toLowerCase()) {
    return {
      isSafe: false,
      isLocal: false,
      targetIdentity: identity,
      error: `FAIL_CLOSED: Target remote project [${projectRef}] does not match approved test reference [${approvedRef}].`,
    };
  }

  return {
    isSafe: true,
    isLocal: false,
    targetIdentity: identity,
  };
}

export class E2ETestIsolationManager {
  private initialStates: Map<string, { state: ServiceStateEnum; sequence: bigint; reason: string }> = new Map();
  private ephemeralCodes: string[] = [];
  private isInterruptionHookRegistered = false;

  constructor(private readonly prisma: ControlPlanePrismaService) {}

  public assertEnvironmentSafe(dbUrl?: string) {
    const validation = validateTestDatabaseTarget(
      dbUrl || process.env.CONTROL_PLANE_TEST_DATABASE_URL || process.env.CONTROL_PLANE_DATABASE_URL,
    );
    if (!validation.isSafe) {
      throw new Error(validation.error);
    }
  }

  public async snapshotCanonicalStates() {
    const current = await this.prisma.globalServiceState.findMany({
      include: { service: true },
    });

    this.initialStates.clear();
    for (const item of current) {
      this.initialStates.set(item.service.code, {
        state: item.state,
        sequence: item.sequence,
        reason: item.reason,
      });
    }

    if (!this.isInterruptionHookRegistered) {
      this.registerInterruptionHandlers();
      this.isInterruptionHookRegistered = true;
    }
  }

  public async seedEphemeralCapabilities(codes: string[]) {
    this.ephemeralCodes = codes;

    for (const code of codes) {
      let catalogItem = await this.prisma.serviceCatalog.findUnique({ where: { code } });
      if (!catalogItem) {
        catalogItem = await this.prisma.serviceCatalog.create({
          data: {
            code,
            name: `Ephemeral E2E Test Capability (${code})`,
            category: 'AI_SERVICES',
            hasBackgroundProcessing: false,
            isCatalogActive: true,
            isCommerciallyControllable: true,
            isOrgOverridePermitted: true,
          },
        });
      }

      await this.prisma.globalServiceState.upsert({
        where: { serviceId: catalogItem.id },
        update: {
          state: ServiceStateEnum.AVAILABLE,
          reason: 'Initial test state',
          sequence: 1n,
        },
        create: {
          serviceId: catalogItem.id,
          state: ServiceStateEnum.AVAILABLE,
          reason: 'Initial test state',
          sequence: 1n,
        },
      });
    }
  }

  public async cleanupAndRestore() {
    if (this.ephemeralCodes.length > 0) {
      const ephemeralCatalogs = await this.prisma.serviceCatalog.findMany({
        where: { code: { in: this.ephemeralCodes } },
        select: { id: true, code: true },
      });
      const ephemeralIds = ephemeralCatalogs.map((c) => c.id);

      if (ephemeralIds.length > 0) {
        await this.prisma.organizationServiceOverride.deleteMany({
          where: { serviceId: { in: ephemeralIds } },
        });
        await this.prisma.globalServiceState.deleteMany({
          where: { serviceId: { in: ephemeralIds } },
        });
        await this.prisma.serviceStateTransitionLog.deleteMany({
          where: { serviceCode: { in: this.ephemeralCodes } },
        });
        await this.prisma.controlPlaneAuditLog.deleteMany({
          where: { entityId: { in: this.ephemeralCodes } },
        });
        await this.prisma.serviceCatalog.deleteMany({
          where: { id: { in: ephemeralIds } },
        });
      }
    }

    for (const [code, initial] of this.initialStates.entries()) {
      const service = await this.prisma.serviceCatalog.findUnique({
        where: { code },
        include: { globalState: true },
      });
      if (service && service.globalState) {
        if (service.globalState.state !== initial.state) {
          const nextSeq = service.globalState.sequence + 1n;
          await this.prisma.globalServiceState.update({
            where: { serviceId: service.id },
            data: {
              state: initial.state,
              reason: `E2E teardown restoration to snapshot (${initial.reason})`,
              sequence: nextSeq,
            },
          });
          await this.prisma.serviceStateTransitionLog.create({
            data: {
              scope: 'GLOBAL',
              serviceCode: code,
              previousState: service.globalState.state,
              newState: initial.state,
              reason: `E2E teardown restoration to snapshot (${initial.reason})`,
              sequence: nextSeq,
              operatorId: 'E2E_TEARDOWN_RESTORER',
              operatorRole: OperatorRole.PLATFORM_SUPER_ADMIN,
            },
          });
        }
      }
    }
  }

  private registerInterruptionHandlers() {
    const handleSignal = async (signal: string) => {
      console.warn(`\n[E2E-ISOLATION] Interception: Caught ${signal}. Restoring global states before exiting...`);
      try {
        await this.cleanupAndRestore();
      } catch (err: any) {
        console.error('[E2E-ISOLATION] Failed to clean up during interrupt:', err.message);
      }
    };

    process.once('SIGINT', () => handleSignal('SIGINT'));
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
  }
}
