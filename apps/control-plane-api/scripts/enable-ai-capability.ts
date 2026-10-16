import * as fs from 'fs';
import * as path from 'path';

// Load control-plane-api .env
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

import { PrismaClient, OperatorRole, ServiceStateEnum } from '@prisma/control-plane-client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.CONTROL_PLANE_DIRECT_URL || process.env.CONTROL_PLANE_DATABASE_URL,
    },
  },
});

interface EnableCapabilityOptions {
  capabilityCode: string;
  reason: string;
  operatorEmail?: string;
}

export async function enableCapability(options: EnableCapabilityOptions) {
  const { capabilityCode, reason } = options;

  console.log(`\n======================================================`);
  console.log(`[CONTROLLED ACTIVATION] Capability: ${capabilityCode}`);
  console.log(`======================================================`);

  // 1. Find operator
  const operatorEmail = options.operatorEmail || 'initial-admin@omnigrc.co';
  const operator = await prisma.operator.findUnique({
    where: { email: operatorEmail },
  });

  if (!operator) {
    throw new Error(`Operator with email [${operatorEmail}] not found.`);
  }

  // 2. Fetch service catalog item
  const service = await prisma.serviceCatalog.findUnique({
    where: { code: capabilityCode },
    include: { globalState: true },
  });

  if (!service) {
    throw new Error(`Service capability [${capabilityCode}] not found in catalog.`);
  }

  const previousState = service.globalState?.state || null;
  const currentSeq = service.globalState?.sequence || 0n;
  const nextSeq = currentSeq + 1n;

  console.log(`Current Global State: ${previousState || 'NONE'} (Seq: ${currentSeq})`);
  console.log(`Target Global State:  AVAILABLE (Seq: ${nextSeq})`);
  console.log(`Authorized Operator:  ${operator.fullName} <${operator.email}> (${operator.role})`);
  console.log(`Reason for update:    "${reason}"`);

  // 3. Execute authoritative transaction (Supported Service-Management Path)
  const result = await prisma.$transaction(async (tx) => {
    let updatedGlobalState;
    if (service.globalState) {
      updatedGlobalState = await tx.globalServiceState.update({
        where: { serviceId: service.id },
        data: {
          state: ServiceStateEnum.AVAILABLE,
          reason,
          sequence: nextSeq,
          updatedByOperatorId: operator.id,
        },
      });
    } else {
      updatedGlobalState = await tx.globalServiceState.create({
        data: {
          serviceId: service.id,
          state: ServiceStateEnum.AVAILABLE,
          reason,
          sequence: nextSeq,
          updatedByOperatorId: operator.id,
        },
      });
    }

    // Historical Audit: State Transition Log
    await tx.serviceStateTransitionLog.create({
      data: {
        scope: 'GLOBAL',
        serviceCode: capabilityCode,
        previousState: previousState,
        newState: ServiceStateEnum.AVAILABLE,
        reason,
        sequence: nextSeq,
        operatorId: operator.id,
        operatorRole: operator.role,
      },
    });

    // Control Plane Audit Log
    await tx.controlPlaneAuditLog.create({
      data: {
        action: 'SERVICE_GLOBAL_STATE_CHANGED',
        entityType: 'SERVICE_CATALOG',
        entityId: capabilityCode,
        actorId: operator.id,
        actorRole: operator.role,
        result: 'SUCCESS',
        metadata: {
          serviceCode: capabilityCode,
          previousState,
          newState: ServiceStateEnum.AVAILABLE,
          reason,
          sequence: nextSeq.toString(),
        },
      },
    });

    return updatedGlobalState;
  });

  console.log(`[SUCCESS] Capability [${capabilityCode}] is now AVAILABLE.`);
  console.log(`Updated Record:`, JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  return result;
}

async function main() {
  const cap = process.argv[2];
  const reason = process.argv[3];

  if (!cap || !reason) {
    console.error('Usage: ts-node enable-ai-capability.ts <CAPABILITY_CODE> <REASON>');
    process.exit(1);
  }

  try {
    await enableCapability({ capabilityCode: cap, reason });
  } catch (err: any) {
    console.error('Activation failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
