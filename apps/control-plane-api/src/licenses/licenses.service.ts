import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { LicenseSigningService } from './license-signing.service';
import {
  LicenseDto,
  CreateLicenseDto,
  UpdateLicenseDto,
  GrantEntitlementDto,
  LicenseProduct,
  LicenseStatus,
  DeploymentDto,
  DeploymentModel,
  DeploymentEnvironment,
  ActivationState,
  InfrastructureOwner,
  SignedLicenseArtifact,
} from '@omnigrc/shared';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly audit: ControlPlaneAuditLogsService,
    private readonly licenseSigningService: LicenseSigningService,
  ) {}

  /**
   * Calculate effective runtime status without mutating stored DB state.
   */
  public getEffectiveStatus(l: { status: any; expiresAt: Date }, now = new Date()): LicenseStatus {
    if (l.status === LicenseStatus.REVOKED || (l.status as any) === 'REVOKED') {
      return LicenseStatus.REVOKED;
    }
    if (l.status === LicenseStatus.SUSPENDED || (l.status as any) === 'SUSPENDED') {
      return LicenseStatus.SUSPENDED;
    }
    if (l.status === LicenseStatus.EXPIRED || now.getTime() > l.expiresAt.getTime()) {
      return LicenseStatus.EXPIRED;
    }
    return l.status as LicenseStatus;
  }


  /**
   * Create a new commercial/technical License authoritative in the Control Plane DB.
   */
  async createLicense(dto: CreateLicenseDto): Promise<LicenseDto> {
    if (!dto.commercialAgreementId) {
      throw new BadRequestException('commercialAgreementId is required for license creation');
    }

    const agreement = await this.prisma.commercialAgreement.findUnique({
      where: { id: dto.commercialAgreementId },
    });

    if (!agreement) {
      throw new NotFoundException(
        `CommercialAgreement with ID "${dto.commercialAgreementId}" not found.`,
      );
    }

    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);

    if (isNaN(startsAt.getTime()) || isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Invalid startsAt or expiresAt date format');
    }

    if (expiresAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }

    const maxDeployments = dto.maxDeployments ?? 1;
    if (typeof maxDeployments !== 'number' || maxDeployments < 1) {
      throw new BadRequestException('maxDeployments must be a positive integer >= 1');
    }

    const license = await this.prisma.license.create({
      data: {
        commercialAgreementId: dto.commercialAgreementId,
        product: (dto.product as any) || LicenseProduct.OMNIGRC,
        status: (dto.status as any) || LicenseStatus.TRIAL,
        startsAt,
        expiresAt,
        maxDeployments,
      },
      include: {
        entitlements: true,
      },
    });

    await this.audit.log('LICENSE_CREATED', 'License', license.id, {
      commercialAgreementId: license.commercialAgreementId,
      status: license.status,
      maxDeployments: license.maxDeployments,
    });

    return {
      id: license.id,
      commercialAgreementId: license.commercialAgreementId,
      product: license.product as LicenseProduct,
      status: this.getEffectiveStatus(license),
      issuedAt: license.issuedAt.toISOString(),
      startsAt: license.startsAt.toISOString(),
      expiresAt: license.expiresAt.toISOString(),
      maxDeployments: license.maxDeployments,
      createdAt: license.createdAt.toISOString(),
      updatedAt: license.updatedAt.toISOString(),
      entitlements: license.entitlements.map((e) => ({
        id: e.id,
        licenseId: e.licenseId,
        code: e.code,
        name: e.name,
        value: e.value,
        enabled: e.enabled,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      deploymentsCount: 0,
    };
  }

  /**
   * List all licenses with optional filtering.
   */
  async findAll(query?: {
    commercialAgreementId?: string;
    status?: LicenseStatus;
  }): Promise<LicenseDto[]> {
    const where: any = {};
    if (query?.commercialAgreementId) where.commercialAgreementId = query.commercialAgreementId;
    if (query?.status) where.status = query.status;

    const licenses = await this.prisma.license.findMany({
      where,
      include: {
        entitlements: true,
        _count: { select: { deployments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return licenses.map((l) => ({
      id: l.id,
      commercialAgreementId: l.commercialAgreementId,
      product: l.product as LicenseProduct,
      status: this.getEffectiveStatus(l),
      issuedAt: l.issuedAt.toISOString(),
      startsAt: l.startsAt.toISOString(),
      expiresAt: l.expiresAt.toISOString(),
      maxDeployments: l.maxDeployments,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      entitlements: l.entitlements.map((e) => ({
        id: e.id,
        licenseId: e.licenseId,
        code: e.code,
        name: e.name,
        value: e.value,
        enabled: e.enabled,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      deploymentsCount: l._count.deployments,
    }));
  }

  /**
   * Find single license details by ID with entitlements & associated deployments.
   */
  async findOne(id: string): Promise<LicenseDto> {
    const l = await this.prisma.license.findUnique({
      where: { id },
      include: {
        entitlements: true,
        deployments: true,
      },
    });

    if (!l) {
      throw new NotFoundException(`License with ID "${id}" not found.`);
    }

    return {
      id: l.id,
      commercialAgreementId: l.commercialAgreementId,
      product: l.product as LicenseProduct,
      status: this.getEffectiveStatus(l),
      issuedAt: l.issuedAt.toISOString(),
      startsAt: l.startsAt.toISOString(),
      expiresAt: l.expiresAt.toISOString(),
      maxDeployments: l.maxDeployments,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      entitlements: l.entitlements.map((e) => ({
        id: e.id,
        licenseId: e.licenseId,
        code: e.code,
        name: e.name,
        value: e.value,
        enabled: e.enabled,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      deployments: l.deployments.map((d) => ({
        id: d.id,
        organizationId: d.organizationId,
        customerId: d.customerId,
        commercialAgreementId: d.commercialAgreementId,
        deploymentModel: d.deploymentModel as DeploymentModel,
        environment: d.environment as DeploymentEnvironment,
        version: d.version,
        activationState: d.activationState as ActivationState,
        infrastructureOwner: d.infrastructureOwner as InfrastructureOwner,
        licenseId: d.licenseId,
        lastCheckInAt: d.lastCheckInAt ? d.lastCheckInAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      deploymentsCount: l.deployments.length,
    };
  }


  /**
   * Associate a Deployment with a valid License in the Control Plane registry.
   */
  async associateDeployment(licenseId: string, deploymentId: string): Promise<DeploymentDto> {
    if (!licenseId || !deploymentId) {
      throw new BadRequestException('licenseId and deploymentId are required');
    }

    return this.prisma.$transaction(async (tx) => {
      const license = await tx.license.findUnique({
        where: { id: licenseId },
        include: {
          commercialAgreement: true,
        },
      });

      if (!license) {
        throw new NotFoundException(`License with ID "${licenseId}" not found.`);
      }

      const deployment = await tx.deployment.findUnique({
        where: { id: deploymentId },
      });

      if (!deployment) {
        throw new NotFoundException(`Deployment with ID "${deploymentId}" not found.`);
      }

      // Cross-Customer / Scope Alignment Check
      if (deployment.customerId && deployment.customerId !== license.commercialAgreement.customerId) {
        throw new BadRequestException(
          `Deployment customer (${deployment.customerId}) does not match license customer (${license.commercialAgreement.customerId})`,
        );
      }

      if (
        deployment.commercialAgreementId &&
        deployment.commercialAgreementId !== license.commercialAgreementId
      ) {
        throw new BadRequestException(
          `Deployment commercial agreement (${deployment.commercialAgreementId}) does not match license commercial agreement (${license.commercialAgreementId})`,
        );
      }

      // Check maxDeployments allowance cap (if not already associated with this license)
      if (deployment.licenseId !== license.id) {
        const currentCount = await tx.deployment.count({
          where: { licenseId: license.id },
        });

        if (currentCount >= license.maxDeployments) {
          throw new BadRequestException(
            `License maxDeployments allowance (${license.maxDeployments}) reached for license ${license.id}`,
          );
        }
      }

      const updated = await tx.deployment.update({
        where: { id: deploymentId },
        data: {
          licenseId: license.id,
          customerId: deployment.customerId || license.commercialAgreement.customerId,
          commercialAgreementId: deployment.commercialAgreementId || license.commercialAgreementId,
        },
      });

      await this.audit.log('DEPLOYMENT_LICENSE_ASSOCIATED', 'Deployment', updated.id, {
        licenseId: license.id,
        organizationId: updated.organizationId,
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        customerId: updated.customerId,
        commercialAgreementId: updated.commercialAgreementId,
        deploymentModel: updated.deploymentModel as DeploymentModel,
        environment: updated.environment as DeploymentEnvironment,
        version: updated.version,
        activationState: updated.activationState as ActivationState,
        infrastructureOwner: updated.infrastructureOwner as InfrastructureOwner,
        licenseId: updated.licenseId,
        lastCheckInAt: updated.lastCheckInAt ? updated.lastCheckInAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Update permissible commercial license metadata.
   */
  async updateLicense(id: string, dto: UpdateLicenseDto): Promise<LicenseDto> {
    const existing = await this.prisma.license.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`License with ID "${id}" not found.`);
    }

    const dataToUpdate: any = {
      sequence: { increment: 1 },
    };

    if (dto.startsAt) {
      const startsAt = new Date(dto.startsAt);
      if (isNaN(startsAt.getTime())) throw new BadRequestException('Invalid startsAt date format');
      dataToUpdate.startsAt = startsAt;
    }

    if (dto.expiresAt) {
      const expiresAt = new Date(dto.expiresAt);
      if (isNaN(expiresAt.getTime())) throw new BadRequestException('Invalid expiresAt date format');
      dataToUpdate.expiresAt = expiresAt;
    }

    if (dto.maxDeployments != null) {
      if (typeof dto.maxDeployments !== 'number' || dto.maxDeployments < 1) {
        throw new BadRequestException('maxDeployments must be a positive integer >= 1');
      }
      dataToUpdate.maxDeployments = dto.maxDeployments;
    }

    const updated = await this.prisma.license.update({
      where: { id },
      data: dataToUpdate,
    });

    await this.audit.log('LICENSE_UPDATED', 'License', updated.id, {
      reason: dto.reason || 'Commercial metadata updated',
      sequence: Number(updated.sequence),
    });

    return this.findOne(updated.id);
  }

  /**
   * Suspend a commercial license.
   */
  async suspendLicense(id: string, reason?: string): Promise<LicenseDto> {
    const existing = await this.prisma.license.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`License with ID "${id}" not found.`);

    const updated = await this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.SUSPENDED as any,
        sequence: { increment: 1 },
      },
    });

    await this.audit.log('LICENSE_SUSPENDED', 'License', updated.id, {
      reason: reason || 'Commercial license suspended by operator',
      sequence: Number(updated.sequence),
    });

    return this.findOne(updated.id);
  }

  /**
   * Reactivate a suspended license.
   */
  async reactivateLicense(id: string, reason?: string): Promise<LicenseDto> {
    const existing = await this.prisma.license.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`License with ID "${id}" not found.`);

    if (existing.status === (LicenseStatus.REVOKED as any)) {
      throw new BadRequestException('Cannot reactivate a REVOKED license. Revocation is a terminal state.');
    }

    if (new Date().getTime() > existing.expiresAt.getTime()) {
      throw new BadRequestException('Cannot reactivate an expired license. Update expiresAt first.');
    }

    const updated = await this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVE as any,
        sequence: { increment: 1 },
      },
    });

    await this.audit.log('LICENSE_REACTIVATED', 'License', updated.id, {
      reason: reason || 'Commercial license reactivated by operator',
      sequence: Number(updated.sequence),
    });

    return this.findOne(updated.id);
  }

  /**
   * Revoke a commercial license (Terminal state).
   */
  async revokeLicense(id: string, reason?: string): Promise<LicenseDto> {
    const existing = await this.prisma.license.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`License with ID "${id}" not found.`);

    const updated = await this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.REVOKED as any,
        sequence: { increment: 1 },
      },
    });

    await this.audit.log('LICENSE_REVOKED', 'License', updated.id, {
      reason: reason || 'Commercial license revoked by operator',
      sequence: Number(updated.sequence),
    });

    return this.findOne(updated.id);
  }

  /**
   * Disassociate a Deployment from a License.
   */
  async disassociateDeployment(licenseId: string, deploymentId: string): Promise<DeploymentDto> {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, licenseId },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment "${deploymentId}" is not associated with License "${licenseId}".`);
    }

    const updated = await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: { licenseId: null },
    });

    await this.audit.log('DEPLOYMENT_LICENSE_DISASSOCIATED', 'Deployment', updated.id, {
      licenseId,
      organizationId: updated.organizationId,
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      customerId: updated.customerId,
      commercialAgreementId: updated.commercialAgreementId,
      deploymentModel: updated.deploymentModel as DeploymentModel,
      environment: updated.environment as DeploymentEnvironment,
      version: updated.version,
      activationState: updated.activationState as ActivationState,
      infrastructureOwner: updated.infrastructureOwner as InfrastructureOwner,
      licenseId: updated.licenseId,
      lastCheckInAt: updated.lastCheckInAt ? updated.lastCheckInAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Issue signed Ed25519 license artifact for an associated deployment.
   */
  async getSignedArtifactForLicense(licenseId: string, targetDeploymentId?: string): Promise<SignedLicenseArtifact> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        entitlements: true,
        commercialAgreement: true,
        deployments: true,
      },
    });

    if (!license) throw new NotFoundException(`License with ID "${licenseId}" not found.`);

    let deployment = targetDeploymentId
      ? license.deployments.find((d) => d.id === targetDeploymentId)
      : license.deployments[0];

    if (!deployment && targetDeploymentId) {
      deployment = await this.prisma.deployment.findUnique({ where: { id: targetDeploymentId } });
    }

    if (!deployment) {
      throw new BadRequestException(`No active deployment associated with License "${licenseId}". Associate a deployment first.`);
    }

    const artifact = this.licenseSigningService.signLicenseArtifact({
      license: {
        id: license.id,
        product: license.product,
        status: this.getEffectiveStatus(license),
        sequence: Number(license.sequence),
        customerId: license.commercialAgreement.customerId,
        commercialAgreementId: license.commercialAgreementId,
        startsAt: license.startsAt,
        expiresAt: license.expiresAt,
        maxDeployments: license.maxDeployments,
      },
      deployment: {
        id: deployment.id,
        organizationId: deployment.organizationId,
        customerId: deployment.customerId,
        lastActivatedAt: deployment.lastActivatedAt,
        createdAt: deployment.createdAt,
      },
      entitlements: license.entitlements.map((e) => ({
        code: e.code,
        name: e.name,
        enabled: e.enabled,
        value: e.value,
      })),
    });

    await this.audit.log('ARTIFACT_ISSUED', 'License', license.id, {
      deploymentId: deployment.id,
      organizationId: deployment.organizationId,
      sequence: Number(license.sequence),
    });

    return artifact;
  }

  /**
   * Grant or update a framework or feature entitlement for a license.
   */
  async grantOrUpdateEntitlement(licenseId: string, dto: GrantEntitlementDto) {
    if (!dto.code || !dto.name) {
      throw new BadRequestException('code and name are required for entitlement');
    }

    return this.prisma.$transaction(async (tx) => {
      const license = await tx.license.findUnique({ where: { id: licenseId } });
      if (!license) throw new NotFoundException(`License with ID "${licenseId}" not found.`);

      const existing = await tx.entitlement.findFirst({
        where: { licenseId, code: dto.code },
      });

      let entitlement;
      let action: string;

      if (existing) {
        const wasEnabled = existing.enabled;
        const isEnabled = dto.enabled !== undefined ? dto.enabled : true;

        entitlement = await tx.entitlement.update({
          where: { id: existing.id },
          data: {
            name: dto.name,
            enabled: isEnabled,
            value: dto.value !== undefined ? dto.value : existing.value,
          },
        });

        if (wasEnabled && !isEnabled) {
          action = 'ENTITLEMENT_SUSPENDED';
        } else if (!wasEnabled && isEnabled) {
          action = 'ENTITLEMENT_REACTIVATED';
        } else {
          action = 'ENTITLEMENT_UPDATED';
        }
      } else {
        const isEnabled = dto.enabled !== undefined ? dto.enabled : true;
        entitlement = await tx.entitlement.create({
          data: {
            licenseId,
            code: dto.code,
            name: dto.name,
            enabled: isEnabled,
            value: dto.value !== undefined ? dto.value : null,
          },
        });
        action = 'ENTITLEMENT_CREATED';
      }

      // Increment license sequence atomically on entitlement state change
      await tx.license.update({
        where: { id: licenseId },
        data: { sequence: { increment: 1 } },
      });

      await this.audit.log(action, 'Entitlement', entitlement.id, {
        licenseId,
        code: entitlement.code,
        enabled: entitlement.enabled,
      });

      return entitlement;
    });
  }

  /**
   * Suspend an entitlement for a license (set enabled: false).
   */
  async suspendEntitlement(licenseId: string, entitlementCode: string) {
    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.entitlement.findFirst({
        where: { licenseId, code: entitlementCode },
      });

      if (!entitlement) {
        throw new NotFoundException(`Entitlement "${entitlementCode}" not found on license "${licenseId}".`);
      }

      const updated = await tx.entitlement.update({
        where: { id: entitlement.id },
        data: { enabled: false },
      });

      await tx.license.update({
        where: { id: licenseId },
        data: { sequence: { increment: 1 } },
      });

      await this.audit.log('ENTITLEMENT_SUSPENDED', 'Entitlement', updated.id, {
        licenseId,
        code: updated.code,
      });

      return updated;
    });
  }

  /**
   * Reactivate a suspended entitlement for a license (set enabled: true).
   */
  async reactivateEntitlement(licenseId: string, entitlementCode: string) {
    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.entitlement.findFirst({
        where: { licenseId, code: entitlementCode },
      });

      if (!entitlement) {
        throw new NotFoundException(`Entitlement "${entitlementCode}" not found on license "${licenseId}".`);
      }

      const updated = await tx.entitlement.update({
        where: { id: entitlement.id },
        data: { enabled: true },
      });

      await tx.license.update({
        where: { id: licenseId },
        data: { sequence: { increment: 1 } },
      });

      await this.audit.log('ENTITLEMENT_REACTIVATED', 'Entitlement', updated.id, {
        licenseId,
        code: updated.code,
      });

      return updated;
    });
  }

  /**
   * Revoke an entitlement for a license (set enabled: false).
   */
  async revokeEntitlement(licenseId: string, entitlementCode: string) {
    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.entitlement.findFirst({
        where: { licenseId, code: entitlementCode },
      });

      if (!entitlement) {
        throw new NotFoundException(`Entitlement "${entitlementCode}" not found on license "${licenseId}".`);
      }

      const updated = await tx.entitlement.update({
        where: { id: entitlement.id },
        data: { enabled: false },
      });

      await tx.license.update({
        where: { id: licenseId },
        data: { sequence: { increment: 1 } },
      });

      await this.audit.log('ENTITLEMENT_REVOKED', 'Entitlement', updated.id, {
        licenseId,
        code: updated.code,
      });

      return updated;
    });
  }
}
