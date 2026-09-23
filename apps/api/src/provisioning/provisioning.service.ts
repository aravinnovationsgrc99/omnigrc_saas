import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';
import {
  SaasProvisioningDto,
  ControlPlaneProvisioningDto,
  ProvisioningResultDto,
  Role,
  PodRegion,
  PodStatus,
  DeploymentModel,
} from '@omnigrc/shared';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  /**
   * Authoritative SaaS Organization & Deployment Provisioning
   * Triggered by Control Plane M2M post-payment event.
   * Idempotent: Repeated events with same controlPlaneDeploymentId or subscriptionId return existing records.
   */
  async provisionSaasOrganization(dto: SaasProvisioningDto): Promise<ProvisioningResultDto> {
    if (!dto.controlPlaneDeploymentId || dto.controlPlaneDeploymentId.trim() === '') {
      throw new BadRequestException('controlPlaneDeploymentId is required as the canonical deployment identity.');
    }
    if (!dto.customerEmail || dto.customerEmail.trim() === '') {
      throw new BadRequestException('customerEmail is required.');
    }

    const canonicalDeploymentId = dto.controlPlaneDeploymentId.trim();
    const subRefId = dto.subscriptionId ? dto.subscriptionId.trim() : null;

    // 1. Idempotency Lookup: Check if deployment projection already exists
    const existingDeployment = await this.prisma.deployment.findFirst({
      where: {
        OR: [
          { controlPlaneDeploymentId: canonicalDeploymentId },
          ...(subRefId ? [{ externalRefId: subRefId }] : []),
        ],
      },
      include: {
        organization: {
          include: { users: { where: { role: Role.ADMIN }, take: 1 } },
        },
      },
    });

    if (existingDeployment) {
      this.logger.log(`Idempotent SaaS provisioning: Deployment "${canonicalDeploymentId}" already exists.`);
      const org = existingDeployment.organization;
      const adminUser = org.users[0];

      // Re-verify and save signed artifact if provided on repeated webhook
      if (dto.signedLicenseArtifact) {
        await this.licenseVerificationService.saveVerifiedStateForOrganization(
          org.id,
          canonicalDeploymentId,
          dto.signedLicenseArtifact,
        );
      }

      const evalState = await this.licenseVerificationService.getEvaluatedStateForOrganization(org.id);

      return {
        success: true,
        isExisting: true,
        organizationId: org.id,
        deploymentId: existingDeployment.id,
        controlPlaneDeploymentId: canonicalDeploymentId,
        adminUserId: adminUser?.id || '',
        adminEmail: adminUser?.email || dto.customerEmail,
        licenseState: evalState.state,
      };
    }

    // 2. Prevent duplicate user email across organizations if user exists
    const targetEmail = dto.customerEmail.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (existingUser) {
      throw new ConflictException(`User with email "${targetEmail}" is already registered to another organization.`);
    }

    const rawPassword = dto.adminInitialPassword || 'OmniGRC@Admin2026!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const adminName = dto.customerName || targetEmail.split('@')[0];

    // 3. Atomic Provisioning Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          primaryRegion: dto.primaryRegion || 'India',
          users: {
            create: {
              name: adminName,
              email: targetEmail,
              passwordHash,
              role: Role.ADMIN,
              passwordSetupRequired: false,
            },
          },
          regionalPods: {
            create: [
              { region: PodRegion.INDIA, status: PodStatus.ACTIVE },
              { region: PodRegion.UK, status: PodStatus.INACTIVE },
              { region: PodRegion.EU, status: PodStatus.INACTIVE },
              { region: PodRegion.AUSTRALIA, status: PodStatus.INACTIVE },
            ],
          },
        },
        include: { users: true },
      });

      const deployment = await tx.deployment.create({
        data: {
          organizationId: organization.id,
          controlPlaneDeploymentId: canonicalDeploymentId,
          externalRefId: subRefId,
          modelType: DeploymentModel.SAAS_MULTI_TENANT,
          status: 'ACTIVE',
        },
      });

      return { organization, deployment, user: organization.users[0] };
    });

    const { organization, deployment, user } = result;

    // 4. Save and verify Control Plane signed license artifact if provided
    if (dto.signedLicenseArtifact) {
      await this.licenseVerificationService.saveVerifiedStateForOrganization(
        organization.id,
        canonicalDeploymentId,
        dto.signedLicenseArtifact,
      );
    }

    await this.auditLogsService.log({
      organizationId: organization.id,
      actorId: user.id,
      action: 'ORGANIZATION_PROVISIONED_SAAS',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: {
        controlPlaneDeploymentId: canonicalDeploymentId,
        subscriptionId: subRefId,
        adminEmail: user.email,
      },
    });

    const evalState = await this.licenseVerificationService.getEvaluatedStateForOrganization(organization.id);

    return {
      success: true,
      isExisting: false,
      organizationId: organization.id,
      deploymentId: deployment.id,
      controlPlaneDeploymentId: canonicalDeploymentId,
      adminUserId: user.id,
      adminEmail: user.email,
      licenseState: evalState.state,
    };
  }

  /**
   * Authoritative Control Plane Provisioning (Private MSSP / Self-Hosted)
   */
  async provisionControlPlaneDeployment(dto: ControlPlaneProvisioningDto): Promise<ProvisioningResultDto> {
    if (!dto.controlPlaneDeploymentId || dto.controlPlaneDeploymentId.trim() === '') {
      throw new BadRequestException('controlPlaneDeploymentId is required.');
    }
    if (!dto.adminEmail || dto.adminEmail.trim() === '') {
      throw new BadRequestException('adminEmail is required.');
    }

    const canonicalDeploymentId = dto.controlPlaneDeploymentId.trim();

    // Idempotency check
    const existingDeployment = await this.prisma.deployment.findUnique({
      where: { controlPlaneDeploymentId: canonicalDeploymentId },
      include: { organization: { include: { users: { take: 1 } } } },
    });

    if (existingDeployment) {
      const org = existingDeployment.organization;
      const adminUser = org.users[0];

      if (dto.signedLicenseArtifact) {
        await this.licenseVerificationService.saveVerifiedStateForOrganization(
          org.id,
          canonicalDeploymentId,
          dto.signedLicenseArtifact,
        );
      }

      const evalState = await this.licenseVerificationService.getEvaluatedStateForOrganization(org.id);

      return {
        success: true,
        isExisting: true,
        organizationId: org.id,
        deploymentId: existingDeployment.id,
        controlPlaneDeploymentId: canonicalDeploymentId,
        adminUserId: adminUser?.id || '',
        adminEmail: adminUser?.email || dto.adminEmail,
        licenseState: evalState.state,
      };
    }

    const targetEmail = dto.adminEmail.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({ where: { email: targetEmail } });
    if (existingUser) {
      throw new ConflictException(`User with email "${targetEmail}" is already registered.`);
    }

    const rawPassword = dto.adminInitialPassword || 'OmniGRC@Admin2026!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const adminName = dto.adminName || targetEmail.split('@')[0];

    const modelType = dto.deploymentModel || DeploymentModel.PRIVATE_MSSP;

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          primaryRegion: dto.primaryRegion || 'India',
          parentOrganizationId: dto.parentOrganizationId || null,
          users: {
            create: {
              name: adminName,
              email: targetEmail,
              passwordHash,
              role: modelType === DeploymentModel.MSSP_SHARED ? Role.MSSP_ADMIN : Role.ADMIN,
              passwordSetupRequired: false,
            },
          },
          regionalPods: {
            create: [
              { region: PodRegion.INDIA, status: PodStatus.ACTIVE },
              { region: PodRegion.UK, status: PodStatus.INACTIVE },
              { region: PodRegion.EU, status: PodStatus.INACTIVE },
              { region: PodRegion.AUSTRALIA, status: PodStatus.INACTIVE },
            ],
          },
        },
        include: { users: true },
      });

      const deployment = await tx.deployment.create({
        data: {
          organizationId: organization.id,
          controlPlaneDeploymentId: canonicalDeploymentId,
          modelType,
          status: 'ACTIVE',
        },
      });

      return { organization, deployment, user: organization.users[0] };
    });

    const { organization, deployment, user } = result;

    if (dto.signedLicenseArtifact) {
      await this.licenseVerificationService.saveVerifiedStateForOrganization(
        organization.id,
        canonicalDeploymentId,
        dto.signedLicenseArtifact,
      );
    }

    await this.auditLogsService.log({
      organizationId: organization.id,
      actorId: user.id,
      action: 'ORGANIZATION_PROVISIONED_CONTROL_PLANE',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: {
        controlPlaneDeploymentId: canonicalDeploymentId,
        deploymentModel: modelType,
        adminEmail: user.email,
      },
    });

    const evalState = await this.licenseVerificationService.getEvaluatedStateForOrganization(organization.id);

    return {
      success: true,
      isExisting: false,
      organizationId: organization.id,
      deploymentId: deployment.id,
      controlPlaneDeploymentId: canonicalDeploymentId,
      adminUserId: user.id,
      adminEmail: user.email,
      licenseState: evalState.state,
    };
  }
}
