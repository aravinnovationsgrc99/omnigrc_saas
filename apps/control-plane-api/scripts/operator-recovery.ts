import { PrismaClient, OperatorRole, OperatorStatus } from '@prisma/control-plane-client';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables if not already set
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

export interface DatabaseTargetValidation {
  isValid: boolean;
  isLocal: boolean;
  redactedHost: string;
  projectRef?: string;
  targetIdentity?: string;
  error?: string;
}

export interface ValidateDatabaseTargetOptions {
  isProduction?: boolean;
  nodeEnv?: string;
  allowRemoteDevDb?: string;
  approvedDevIdentity?: string;
}

export function extractDatabaseTargetIdentity(rawUrl: string): {
  hostname: string;
  projectRef?: string;
  dbName?: string;
  identity: string;
  isAmbiguous: boolean;
} | null {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().trim();
    const username = decodeURIComponent(parsed.username || '').trim();
    const dbName = parsed.pathname.replace(/^\/+/, '').trim();

    let projectRef: string | undefined = undefined;

    // Supabase pooler username pattern: postgres.<project-ref>
    if (username.includes('.')) {
      const parts = username.split('.');
      if (parts.length >= 2 && parts[1]) {
        projectRef = parts[1].trim();
      }
    }

    // Supabase direct hostname pattern: <project-ref>.supabase.co or db.<project-ref>.supabase.co
    if (hostname.endsWith('.supabase.co')) {
      const sub = hostname.replace(/\.supabase\.co$/, '');
      const parts = sub.split('.');
      projectRef = parts[parts.length - 1];
    }

    const isSupabasePooler = hostname.includes('pooler.supabase.com');
    const isAmbiguous = isSupabasePooler && !projectRef;
    const identity = projectRef || (hostname ? `${hostname}${dbName ? `/${dbName}` : ''}` : '');

    return {
      hostname,
      projectRef,
      dbName,
      identity,
      isAmbiguous,
    };
  } catch {
    return null;
  }
}

export function validateDatabaseTarget(
  rawUrl: string | undefined,
  options: ValidateDatabaseTargetOptions = {},
): DatabaseTargetValidation {
  if (!rawUrl) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost: 'none',
      error: 'Missing database connection URL. CONTROL_PLANE_DIRECT_URL or CONTROL_PLANE_DATABASE_URL must be set.',
    };
  }

  const targetInfo = extractDatabaseTargetIdentity(rawUrl);
  if (!targetInfo) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost: 'malformed',
      error: 'Malformed database connection URL. Unable to determine database target.',
    };
  }

  const { hostname, projectRef, identity, isAmbiguous } = targetInfo;

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === 'host.docker.internal';

  const redactedHost = isLocal
    ? 'localhost'
    : hostname.replace(/^([a-zA-Z0-9_-]{1,6})[a-zA-Z0-9_-]*/, '$1***');

  // Strict Fail-Closed Rule 1: Never permit CLI account mutations in production or staging environments
  const currentEnv = (options.nodeEnv ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  const isProdOrStaging =
    options.isProduction === true ||
    currentEnv === 'production' ||
    currentEnv === 'staging';

  if (isProdOrStaging) {
    return {
      isValid: false,
      isLocal,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: 'Direct CLI account mutation is blocked in production and staging environments. Use multi-party break-glass authorization or trusted operator ceremony.',
    };
  }

  // Local targets are valid development targets in non-production environments
  if (isLocal) {
    return {
      isValid: true,
      isLocal: true,
      redactedHost: 'localhost',
      targetIdentity: 'local',
    };
  }

  // Strict Fail-Closed Rule 2: Remote targets MUST have established project/database identity
  if (isAmbiguous || !identity) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      error: `Target database is remote (${redactedHost}), but its project/database identity cannot be positively established. Supabase pooler targets require an explicit project reference in the username (postgres.<project-ref>).`,
    };
  }

  // Strict Fail-Closed Rule 3: Remote targets REQUIRE an independently configured development allowlist
  const configuredAllowlist = (
    options.approvedDevIdentity ??
    process.env.APPROVED_CONTROL_PLANE_DEV_PROJECT_REF ??
    process.env.APPROVED_DEV_DATABASE_IDENTITY ??
    ''
  ).trim();

  if (!configuredAllowlist) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: 'Missing approved remote development database allowlist configuration (APPROVED_CONTROL_PLANE_DEV_PROJECT_REF). Remote recovery mutations are blocked by default.',
    };
  }

  const approvedList = configuredAllowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (approvedList.length === 0) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: 'Empty approved remote development database allowlist configuration. Remote recovery mutations are blocked.',
    };
  }

  // Strict Fail-Closed Rule 4: Target project/database identity must match the approved allowlist
  const targetMatchesAllowlist =
    (projectRef && approvedList.includes(projectRef.toLowerCase())) ||
    approvedList.includes(identity.toLowerCase());

  if (!targetMatchesAllowlist) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: `Unauthorized remote database target. Target project/database identity [${projectRef || identity}] does not match independently configured approved development allowlist.`,
    };
  }

  // Strict Fail-Closed Rule 5: CLI flag --allow-remote-dev-db must be provided AND match approved allowlist & target
  if (!options.allowRemoteDevDb) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: `Target database is remote (${redactedHost}, project: ${projectRef || identity}). Refusing mutation without explicit target confirmation. To authorize against the approved remote development database, specify --allow-remote-dev-db=<project-ref> along with --confirm.`,
    };
  }

  const cliFlagValue = options.allowRemoteDevDb.trim().toLowerCase();
  const cliMatchesApproved = approvedList.includes(cliFlagValue);
  const cliMatchesTarget =
    (projectRef && cliFlagValue === projectRef.toLowerCase()) ||
    cliFlagValue === identity.toLowerCase();

  if (!cliMatchesApproved || !cliMatchesTarget) {
    return {
      isValid: false,
      isLocal: false,
      redactedHost,
      projectRef,
      targetIdentity: identity,
      error: `Conflicting remote target authorization. Specified --allow-remote-dev-db=[${options.allowRemoteDevDb}] does not match both the approved development allowlist and the target database identity.`,
    };
  }

  return {
    isValid: true,
    isLocal: false,
    redactedHost,
    projectRef,
    targetIdentity: identity,
  };
}

