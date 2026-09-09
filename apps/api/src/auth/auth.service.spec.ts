import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        createMany: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mocked-token'),
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

  it('should throw ConflictException if user email exists', async () => {
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

  it('should complete onboarding and log audit event', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      name: 'Admin',
    });
    prisma.organization.update.mockResolvedValue({ id: 'org-1', onboardingCompleted: true });

    const res = await service.completeOnboarding('user-1', {
      primaryFramework: 'ISO27001',
    });

    expect(res.success).toBe(true);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ONBOARDING_COMPLETED',
        organizationId: 'org-1',
      }),
    );
  });
});
