import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { OperatorSecurityService } from './operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OperatorLoginDto, BootstrapOperatorDto, OperatorAuthResponse } from './dto/operator-auth.dto';
import { OperatorRole } from '@prisma/control-plane-client';
import * as crypto from 'crypto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_EXPIRY_HOURS = 8;

@Injectable()
export class OperatorAuthService {
  private readonly logger = new Logger(OperatorAuthService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly securityService: OperatorSecurityService,
    private readonly jwtService: JwtService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
  ) {}

  async login(
    dto: OperatorLoginDto,
    ipAddress: string,
    userAgent: string,
    correlationId?: string,
  ): Promise<OperatorAuthResponse> {
    const sanitizedEmail = dto.email.trim().toLowerCase();
    const operator = await this.prisma.operator.findUnique({
      where: { email: sanitizedEmail },
    });

    if (!operator) {
      await this.auditLogsService.log({
        action: 'OPERATOR_LOGIN_FAILED',
        entityType: 'OPERATOR',
        entityId: 'UNKNOWN',
        ipAddress,
        correlationId,
        result: 'FAILURE',
        metadata: { email: sanitizedEmail, reason: 'Operator not found' },
      });
      throw new UnauthorizedException('Invalid operator credentials');
    }

    // Lockout check
    if (operator.lockedUntil && operator.lockedUntil > new Date()) {
      await this.auditLogsService.log({
        action: 'OPERATOR_LOGIN_LOCKED',
        entityType: 'OPERATOR',
        entityId: operator.id,
        actorId: operator.id,
        actorRole: operator.role,
        ipAddress,
        correlationId,
        result: 'DENIED',
        metadata: { lockedUntil: operator.lockedUntil },
      });
      throw new ForbiddenException(
        `Account is temporarily locked due to consecutive failed login attempts. Try again after ${operator.lockedUntil.toISOString()}`,
      );
    }

    // Password verification
    const isPasswordValid = await this.securityService.comparePassword(dto.password, operator.passwordHash);

    if (!isPasswordValid) {
      const attempts = operator.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await this.prisma.operator.update({
        where: { id: operator.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil,
        },
      });

      await this.auditLogsService.log({
        action: 'OPERATOR_LOGIN_FAILED',
        entityType: 'OPERATOR',
        entityId: operator.id,
        actorId: operator.id,
        actorRole: operator.role,
        ipAddress,
        correlationId,
        result: 'FAILURE',
        metadata: { attempts, locked: !!lockedUntil },
      });

      throw new UnauthorizedException('Invalid operator credentials');
    }

    // Status check
    if (operator.status === 'SUSPENDED') {
      await this.auditLogsService.log({
        action: 'OPERATOR_LOGIN_SUSPENDED',
        entityType: 'OPERATOR',
        entityId: operator.id,
        actorId: operator.id,
        actorRole: operator.role,
        ipAddress,
        correlationId,
        result: 'DENIED',
      });
      throw new ForbiddenException('Operator account is suspended');
    }

    // Mandatory MFA check
    if (operator.mfaEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('6-digit TOTP verification code is required for MFA-enabled accounts');
      }

      const isMfaValid = this.securityService.verifyTotpCode(operator.totpSecret || '', dto.totpCode);
      if (!isMfaValid) {
        await this.auditLogsService.log({
          action: 'OPERATOR_MFA_FAILED',
          entityType: 'OPERATOR',
          entityId: operator.id,
          actorId: operator.id,
          actorRole: operator.role,
          ipAddress,
          correlationId,
          result: 'FAILURE',
        });
        throw new UnauthorizedException('Invalid TOTP verification code');
      }
    }

    // Transparent hash upgrade from legacy Bcrypt to Argon2id upon successful authentication
    let updatedPasswordHash: string | undefined = undefined;
    if (operator.passwordHash.startsWith('$2b$') || operator.passwordHash.startsWith('$2a$')) {
      updatedPasswordHash = await this.securityService.hashPassword(dto.password);
      this.logger.log(`Transparently migrated password hash to Argon2id for operator ${operator.id}`);
    }

    // Transparent TOTP encryption upgrade for legacy plaintext secrets
    let updatedTotpSecret: string | undefined = undefined;
    if (operator.totpSecret && !operator.totpSecret.includes(':')) {
      updatedTotpSecret = this.securityService.encryptSecret(operator.totpSecret);
      this.logger.log(`Transparently encrypted legacy TOTP secret for operator ${operator.id}`);
    }

    // Reset lockout counters and persist transparent upgrades on success
    await this.prisma.operator.update({
      where: { id: operator.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(updatedPasswordHash ? { passwordHash: updatedPasswordHash } : {}),
        ...(updatedTotpSecret ? { totpSecret: updatedTotpSecret } : {}),
      },
    });

