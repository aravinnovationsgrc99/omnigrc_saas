import { Test, TestingModule } from '@nestjs/testing';
import { RisksController } from '../risks/risks.controller';
import { ControlsController } from '../controls/controls.controller';
import { RisksService } from '../risks/risks.service';
import { ControlsService } from '../controls/controls.service';
import { MappingQueueService } from '../controls/ai/mapping-queue.service';
import { RiskControlsService } from './risk-controls.service';
import { EvidenceService } from '../evidence/evidence.service';
import { BusinessAuditsService } from '../business-audits/business-audits.service';
import { Role, RiskControlMitigationType } from '@omnigrc/shared';
import { REQUIRE_CAPABILITY_KEY } from '../common/decorators/require-capability.decorator';
import { REQUIRES_ACTIVE_LICENSE_KEY } from '../common/decorators/requires-active-license.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Reflector } from '@nestjs/core';

describe('RiskControls Controllers Integration', () => {
  let risksController: RisksController;
  let controlsController: ControlsController;
  let riskControlsService: jest.Mocked<any>;
  let risksService: jest.Mocked<any>;
  let controlsService: jest.Mocked<any>;
  let mappingQueueService: jest.Mocked<any>;
  let evidenceService: jest.Mocked<any>;

  const mockUser = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    riskControlsService = {
      getControlsForRisk: jest.fn(),
      getRisksForControl: jest.fn(),
      associate: jest.fn(),
      disassociate: jest.fn(),
    };

    risksService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    controlsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    mappingQueueService = {
      enqueueJob: jest.fn(),
    };

    evidenceService = {
      getEvidenceForControl: jest.fn(),
      attachEvidence: jest.fn(),
      detachEvidence: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RisksController, ControlsController],
      providers: [
        { provide: RiskControlsService, useValue: riskControlsService },
        { provide: RisksService, useValue: risksService },
        { provide: ControlsService, useValue: controlsService },
        { provide: MappingQueueService, useValue: mappingQueueService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: BusinessAuditsService, useValue: { getTestsForControl: jest.fn(), createCheckItemForControl: jest.fn() } },
        Reflector,
      ],
    }).compile();

    risksController = module.get<RisksController>(RisksController);
    controlsController = module.get<ControlsController>(ControlsController);
  });

  describe('RisksController Association Routes', () => {
    it('getControls delegates to riskControlsService.getControlsForRisk', async () => {
      const mockResult = { items: [], total: 0, page: 1, limit: 50 };
      riskControlsService.getControlsForRisk.mockResolvedValue(mockResult);

      const result = await risksController.getControls(mockUser, 'risk-1', { page: 1, limit: 50 });

      expect(riskControlsService.getControlsForRisk).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'risk-1',
        { page: 1, limit: 50 },
      );
      expect(result).toBe(mockResult);
    });

    it('associateControl enforces dual capability metadata, active license, and delegates to service', async () => {
      const handler = risksController.associateControl;
      const capabilityMeta = Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler);
      const licenseMeta = Reflect.getMetadata(REQUIRES_ACTIVE_LICENSE_KEY, handler);
      const rolesMeta = Reflect.getMetadata(ROLES_KEY, handler);

      expect(capabilityMeta.capabilityCode).toEqual(['GRC_CORE_RISKS', 'GRC_CORE_CONTROLS']);
      expect(licenseMeta).toBe(true);
      expect(rolesMeta).toContain(Role.ADMIN);
      expect(rolesMeta).not.toContain(Role.EXTERNAL_AUDITOR);

      const mockAssoc = { id: 'rc-1', controlId: 'ctrl-1' };
      riskControlsService.associate.mockResolvedValue(mockAssoc);

      const result = await risksController.associateControl(mockUser, 'risk-1', {
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.PREVENTATIVE,
      });

      expect(riskControlsService.associate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'risk-1',
        'ctrl-1',
        expect.objectContaining({ controlId: 'ctrl-1' }),
      );
      expect(result).toBe(mockAssoc);
    });

    it('disassociateControl enforces dual capability metadata, active license, and delegates to service', async () => {
      const handler = risksController.disassociateControl;
      const capabilityMeta = Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler);
      const licenseMeta = Reflect.getMetadata(REQUIRES_ACTIVE_LICENSE_KEY, handler);

      expect(capabilityMeta.capabilityCode).toEqual(['GRC_CORE_RISKS', 'GRC_CORE_CONTROLS']);
      expect(licenseMeta).toBe(true);

      riskControlsService.disassociate.mockResolvedValue({ success: true });

      const result = await risksController.disassociateControl(mockUser, 'risk-1', 'ctrl-1');

      expect(riskControlsService.disassociate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'risk-1',
        'ctrl-1',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('ControlsController Association Routes', () => {
    it('getRisks delegates to riskControlsService.getRisksForControl', async () => {
      const mockResult = { items: [], total: 0, page: 1, limit: 50 };
      riskControlsService.getRisksForControl.mockResolvedValue(mockResult);

      const result = await controlsController.getRisks(mockUser, 'ctrl-1', { page: 1, limit: 50 });

      expect(riskControlsService.getRisksForControl).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'ctrl-1',
        { page: 1, limit: 50 },
      );
      expect(result).toBe(mockResult);
    });

    it('associateRisk enforces dual capability metadata, active license, and delegates to canonical service', async () => {
      const handler = controlsController.associateRisk;
      const capabilityMeta = Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler);
      const licenseMeta = Reflect.getMetadata(REQUIRES_ACTIVE_LICENSE_KEY, handler);

      expect(capabilityMeta.capabilityCode).toEqual(['GRC_CORE_CONTROLS', 'GRC_CORE_RISKS']);
      expect(licenseMeta).toBe(true);

      const mockAssoc = { id: 'rc-1', controlId: 'ctrl-1', riskId: 'risk-1' };
      riskControlsService.associate.mockResolvedValue(mockAssoc);

      const result = await controlsController.associateRisk(mockUser, 'ctrl-1', {
        riskId: 'risk-1',
      });

      expect(riskControlsService.associate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'risk-1',
        'ctrl-1',
        expect.objectContaining({ riskId: 'risk-1' }),
      );
      expect(result).toBe(mockAssoc);
    });

    it('disassociateRisk delegates to canonical service with riskId and controlId', async () => {
      riskControlsService.disassociate.mockResolvedValue({ success: true });

      const result = await controlsController.disassociateRisk(mockUser, 'ctrl-1', 'risk-1');

      expect(riskControlsService.disassociate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'risk-1',
        'ctrl-1',
      );
      expect(result.success).toBe(true);
    });
  });
});
