import { Test, TestingModule } from '@nestjs/testing';
import { ServiceControlSignalService } from './service-control-signal.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('ServiceControlSignalService (Data Plane Signal Receiver)', () => {
  let service: ServiceControlSignalService;
  let prisma: any;

  const m2mSecret = 'test-m2m-secret-key-1234567890';

  const mockPrisma = {
    organization: {
      findUnique: jest.fn(),
    },
    globalServiceStateProjection: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationServiceOverrideProjection: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    process.env.CONTROL_PLANE_M2M_SECRET = m2mSecret;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceControlSignalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ServiceControlSignalService>(ServiceControlSignalService);
    prisma = module.get(PrismaService);
  });

  describe('processGlobalServiceSignal', () => {
    it('should accept valid signed global state signal and update projection', async () => {
      const id = 'sig-1';
      const capabilityCode = 'AI_DOC_INTELLIGENCE';
      const targetState = 'DISABLED';
      const sequenceStr = '100';
      const timestamp = new Date().toISOString();
      const issuer = 'control-plane';

      const canonicalString = `id:${id}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
      const signature = crypto.createHmac('sha256', m2mSecret).update(canonicalString).digest('hex');

      mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue(null);
      mockPrisma.globalServiceStateProjection.create.mockResolvedValue({
        capabilityCode,
        state: targetState,
        sequence: 100n,
        receivedAt: new Date(),
      });

      const result = await service.processGlobalServiceSignal({
        id,
        capabilityCode,
        targetState: targetState as any,
        sequence: sequenceStr,
        timestamp,
        issuer,
        signature,
      });

      expect(result.status).toBe('ACCEPTED');
      expect(result.capabilityCode).toBe('AI_DOC_INTELLIGENCE');
      expect(result.state).toBe('DISABLED');
    });

    it('should reject signal with invalid HMAC signature', async () => {
      const timestamp = new Date().toISOString();

      await expect(
        service.processGlobalServiceSignal({
          id: 'sig-1',
          capabilityCode: 'AI_DOC_INTELLIGENCE',
          targetState: 'DISABLED' as any,
          sequence: '100',
          timestamp,
          issuer: 'control-plane',
          signature: 'invalid-signature-hex',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject signal with stale sequence', async () => {
      const id = 'sig-1';
      const capabilityCode = 'AI_DOC_INTELLIGENCE';
      const targetState = 'DISABLED';
      const sequenceStr = '50'; // Older than projected 100
      const timestamp = new Date().toISOString();
      const issuer = 'control-plane';

      const canonicalString = `id:${id}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
      const signature = crypto.createHmac('sha256', m2mSecret).update(canonicalString).digest('hex');

      mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({
        capabilityCode,
        state: 'AVAILABLE',
        sequence: 100n,
      });

      await expect(
        service.processGlobalServiceSignal({
          id,
          capabilityCode,
          targetState: targetState as any,
          sequence: sequenceStr,
          timestamp,
          issuer,
          signature,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('processOrgServiceOverrideSignal', () => {
    it('should accept valid signed org override signal and update projection', async () => {
      const id = 'sig-2';
      const organizationId = 'org-100';
      const capabilityCode = 'VENDOR_RISK';
      const targetState = 'DISABLED';
      const sequenceStr = '10';
      const timestamp = new Date().toISOString();
      const issuer = 'control-plane';

      const canonicalString = `id:${id}|organizationId:${organizationId}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
      const signature = crypto.createHmac('sha256', m2mSecret).update(canonicalString).digest('hex');

      mockPrisma.organization.findUnique.mockResolvedValue({ id: organizationId });
      mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);
      mockPrisma.organizationServiceOverrideProjection.create.mockResolvedValue({
        organizationId,
        capabilityCode,
        overrideState: targetState,
        sequence: 10n,
        reason: 'Org policy',
        receivedAt: new Date(),
      });

      const result = await service.processOrgServiceOverrideSignal({
        id,
        organizationId,
        capabilityCode,
        targetState,
        reason: 'Org policy',
        sequence: sequenceStr,
        timestamp,
        issuer,
        signature,
      });

      expect(result.status).toBe('ACCEPTED');
      expect(result.organizationId).toBe(organizationId);
      expect(result.state).toBe('DISABLED');
    });
  });
});
