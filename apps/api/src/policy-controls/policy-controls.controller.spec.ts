import { Test, TestingModule } from '@nestjs/testing';
import { PolicyControlsController } from './policy-controls.controller';
import { PolicyControlsService } from './policy-controls.service';
import { MappingStatus, Role } from '@omnigrc/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PolicyControlsController', () => {
  let controller: PolicyControlsController;
  let service: jest.Mocked<PolicyControlsService>;

  const mockAdminUser = {
    userId: 'user-admin',
    organizationId: 'org-tenant-1',
    role: Role.ADMIN,
  };

  const mockAuditorUser = {
    userId: 'user-auditor',
    organizationId: 'org-tenant-1',
    role: Role.EXTERNAL_AUDITOR,
  };

  beforeEach(async () => {
    const mockService = {
      getControlsForPolicy: jest.fn(),
      getPoliciesForControl: jest.fn(),
      associate: jest.fn(),
      updateMapping: jest.fn(),
      disassociate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PolicyControlsController],
      providers: [
        {
          provide: PolicyControlsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<PolicyControlsController>(PolicyControlsController);
    service = module.get(PolicyControlsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getControlsForPolicy', () => {
    it('should forward request with tenant context to service', async () => {
      service.getControlsForPolicy.mockResolvedValue({
        items: [
          {
            id: 'map-1',
            controlId: 'ctrl-1',
            controlName: 'Access Control',
            status: MappingStatus.APPROVED,
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const res = await controller.getControlsForPolicy(mockAdminUser, 'pol-1', { page: 1 });

      expect(res.items).toHaveLength(1);
      expect(service.getControlsForPolicy).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-tenant-1', role: Role.ADMIN }),
        'pol-1',
        { page: 1 },
      );
    });
  });

  describe('getPoliciesForControl', () => {
    it('should allow read access for external auditor with tenant scoping', async () => {
      service.getPoliciesForControl.mockResolvedValue({
        items: [
          {
            id: 'map-1',
            policyId: 'pol-1',
            policyCode: 'POL-01',
            policyTitle: 'Security Policy',
            policyCategory: 'Security',
            policyStatus: 'PUBLISHED' as any,
            policyOwnerId: 'ciso',
            status: MappingStatus.APPROVED,
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const res = await controller.getPoliciesForControl(mockAuditorUser, 'ctrl-1', {});

      expect(res.items).toHaveLength(1);
      expect(service.getPoliciesForControl).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-tenant-1', role: Role.EXTERNAL_AUDITOR }),
        'ctrl-1',
        {},
      );
    });
  });

  describe('associate', () => {
    it('should create mapping for authorized admin user', async () => {
      service.associate.mockResolvedValue({
        id: 'map-1',
        controlId: 'ctrl-1',
        controlName: 'MFA Enforcement',
        status: MappingStatus.APPROVED,
        rationale: 'Mandatory for all staff',
        createdAt: new Date(),
      });

      const res = await controller.associate(mockAdminUser, 'pol-1', 'ctrl-1', {
        status: MappingStatus.APPROVED,
        rationale: 'Mandatory for all staff',
      });

      expect(res.controlName).toBe('MFA Enforcement');
      expect(service.associate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-tenant-1' }),
        'pol-1',
        'ctrl-1',
        {
          status: MappingStatus.APPROVED,
          rationale: 'Mandatory for all staff',
        },
      );
    });
  });

  describe('updateMapping', () => {
    it('should update mapping status and rationale', async () => {
      service.updateMapping.mockResolvedValue({
        id: 'map-1',
        controlId: 'ctrl-1',
        controlName: 'MFA Enforcement',
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Compensating control in place',
        createdAt: new Date(),
      });

      const res = await controller.updateMapping(mockAdminUser, 'pol-1', 'ctrl-1', {
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Compensating control in place',
      });

      expect(res.status).toBe(MappingStatus.OVERRIDDEN);
      expect(service.updateMapping).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-tenant-1' }),
        'pol-1',
        'ctrl-1',
        {
          status: MappingStatus.OVERRIDDEN,
          rationale: 'Compensating control in place',
        },
      );
    });
  });

  describe('disassociate', () => {
    it('should delete mapping for authorized user', async () => {
      service.disassociate.mockResolvedValue({ success: true, unmappedId: 'map-1' });

      const res = await controller.disassociate(mockAdminUser, 'pol-1', 'ctrl-1');

      expect(res.success).toBe(true);
      expect(service.disassociate).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-tenant-1' }),
        'pol-1',
        'ctrl-1',
      );
    });
  });
});

