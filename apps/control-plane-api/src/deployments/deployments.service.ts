import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { LicenseSigningService } from '../licenses/license-signing.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  DeploymentModel,
  DeploymentEnvironment,
  ActivationState,
  InfrastructureOwner,
  CreateDeploymentDto,
  UpdateDeploymentStateDto,
  DeploymentCheckInDto,
  DeploymentCheckInResponseDto,
  DeploymentDto,
  ActivateDeploymentDto,
  SignedLicenseArtifactResponseDto,
  SignedLicenseArtifact,
  LicenseStatus,
} from '@omnigrc/shared';

@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly licenseSigningService: LicenseSigningService,
    private readonly audit: ControlPlaneAuditLogsService,
  ) {}

  /**
   * Derive infrastructure owner from deployment model:
   * - MSSP_SHARED → ARAV
   * - PRIVATE_MSSP → ARAV
   * - SELF_HOSTED → CUSTOMER
   */
  private deriveInfrastructureOwner(model: DeploymentModel): InfrastructureOwner {
    switch (model) {
      case DeploymentModel.MSSP_SHARED:
      case DeploymentModel.PRIVATE_MSSP:
        return InfrastructureOwner.ARAV;
      case DeploymentModel.SELF_HOSTED:
        return InfrastructureOwner.CUSTOMER;
      default:
        throw new BadRequestException(`Invalid deployment model: ${model}`);
    }
  }

  /**
   * Register a new Deployment in the Arav Control Plane registry.
   */
  async createDeployment(dto: CreateDeploymentDto): Promise<DeploymentDto> {
    if (!dto.organizationId) {
      throw new BadRequestException('organizationId is required for deployment registration');
    }

    const infrastructureOwner = this.deriveInfrastructureOwner(dto.deploymentModel);
    const rawRegistrationSecret = `secret_${crypto.randomUUID()}`;
    const registrationSecretHash = await bcrypt.hash(rawRegistrationSecret, 10);

    const deployment = await this.prisma.deployment.create({
      data: {
        organizationId: dto.organizationId,
        customerId: dto.customerId || null,
        commercialAgreementId: dto.commercialAgreementId || null,
        deploymentModel: dto.deploymentModel as any,
        environment: (dto.environment as any) || DeploymentEnvironment.PRODUCTION,
        version: dto.version || '1.0.0',
        activationState: ActivationState.PENDING as any,
        infrastructureOwner: infrastructureOwner as any,
        registrationSecretHash,
      },
    });

    return {
      id: deployment.id,
      organizationId: deployment.organizationId,
      customerId: deployment.customerId,
      commercialAgreementId: deployment.commercialAgreementId,
      deploymentModel: deployment.deploymentModel as DeploymentModel,
      environment: deployment.environment as DeploymentEnvironment,
      version: deployment.version,
      activationState: deployment.activationState as ActivationState,
      infrastructureOwner: deployment.infrastructureOwner as InfrastructureOwner,
      licenseId: deployment.licenseId,
      lastCheckInAt: deployment.lastCheckInAt ? deployment.lastCheckInAt.toISOString() : null,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
      registrationSecret: rawRegistrationSecret, // Returned ONLY once upon creation
    };
  }

  /**
   * List registered deployments with optional filtering.
   */
  async findAll(query?: {
    organizationId?: string;
    deploymentModel?: DeploymentModel;
    activationState?: ActivationState;
  }): Promise<DeploymentDto[]> {
    const where: any = {};
    if (query?.organizationId) where.organizationId = query.organizationId;
    if (query?.deploymentModel) where.deploymentModel = query.deploymentModel;
    if (query?.activationState) where.activationState = query.activationState;

    const deployments = await this.prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return deployments.map((d) => ({
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
    }));
  }

  /**
   * Fetch single deployment details by ID.
   */
  async findOne(id: string): Promise<DeploymentDto> {
    const d = await this.prisma.deployment.findUnique({
      where: { id },
    });

    if (!d) {
      throw new NotFoundException(`Deployment with ID "${id}" not found.`);
    }

    return {
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
    };
  }

  /**
   * Activate a deployment: Validates deployment identity, secret, and associated license (TRIAL or ACTIVE),
   * signs the deployment-bound license artifact FIRST, and commits activationState = ACTIVE in a DB transaction.
   */
  async activate(
    id: string,
    dto: ActivateDeploymentDto,
  ): Promise<SignedLicenseArtifactResponseDto> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        license: {
          include: { entitlements: true },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID "${id}" not found.`);
    }

    if (deployment.activationState === (ActivationState.DECOMMISSIONED as any)) {
      throw new BadRequestException('Cannot activate a decommissioned deployment.');
    }

    if (!dto.registrationSecret) {
      throw new BadRequestException('registrationSecret is required for activation');
    }

    const isValidSecret = await bcrypt.compare(
      dto.registrationSecret,
      deployment.registrationSecretHash,
    );

    if (!isValidSecret) {
      throw new UnauthorizedException('Invalid deployment registration secret');
    }

    if (!deployment.license) {
      throw new BadRequestException(`Deployment "${id}" has no associated license.`);
    }

    const license = deployment.license;

    // TRIAL and ACTIVE are both eligible for activation! EXPIRED is not.
    if (
      license.status !== (LicenseStatus.TRIAL as any) &&
      license.status !== (LicenseStatus.ACTIVE as any)
    ) {
      throw new BadRequestException(`Associated license status is ${license.status}, expected TRIAL or ACTIVE.`);
    }

    const now = new Date();
    if (now.getTime() < license.startsAt.getTime() || now.getTime() >= license.expiresAt.getTime()) {
      throw new BadRequestException('Associated license is expired or not yet within valid date range.');
    }

    const nowActivationDate = deployment.lastActivatedAt || new Date();

    // Step 5: Perform signing FIRST before committing DB state!
    const artifact = this.licenseSigningService.signLicenseArtifact({
      license: {
        id: license.id,
        product: license.product,
        status: license.status,
        customerId: deployment.customerId,
        commercialAgreementId: license.commercialAgreementId,
        startsAt: license.startsAt,
        expiresAt: license.expiresAt,
        maxDeployments: license.maxDeployments,
      },
      deployment: {
        id: deployment.id,
        organizationId: deployment.organizationId,
        customerId: deployment.customerId,
        lastActivatedAt: nowActivationDate,
        createdAt: deployment.createdAt,
      },
      entitlements: license.entitlements,
    });

    // Step 6: Commit activation state change in DB transaction ONLY AFTER signing succeeded
    await this.prisma.$transaction(async (tx) => {
      await tx.deployment.update({
        where: { id },
        data: {
          activationState: ActivationState.ACTIVE as any,
          lastActivatedAt: nowActivationDate,
        },
      });

      await tx.controlPlaneAuditLog.create({
        data: {
          action: 'DEPLOYMENT_ACTIVATED',
          entityType: 'Deployment',
          entityId: id,
          metadata: {
            licenseId: license.id,
            status: license.status,
            keyId: artifact.keyId,
          },
        },
      });
    });

    return {
      success: true,
      deploymentId: deployment.id,
      activationState: ActivationState.ACTIVE,
      artifact,
    };
  }

  /**
   * Fetch the active signed license artifact for a deployment (Admin only).
   */
  async getLicenseArtifact(id: string): Promise<SignedLicenseArtifactResponseDto> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        license: {
          include: { entitlements: true },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID "${id}" not found.`);
    }

    if (!deployment.license) {
      throw new BadRequestException(`Deployment "${id}" has no associated license.`);
    }

    const license = deployment.license;

    const artifact = this.licenseSigningService.signLicenseArtifact({
      license: {
        id: license.id,
        product: license.product,
        status: license.status,
        customerId: deployment.customerId,
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
      entitlements: license.entitlements,
    });

    return {
      success: true,
      deploymentId: deployment.id,
      activationState: deployment.activationState as ActivationState,
      artifact,
    };
  }

  /**
   * Narrow Check-In API: Record heartbeat check-in & version update with secret verification,
   * returning optional refreshed signed license artifact if deployment is ACTIVE.
   */
  async checkIn(id: string, dto: DeploymentCheckInDto): Promise<DeploymentCheckInResponseDto> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        license: {
          include: { entitlements: true },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID "${id}" not found.`);
    }

    if (!dto.registrationSecret) {
      throw new BadRequestException('registrationSecret is required for check-in');
    }

    const isValidSecret = await bcrypt.compare(
      dto.registrationSecret,
      deployment.registrationSecretHash,
    );

    if (!isValidSecret) {
      throw new UnauthorizedException('Invalid deployment registration secret');
    }

    const updated = await this.prisma.deployment.update({
      where: { id },
      data: {
        lastCheckInAt: new Date(),
        version: dto.version || deployment.version,
      },
    });

    let artifact: SignedLicenseArtifact | undefined = undefined;

    // Issue refreshed artifact during check-in if deployment is active and associated license is valid
    if (
      updated.activationState === (ActivationState.ACTIVE as any) &&
      deployment.license &&
      (deployment.license.status === (LicenseStatus.TRIAL as any) ||
        deployment.license.status === (LicenseStatus.ACTIVE as any))
    ) {
      const now = new Date();
      if (
        now.getTime() >= deployment.license.startsAt.getTime() &&
        now.getTime() < deployment.license.expiresAt.getTime()
      ) {
        artifact = this.licenseSigningService.signLicenseArtifact({
          license: {
            id: deployment.license.id,
            product: deployment.license.product,
            status: deployment.license.status,
            customerId: deployment.customerId,
            commercialAgreementId: deployment.license.commercialAgreementId,
            startsAt: deployment.license.startsAt,
            expiresAt: deployment.license.expiresAt,
            maxDeployments: deployment.license.maxDeployments,
          },
          deployment: {
            id: deployment.id,
            organizationId: deployment.organizationId,
            customerId: deployment.customerId,
            lastActivatedAt: deployment.lastActivatedAt,
            createdAt: deployment.createdAt,
          },
          entitlements: deployment.license.entitlements,
        });
      }
    }

    return {
      success: true,
      deploymentId: updated.id,
      lastCheckInAt: updated.lastCheckInAt.toISOString(),
      version: updated.version,
      activationState: updated.activationState as ActivationState,
      artifact,
    };
  }

  /**
   * Update activation state representation (PENDING, ACTIVE, SUSPENDED, DECOMMISSIONED).
   */
  async updateState(id: string, dto: UpdateDeploymentStateDto): Promise<DeploymentDto> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment with ID "${id}" not found.`);
    }

    const updated = await this.prisma.deployment.update({
      where: { id },
      data: {
        activationState: dto.activationState as any,
      },
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
