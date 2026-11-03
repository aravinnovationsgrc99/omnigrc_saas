import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { TenantContext } from '../tenant/tenant.context';
import {
  Role,
  ProductAccessStatus,
  OrganizationMemberDto,
  UpdateMemberAccessDto,
  OrganizationDetailsDto,
  UpdateOrganizationDetailsDto,
  OrganizationEntitlementDetailDto,
} from '@omnigrc/shared';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly licenseVerificationService: LicenseVerificationService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
  ) {}


  async findAll(organizationId: string): Promise<OrganizationMemberDto[]> {
    return TenantContext.run({ organizationId }, async () => {
      const users = await this.prisma.user.findMany({
        where: { organizationId },
        include: {
          memberships: {
            where: { organizationId },
            include: {
              departments: { include: { department: { select: { id: true, name: true } } } },
              projects: { include: { project: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const members: OrganizationMemberDto[] = [];
      for (const u of users) {
        let m = u.memberships[0];
        if (!m) {
          // Auto-provision membership record if absent
          m = await this.prisma.organizationMembership.create({
            data: {
              organizationId,
              userId: u.id,
              role: u.role as Role,
              status: ProductAccessStatus.ACTIVE,
            },
            include: {
              departments: { include: { department: { select: { id: true, name: true } } } },
              projects: { include: { project: { select: { id: true, name: true } } } },
            },
          });
        }

        members.push({
          id: m.id,
          userId: u.id,
          organizationId: m.organizationId,
          name: u.name,
          email: u.email,
          role: m.role as Role,
          productAccessStatus: m.status as ProductAccessStatus,
          status: m.status as ProductAccessStatus,
          user: { id: u.id, email: u.email },
          grantedAt: m.grantedAt.toISOString(),
          revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
          revokedById: m.revokedById,
          departments: m.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
          projects: m.projects.map((p) => ({ id: p.project.id, name: p.project.name })),
        });
      }

      return members;
    });
  }

  async findOne(organizationId: string, memberIdOrUserId: string): Promise<OrganizationMemberDto> {
    const u = await this.prisma.user.findFirst({
      where: {
        organizationId,
        OR: [{ id: memberIdOrUserId }, { memberships: { some: { id: memberIdOrUserId } } }],
      },
      include: {
        memberships: {
          where: { organizationId },
          include: {
            departments: { include: { department: { select: { id: true, name: true } } } },
            projects: { include: { project: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!u) {
      throw new NotFoundException(`Organization member "${memberIdOrUserId}" not found.`);
    }

    let m = u.memberships[0];
    if (!m) {
      m = await this.prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: u.id,
          role: u.role as Role,
          status: ProductAccessStatus.ACTIVE,
        },
        include: {
          departments: { include: { department: { select: { id: true, name: true } } } },
          projects: { include: { project: { select: { id: true, name: true } } } },
        },
      });
    }

    return {
      id: m.id,
      userId: u.id,
      organizationId: m.organizationId,
      name: u.name,
      email: u.email,
      role: m.role as Role,
      productAccessStatus: m.status as ProductAccessStatus,
      status: m.status as ProductAccessStatus,
      user: { id: u.id, email: u.email },
      grantedAt: m.grantedAt.toISOString(),
      revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
      revokedById: m.revokedById,
      departments: m.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
      projects: m.projects.map((p) => ({ id: p.project.id, name: p.project.name })),
    };
  }

  async updateMemberAccess(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateMemberAccessDto,
  ): Promise<OrganizationMemberDto> {
    // 1. Prevent Self-Privilege Escalation & Self-Restoration
    if (actorUserId === targetUserId) {
      if (dto.role) {
        throw new ForbiddenException('Privilege escalation attempt denied: Users cannot alter their own role.');
      }
      if (dto.productAccessStatus) {
        throw new ForbiddenException('Self-access restoration attempt denied: Users cannot alter their own product access status.');
      }
    }

    // 2. Fetch target membership
    let membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });

    if (!membership) {
      const user = await this.prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
      if (!user) {
        throw new NotFoundException(`User "${targetUserId}" not found in organization.`);
      }

      membership = await this.prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: targetUserId,
          role: user.role as Role,
          status: ProductAccessStatus.ACTIVE,
        },
      });
    }

    const previousRole = membership.role;
    const previousStatus = membership.status;

    // 3. Update Role if provided
    if (dto.role && dto.role !== membership.role) {
      membership = await this.prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { role: dto.role },
      });

      // Keep User table role in sync
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { role: dto.role },
      });

      await this.auditLogs.log({
        action: 'ROLE_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { previousRole, newRole: dto.role },
      });
    }

    // 4. Update Product Access Status if provided
    if (dto.productAccessStatus && dto.productAccessStatus !== membership.status) {
      const isRevoking = dto.productAccessStatus === ProductAccessStatus.REVOKED || dto.productAccessStatus === ProductAccessStatus.SUSPENDED;
      
      membership = await this.prisma.organizationMembership.update({
        where: { id: membership.id },
        data: {
          status: dto.productAccessStatus,
          revokedAt: isRevoking ? new Date() : null,
          revokedById: isRevoking ? actorUserId : null,
        },
      });

      let auditAction = 'PRODUCT_ACCESS_GRANTED';
      if (dto.productAccessStatus === ProductAccessStatus.SUSPENDED) auditAction = 'PRODUCT_ACCESS_SUSPENDED';
      if (dto.productAccessStatus === ProductAccessStatus.REVOKED) auditAction = 'PRODUCT_ACCESS_REVOKED';
      if (dto.productAccessStatus === ProductAccessStatus.ACTIVE) auditAction = 'PRODUCT_ACCESS_REACTIVATED';

      await this.auditLogs.log({
        action: auditAction,
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { previousStatus, newStatus: dto.productAccessStatus },
      });
    }

    // 5. Update Department Assignments if provided
    if (dto.departmentIds !== undefined) {
      // Validate cross-tenant invariant
      const depts = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds }, organizationId },
      });

      if (depts.length !== dto.departmentIds.length) {
        throw new ForbiddenException('Cross-tenant assignment denied: One or more departments do not belong to target organization.');
      }

      await this.prisma.userDepartment.deleteMany({ where: { membershipId: membership.id } });
      for (const deptId of dto.departmentIds) {
        await this.prisma.userDepartment.create({
          data: { membershipId: membership.id, departmentId: deptId },
        });
      }

      await this.auditLogs.log({
        action: 'DEPARTMENT_ASSIGNMENT_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { departmentIds: dto.departmentIds },
      });
    }

    // 6. Update Project Assignments if provided
    if (dto.projectIds !== undefined) {
      // Validate cross-tenant invariant
      const projs = await this.prisma.project.findMany({
        where: { id: { in: dto.projectIds }, organizationId },
      });

      if (projs.length !== dto.projectIds.length) {
        throw new ForbiddenException('Cross-tenant assignment denied: One or more projects do not belong to target organization.');
      }

      await this.prisma.userProject.deleteMany({ where: { membershipId: membership.id } });
      for (const projId of dto.projectIds) {
        await this.prisma.userProject.create({
          data: { membershipId: membership.id, projectId: projId },
        });
      }

      await this.auditLogs.log({
        action: 'PROJECT_ASSIGNMENT_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { projectIds: dto.projectIds },
      });
    }

    return this.findOne(organizationId, targetUserId);
  }

  /**
   * Fetch complete Organization Administrative Details from backend
   */
  async getOrganizationDetails(organizationId: string): Promise<OrganizationDetailsDto> {
    return TenantContext.run({ organizationId }, async () => {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new NotFoundException(`Organization "${organizationId}" not found.`);
      }

      const evalLicense = await this.licenseVerificationService.getEvaluatedStateForOrganization(organizationId);
      const isReadOnly = evalLicense.state === 'EXPIRED';

      const [activeMemberCount, departmentCount, projectCount, rawEntitlements, profile] = await Promise.all([
        this.prisma.organizationMembership.count({
          where: { organizationId, status: ProductAccessStatus.ACTIVE },
        }),
        this.prisma.department.count({
          where: { organizationId },
        }),
        this.prisma.project.count({
          where: { organizationId },
        }),
        this.prisma.organizationFrameworkEntitlement.findMany({
          where: { organizationId },
          include: {
            framework: { select: { id: true, code: true, name: true } },
            frameworkVersion: { select: { id: true, version: true, name: true } },
          },
        }),
        this.prisma.organizationComplianceProfile.findUnique({
          where: { organizationId },
        }),
      ]);

      const entitlements: OrganizationEntitlementDetailDto[] = rawEntitlements.map((e) => ({
        id: e.id,
        frameworkId: e.frameworkId,
        frameworkCode: e.framework.code,
        frameworkName: e.framework.name,
        versionId: e.versionId,
        versionName: e.frameworkVersion ? `${e.frameworkVersion.name} (${e.frameworkVersion.version})` : null,
        status: e.status,
        expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
        source: e.source,
      }));

      const customAttrs: any = (profile?.customAttributes as any) || {};
      const industry = profile?.industrySector || customAttrs.industry || null;
      const description = customAttrs.description || null;
      const businessActivities = customAttrs.businessActivities || null;
      const registeredAddress = customAttrs.registeredAddress || null;
      const contactEmail = customAttrs.contactEmail || null;
      const contactPhone = customAttrs.contactPhone || null;
      const logoUrl = customAttrs.logoUrl || null;

      return {
        id: org.id,
        name: org.name,
        type: org.type,
        parentOrganizationId: org.parentOrganizationId,
        primaryRegion: org.primaryRegion,
        primaryFramework: org.primaryFramework,
        slackWebhookUrl: org.slackWebhookUrl,
        description,
        industry,
        businessActivities,
        registeredAddress,
        contactEmail,
        contactPhone,
        logoUrl,
        onboardingCompleted: org.onboardingCompleted,
        createdAt: org.createdAt.toISOString(),
        licenseState: evalLicense.state,
        isReadOnly,
        activeMemberCount,
        departmentCount,
        projectCount,
        entitlements,
      };
    });
  }

  /**
   * Update Organization Administrative Details (Server-Authorized for ADMIN/MSSP_ADMIN)
   */
  async updateOrganizationDetails(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    dto: UpdateOrganizationDetailsDto,
  ): Promise<OrganizationDetailsDto> {
    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only Organization Administrators can update organization settings.');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization "${organizationId}" not found.`);
    }

    const updateData: any = {};
    if (dto.name && dto.name.trim()) updateData.name = dto.name.trim();
    if (dto.primaryRegion && dto.primaryRegion.trim()) updateData.primaryRegion = dto.primaryRegion.trim();
    if (dto.primaryFramework && dto.primaryFramework.trim()) updateData.primaryFramework = dto.primaryFramework.trim();
    if (dto.slackWebhookUrl !== undefined) updateData.slackWebhookUrl = dto.slackWebhookUrl ? dto.slackWebhookUrl.trim() : null;

    if (Object.keys(updateData).length > 0) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: updateData,
      });
    }

    // Update Company Profile Attributes (industry, description, activities, address, contact)
    const hasProfileUpdates =
      dto.industry !== undefined ||
      dto.description !== undefined ||
      dto.businessActivities !== undefined ||
      dto.registeredAddress !== undefined ||
      dto.contactEmail !== undefined ||
      dto.contactPhone !== undefined ||
      dto.logoUrl !== undefined;

    if (hasProfileUpdates) {
      const existingProfile = await this.prisma.organizationComplianceProfile.findUnique({
        where: { organizationId },
      });
      const currentAttrs: any = (existingProfile?.customAttributes as any) || {};
      const updatedAttrs = {
        ...currentAttrs,
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.industry !== undefined && { industry: dto.industry?.trim() || null }),
        ...(dto.businessActivities !== undefined && { businessActivities: dto.businessActivities?.trim() || null }),
        ...(dto.registeredAddress !== undefined && { registeredAddress: dto.registeredAddress?.trim() || null }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail?.trim() || null }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone?.trim() || null }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl?.trim() || null }),
      };

      await this.prisma.organizationComplianceProfile.upsert({
        where: { organizationId },
        create: {
          organizationId,
          industrySector: dto.industry?.trim() || null,
          customAttributes: updatedAttrs,
        },
        update: {
          ...(dto.industry !== undefined && { industrySector: dto.industry?.trim() || null }),
          customAttributes: updatedAttrs,
        },
      });
    }

    await this.auditLogs.log({
      action: 'ORGANIZATION_SETTINGS_CHANGED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Organization',
      entityId: organizationId,
      metadata: {
        updatedFields: [
          ...Object.keys(updateData),
          ...(hasProfileUpdates ? ['companyProfile'] : []),
        ],
      },
    });

    return this.getOrganizationDetails(organizationId);
  }

  /**
   * Upload and persist organization-specific logo with type, size, and header validation.
   */
  async uploadLogo(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    dto: { data: string; mimeType: string; filename?: string },
  ): Promise<{ success: boolean; logoUrl: string }> {
    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only Organization Administrators can upload company logos.');
    }

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedMimeTypes.includes(dto.mimeType)) {
      throw new BadRequestException(
        `Invalid logo file format "${dto.mimeType}". Allowed formats: PNG, JPEG, WebP, SVG.`,
      );
    }

    // Clean base64 data prefix if passed
    const cleanBase64 = dto.data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Max 2MB file size enforcement
    const MAX_SIZE = 2 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new BadRequestException(`Logo file size (${Math.round(buffer.length / 1024)}KB) exceeds 2MB limit.`);
    }

    // Validate image header / magic numbers
    if (dto.mimeType === 'image/png') {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngMagic)) {
        throw new BadRequestException('File content does not match PNG signature.');
      }
    } else if (dto.mimeType === 'image/jpeg') {
      if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new BadRequestException('File content does not match JPEG signature.');
      }
    } else if (dto.mimeType === 'image/webp') {
      const riff = buffer.subarray(0, 4).toString('ascii');
      const webp = buffer.subarray(8, 12).toString('ascii');
      if (riff !== 'RIFF' || webp !== 'WEBP') {
        throw new BadRequestException('File content does not match WebP signature.');
      }
    } else if (dto.mimeType === 'image/svg+xml') {
      const text = buffer.toString('utf8').trim();
      if (!text.startsWith('<svg') && !text.startsWith('<?xml')) {
        throw new BadRequestException('File content does not match valid SVG format.');
      }
    }

    // Persist to tenant-scoped storage directory
    const ext = dto.mimeType === 'image/png' ? 'png' : dto.mimeType === 'image/jpeg' ? 'jpg' : dto.mimeType === 'image/webp' ? 'webp' : 'svg';
    const logoDir = path.resolve(process.cwd(), 'uploads', 'logos', organizationId);
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }

    const filePath = path.join(logoDir, `logo.${ext}`);
    fs.writeFileSync(filePath, buffer);

    const logoUrl = `/api/organization-members/logo`;
    const dataUri = `data:${dto.mimeType};base64,${cleanBase64}`;

    // Update profile customAttributes
    const existingProfile = await this.prisma.organizationComplianceProfile.findUnique({
      where: { organizationId },
    });
    const currentAttrs: any = (existingProfile?.customAttributes as any) || {};
    const updatedAttrs = {
      ...currentAttrs,
      logoUrl,
      logoDataUri: dataUri,
      logoMimeType: dto.mimeType,
      logoFilePath: filePath,
      logoUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.organizationComplianceProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        customAttributes: updatedAttrs,
      },
      update: {
        customAttributes: updatedAttrs,
      },
    });

    await this.auditLogs.log({
      action: 'ORGANIZATION_LOGO_UPDATED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { mimeType: dto.mimeType, sizeBytes: buffer.length },
    });

    return { success: true, logoUrl };
  }

  /**
   * Get organization logo image stream/buffer safely scoped to tenant.
   */
  async getLogo(organizationId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const profile = await this.prisma.organizationComplianceProfile.findUnique({
      where: { organizationId },
    });
    const attrs: any = (profile?.customAttributes as any) || {};

    if (attrs.logoFilePath && fs.existsSync(attrs.logoFilePath)) {
      const buffer = fs.readFileSync(attrs.logoFilePath);
      return { buffer, mimeType: attrs.logoMimeType || 'image/png' };
    }

    if (attrs.logoDataUri) {
      const match = attrs.logoDataUri.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          buffer: Buffer.from(match[2], 'base64'),
          mimeType: match[1],
        };
      }
    }

    return null;
  }

  /**
   * Delete organization logo.
   */
  async deleteLogo(organizationId: string, actorUserId: string, actorRole: Role): Promise<{ success: boolean }> {
    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only Organization Administrators can delete company logos.');
    }

    const profile = await this.prisma.organizationComplianceProfile.findUnique({
      where: { organizationId },
    });
    const attrs: any = (profile?.customAttributes as any) || {};

    if (attrs.logoFilePath && fs.existsSync(attrs.logoFilePath)) {
      try {
        fs.unlinkSync(attrs.logoFilePath);
      } catch {
        // continue
      }
    }

    const updatedAttrs = {
      ...attrs,
      logoUrl: null,
      logoDataUri: null,
      logoMimeType: null,
      logoFilePath: null,
      logoUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.organizationComplianceProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        customAttributes: updatedAttrs,
      },
      update: {
        customAttributes: updatedAttrs,
      },
    });

    await this.auditLogs.log({
      action: 'ORGANIZATION_LOGO_REMOVED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Organization',
      entityId: organizationId,
      metadata: {},
    });

    return { success: true };
  }
}

