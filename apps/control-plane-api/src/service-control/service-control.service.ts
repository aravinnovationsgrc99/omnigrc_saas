import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ServiceStateEnum, OperatorRole } from '@prisma/control-plane-client';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { UpdateGlobalServiceStateDto } from './dto/update-global-service-state.dto';
import { UpdateOrganizationServiceOverrideDto } from './dto/update-organization-service-override.dto';
import * as crypto from 'crypto';

export interface OperatorContext {
  id: string;
  role: OperatorRole;
  email: string;
}

export const CANONICAL_CAPABILITIES = [
  { code: 'GRC_CORE_ASSETS', name: 'Asset Management', category: 'CORE_GRC', hasBg: false },
  { code: 'GRC_CORE_RISKS', name: 'Risk Management', category: 'CORE_GRC', hasBg: false },
  { code: 'GRC_CORE_CONTROLS', name: 'Controls & Framework Controls', category: 'CORE_GRC', hasBg: false },
  { code: 'GRC_CORE_TASKS', name: 'Compliance Tasks', category: 'CORE_GRC', hasBg: false },
  { code: 'FRAMEWORK_LIBRARY', name: 'Catalog Frameworks', category: 'GOVERNANCE', hasBg: false },
  { code: 'FRAMEWORK_COVERAGE', name: 'Framework Coverage & Entitlements', category: 'GOVERNANCE', hasBg: false },
  { code: 'EVIDENCE_VAULT', name: 'Universal Evidence Vault', category: 'EVIDENCE', hasBg: false },
  { code: 'APPROVAL_ENGINE', name: 'Universal Approval Engine', category: 'GOVERNANCE', hasBg: false },
  { code: 'POLICIES_MODULE', name: 'Policy Management', category: 'GOVERNANCE', hasBg: false },
  { code: 'BUSINESS_AUDITS', name: 'Business Audits', category: 'GOVERNANCE', hasBg: false },
  { code: 'VENDOR_RISK', name: 'Vendor Risk Management', category: 'THIRD_PARTY', hasBg: false },
  { code: 'VULNERABILITY_MGMT', name: 'Vulnerability Management', category: 'SECURITY', hasBg: false },
  { code: 'INCIDENT_MGMT', name: 'Incident Management', category: 'SECURITY', hasBg: false },
  { code: 'AI_DOC_INTELLIGENCE', name: 'AI Document Intelligence', category: 'AI_SERVICES', hasBg: true },
  { code: 'AI_GRC_CHAT', name: 'AI GRC Assistant', category: 'AI_SERVICES', hasBg: false },
  { code: 'AI_CONTROL_MAPPING', name: 'AI Control Auto-Mapping', category: 'AI_SERVICES', hasBg: true },
  { code: 'NOTIFICATIONS_EMAIL', name: 'Email Notifications & Digests', category: 'INTEGRATIONS', hasBg: true },
  { code: 'MSSP_PORTAL', name: 'MSSP Provider Portal', category: 'MSSP', hasBg: false },
];

const TRIVIAL_REASONS = [
  'test',
  'xxxxxxxxxx',
  'ok ok ok ok ok',
  '1234567890',
  'asdfghjkl;',
  'testing123',
  'change state',
];

@Injectable()
export class ServiceControlService implements OnModuleInit {
  private readonly logger = new Logger(ServiceControlService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
  ) {}

  async onModuleInit() {
    await this.seedCanonicalServiceCatalog();
  }

  /**
   * Seed catalog with 18 canonical capability codes
   */
  private async seedCanonicalServiceCatalog() {
    for (const cap of CANONICAL_CAPABILITIES) {
      const existing = await this.prisma.serviceCatalog.findUnique({
        where: { code: cap.code },
      });

      if (!existing) {
        const catalogItem = await this.prisma.serviceCatalog.create({
          data: {
            code: cap.code,
            name: cap.name,
            category: cap.category,
            hasBackgroundProcessing: cap.hasBg,
            isCatalogActive: true,
            isCommerciallyControllable: true,
            isOrgOverridePermitted: true,
          },
        });

        await this.prisma.globalServiceState.create({
          data: {
            serviceId: catalogItem.id,
            state: ServiceStateEnum.AVAILABLE,
            reason: 'Default initial capability availability',
            sequence: 1n,
          },
        });
      }
    }
    this.logger.log('Canonical Service Catalog seeding verified (18 capabilities).');
  }

  async listServices() {
    const catalog = await this.prisma.serviceCatalog.findMany({
      include: {
        globalState: true,
      },
      orderBy: { code: 'asc' },
    });

    return catalog.map((item) => ({
      ...item,
      globalState: item.globalState
        ? {
            ...item.globalState,
            sequence: item.globalState.sequence.toString(),
          }
        : null,
    }));
  }

