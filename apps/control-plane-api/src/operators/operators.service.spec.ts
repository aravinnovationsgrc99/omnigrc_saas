import { OperatorsService } from './operators.service';
import { OperatorSecurityService } from '../auth/operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OperatorAuthService } from '../auth/operator-auth.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';

describe('OperatorsService', () => {
  let service: OperatorsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      operator: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue(true) } as any;
    const mockSecurity = new OperatorSecurityService();
    const mockAuth = { revokeAllOperatorSessions: jest.fn().mockResolvedValue(1) } as any;

    service = new OperatorsService(mockPrisma as any, mockSecurity, mockAudit, mockAuth);
  });

  describe('updateRole & Anti-Self-Escalation', () => {
    it('should throw ForbiddenException if an operator attempts to modify their own role', async () => {
      const actor = { id: 'op_admin_1', role: OperatorRole.PLATFORM_SUPER_ADMIN };

      try {
        await service.updateRole('op_admin_1', { role: OperatorRole.COMMERCIAL_OPERATOR }, actor);
        fail('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toContain('Anti-self-escalation policy violation');
      }
    });

    it('should throw ForbiddenException if a non-super-admin attempts to assign PLATFORM_SUPER_ADMIN', async () => {
      const actor = { id: 'op_comm_1', role: OperatorRole.COMMERCIAL_OPERATOR };

      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'target_op',
        role: OperatorRole.COMMERCIAL_OPERATOR,
      });

      try {
        await service.updateRole('target_op', { role: OperatorRole.PLATFORM_SUPER_ADMIN }, actor);
        fail('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
      }
    });

    it('should allow PLATFORM_SUPER_ADMIN to update another operator role', async () => {
      const actor = { id: 'super_admin_1', role: OperatorRole.PLATFORM_SUPER_ADMIN };

      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'target_op',
        email: 'user@omnigrc.co',
        role: OperatorRole.COMMERCIAL_OPERATOR,
      });

      mockPrisma.operator.update.mockResolvedValue({
        id: 'target_op',
        role: OperatorRole.OPERATIONS_ENGINEER,
      });

      const result = await service.updateRole('target_op', { role: OperatorRole.OPERATIONS_ENGINEER }, actor);
      expect(result.role).toEqual(OperatorRole.OPERATIONS_ENGINEER);
    });
  });
});
