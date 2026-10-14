import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { EvidenceVaultController } from './evidence-vault.controller';
import { EvidenceVaultService } from './evidence-vault.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, EvidenceVaultQueryDto } from '@omnigrc/shared';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('EvidenceVaultController RBAC & Scoping Unit Suite', () => {
  let controller: EvidenceVaultController;
  let service: EvidenceVaultService;
  let reflector: Reflector;
  let rolesGuard: RolesGuard;

  const mockEvidenceVaultService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvidenceVaultController],
      providers: [
        Reflector,
        RolesGuard,
        {
          provide: EvidenceVaultService,
          useValue: mockEvidenceVaultService,
        },
      ],
    }).compile();

    controller = module.get<EvidenceVaultController>(EvidenceVaultController);
    service = module.get<EvidenceVaultService>(EvidenceVaultService);
    reflector = module.get<Reflector>(Reflector);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  function createMockExecutionContext(user?: { role?: string; organizationId?: string }): ExecutionContext {
    return {
      getHandler: () => EvidenceVaultController.prototype.getVaultItems,
      getClass: () => EvidenceVaultController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  describe('1. Role Allowlist Metadata', () => {
    it('should have explicit @Roles decorator on the controller class matching established allowlist', () => {
      const classRoles = reflector.get<Role[]>(ROLES_KEY, EvidenceVaultController);
      expect(classRoles).toBeDefined();
      expect(classRoles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.EXTERNAL_AUDITOR,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
    });

    it('should have explicit @Roles decorator on GET /evidence/vault handler', () => {
      const handlerRoles = reflector.get<Role[]>(ROLES_KEY, EvidenceVaultController.prototype.getVaultItems);
      expect(handlerRoles).toBeDefined();
      expect(handlerRoles).toEqual([
        Role.ADMIN,
        Role.ANALYST,
        Role.EXTERNAL_AUDITOR,
        Role.MSSP_ADMIN,
        Role.MSSP_ANALYST,
      ]);
    });
  });

  describe('2. RolesGuard Enforcement on GET /evidence/vault', () => {
    it('should permit Role.ADMIN', () => {
      const ctx = createMockExecutionContext({ role: Role.ADMIN, organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should permit Role.ANALYST', () => {
      const ctx = createMockExecutionContext({ role: Role.ANALYST, organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should permit Role.EXTERNAL_AUDITOR', () => {
      const ctx = createMockExecutionContext({ role: Role.EXTERNAL_AUDITOR, organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should permit Role.MSSP_ADMIN', () => {
      const ctx = createMockExecutionContext({ role: Role.MSSP_ADMIN, organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should permit Role.MSSP_ANALYST', () => {
      const ctx = createMockExecutionContext({ role: Role.MSSP_ANALYST, organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should REJECT an unauthorized / unlisted role', () => {
      const ctx = createMockExecutionContext({ role: 'UNAUTHORIZED_ROLE', organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctx)).toBe(false);
    });

    it('should REJECT when user is unauthenticated or has no role', () => {
      const ctxNoUser = createMockExecutionContext(undefined);
      expect(rolesGuard.canActivate(ctxNoUser)).toBe(false);

      const ctxNoRole = createMockExecutionContext({ organizationId: 'org-1' });
      expect(rolesGuard.canActivate(ctxNoRole)).toBe(false);
    });
  });

  describe('3. Execution & Tenant Scoping Delegation', () => {
    it('should delegate to EvidenceVaultService.findAll with the caller organizationId and query DTO', async () => {
      const expectedResult = { items: [], total: 0, page: 1, limit: 20 };
      mockEvidenceVaultService.findAll.mockResolvedValue(expectedResult);

      const query: EvidenceVaultQueryDto = { page: 1, limit: 20, domain: 'AUDIT' };
      const result = await controller.getVaultItems('org-tenant-42', query);

      expect(mockEvidenceVaultService.findAll).toHaveBeenCalledWith('org-tenant-42', query);
      expect(result).toBe(expectedResult);
    });
  });
});
