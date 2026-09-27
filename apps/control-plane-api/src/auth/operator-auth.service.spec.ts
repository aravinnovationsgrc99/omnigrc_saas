import { OperatorAuthService } from './operator-auth.service';
import { OperatorSecurityService } from './operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import * as bcrypt from 'bcrypt';

describe('OperatorAuthService', () => {
  let service: OperatorAuthService;
  let securityService: OperatorSecurityService;
  let auditLogsService: ControlPlaneAuditLogsService;
  let jwtService: JwtService;
  let mockPrisma: any;

  beforeEach(() => {
    securityService = new OperatorSecurityService();
    jwtService = new JwtService({ secret: 'test-jwt-secret' });
    auditLogsService = {
      log: jest.fn().mockResolvedValue(true),
    } as any;

    mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      operator: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      operatorSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    service = new OperatorAuthService(
      mockPrisma as any,
      securityService,
      jwtService,
      auditLogsService,
    );
  });

  describe('login', () => {
    it('should throw UnauthorizedException if operator does not exist', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nonexistent@omnigrc.co', password: 'password123' }, '127.0.0.1', 'Jest'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if operator account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_1',
        email: 'locked@omnigrc.co',
        lockedUntil,
        status: 'ACTIVE',
      });

      await expect(
        service.login({ email: 'locked@omnigrc.co', password: 'password123' }, '127.0.0.1', 'Jest'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should lock operator account after 5 consecutive failed login attempts', async () => {
      const passwordHash = await securityService.hashPassword('CorrectPassword123!');
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_1',
        email: 'op@omnigrc.co',
        passwordHash,
        failedLoginAttempts: 4,
        status: 'ACTIVE',
      });

      mockPrisma.operator.update.mockResolvedValue({});

      await expect(
        service.login({ email: 'op@omnigrc.co', password: 'WrongPassword!' }, '127.0.0.1', 'Jest'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.operator.update).toHaveBeenCalledWith({
        where: { id: 'op_1' },
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      });
    });

    it('should issue tokens on valid login without MFA', async () => {
      const passwordHash = await securityService.hashPassword('CorrectPassword123!');
      const mockOperator = {
        id: 'op_123',
        email: 'admin@omnigrc.co',
        passwordHash,
        fullName: 'Admin User',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      mockPrisma.operator.findUnique.mockResolvedValue(mockOperator);
      mockPrisma.operator.update.mockResolvedValue({});
      mockPrisma.operatorSession.create.mockResolvedValue({
        id: 'sess_123',
        familyId: 'fam_123',
        operatorId: 'op_123',
        ipAddress: '127.0.0.1',
      });

      const response = await service.login(
        { email: 'admin@omnigrc.co', password: 'CorrectPassword123!' },
        '127.0.0.1',
        'Jest',
      );

      expect(response.accessToken).toBeDefined();
      expect(response.refreshToken).toBeDefined();
      expect(response.operator.email).toEqual('admin@omnigrc.co');
      expect(response.operator.role).toEqual(OperatorRole.PLATFORM_SUPER_ADMIN);
    });

    it('should transparently upgrade legacy Bcrypt password hash to Argon2id upon successful login', async () => {
      const plainPassword = 'LegacyPassword123!';
      const legacyBcryptHash = await bcrypt.hash(plainPassword, 10);

      const mockOperator = {
        id: 'op_legacy_1',
        email: 'legacy@omnigrc.co',
        passwordHash: legacyBcryptHash,
        fullName: 'Legacy User',
        role: OperatorRole.SUPPORT_ENGINEER,
        status: 'ACTIVE',
        mfaEnabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      mockPrisma.operator.findUnique.mockResolvedValue(mockOperator);
      mockPrisma.operator.update.mockResolvedValue({});
      mockPrisma.operatorSession.create.mockResolvedValue({
        id: 'sess_legacy_1',
        familyId: 'fam_legacy_1',
        operatorId: 'op_legacy_1',
        ipAddress: '127.0.0.1',
      });

      const response = await service.login(
        { email: 'legacy@omnigrc.co', password: plainPassword },
        '127.0.0.1',
        'Jest',
      );

      expect(response.accessToken).toBeDefined();
      expect(mockPrisma.operator.update).toHaveBeenCalledWith({
        where: { id: 'op_legacy_1' },
        data: expect.objectContaining({
          failedLoginAttempts: 0,
          passwordHash: expect.stringMatching(/^\$argon2id\$/),
        }),
      });
    });
  });

  describe('refresh & reuse detection', () => {
    it('should trigger family revocation when a revoked refresh token is reused', async () => {
      const mockRevokedSession = {
        id: 'sess_old',
        familyId: 'fam_stolen',
        operatorId: 'op_123',
        isRevoked: true,
        operator: { id: 'op_123', role: OperatorRole.COMMERCIAL_OPERATOR },
      };

      mockPrisma.operatorSession.findFirst.mockResolvedValue(mockRevokedSession);
      mockPrisma.operatorSession.updateMany.mockResolvedValue({ count: 2 });

      await expect(
        service.refresh('stolen_refresh_token', '192.168.1.1', 'HackerBrowser'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.operatorSession.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam_stolen', isRevoked: false },
        data: { isRevoked: true },
      });

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OPERATOR_REFRESH_REUSE_DETECTED',
          result: 'DENIED',
        }),
      );
    });
  });
});