  async getServiceByCode(code: string) {
    const service = await this.prisma.serviceCatalog.findUnique({
      where: { code },
      include: { globalState: true },
    });

    if (!service) {
      throw new NotFoundException(`Service capability code [${code}] not found in catalog.`);
    }

    return {
      ...service,
      globalState: service.globalState
        ? {
            ...service.globalState,
            sequence: service.globalState.sequence.toString(),
          }
        : null,
    };
  }

  /**
   * Update Global Service Availability State
   */
  async updateGlobalServiceState(
    code: string,
    dto: UpdateGlobalServiceStateDto,
    operator: OperatorContext,
    ipAddress?: string,
    correlationId?: string,
  ) {
    const service = await this.prisma.serviceCatalog.findUnique({
      where: { code },
      include: { globalState: true },
    });

    if (!service) {
      throw new NotFoundException(`Service capability code [${code}] not found.`);
    }

    const { state, reason, idempotencyKey } = dto;
    const cleanedReason = reason.trim();

    if (cleanedReason.length < 10) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason must be at least 10 characters long',
        code: 'REASON_TOO_SHORT',
      });
    }

    if (TRIVIAL_REASONS.some((t) => cleanedReason.toLowerCase().includes(t))) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason provided is trivial or invalid.',
        code: 'REASON_TOO_TRIVIAL',
      });
    }

    if (idempotencyKey) {
      const existingLog = await this.prisma.serviceStateTransitionLog.findUnique({
        where: { idempotencyKey },
      });

      if (existingLog) {
        if (existingLog.newState === state && existingLog.serviceCode === code) {
          return {
            idempotent: true,
            serviceCode: code,
            state: service.globalState?.state || state,
          };
        } else {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Idempotency key "${idempotencyKey}" was used for a different transition.`,
            code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
          });
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let currentState = service.globalState;
      const currentSeq = currentState ? currentState.sequence : 0n;
      const nextSeq = currentSeq + 1n;

      let updatedGlobalState;
      if (currentState) {
        updatedGlobalState = await tx.globalServiceState.update({
          where: { serviceId: service.id },
          data: {
            state,
            reason: cleanedReason,
            sequence: nextSeq,
            updatedByOperatorId: operator.id,
          },
        });
      } else {
        updatedGlobalState = await tx.globalServiceState.create({
          data: {
            serviceId: service.id,
            state,
            reason: cleanedReason,
            sequence: nextSeq,
            updatedByOperatorId: operator.id,
          },
        });
      }

      await tx.serviceStateTransitionLog.create({
        data: {
          scope: 'GLOBAL',
          serviceCode: code,
          previousState: currentState?.state || null,
          newState: state,
          reason: cleanedReason,
          sequence: nextSeq,
          idempotencyKey: idempotencyKey || null,
          operatorId: operator.id,
          operatorRole: operator.role,
        },
      });

      return {
        previousState: currentState?.state || null,
        record: updatedGlobalState,
      };
    });

    const responseSeq = result.record.sequence.toString();

    await this.auditLogsService.log({
      action: 'SERVICE_GLOBAL_STATE_CHANGED',
      entityType: 'SERVICE_CATALOG',
      entityId: code,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
      metadata: {
        serviceCode: code,
        previousState: result.previousState,
        newState: state,
        reason: cleanedReason,
        sequence: responseSeq,
      },
    });

    const propagation = await this.propagateGlobalServiceStateToDataPlane({
      capabilityCode: code,
      state,
      sequence: responseSeq,
      reason: cleanedReason,
      correlationId: correlationId || `corr_${Date.now()}`,
    });

    return {
      idempotent: false,
      capabilityCode: code,
      state: result.record.state,
      previousState: result.previousState,
      sequence: responseSeq,
      reason: cleanedReason,
      updatedAt: result.record.updatedAt,
      propagation,
    };
  }

  /**
   * Set Organization Service Override (AVAILABLE or DISABLED)
   */
  async setOrganizationServiceOverride(
    organizationId: string,
    code: string,
    dto: UpdateOrganizationServiceOverrideDto,
    operator: OperatorContext,
    ipAddress?: string,
    correlationId?: string,
  ) {
    const service = await this.prisma.serviceCatalog.findUnique({
      where: { code },
      include: { globalState: true },
    });

    if (!service) {
      throw new NotFoundException(`Service capability code [${code}] not found.`);
    }

    if (!service.isOrgOverridePermitted) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Organization service overrides are not permitted for service [${code}].`,
        code: 'OVERRIDE_NOT_PERMITTED',
      });
    }

    const { overrideState, reason, idempotencyKey } = dto;
    const cleanedReason = reason.trim();

    if (cleanedReason.length < 10) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason must be at least 10 characters long',
        code: 'REASON_TOO_SHORT',
      });
    }

    if (TRIVIAL_REASONS.some((t) => cleanedReason.toLowerCase().includes(t))) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason provided is trivial or invalid.',
        code: 'REASON_TOO_TRIVIAL',
      });
    }

    // COMMERCIAL PRIMACY RULE:
    // OrganizationServiceOverride may RESTRICT or DISABLE access.
    // It can NEVER grant access if global/commercial state is COMMERCIAL_DISABLED.
    if (
      service.globalState?.state === ServiceStateEnum.COMMERCIAL_DISABLED &&
      overrideState === ServiceStateEnum.AVAILABLE
    ) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Cannot override service [${code}] to AVAILABLE when global commercial state is COMMERCIAL_DISABLED. Commercial license primacy applies.`,
        code: 'INVALID_OVERRIDE_PRIMACY',
      });
    }

    if (idempotencyKey) {
      const existingLog = await this.prisma.serviceStateTransitionLog.findUnique({
        where: { idempotencyKey },
      });

      if (existingLog) {
        if (existingLog.newState === overrideState && existingLog.organizationId === organizationId) {
          return {
            idempotent: true,
            organizationId,
            serviceCode: code,
            overrideState,
          };
        } else {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Idempotency key "${idempotencyKey}" was used for a different transition.`,
            code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
          });
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existingOverride = await tx.organizationServiceOverride.findUnique({
        where: {
          organizationId_serviceId: { organizationId, serviceId: service.id },
        },
      });

      const currentSeq = existingOverride ? existingOverride.sequence : 0n;
      const nextSeq = currentSeq + 1n;

      const updatedOverride = await tx.organizationServiceOverride.upsert({
        where: {
          organizationId_serviceId: { organizationId, serviceId: service.id },
        },
        update: {
          overrideState,
          reason: cleanedReason,
          sequence: nextSeq,
          idempotencyKey: idempotencyKey || null,
          updatedByOperatorId: operator.id,
        },
        create: {
          organizationId,
          serviceId: service.id,
          overrideState,
          reason: cleanedReason,
          sequence: nextSeq,
          idempotencyKey: idempotencyKey || null,
          updatedByOperatorId: operator.id,
        },
      });

      await tx.serviceStateTransitionLog.create({
        data: {
          scope: 'ORGANIZATION_OVERRIDE',
          organizationId,
          serviceCode: code,
          previousState: existingOverride?.overrideState || null,
          newState: overrideState,
          reason: cleanedReason,
          sequence: nextSeq,
          idempotencyKey: idempotencyKey || null,
          operatorId: operator.id,
          operatorRole: operator.role,
        },
      });

      return {
        previousState: existingOverride?.overrideState || null,
        record: updatedOverride,
      };
    });

    const responseSeq = result.record.sequence.toString();

    await this.auditLogsService.log({
      action: 'ORGANIZATION_SERVICE_OVERRIDE_SET',
      entityType: 'ORGANIZATION_SERVICE_OVERRIDE',
      entityId: `${organizationId}:${code}`,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
      metadata: {
        organizationId,
        serviceCode: code,
        overrideState,
        reason: cleanedReason,
        sequence: responseSeq,
      },
    });

    const propagation = await this.propagateOrgOverrideToDataPlane({
      organizationId,
      capabilityCode: code,
      overrideState,
      sequence: responseSeq,
      reason: cleanedReason,
      correlationId: correlationId || `corr_${Date.now()}`,
    });

    return {
      idempotent: false,
      organizationId,
      capabilityCode: code,
      overrideState: result.record.overrideState,
      previousState: result.previousState,
      sequence: responseSeq,
      reason: cleanedReason,
      updatedAt: result.record.updatedAt,
      propagation,
    };
  }

  /**
   * Clear Organization Service Override
   */
  async clearOrganizationServiceOverride(
    organizationId: string,
    code: string,
    operator: OperatorContext,
    ipAddress?: string,
    correlationId?: string,
  ) {
    const service = await this.prisma.serviceCatalog.findUnique({
      where: { code },
    });

    if (!service) {
      throw new NotFoundException(`Service capability code [${code}] not found.`);
    }

    const existing = await this.prisma.organizationServiceOverride.findUnique({
      where: {
        organizationId_serviceId: { organizationId, serviceId: service.id },
      },
    });

    if (!existing) {
      return { message: 'No active override existed for this organization and service' };
    }

    await this.prisma.organizationServiceOverride.delete({
      where: {
        organizationId_serviceId: { organizationId, serviceId: service.id },
      },
    });

    await this.auditLogsService.log({
      action: 'ORGANIZATION_SERVICE_OVERRIDE_CLEARED',
      entityType: 'ORGANIZATION_SERVICE_OVERRIDE',
      entityId: `${organizationId}:${code}`,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
      metadata: { organizationId, serviceCode: code },
    });

    const propagation = await this.propagateOrgOverrideToDataPlane({
      organizationId,
      capabilityCode: code,
      overrideState: ServiceStateEnum.AVAILABLE, // Reset to default
      sequence: (existing.sequence + 1n).toString(),
      reason: 'Override cleared by Control Plane operator',
      correlationId: correlationId || `corr_${Date.now()}`,
    });

    return {
      cleared: true,
      organizationId,
      capabilityCode: code,
      propagation,
    };
  }

  /**
   * Propagate Global Service State Signal to Data Plane
   */
  public async propagateGlobalServiceStateToDataPlane(params: {
    capabilityCode: string;
    state: ServiceStateEnum;
    sequence: string;
    reason: string;
    correlationId: string;
  }) {
    const isProduction = process.env.NODE_ENV === 'production';
    const envSecret = process.env.CONTROL_PLANE_M2M_SECRET || process.env.CONTROL_PLANE_PROVISIONING_SECRET;

    if (isProduction && !envSecret) {
      throw new Error('PRODUCTION SECURITY ERROR: CONTROL_PLANE_M2M_SECRET is required in production.');
    }

    const secret = envSecret || 'omnigrc-dev-control-plane-secret-change-in-prod';
    const dataPlaneUrl = process.env.DATA_PLANE_URL || 'http://localhost:3000';
    const endpoint = `${dataPlaneUrl.replace(/\/$/, '')}/v1/control-signals/global-service-state`;

    const signalId = `sig_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const issuer = 'arav-control-plane';

    const canonicalString = `id:${signalId}|capabilityCode:${params.capabilityCode}|state:${params.state}|sequence:${params.sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(canonicalString)
      .digest('hex');

    const payload = {
      id: signalId,
      capabilityCode: params.capabilityCode,
      state: params.state,
      sequence: params.sequence,
      timestamp,
      reason: params.reason,
      correlationId: params.correlationId,
      issuer,
      signature,
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-control-plane-secret': secret,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => null);
      return {
        status: res.ok ? 'DELIVERED' : 'FAILED_PROPAGATION',
        statusCode: res.status,
        dataPlaneResponse: responseData,
      };
    } catch (err: any) {
      this.logger.warn(`Data Plane global service signal error: ${err.message}`);
      return { status: 'FAILED_PROPAGATION', error: err.message };
    }
  }

  /**
   * Propagate Organization Service Override Signal to Data Plane
   */
  public async propagateOrgOverrideToDataPlane(params: {
    organizationId: string;
    capabilityCode: string;
    overrideState: ServiceStateEnum;
    sequence: string;
    reason: string;
    correlationId: string;
  }) {
    const isProduction = process.env.NODE_ENV === 'production';
    const envSecret = process.env.CONTROL_PLANE_M2M_SECRET || process.env.CONTROL_PLANE_PROVISIONING_SECRET;

    if (isProduction && !envSecret) {
      throw new Error('PRODUCTION SECURITY ERROR: CONTROL_PLANE_M2M_SECRET is required in production.');
    }

    const secret = envSecret || 'omnigrc-dev-control-plane-secret-change-in-prod';
    const dataPlaneUrl = process.env.DATA_PLANE_URL || 'http://localhost:3000';
    const endpoint = `${dataPlaneUrl.replace(/\/$/, '')}/v1/control-signals/organization-service-override`;

    const signalId = `sig_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const issuer = 'arav-control-plane';

    const canonicalString = `id:${signalId}|organizationId:${params.organizationId}|capabilityCode:${params.capabilityCode}|overrideState:${params.overrideState}|sequence:${params.sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(canonicalString)
      .digest('hex');

    const payload = {
      id: signalId,
      organizationId: params.organizationId,
      capabilityCode: params.capabilityCode,
      overrideState: params.overrideState,
      sequence: params.sequence,
      timestamp,
      reason: params.reason,
      correlationId: params.correlationId,
      issuer,
      signature,
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-control-plane-secret': secret,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => null);
      return {
        status: res.ok ? 'DELIVERED' : 'FAILED_PROPAGATION',
        statusCode: res.status,
        dataPlaneResponse: responseData,
      };
    } catch (err: any) {
      this.logger.warn(`Data Plane org override signal error: ${err.message}`);
      return { status: 'FAILED_PROPAGATION', error: err.message };
    }
  }
}