export interface OperatorRecoveryResult {
  success: boolean;
  operatorId?: string;
  email?: string;
  role?: string;
  status?: string;
  mfaStatus?: string;
  targetDatabaseType?: string;
  sessionsRevoked?: number;
  auditLogged?: boolean;
  error?: string;
}

export interface ExecuteOperatorRecoveryOptions {
  email: string;
  action: 'status' | 'reset-mfa' | 'unlock';
  confirm?: boolean;
  isProduction?: boolean;
  nodeEnv?: string;
  approvedDevIdentity?: string;
  dbUrl?: string;
  allowRemoteDevDb?: string;
}

export async function executeOperatorRecovery(
  prisma: PrismaClient,
  options: ExecuteOperatorRecoveryOptions,
): Promise<OperatorRecoveryResult> {
  const { email, action, confirm, isProduction, nodeEnv, approvedDevIdentity, dbUrl, allowRemoteDevDb } = options;

  // Validate database target safety before executing any mutation
  if (action === 'reset-mfa' || action === 'unlock') {
    const targetValidation = validateDatabaseTarget(dbUrl, {
      isProduction,
      nodeEnv,
      approvedDevIdentity,
      allowRemoteDevDb,
    });

    if (!targetValidation.isValid) {
      return {
        success: false,
        error: targetValidation.error,
      };
    }
  }

  const operator = await prisma.operator.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      mfaEnabled: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      createdAt: true,
    },
  });

  if (!operator) {
    return {
      success: false,
      error: 'Operator account not found or access denied.',
    };
  }

  // Suspended operators cannot undergo recovery
  if (operator.status === OperatorStatus.SUSPENDED) {
    return {
      success: false,
      operatorId: operator.id,
      email: operator.email,
      status: operator.status,
      error: 'Operator account is SUSPENDED. Re-activation requires platform super-admin break-glass approval.',
    };
  }

  if (action === 'status') {
    const targetValidation = validateDatabaseTarget(dbUrl, {
      isProduction,
      nodeEnv,
      approvedDevIdentity,
      allowRemoteDevDb,
    });
    return {
      success: true,
      operatorId: operator.id,
      email: operator.email,
      role: operator.role,
      status: operator.status,
      mfaStatus: operator.mfaEnabled ? 'ENROLLED' : 'RE_ENROLLMENT_REQUIRED',
      targetDatabaseType: targetValidation.isLocal
        ? 'LOCAL_DEV'
        : `REMOTE_TARGET (${targetValidation.redactedHost}${targetValidation.projectRef ? `, project: ${targetValidation.projectRef}` : ''})`,
    };
  }

  if (action === 'unlock') {
    if (!confirm) {
      return {
        success: false,
        error: 'Confirmation required. Pass --confirm to unlock account.',
      };
    }

    await prisma.operator.update({
      where: { id: operator.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await prisma.controlPlaneAuditLog.create({
      data: {
        action: 'OPERATOR_ACCOUNT_UNLOCKED_BY_RECOVERY',
        entityType: 'OPERATOR',
        entityId: operator.id,
        actorId: 'RECOVERY_CLI',
        actorRole: operator.role,
        result: 'SUCCESS',
        metadata: {
          email: operator.email,
          reason: 'Manual account lock cleared via authorized recovery utility',
        },
      },
    });

    return {
      success: true,
      operatorId: operator.id,
      email: operator.email,
      role: operator.role,
      status: operator.status,
      auditLogged: true,
    };
  }

  if (action === 'reset-mfa') {
    if (!confirm) {
      return {
        success: false,
        error: 'Confirmation required. Pass --confirm to initiate MFA re-enrollment reset.',
      };
    }

    // 1. Invalidate old MFA secret and mark as requiring re-enrollment
    await prisma.operator.update({
      where: { id: operator.id },
      data: {
        mfaEnabled: false,
        totpSecret: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 2. Revoke all existing active sessions immediately
    const revokedSessions = await prisma.operatorSession.updateMany({
      where: {
        operatorId: operator.id,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
      },
    });

    // 3. Write immutable security audit event
    await prisma.controlPlaneAuditLog.create({
      data: {
        action: 'OPERATOR_MFA_RESET_AND_SESSIONS_REVOKED',
        entityType: 'OPERATOR',
        entityId: operator.id,
        actorId: 'RECOVERY_CLI',
        actorRole: operator.role,
        result: 'SUCCESS',
        metadata: {
          email: operator.email,
          reason: 'MFA recovery reset authorized; existing sessions revoked; re-enrollment required on next login',
          revokedSessionCount: revokedSessions.count,
        },
      },
    });

    return {
      success: true,
      operatorId: operator.id,
      email: operator.email,
      role: operator.role,
      status: operator.status,
      mfaStatus: 'RE_ENROLLMENT_REQUIRED',
      sessionsRevoked: revokedSessions.count,
      auditLogged: true,
    };
  }

  return {
    success: false,
    error: `Unknown recovery action: ${action}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith('--email='))?.split('=')[1] || 'initial-admin@omnigrc.co';
  const resetMfa = args.includes('--reset-mfa');
  const unlockOnly = args.includes('--unlock');
  const confirm = args.includes('--confirm');
  const allowRemoteDevDb = args.find((a) => a.startsWith('--allow-remote-dev-db='))?.split('=')[1];
  const nodeEnv = process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';
  const approvedDevIdentity =
    process.env.APPROVED_CONTROL_PLANE_DEV_PROJECT_REF ||
    process.env.APPROVED_DEV_DATABASE_IDENTITY;
  const dbUrl = process.env.CONTROL_PLANE_DIRECT_URL || process.env.CONTROL_PLANE_DATABASE_URL;

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    let action: 'status' | 'reset-mfa' | 'unlock' = 'status';
    if (resetMfa) action = 'reset-mfa';
    else if (unlockOnly) action = 'unlock';

    const result = await executeOperatorRecovery(prisma, {
      email: emailArg,
      action,
      confirm,
      isProduction,
      nodeEnv,
      approvedDevIdentity,
      dbUrl,
      allowRemoteDevDb,
    });

    console.log('========================================================');
    console.log('OMNiGRC Control Plane — Operator Recovery & Re-enrollment');
    console.log('========================================================');

    if (!result.success) {
      console.error(`[RECOVERY FAILED]: ${result.error}`);
      console.log('========================================================');
      process.exit(1);
    }

    console.log(`Operator ID:        ${result.operatorId}`);
    console.log(`Email:              ${result.email}`);
    console.log(`Role:               ${result.role}`);
    console.log(`Status:             ${result.status}`);
    console.log(`MFA Posture:        ${result.mfaStatus}`);
    if (result.targetDatabaseType) {
      console.log(`Database Target:    ${result.targetDatabaseType}`);
    }

    if (action === 'reset-mfa') {
      console.log('--------------------------------------------------------');
      console.log('[ACTION PERFORMED]: Old MFA enrollment securely invalidated.');
      console.log(`[ACTION PERFORMED]: ${result.sessionsRevoked ?? 0} active sessions revoked.`);
      console.log('[ACTION PERFORMED]: Security audit log entry created.');
      console.log('');
      console.log('NEXT MANDATORY STEP:');
      console.log('1. Authenticate with your existing operator password.');
      console.log('2. Navigate to Control Panel Settings and complete fresh MFA enrollment.');
    } else if (action === 'unlock') {
      console.log('--------------------------------------------------------');
      console.log('[ACTION PERFORMED]: Account unlocked. Failed attempt counter cleared.');
    } else {
      console.log('--------------------------------------------------------');
      console.log('NOTE: To reset MFA and force new authenticator enrollment:');
      console.log('  Local DB:   npm run operator:recover -- --reset-mfa --confirm');
      console.log('  Remote Dev: npm run operator:recover -- --reset-mfa --confirm --allow-remote-dev-db=<project-ref>');
      console.log('NOTE: No secret keys or authentication material are exposed by this tool.');
    }
    console.log('========================================================');
  } catch (err: any) {
    console.error('[ERROR] Recovery operation encountered an unexpected failure:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
