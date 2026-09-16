import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import {
  LicenseDto,
  CreateLicenseDto,
  LicenseProduct,
  LicenseStatus,
  DeploymentDto,
  DeploymentModel,
  DeploymentEnvironment,
  ActivationState,
  InfrastructureOwner,
} from '@omnigrc/shared';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly audit: ControlPlaneAuditLogsService,
  ) {}

  /**
   * Calculate effective runtime status without mutating stored DB state.
   */
  public getEffectiveStatus(l: { status: any; expiresAt: Date }, now = new Date()): LicenseStatus {
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

    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        commercialAgreement: true,
      },
    });

    if (!license) {
      throw new NotFoundException(`License with ID "${licenseId}" not found.`);
    }

    const deployment = await this.prisma.deployment.findUnique({
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
      const currentCount = await this.prisma.deployment.count({
        where: { licenseId: license.id },
      });

      if (currentCount >= license.maxDeployments) {
        throw new BadRequestException(
          `License maxDeployments allowance (${license.maxDeployments}) reached for license ${license.id}`,
        );
      }
    }

    const updated = await this.prisma.deployment.update({
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
  }
}