    // Create session family & tokens
    const familyId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this.securityService.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_HOURS * 60 * 60 * 1000);

    const session = await this.prisma.operatorSession.create({
      data: {
        operatorId: operator.id,
        refreshTokenHash,
        ipAddress: ipAddress || '127.0.0.1',
        userAgent: userAgent || 'Unknown',
        familyId,
        expiresAt,
      },
    });

    const accessToken = this.jwtService.sign({
      sub: operator.id,
      email: operator.email,
      role: operator.role,
      sessionId: session.id,
      type: 'OPERATOR_ACCESS',
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_LOGIN_SUCCESS',
      entityType: 'OPERATOR',
      entityId: operator.id,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
      metadata: { sessionId: session.id },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      operator: {
        id: operator.id,
        email: operator.email,
        fullName: operator.fullName,
        role: operator.role,
        status: operator.status,
        mfaEnabled: operator.mfaEnabled,
      },
    };
  }

  async refresh(
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
    correlationId?: string,
  ): Promise<OperatorAuthResponse> {
    const tokenHash = this.securityService.hashToken(refreshToken);

    return await this.prisma.$transaction(async (tx) => {
      const session = await tx.operatorSession.findFirst({
        where: { refreshTokenHash: tokenHash },
        include: { operator: true },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // REUSE DETECTION: If token was already revoked, revoke all active sessions in the family!
      if (session.isRevoked) {
        this.logger.warn(`SECURITY WARNING: Refresh token reuse detected for family ${session.familyId}`);
        await this.prisma.operatorSession.updateMany({
          where: { familyId: session.familyId, isRevoked: false },
          data: { isRevoked: true },
        });

        await this.auditLogsService.log({
          action: 'OPERATOR_REFRESH_REUSE_DETECTED',
          entityType: 'OPERATOR_SESSION',
          entityId: session.id,
          actorId: session.operatorId,
          actorRole: session.operator.role,
          ipAddress,
          correlationId,
          result: 'DENIED',
          metadata: { familyId: session.familyId },
        });

        throw new UnauthorizedException('Security violation: Refresh token family revoked due to reuse detection');
      }

      // Atomic revocation check to prevent concurrent race conditions
      const updateResult = await tx.operatorSession.updateMany({
        where: { id: session.id, isRevoked: false },
        data: { isRevoked: true },
      });

      if (updateResult.count === 0) {
        this.logger.warn(`SECURITY WARNING: Concurrent refresh race condition detected for session ${session.id}`);
        await tx.operatorSession.updateMany({
          where: { familyId: session.familyId, isRevoked: false },
          data: { isRevoked: true },
        });

        await this.auditLogsService.log({
          action: 'OPERATOR_REFRESH_REUSE_DETECTED',
          entityType: 'OPERATOR_SESSION',
          entityId: session.id,
          actorId: session.operatorId,
          actorRole: session.operator.role,
          ipAddress,
          correlationId,
          result: 'DENIED',
          metadata: { familyId: session.familyId, reason: 'Concurrent double refresh' },
        });

        throw new UnauthorizedException('Security violation: Refresh token family revoked due to reuse detection');
      }

      if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token has expired');
      }

      if (session.operator.status === 'SUSPENDED') {
        throw new ForbiddenException('Operator account is suspended');
      }

      // Soft CIDR drift check for auditing/security logging
      const hasSoftDrift = this.securityService.checkCidrSoftDrift(session.ipAddress, ipAddress);
      if (!hasSoftDrift) {
        this.logger.warn(
          `Session IP changed from ${session.ipAddress} to ${ipAddress} for operator ${session.operator.id}`,
        );
      }

      const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
      const newRefreshTokenHash = this.securityService.hashToken(newRawRefreshToken);
      const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_HOURS * 60 * 60 * 1000);

      const newSession = await tx.operatorSession.create({
        data: {
          operatorId: session.operatorId,
          refreshTokenHash: newRefreshTokenHash,
          ipAddress: ipAddress || session.ipAddress,
          userAgent: userAgent || session.userAgent,
          familyId: session.familyId,
          expiresAt: newExpiresAt,
        },
      });

      const accessToken = this.jwtService.sign({
        sub: session.operator.id,
        email: session.operator.email,
        role: session.operator.role,
        sessionId: newSession.id,
        type: 'OPERATOR_ACCESS',
      });

      await this.auditLogsService.log({
        action: 'OPERATOR_TOKEN_REFRESHED',
        entityType: 'OPERATOR_SESSION',
        entityId: newSession.id,
        actorId: session.operator.id,
        actorRole: session.operator.role,
        ipAddress,
        correlationId,
        result: 'SUCCESS',
      });

      return {
        accessToken,
        refreshToken: newRawRefreshToken,
        operator: {
          id: session.operator.id,
          email: session.operator.email,
          fullName: session.operator.fullName,
          role: session.operator.role,
          status: session.operator.status,
          mfaEnabled: session.operator.mfaEnabled,
        },
      };
    });
  }

  async logout(sessionId: string, operatorId: string, ipAddress?: string, correlationId?: string): Promise<void> {
    await this.prisma.operatorSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_LOGOUT',
      entityType: 'OPERATOR_SESSION',
      entityId: sessionId,
      actorId: operatorId,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
    });
  }

  async revokeAllOperatorSessions(operatorId: string, actorId?: string, ipAddress?: string): Promise<number> {
    const result = await this.prisma.operatorSession.updateMany({
      where: { operatorId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_ALL_SESSIONS_REVOKED',
      entityType: 'OPERATOR',
      entityId: operatorId,
      actorId: actorId || operatorId,
      ipAddress,
      result: 'SUCCESS',
      metadata: { revokedCount: result.count },
    });

    return result.count;
  }

  async setupMfa(operatorId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const operator = await this.prisma.operator.findUnique({ where: { id: operatorId } });
    if (!operator) throw new BadRequestException('Operator not found');

    const mfaData = this.securityService.generateTotpSecret(operator.email);
    const encryptedTotpSecret = this.securityService.encryptSecret(mfaData.secret);

    await this.prisma.operator.update({
      where: { id: operatorId },
      data: { totpSecret: encryptedTotpSecret },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_MFA_SETUP_INITIATED',
      entityType: 'OPERATOR',
      entityId: operatorId,
      actorId: operatorId,
      actorRole: operator.role,
      result: 'SUCCESS',
    });

    return mfaData;
  }

  async verifyAndEnableMfa(operatorId: string, totpCode: string): Promise<{ success: boolean }> {
    const operator = await this.prisma.operator.findUnique({ where: { id: operatorId } });
    if (!operator || !operator.totpSecret) {
      throw new BadRequestException('MFA setup has not been initiated for this account');
    }

    const isValid = this.securityService.verifyTotpCode(operator.totpSecret, totpCode);
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP verification code');
    }

    await this.prisma.operator.update({
      where: { id: operatorId },
      data: { mfaEnabled: true },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_MFA_ENABLED',
      entityType: 'OPERATOR',
      entityId: operatorId,
      actorId: operatorId,
      actorRole: operator.role,
      result: 'SUCCESS',
    });

    return { success: true };
  }

  async bootstrapOperator(
    dto: BootstrapOperatorDto,
    ipAddress?: string,
    correlationId?: string,
  ): Promise<OperatorAuthResponse> {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    if (isProduction && !process.env.CONTROL_PLANE_BOOTSTRAP_SECRET) {
      this.logger.error('CONTROL_PLANE_BOOTSTRAP_SECRET is required in production environments');
      throw new ForbiddenException('Bootstrap disabled: missing environment configuration');
    }

    const expectedSecret = process.env.CONTROL_PLANE_BOOTSTRAP_SECRET || 'arav-cp-dev-bootstrap-secret-2026';
    if (!dto.bootstrapSecret || dto.bootstrapSecret !== expectedSecret) {
      await this.auditLogsService.log({
        action: 'OPERATOR_BOOTSTRAP_FAILED',
        entityType: 'OPERATOR',
        entityId: 'BOOTSTRAP',
        ipAddress,
        correlationId,
        result: 'DENIED',
        metadata: { reason: 'Invalid bootstrap secret' },
      });
      throw new ForbiddenException('Invalid bootstrap secret');
    }

    const operatorCount = await this.prisma.operator.count();
    if (operatorCount > 0) {
      await this.auditLogsService.log({
        action: 'OPERATOR_BOOTSTRAP_DENIED',
        entityType: 'OPERATOR',
        entityId: 'BOOTSTRAP',
        ipAddress,
        correlationId,
        result: 'DENIED',
        metadata: { reason: 'Operator already exists' },
      });
      throw new ForbiddenException('Initial operator bootstrap is permanently disabled because an operator already exists');
    }

    const sanitizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.operator.findUnique({ where: { email: sanitizedEmail } });
    if (existing) {
      throw new BadRequestException('Operator with this email already exists');
    }

    const passwordHash = await this.securityService.hashPassword(dto.password);
    const operator = await this.prisma.operator.create({
      data: {
        email: sanitizedEmail,
        passwordHash,
        fullName: dto.fullName,
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
      },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_BOOTSTRAP_CREATED',
      entityType: 'OPERATOR',
      entityId: operator.id,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
    });

    // Auto-login bootstrapped admin
    const familyId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this.securityService.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_HOURS * 60 * 60 * 1000);

    const session = await this.prisma.operatorSession.create({
      data: {
        operatorId: operator.id,
        refreshTokenHash,
        ipAddress: ipAddress || '127.0.0.1',
        userAgent: 'Bootstrap CLI/API',
        familyId,
        expiresAt,
      },
    });

    const accessToken = this.jwtService.sign({
      sub: operator.id,
      email: operator.email,
      role: operator.role,
      sessionId: session.id,
      type: 'OPERATOR_ACCESS',
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      operator: {
        id: operator.id,
        email: operator.email,
        fullName: operator.fullName,
        role: operator.role,
        status: operator.status,
        mfaEnabled: operator.mfaEnabled,
      },
    };
  }
}
