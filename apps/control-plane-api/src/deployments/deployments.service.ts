import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
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
} from '@omnigrc/shared';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: ControlPlanePrismaService) {}

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
   * Narrow Check-In API: Record heartbeat check-in & version update with secret verification.
   */
  async checkIn(id: string, dto: DeploymentCheckInDto): Promise<DeploymentCheckInResponseDto> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
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

    return {
      success: true,
      deploymentId: updated.id,
      lastCheckInAt: updated.lastCheckInAt.toISOString(),
      version: updated.version,
      activationState: updated.activationState as ActivationState,
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
