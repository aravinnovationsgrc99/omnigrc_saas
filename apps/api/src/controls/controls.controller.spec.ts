import { Test, TestingModule } from '@nestjs/testing';
import { ControlsController } from './controls.controller';
import { ControlsService } from './controls.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { RiskControlsService } from '../risk-controls/risk-controls.service';
import { EvidenceService } from '../evidence/evidence.service';
import { BusinessAuditsService } from '../business-audits/business-audits.service';
import { Role } from '@omnigrc/shared';
import { REQUIRE_CAPABILITY_KEY } from '../common/decorators/require-capability.decorator';
import { REQUIRES_ACTIVE_LICENSE_KEY } from '../common/decorators/requires-active-license.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';

describe('ControlsController Evidence Association Integration', () => {
  let controller: ControlsController;
  let controlsService: jest.Mocked<any>;
  let mappingQueueService: jest.Mocked<any>;
  let riskControlsService: jest.Mocked<any>;
  let evidenceService: jest.Mocked<any>;
  let businessAuditsService: jest.Mocked<any>;
  let reflector: Reflector;

  const mockUser = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    controlsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };
    mappingQueueService = {
      enqueueMappingJob: jest.fn(),
      getJobState: jest.fn(),
    };
    riskControlsService = {
      getRisksForControl: jest.fn(),
      associate: jest.fn(),
      disassociate: jest.fn(),
    };
    evidenceService = {
      getEvidenceForControl: jest.fn(),
      attachEvidence: jest.fn(),
      detachEvidence: jest.fn(),
    };
    businessAuditsService = {
      getTestsForControl: jest.fn(),
      createCheckItemForControl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControlsController],
      providers: [
        { provide: ControlsService, useValue: controlsService },
        { provide: MappingQueueService, useValue: mappingQueueService },
        { provide: RiskControlsService, useValue: riskControlsService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: BusinessAuditsService, useValue: businessAuditsService },
        Reflector,
      ],
    }).compile();

    controller = module.get<ControlsController>(ControlsController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Metadata and Guards', () => {
    it('class has GRC_CORE_CONTROLS capability and established role allowlist', () => {
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, ControlsController);
      const roles = reflector.get(ROLES_KEY, ControlsController);

      expect(capability.capabilityCode).toEqual('GRC_CORE_CONTROLS');
      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.EXTERNAL_AUDITOR,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
    });

    it('getEvidence endpoint allows EXTERNAL_AUDITOR and inherits class capability for historical reads', () => {
      const handler = controller.getEvidence;
      const roles = reflector.get(ROLES_KEY, handler);
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, handler);

      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.EXTERNAL_AUDITOR,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
      // Should not require EVIDENCE_VAULT on read, preserving historical read access
      expect(capability).toBeUndefined();
    });

    it('attachEvidence requires dual capabilities and active license', () => {
      const handler = controller.attachEvidence;
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, handler);
      const license = reflector.get(REQUIRES_ACTIVE_LICENSE_KEY, handler);
      const roles = reflector.get(ROLES_KEY, handler);

      expect(capability.capabilityCode).toEqual(['GRC_CORE_CONTROLS', 'EVIDENCE_VAULT']);
      expect(license).toBe(true);
      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
      expect(roles).not.toContain(Role.EXTERNAL_AUDITOR);
    });

    it('detachEvidence requires dual capabilities and active license', () => {
      const handler = controller.detachEvidence;
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, handler);
      const license = reflector.get(REQUIRES_ACTIVE_LICENSE_KEY, handler);
      const roles = reflector.get(ROLES_KEY, handler);

      expect(capability.capabilityCode).toEqual(['GRC_CORE_CONTROLS', 'EVIDENCE_VAULT']);
      expect(license).toBe(true);
      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
      expect(roles).not.toContain(Role.EXTERNAL_AUDITOR);
    });

    it('getTests endpoint allows EXTERNAL_AUDITOR and inherits class capability for historical reads', () => {
      const handler = controller.getTests;
      const roles = reflector.get(ROLES_KEY, handler);
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, handler);
      const license = reflector.get(REQUIRES_ACTIVE_LICENSE_KEY, handler);

      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.EXTERNAL_AUDITOR,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
      // Should not require dual capability on read, preserving historical read access
      expect(capability).toBeUndefined();
      // Should not require active license for historical reads
      expect(license).toBeUndefined();
    });

    it('createTest requires dual capabilities (GRC_CORE_CONTROLS + BUSINESS_AUDITS) and active license', () => {
      const handler = controller.createTest;
      const capability = reflector.get(REQUIRE_CAPABILITY_KEY, handler);
      const license = reflector.get(REQUIRES_ACTIVE_LICENSE_KEY, handler);
      const roles = reflector.get(ROLES_KEY, handler);

      expect(capability.capabilityCode).toEqual(['GRC_CORE_CONTROLS', 'BUSINESS_AUDITS']);
      expect(license).toBe(true);
      expect(roles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
      expect(roles).not.toContain(Role.EXTERNAL_AUDITOR);
    });
  });

  describe('Route Execution & Service Delegation', () => {
    it('getEvidence delegates to evidenceService.getEvidenceForControl with scoped authCtx', async () => {
      const mockResult = { items: [], total: 0, page: 1, limit: 20 };
      evidenceService.getEvidenceForControl.mockResolvedValue(mockResult);

      const result = await controller.getEvidence(mockUser, 'ctrl-1', { page: 1, limit: 20 });

      expect(evidenceService.getEvidenceForControl).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1', role: Role.ADMIN }),
        'ctrl-1',
        { page: 1, limit: 20 },
      );
      expect(result).toBe(mockResult);
    });

    it('attachEvidence validates evidenceId and delegates to evidenceService.attachEvidence', async () => {
      const mockResult = { id: 'ev-1', title: 'Audit Proof' };
      evidenceService.attachEvidence.mockResolvedValue(mockResult);

      const result = await controller.attachEvidence(mockUser, 'ctrl-1', { evidenceId: 'ev-1' });

      expect(evidenceService.attachEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
        'ev-1',
        'CONTROL',
        'ctrl-1',
      );
      expect(result).toBe(mockResult);
    });

    it('attachEvidence throws BadRequestException when evidenceId is missing', async () => {
      await expect(
        controller.attachEvidence(mockUser, 'ctrl-1', { evidenceId: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('detachEvidence delegates to evidenceService.detachEvidence with controlId and evidenceId', async () => {
      const mockResult = { id: 'ev-1', title: 'Audit Proof' };
      evidenceService.detachEvidence.mockResolvedValue(mockResult);

      const result = await controller.detachEvidence(mockUser, 'ctrl-1', 'ev-1');

      expect(evidenceService.detachEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
        'ev-1',
        'CONTROL',
        'ctrl-1',
      );
      expect(result).toBe(mockResult);
    });

    it('getTests delegates to businessAuditsService.getTestsForControl with scoped authCtx', async () => {
      const mockResult = { items: [], total: 0, page: 1, limit: 20 };
      businessAuditsService.getTestsForControl.mockResolvedValue(mockResult);

      const result = await controller.getTests(mockUser, 'ctrl-1', { page: 1, limit: 20 });

      expect(businessAuditsService.getTestsForControl).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1', role: Role.ADMIN }),
        'ctrl-1',
        { page: 1, limit: 20 },
      );
      expect(result).toBe(mockResult);
    });

    it('createTest delegates to businessAuditsService.createCheckItemForControl with scoped authCtx', async () => {
      const mockDto = { assessmentId: 'assess-1', title: 'Evaluate Control' };
      const mockResult = { id: 'ci-1', title: 'Evaluate Control' };
      businessAuditsService.createCheckItemForControl.mockResolvedValue(mockResult);

      const result = await controller.createTest(mockUser, 'ctrl-1', mockDto as any);

      expect(businessAuditsService.createCheckItemForControl).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1', role: Role.ADMIN }),
        'ctrl-1',
        mockDto,
      );
      expect(result).toBe(mockResult);
    });
  });
});
