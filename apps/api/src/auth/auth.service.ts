import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto, Role, PodRegion, PodStatus, AuthResponseDto } from '@omnigrc/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
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
            email: dto.email,
            passwordHash,
            role: Role.ADMIN,
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
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: organization.id,
        name: organization.name,
        primaryRegion: organization.primaryRegion,
        createdAt: organization.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        primaryRegion: user.organization.primaryRegion,
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
        createdAt: user.createdAt.toISOString(),
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        primaryRegion: user.organization.primaryRegion,
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
