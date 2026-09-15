import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResendMailerService } from '../notifications/mailer/resend-mailer.service';
import { renderInvitationEmailHtml, PriorityLevel } from '../notifications/templates/email-templates';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  RegisterDto,
  LoginDto,
  Role,
  PodRegion,
  PodStatus,
  AuthResponseDto,
  OnboardingCompleteDto,
  InviteTeamMemberDto,
  AssetType,
  AssetCriticality,
  InvitationStatus,
  InvitationDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  ValidateInvitationResponseDto,
  SetupPasswordDto,
} from '@omnigrc/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resendMailerService: ResendMailerService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create Organization + First ADMIN user + RegionalPods transactionally
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.organizationName,
        primaryRegion: dto.primaryRegion || 'India',
        users: {
          create: {
            name: dto.name,
            email: dto.email.toLowerCase().trim(),
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
      include: {
        users: true,
      },
    });

    const user = organization.users[0];

    // Audit log entry
    await this.auditLogsService.log({
      organizationId: organization.id,
      actorId: user.id,
      action: 'ORGANIZATION_REGISTERED',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { organizationName: organization.name, adminEmail: user.email },
    });

    const tokens = this.generateTokens(user.id, user.email, organization.id, user.role);

    return {
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        emailNotifications: user.emailNotifications ?? true,
        passwordSetupRequired: user.passwordSetupRequired ?? false,
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: organization.id,
        name: organization.name,
        primaryRegion: organization.primaryRegion,
        primaryFramework: organization.primaryFramework,
        onboardingCompleted: organization.onboardingCompleted,
        createdAt: organization.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.auditLogsService.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email },
    });

    const tokens = this.generateTokens(user.id, user.email, user.organizationId, user.role);

    return {
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        emailNotifications: user.emailNotifications ?? true,
        passwordSetupRequired: user.passwordSetupRequired ?? false,
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        primaryRegion: user.organization.primaryRegion,
        primaryFramework: user.organization.primaryFramework,
        onboardingCompleted: user.organization.onboardingCompleted,
        createdAt: user.organization.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async refreshToken(refreshTokenStr: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshTokenStr, {
        secret: process.env.JWT_REFRESH_SECRET || 'omnigrc-dev-refresh-secret-key',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email, user.organizationId, user.role);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(userId: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = this.generateTokens(user.id, user.email, user.organizationId, user.role);

    return {
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        emailNotifications: user.emailNotifications,
        passwordSetupRequired: user.passwordSetupRequired ?? false,
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        primaryRegion: user.organization.primaryRegion,
        primaryFramework: user.organization.primaryFramework,
        onboardingCompleted: user.organization.onboardingCompleted,
        createdAt: user.organization.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async updatePreferences(userId: string, emailNotifications: boolean) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotifications },
    });

    return {
      id: updated.id,
      emailNotifications: updated.emailNotifications,
    };
  }

  async completeOnboarding(userId: string, dto: OnboardingCompleteDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updateData: any = { onboardingCompleted: true };
    if (dto.primaryFramework) {
      updateData.primaryFramework = dto.primaryFramework;
    }

    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: updateData,
    });

    let importedAssetCount = 0;
    if (dto.assets && dto.assets.length > 0) {
      const assetData = dto.assets.map((asset) => ({
        organizationId: user.organizationId,
        name: asset.name,
        type: asset.type || ('SOFTWARE' as AssetType),
        owner: asset.owner || user.name,
        criticality: asset.criticality || ('MEDIUM' as AssetCriticality),
        createdById: userId,
      }));

      await this.prisma.asset.createMany({
        data: assetData,
      });
      importedAssetCount = assetData.length;
    }

    await this.auditLogsService.log({
      organizationId: user.organizationId,
      actorId: userId,
      action: 'ONBOARDING_COMPLETED',
      entityType: 'Organization',
      entityId: user.organizationId,
      metadata: {
        primaryFramework: dto.primaryFramework || null,
        importedAssetCount,
      },
    });

    return {
      success: true,
      onboardingCompleted: true,
      primaryFramework: dto.primaryFramework || null,
      importedAssetCount,
    };
  }

  // --- Secure Invitation Flow Methods ---

  async createInvitation(adminUserId: string, dto: CreateInvitationDto): Promise<InvitationDto> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { organization: true },
    });

    if (!admin || !admin.organizationId) {
      throw new UnauthorizedException('Admin user not found');
    }

    const targetEmail = dto.email.toLowerCase().trim();

    // Check if target user already exists in the SAME organization
    const existingSameOrgUser = await this.prisma.user.findFirst({
      where: {
        email: targetEmail,
        organizationId: admin.organizationId,
      },
    });

    if (existingSameOrgUser) {
      throw new ConflictException('User is already a member of this organization');
    }

    // Revoke any previous PENDING invitations for this email in this organization
    await this.prisma.invitation.updateMany({
      where: {
        organizationId: admin.organizationId,
        email: targetEmail,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    // Generate cryptographically secure random token (32-byte hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day expiration

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: admin.organizationId,
        email: targetEmail,
        role: dto.role || Role.ANALYST,
        invitedById: adminUserId,
        tokenHash,
        expiresAt,
        status: InvitationStatus.PENDING,
      },
    });

    // Construct raw token URL ONLY for immediate response to authorized admin and email dispatch
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.omnigrc.com';
    const inviteUrl = `${baseUrl}/invite/accept?token=${rawToken}`;

    // Dispatch Resend email (errors caught gracefully so manual link remains copyable & usable)
    let emailSent = false;
    try {
      emailSent = await this.resendMailerService.sendEmail(
        {
          to: targetEmail,
          subject: `Invitation to join ${admin.organization.name} on OMNiGRC`,
          html: renderInvitationEmailHtml({
            inviterName: admin.name || admin.email,
            orgName: admin.organization.name,
            role: invitation.role,
            inviteUrl,
            expiresAt: invitation.expiresAt,
          }),
        },
        PriorityLevel.P0,
      );
    } catch (err: any) {
      this.logger.error(`Resend email dispatch error for ${targetEmail}: ${err.message}`);
    }

    await this.auditLogsService.log({
      organizationId: admin.organizationId,
      actorId: adminUserId,
      action: 'INVITATION_CREATED',
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: {
        invitedEmail: targetEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        emailSent,
      },
    });

    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role as Role,
      invitedById: invitation.invitedById,
      status: invitation.status as InvitationStatus,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      inviteUrl, // Returned ONLY on creation/resend/copy-link to authorized admin
    };
  }

  async listInvitations(adminUserId: string): Promise<InvitationDto[]> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
    });

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    // Automatically transition past-due PENDING invitations to EXPIRED
    await this.prisma.invitation.updateMany({
      where: {
        organizationId: admin.organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: InvitationStatus.EXPIRED,
      },
    });

    const invitations = await this.prisma.invitation.findMany({
      where: {
        organizationId: admin.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Note: inviteUrl / rawToken is intentionally EXCLUDED from list API for security
    return invitations.map((inv) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role as Role,
      invitedById: inv.invitedById,
      status: inv.status as InvitationStatus,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : undefined,
      revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : undefined,
    }));
  }

  async validateInvitation(rawToken: string): Promise<ValidateInvitationResponseDto> {
    if (!rawToken || rawToken.trim() === '') {
      return { valid: false, reason: 'Invitation token is missing' };
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation) {
      return { valid: false, reason: 'Invalid or non-existent invitation token' };
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return { valid: false, reason: `Invitation token has been ${invitation.status.toLowerCase()}` };
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      return { valid: false, reason: 'Invitation token has expired' };
    }

    return {
      valid: true,
      organizationName: invitation.organization.name,
      email: invitation.email,
      role: invitation.role as Role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<AuthResponseDto> {
    if (!dto.token || dto.token.trim() === '') {
      throw new BadRequestException('Invitation token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(dto.token.trim()).digest('hex');
    const now = new Date();

    // 100% Atomic Transaction: User creation/lookup & invitation acceptance run in a single DB transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Atomic status transition PENDING -> ACCEPTED to prevent concurrent double acceptance
      const updateResult = await tx.invitation.updateMany({
        where: {
          tokenHash,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: now,
        },
      });

      if (updateResult.count === 0) {
        const existing = await tx.invitation.findUnique({ where: { tokenHash } });
        if (!existing) {
          throw new BadRequestException('Invalid invitation token');
        }
        if (existing.status !== InvitationStatus.PENDING) {
          throw new BadRequestException(`Invitation is no longer valid (status: ${existing.status})`);
        }
        if (existing.expiresAt <= now) {
          await tx.invitation.update({
            where: { id: existing.id },
            data: { status: InvitationStatus.EXPIRED },
          });
          throw new BadRequestException('Invitation token has expired');
        }
        throw new BadRequestException('Invitation is no longer valid or has already been accepted');
      }

      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        include: { organization: true },
      });

      if (!invitation) {
        throw new BadRequestException('Invitation not found');
      }

      // Derive recipient properties EXCLUSIVELY from trusted DB Invitation record
      const email = invitation.email;
      const organizationId = invitation.organizationId;
      const role = invitation.role;

      const existingUser = await tx.user.findUnique({
        where: { email },
        include: { organization: true },
      });

      let userToAuth: any;

      if (existingUser) {
        if (existingUser.organizationId !== organizationId) {
          throw new ConflictException(
            'Your user account belongs to another organization and cannot join this organization',
          );
        }
        // Preserve existing user's role: do NOT overwrite existingUser.role silently!
        userToAuth = existingUser;
      } else {
        if (!dto.password || dto.password.trim().length < 6) {
          throw new BadRequestException('Password must be at least 6 characters long');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const userName = dto.name || email.split('@')[0];

        userToAuth = await tx.user.create({
          data: {
            organizationId,
            name: userName,
            email,
            passwordHash,
            role: role as Role,
            passwordSetupRequired: false,
          },
          include: { organization: true },
        });
      }

      return { userToAuth, invitation };
    });

    const { userToAuth, invitation } = result;

    await this.auditLogsService.log({
      organizationId: invitation.organizationId,
      actorId: userToAuth.id,
      action: 'INVITATION_ACCEPTED',
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: {
        userEmail: invitation.email,
        role: invitation.role,
      },
    });

    const tokens = this.generateTokens(userToAuth.id, userToAuth.email, userToAuth.organizationId, userToAuth.role);

    return {
      user: {
        id: userToAuth.id,
        organizationId: userToAuth.organizationId,
        name: userToAuth.name,
        email: userToAuth.email,
        role: userToAuth.role as Role,
        emailNotifications: userToAuth.emailNotifications ?? true,
        passwordSetupRequired: userToAuth.passwordSetupRequired ?? false,
        createdAt: userToAuth.createdAt.toISOString(),
      },
      organization: {
        id: userToAuth.organization.id,
        name: userToAuth.organization.name,
        primaryRegion: userToAuth.organization.primaryRegion,
        primaryFramework: userToAuth.organization.primaryFramework,
        onboardingCompleted: userToAuth.organization.onboardingCompleted,
        createdAt: userToAuth.organization.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async revokeInvitation(adminUserId: string, invitationId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
    });

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    // Tenant Isolation Enforcement: Ensure invitation belongs to admin's organization!
    if (!invitation || invitation.organizationId !== admin.organizationId) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot revoke an invitation that is ${invitation.status}`);
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.auditLogsService.log({
      organizationId: admin.organizationId,
      actorId: adminUserId,
      action: 'INVITATION_REVOKED',
      entityType: 'Invitation',
      entityId: updated.id,
      metadata: { email: updated.email },
    });

    return { success: true, message: 'Invitation revoked successfully' };
  }

  async resendInvitation(adminUserId: string, invitationId: string): Promise<InvitationDto> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { organization: true },
    });

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    const oldInvitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    // Tenant Isolation Check
    if (!oldInvitation || oldInvitation.organizationId !== admin.organizationId) {
      throw new NotFoundException('Invitation not found');
    }

    // Revoke old invitation token
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    // Issue fresh 32-byte hex token & invitation
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newInvitation = await this.prisma.invitation.create({
      data: {
        organizationId: admin.organizationId,
        email: oldInvitation.email,
        role: oldInvitation.role,
        invitedById: adminUserId,
        tokenHash,
        expiresAt,
        status: InvitationStatus.PENDING,
      },
    });

    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.omnigrc.com';
    const inviteUrl = `${baseUrl}/invite/accept?token=${rawToken}`;

    let emailSent = false;
    try {
      emailSent = await this.resendMailerService.sendEmail(
        {
          to: newInvitation.email,
          subject: `Invitation to join ${admin.organization.name} on OMNiGRC`,
          html: renderInvitationEmailHtml({
            inviterName: admin.name || admin.email,
            orgName: admin.organization.name,
            role: newInvitation.role,
            inviteUrl,
            expiresAt: newInvitation.expiresAt,
          }),
        },
        PriorityLevel.P0,
      );
    } catch (err: any) {
      this.logger.error(`Resend email error for ${newInvitation.email}: ${err.message}`);
    }

    await this.auditLogsService.log({
      organizationId: admin.organizationId,
      actorId: adminUserId,
      action: 'INVITATION_RESENT',
      entityType: 'Invitation',
      entityId: newInvitation.id,
      metadata: {
        invitedEmail: newInvitation.email,
        previousInvitationId: oldInvitation.id,
        emailSent,
      },
    });

    return {
      id: newInvitation.id,
      organizationId: newInvitation.organizationId,
      email: newInvitation.email,
      role: newInvitation.role as Role,
      invitedById: newInvitation.invitedById,
      status: newInvitation.status as InvitationStatus,
      expiresAt: newInvitation.expiresAt.toISOString(),
      createdAt: newInvitation.createdAt.toISOString(),
      inviteUrl,
    };
  }

  async copyInviteLink(adminUserId: string, invitationId: string): Promise<InvitationDto> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { organization: true },
    });

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    const oldInvitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    // Tenant Ownership Check
    if (!oldInvitation || oldInvitation.organizationId !== admin.organizationId) {
      throw new NotFoundException('Invitation not found');
    }

    if (oldInvitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot copy link for an invitation that is ${oldInvitation.status}`);
    }

    // Revoke previous token
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    // Rotate and generate fresh 32-byte hex token & invitation
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newInvitation = await this.prisma.invitation.create({
      data: {
        organizationId: admin.organizationId,
        email: oldInvitation.email,
        role: oldInvitation.role,
        invitedById: adminUserId,
        tokenHash,
        expiresAt,
        status: InvitationStatus.PENDING,
      },
    });

    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.omnigrc.com';
    const inviteUrl = `${baseUrl}/invite/accept?token=${rawToken}`;

    await this.auditLogsService.log({
      organizationId: admin.organizationId,
      actorId: adminUserId,
      action: 'INVITATION_LINK_COPIED',
      entityType: 'Invitation',
      entityId: newInvitation.id,
      metadata: {
        invitedEmail: newInvitation.email,
        previousInvitationId: oldInvitation.id,
      },
    });

    return {
      id: newInvitation.id,
      organizationId: newInvitation.organizationId,
      email: newInvitation.email,
      role: newInvitation.role as Role,
      invitedById: newInvitation.invitedById,
      status: newInvitation.status as InvitationStatus,
      expiresAt: newInvitation.expiresAt.toISOString(),
      createdAt: newInvitation.createdAt.toISOString(),
      inviteUrl,
    };
  }

  async setupPassword(userId: string, dto: SetupPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!dto.newPassword || dto.newPassword.trim().length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordSetupRequired: false,
      },
    });

    await this.auditLogsService.log({
      organizationId: user.organizationId,
      actorId: userId,
      action: 'PASSWORD_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { email: user.email },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  async inviteTeamMember(userId: string, dto: InviteTeamMemberDto) {
    const inv = await this.createInvitation(userId, {
      email: dto.email,
      role: dto.role,
      name: dto.name,
    });

    return {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      message: 'Invitation dispatched successfully',
      inviteUrl: inv.inviteUrl,
    };
  }

  private generateTokens(userId: string, email: string, organizationId: string, role: string) {
    const payload = { sub: userId, email, organizationId, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod',
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'omnigrc-dev-refresh-secret-key',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
