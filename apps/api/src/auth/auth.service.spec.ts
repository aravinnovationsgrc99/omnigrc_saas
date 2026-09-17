import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResendMailerService } from '../notifications/mailer/resend-mailer.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Role, InvitationStatus, OrgType } from '@omnigrc/shared';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resendMailerService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      invitation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      asset: {
        createMany: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    resendMailerService = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResendMailerService, useValue: resendMailerService },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mocked-jwt-token'),
            verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Registration & Onboarding', () => {
    it('should register a new organization and user with audit logging', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
        primaryRegion: 'India',
        createdAt: new Date(),
        users: [
          {
            id: 'user-1',
            organizationId: 'org-1',
            name: 'Admin User',
            email: 'admin@acme.com',
            role: 'ADMIN',
            emailNotifications: true,
            passwordSetupRequired: false,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.register({
        organizationName: 'Acme Corp',
        name: 'Admin User',
        email: 'admin@acme.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('admin@acme.com');
      expect(result.organization.name).toBe('Acme Corp');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_REGISTERED',
          organizationId: 'org-1',
        }),
      );
    });

    it('should throw ConflictException if user email exists during registration', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-existing' });

      await expect(
        service.register({
          organizationName: 'Acme',
          name: 'Admin',
          email: 'existing@acme.com',
          password: 'pass',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Secure Invitation System - Creation & Token Hashing', () => {
    const adminUser = {
      id: 'admin-1',
      name: 'Org A Admin',
      email: 'admin@orga.com',
      organizationId: 'org-A',
      organization: { id: 'org-A', name: 'Organization A' },
    };

    it('should create invitation, hash token with SHA-256, and return raw token inviteUrl only to creating admin', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      const createdInv = {
        id: 'inv-123',
        organizationId: 'org-A',
        email: 'invitee@orga.com',
        role: Role.ANALYST,
        invitedById: 'admin-1',
        tokenHash: 'hashed-token-value',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: InvitationStatus.PENDING,
        createdAt: new Date(),
      };
      prisma.invitation.create.mockResolvedValue(createdInv);

      const result = await service.createInvitation('admin-1', {
        email: 'INVITEE@ORGA.COM ',
        role: Role.ANALYST,
      });

      expect(result.id).toBe('inv-123');
      expect(result.email).toBe('invitee@orga.com');
      expect(result.status).toBe(InvitationStatus.PENDING);
      expect(result.inviteUrl).toContain('/invite/accept?token=');

      // Verify raw token is NEVER saved in DB payload (only SHA-256 tokenHash)
      const createCallData = prisma.invitation.create.mock.calls[0][0].data;
      expect(createCallData.tokenHash).toBeDefined();
      expect(createCallData.tokenHash.length).toBe(64);
      expect(createCallData.rawToken).toBeUndefined();

      // Verify email dispatch
      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invitee@orga.com',
          subject: expect.stringContaining('Organization A'),
        }),
        expect.anything(),
      );
    });

    it('should handle Resend email dispatch failure gracefully without producing an inconsistent state', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      resendMailerService.sendEmail.mockRejectedValue(new Error('SMTP Connection Failed'));

      prisma.invitation.create.mockResolvedValue({
        id: 'inv-recoverable',
        organizationId: 'org-A',
        email: 'invitee@orga.com',
        role: Role.ANALYST,
        invitedById: 'admin-1',
        tokenHash: 'hash-fail',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: InvitationStatus.PENDING,
        createdAt: new Date(),
      });

      const res = await service.createInvitation('admin-1', {
        email: 'invitee@orga.com',
        role: Role.ANALYST,
      });

      expect(res.id).toBe('inv-recoverable');
      expect(res.status).toBe(InvitationStatus.PENDING);
      expect(res.inviteUrl).toBeDefined();
    });

    it('should NOT include raw token or inviteUrl in listInvitations response', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          organizationId: 'org-A',
          email: 'user1@orga.com',
          role: Role.ANALYST,
          invitedById: 'admin-1',
          tokenHash: 'some-hash',
          expiresAt: new Date(),
          status: InvitationStatus.PENDING,
          createdAt: new Date(),
        },
      ]);

      const list = await service.listInvitations('admin-1');
      expect(list[0].inviteUrl).toBeUndefined();
    });
  });

  describe('Secure Invitation System - Validation & Transactional Acceptance', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const expectedTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const validInvitation = {
      id: 'inv-789',
      organizationId: 'org-A',
      email: 'invitee@orga.com',
      role: Role.ANALYST,
      tokenHash: expectedTokenHash,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 86400000),
      organization: { id: 'org-A', name: 'Organization A', primaryRegion: 'India', onboardingCompleted: true, createdAt: new Date() },
    };

    it('should validate invitation token without mutating state', async () => {
      prisma.invitation.findUnique.mockResolvedValue(validInvitation);

      const res = await service.validateInvitation(rawToken);

      expect(res.valid).toBe(true);
      expect(res.organizationName).toBe('Organization A');
      expect(res.email).toBe('invitee@orga.com');
      expect(res.role).toBe(Role.ANALYST);
    });

    it('should accept invitation for a new user inside a Prisma transaction', async () => {
      prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.invitation.findUnique.mockResolvedValue(validInvitation);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        organizationId: 'org-A',
        name: 'New Invitee User',
        email: 'invitee@orga.com',
        passwordHash: 'hashed-pass',
        role: Role.ANALYST,
        emailNotifications: true,
        passwordSetupRequired: false,
        createdAt: new Date(),
        organization: validInvitation.organization,
      });

      const res = await service.acceptInvitation({
        token: rawToken,
        password: 'securePassword123!',
        name: 'New Invitee User',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res.user.email).toBe('invitee@orga.com');
      expect(res.user.organizationId).toBe('org-A');
      expect(res.user.role).toBe(Role.ANALYST);
    });

    it('should rollback transaction and leave invitation pending if user creation fails inside transaction', async () => {
      prisma.$transaction.mockImplementation(async (cb) => {
        return cb({
          invitation: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(validInvitation),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockRejectedValue(new Error('DB Constraint Violation')),
          },
        });
      });

      await expect(
        service.acceptInvitation({
          token: rawToken,
          password: 'password123',
        }),
      ).rejects.toThrow('DB Constraint Violation');
    });

    it('should safely handle concurrent/double acceptance without race condition', async () => {
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
      prisma.invitation.findUnique.mockResolvedValue({
        ...validInvitation,
        status: InvitationStatus.ACCEPTED,
      });

      await expect(
        service.acceptInvitation({
          token: rawToken,
          password: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Tenant Isolation & Token Rotation (Resend & Copy Link)', () => {
    it('should prevent Admin from Organization B from revoking an invitation belonging to Organization A', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-orgB',
        organizationId: 'org-B',
      });

      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-orgA-1',
        organizationId: 'org-A',
        status: InvitationStatus.PENDING,
      });

      await expect(service.revokeInvitation('admin-orgB', 'inv-orgA-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should prevent Admin from Organization B from obtaining a copy link for Organization A invitation', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-orgB',
        organizationId: 'org-B',
      });

      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-orgA-1',
        organizationId: 'org-A',
        status: InvitationStatus.PENDING,
      });

      await expect(service.copyInviteLink('admin-orgB', 'inv-orgA-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should rotate token when copyInviteLink is called, invalidating old token and returning fresh inviteUrl', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-orgA',
        organizationId: 'org-A',
        name: 'Admin A',
        organization: { name: 'Org A' },
      });

      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-old-link',
        organizationId: 'org-A',
        email: 'user@orga.com',
        role: Role.ANALYST,
        status: InvitationStatus.PENDING,
      });

      prisma.invitation.update.mockResolvedValue({
        id: 'inv-old-link',
        status: InvitationStatus.REVOKED,
      });

      prisma.invitation.create.mockResolvedValue({
        id: 'inv-fresh-copied',
        organizationId: 'org-A',
        email: 'user@orga.com',
        role: Role.ANALYST,
        invitedById: 'admin-orgA',
        tokenHash: 'fresh-hash-copy',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: InvitationStatus.PENDING,
        createdAt: new Date(),
      });

      const res = await service.copyInviteLink('admin-orgA', 'inv-old-link');

      expect(res.id).toBe('inv-fresh-copied');
      expect(res.inviteUrl).toBeDefined();

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-old-link' },
        data: { status: InvitationStatus.REVOKED, revokedAt: expect.any(Date) },
      });

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVITATION_LINK_COPIED',
          organizationId: 'org-A',
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 10 Security: MSSP Context Switching Security Tests
  // ---------------------------------------------------------------------------
  describe('MSSP Context Switching Security (Phase 10)', () => {
    const msspUserId = 'mssp-user-1';
    const msspHomeOrgId = 'mssp-org-1';
    const clientOrgId = 'client-org-1';

    it('should reject switchContext for a non-MSSP user role', async () => {
      // Regular ADMIN trying to switch context
      await expect(
        service.switchContext(msspUserId, msspHomeOrgId, Role.ADMIN, {
          targetOrganizationId: clientOrgId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MSSP_CONTEXT_SWITCH_FAILED',
          metadata: expect.objectContaining({ reason: expect.stringContaining('MSSP role') }),
        }),
      );
    });

    it('should reject switchContext when home organization is not MSSP_PROVIDER type', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: msspHomeOrgId,
        type: OrgType.STANDALONE, // Not an MSSP provider
      });

      await expect(
        service.switchContext(msspUserId, msspHomeOrgId, Role.MSSP_ADMIN, {
          targetOrganizationId: clientOrgId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MSSP_CONTEXT_SWITCH_FAILED',
          metadata: expect.objectContaining({ reason: expect.stringContaining('not an MSSP Provider') }),
        }),
      );
    });

    it('should reject switchContext when target organization belongs to a different MSSP', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({
          id: msspHomeOrgId,
          type: OrgType.MSSP_PROVIDER,
        })
        .mockResolvedValueOnce({
          id: clientOrgId,
          type: OrgType.CLIENT_TENANT,
          parentOrganizationId: 'different-mssp-org', // Belongs to a DIFFERENT MSSP
        });

      await expect(
        service.switchContext(msspUserId, msspHomeOrgId, Role.MSSP_ADMIN, {
          targetOrganizationId: clientOrgId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MSSP_CONTEXT_SWITCH_FAILED',
          metadata: expect.objectContaining({
            reason: expect.stringContaining('not managed by this MSSP'),
          }),
        }),
      );
    });

    it('should reject switchContext when target organization is itself an MSSP_PROVIDER (privilege escalation)', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({
          id: msspHomeOrgId,
          type: OrgType.MSSP_PROVIDER,
        })
        .mockResolvedValueOnce({
          id: clientOrgId,
          type: OrgType.MSSP_PROVIDER, // Another MSSP — must be rejected
          parentOrganizationId: msspHomeOrgId,
        });

      await expect(
        service.switchContext(msspUserId, msspHomeOrgId, Role.MSSP_ADMIN, {
          targetOrganizationId: clientOrgId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MSSP_CONTEXT_SWITCH_FAILED',
          metadata: expect.objectContaining({ reason: expect.stringContaining('cannot be an MSSP Provider') }),
        }),
      );
    });

    it('should reject switchContext for a non-existent target organization', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({
          id: msspHomeOrgId,
          type: OrgType.MSSP_PROVIDER,
        })
        .mockResolvedValueOnce(null); // Target org does not exist

      await expect(
        service.switchContext(msspUserId, msspHomeOrgId, Role.MSSP_ADMIN, {
          targetOrganizationId: 'nonexistent-org-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should succeed and issue a short-lived context token for valid MSSP context switch', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({
          id: msspHomeOrgId,
          type: OrgType.MSSP_PROVIDER,
        })
        .mockResolvedValueOnce({
          id: clientOrgId,
          type: OrgType.CLIENT_TENANT,
          parentOrganizationId: msspHomeOrgId,
          name: 'Client Org',
          primaryRegion: 'India',
          primaryFramework: null,
          onboardingCompleted: true,
          createdAt: new Date(),
        });

      prisma.user.findUnique.mockResolvedValue({
        id: msspUserId,
        organizationId: msspHomeOrgId,
        email: 'mssp@arav.co',
        role: Role.MSSP_ADMIN,
        name: 'MSSP Admin',
      });

      const jwtSignSpy = jest.spyOn(
        (service as any).jwtService,
        'sign',
      );

      const result = await service.switchContext(msspUserId, msspHomeOrgId, Role.MSSP_ADMIN, {
        targetOrganizationId: clientOrgId,
      });

      expect(result.accessToken).toBe('mocked-jwt-token');
      expect(result.expiresIn).toBe('15m');
      expect(result.actingViaMsspId).toBe(msspHomeOrgId);
      expect(result.targetOrganization.id).toBe(clientOrgId);

      // Verify the JWT payload includes actingViaMsspId claim
      const signPayload = jwtSignSpy.mock.calls[0][0] as any;
      expect(signPayload.actingViaMsspId).toBe(msspHomeOrgId);
      expect(signPayload.organizationId).toBe(clientOrgId);
      expect(signPayload.sub).toBe(msspUserId);

      // Verify audit log records the switch
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MSSP_CONTEXT_SWITCHED',
          organizationId: msspHomeOrgId,
          entityId: clientOrgId,
        }),
      );
    });

    it('refreshToken should return normal token WITHOUT actingViaMsspId (context token cannot be refreshed)', async () => {
      // Simulate the jwtService.verify returning a context token payload
      const jwtVerifyMock = jest.fn().mockReturnValue({
        sub: msspUserId,
        email: 'mssp@arav.co',
        organizationId: clientOrgId,
        actingViaMsspId: msspHomeOrgId, // This is a context token
        role: Role.MSSP_ADMIN,
      });

      const jwtSignMock = jest.fn().mockReturnValue('refreshed-normal-token');

      // Rebuild service with controlled jwt mock
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditLogsService, useValue: auditLogsService },
          { provide: ResendMailerService, useValue: resendMailerService },
          {
            provide: JwtService,
            useValue: { sign: jwtSignMock, verify: jwtVerifyMock },
          },
        ],
      }).compile();

      const testService = module.get<AuthService>(AuthService);

      prisma.user.findUnique.mockResolvedValue({
        id: msspUserId,
        organizationId: msspHomeOrgId, // Home org from DB
        email: 'mssp@arav.co',
        role: Role.MSSP_ADMIN,
        name: 'MSSP Admin',
      });

      // The refresh endpoint takes a refreshToken string and returns new tokens
      const result = await testService.refreshToken('any-refresh-token-string');

      // The issued tokens should use the home organizationId from DB, NOT actingViaMsspId
      const signPayload = jwtSignMock.mock.calls[0][0] as any;
      expect(signPayload.organizationId).toBe(msspHomeOrgId); // Home org, not target org
      expect(signPayload.actingViaMsspId).toBeUndefined();   // Context claim is NOT carried forward
      expect(result.accessToken).toBeDefined();
    });
  });
});
