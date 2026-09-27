import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationControlSignalService } from './organization-control-signal.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationControlStateEnum } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('OrganizationControlSignalService (Data Plane Receiver)', () => {
  let service: OrganizationControlSignalService;
  let prisma: PrismaService;

  const m2mSecret =
    process.env.CONTROL_PLANE_M2M_SECRET ||
    process.env.CONTROL_PLANE_PROVISIONING_SECRET ||
    'omnigrc-dev-control-plane-secret-change-in-prod';

  const mockPrisma = {
    organization: {
      findUnique: jest.fn(),
    },
    organizationControlStateProjection: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  function createValidSignal(params: {
    id?: string;
    organizationId?: string;
    targetState?: OrganizationControlStateEnum;
    sequence?: string;
    timestamp?: string;
    issuer?: string;
  }) {
    const id = params.id || 'sig_123';
    const organizationId = params.organizationId || 'org_test_1';
    const targetState = params.targetState || OrganizationControlStateEnum.ACTIVE;
    const sequence = params.sequence || '2';
    const timestamp = params.timestamp || new Date().toISOString();
    const issuer = params.issuer || 'arav-control-plane';

    const canonicalString = `id:${id}|organizationId:${organizationId}|targetState:${targetState}|sequence:${sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature = crypto
      .createHmac('sha256', m2mSecret)
      .update(canonicalString)
      .digest('hex');

    return {
      id,
      organizationId,
      targetState,
      sequence,
      timestamp,
      reason: 'Valid state change signal from control plane',
      issuer,
      signature,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationControlSignalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrganizationControlSignalService>(OrganizationControlSignalService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Signal Authentication & Signature Verification', () => {
    it('should accept signal with valid HMAC-SHA256 signature', async () => {
      const dto = createValidSignal({});
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_test_1' });
      mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue(null);
      mockPrisma.organizationControlStateProjection.create.mockResolvedValue({
        organizationId: 'org_test_1',
        state: OrganizationControlStateEnum.ACTIVE,
        sequence: 2n,
        receivedAt: new Date(),
      });

      const res = await service.processSignal(dto);
      expect(res.status).toBe('ACCEPTED');
      expect(res.state).toBe(OrganizationControlStateEnum.ACTIVE);
    });

    it('should reject signal with invalid HMAC signature', async () => {
      const dto = createValidSignal({});
      dto.signature = 'tampered_bad_signature_hash_123';

      await expect(service.processSignal(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Timestamp Freshness & Replay Protection', () => {
    it('should reject stale signal with timestamp older than 5 minutes', async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago
      const dto = createValidSignal({ timestamp: oldTime });

      await expect(service.processSignal(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Monotonic Sequence Enforcement', () => {
    it('should reject incoming signal with sequence <= projected sequence', async () => {
      const dto = createValidSignal({ sequence: '2' });
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_test_1' });
      mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({
        organizationId: 'org_test_1',
        state: OrganizationControlStateEnum.DISABLED,
        sequence: 5n, // Current projection sequence is 5 (newer than incoming sequence 2)
      });

      await expect(service.processSignal(dto)).rejects.toThrow(ConflictException);
    });

    it('should accept incoming signal with sequence > projected sequence', async () => {
      const dto = createValidSignal({ sequence: '6', targetState: OrganizationControlStateEnum.ACTIVE });
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_test_1' });
      mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({
        organizationId: 'org_test_1',
        state: OrganizationControlStateEnum.DISABLED,
        sequence: 5n,
      });

      mockPrisma.organizationControlStateProjection.update.mockResolvedValue({
        organizationId: 'org_test_1',
        state: OrganizationControlStateEnum.ACTIVE,
        sequence: 6n,
        receivedAt: new Date(),
      });

      const res = await service.processSignal(dto);
      expect(res.status).toBe('ACCEPTED');
      expect(res.state).toBe(OrganizationControlStateEnum.ACTIVE);
    });

    it('should reject out-of-order sequence 6 signal arriving after sequence 7 disabled state', async () => {
      // Simulate current projection is sequence 7 DISABLED
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_test_1' });
      mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({
        organizationId: 'org_test_1',
        state: OrganizationControlStateEnum.DISABLED,
        sequence: 7n,
      });

      // Incoming delayed sequence 6 ACTIVE signal
      const delayedSignal = createValidSignal({
        sequence: '6',
        targetState: OrganizationControlStateEnum.ACTIVE,
      });

      await expect(service.processSignal(delayedSignal)).rejects.toThrow(ConflictException);

      // Verify projection was NOT updated
      expect(mockPrisma.organizationControlStateProjection.update).not.toHaveBeenCalled();
    });
  });
});
