import { Test, TestingModule } from '@nestjs/testing';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementStatus } from '@omnigrc/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('FrameworkEntitlementsService', () => {
  let service: FrameworkEntitlementsService;
  let prisma: any;

  const mockPrismaService = {
    organizationFrameworkEntitlement: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    framework: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FrameworkEntitlementsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('isEffectivelyActive', () => {
    it('should return true for ACTIVE status with no expiration', () => {
      const active = { status: EntitlementStatus.ACTIVE, expiresAt: null };
      expect(service.isEffectivelyActive(active)).toBe(true);
    });

    it('should return false for ACTIVE status with past expiration timestamp', () => {
      const expired = {
        status: EntitlementStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      };
      expect(service.isEffectivelyActive(expired)).toBe(false);
    });

    it('should return false for SUSPENDED or REVOKED status', () => {
      expect(service.isEffectivelyActive({ status: EntitlementStatus.SUSPENDED })).toBe(false);
      expect(service.isEffectivelyActive({ status: EntitlementStatus.REVOKED })).toBe(false);
      expect(service.isEffectivelyActive({ status: EntitlementStatus.DRAFT })).toBe(false);
    });
  });

  describe('assertEntitled', () => {
    it('should throw ForbiddenException if organization is not entitled to framework', async () => {
      prisma.framework.findFirst.mockResolvedValue({ id: 'fw-iso27001', code: 'ISO27001', name: 'ISO 27001' });
      prisma.organizationFrameworkEntitlement.findMany.mockResolvedValue([
        { frameworkId: 'fw-soc2', status: EntitlementStatus.ACTIVE, expiresAt: null },
      ]);

      await expect(service.assertEntitled('org-1', 'ISO27001')).rejects.toThrow(ForbiddenException);
    });

    it('should pass if organization has active entitlement for framework', async () => {
      prisma.framework.findFirst.mockResolvedValue({ id: 'fw-iso27001', code: 'ISO27001', name: 'ISO 27001' });
      prisma.organizationFrameworkEntitlement.findMany.mockResolvedValue([
        { frameworkId: 'fw-iso27001', status: EntitlementStatus.ACTIVE, expiresAt: null },
      ]);

      await expect(service.assertEntitled('org-1', 'ISO27001')).resolves.not.toThrow();
    });

    it('should throw NotFoundException if framework code is unknown', async () => {
      prisma.framework.findFirst.mockResolvedValue(null);
      await expect(service.assertEntitled('org-1', 'UNKNOWN_FW')).rejects.toThrow(NotFoundException);
    });
  });
});
