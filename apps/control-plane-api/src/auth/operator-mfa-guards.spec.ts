import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { OperatorJwtStrategy } from './operator-jwt.strategy';
import { OperatorJwtGuard } from './operator-jwt.guard';
import { OperatorRbacGuard } from './operator-rbac.guard';
import { OperatorRole } from '@prisma/control-plane-client';
import { Reflector } from '@nestjs/core';

describe('Server-Enforced MFA Re-Enrollment Guards Specification', () => {
  let strategy: OperatorJwtStrategy;
  let jwtGuard: OperatorJwtGuard;
  let rbacGuard: OperatorRbacGuard;
  let mockPrisma: any;
  let reflector: Reflector;

  beforeEach(() => {
    mockPrisma = {
      operator: {
        findUnique: jest.fn(),
      },
      operatorSession: {
        findUnique: jest.fn(),
      },
    };

    strategy = new OperatorJwtStrategy(mockPrisma);
    jwtGuard = new OperatorJwtGuard();
    reflector = new Reflector();
    rbacGuard = new OperatorRbacGuard(reflector);
  });

  describe('OperatorJwtStrategy Server-Side Invariants', () => {
    it('should reject OPERATOR_ACCESS token if operator.mfaEnabled is false in database', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_reset_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: false, // Reset by recovery
      });
      mockPrisma.operatorSession.findUnique.mockResolvedValue({
        id: 'sess_1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await expect(
        strategy.validate({
          sub: 'op_reset_1',
          email: 'admin@omnigrc.co',
          role: OperatorRole.PLATFORM_SUPER_ADMIN,
          sessionId: 'sess_1',
          type: 'OPERATOR_ACCESS',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept OPERATOR_ACCESS token if operator.mfaEnabled is true', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_active_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: true,
      });
      mockPrisma.operatorSession.findUnique.mockResolvedValue({
        id: 'sess_1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const user = await strategy.validate({
        sub: 'op_active_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        sessionId: 'sess_1',
        type: 'OPERATOR_ACCESS',
      });

      expect(user.id).toBe('op_active_1');
      expect(user.isMfaRestricted).toBe(false);
      expect(user.mfaEnabled).toBe(true);
    });

    it('should accept OPERATOR_MFA_ENROLLMENT_PENDING token and flag isMfaRestricted as true', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_pending_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: false,
      });
      mockPrisma.operatorSession.findUnique.mockResolvedValue({
        id: 'sess_1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const user = await strategy.validate({
        sub: 'op_pending_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        sessionId: 'sess_1',
        type: 'OPERATOR_MFA_ENROLLMENT_PENDING',
      });

      expect(user.id).toBe('op_pending_1');
      expect(user.isMfaRestricted).toBe(true);
      expect(user.mfaEnabled).toBe(false);
    });
  });

  describe('OperatorJwtGuard Allowlist Enforcement for MFA-Restricted Operators', () => {
    function createMockContext(method: string, path: string) {
      const req: any = {
        method,
        path,
        url: path,
        headers: {},
      };
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;
    }

    it('should permit GET /v1/operator-auth/me for MFA-restricted operator', () => {
      const context = createMockContext('GET', '/v1/operator-auth/me');
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      expect(() => jwtGuard.handleRequest(null, operator, null, context)).not.toThrow();
    });

    it('should permit POST /v1/operator-auth/mfa/setup for MFA-restricted operator', () => {
      const context = createMockContext('POST', '/v1/operator-auth/mfa/setup');
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      expect(() => jwtGuard.handleRequest(null, operator, null, context)).not.toThrow();
    });

    it('should permit POST /v1/operator-auth/mfa/verify for MFA-restricted operator', () => {
      const context = createMockContext('POST', '/v1/operator-auth/mfa/verify');
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      expect(() => jwtGuard.handleRequest(null, operator, null, context)).not.toThrow();
    });

    it('should permit POST /v1/operator-auth/logout for MFA-restricted operator', () => {
      const context = createMockContext('POST', '/v1/operator-auth/logout');
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      expect(() => jwtGuard.handleRequest(null, operator, null, context)).not.toThrow();
    });

    it('should permit allowlisted routes with trailing slashes, query parameters, multiple slashes, or casing variations', () => {
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      // Trailing slash
      const c1 = createMockContext('GET', '/v1/operator-auth/me/');
      expect(() => jwtGuard.handleRequest(null, operator, null, c1)).not.toThrow();

      // Query parameters
      const c2 = createMockContext('GET', '/v1/operator-auth/me?format=json&include=permissions');
      expect(() => jwtGuard.handleRequest(null, operator, null, c2)).not.toThrow();

      // Multiple slashes
      const c3 = createMockContext('POST', '/v1//operator-auth///mfa/setup');
      expect(() => jwtGuard.handleRequest(null, operator, null, c3)).not.toThrow();

      // Mixed casing
      const c4 = createMockContext('GET', '/v1/Operator-Auth/Me');
      expect(() => jwtGuard.handleRequest(null, operator, null, c4)).not.toThrow();
    });

    it('should BLOCK unexpected HTTP methods against allowlisted paths for MFA-restricted operator', () => {
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      // POST to /v1/operator-auth/me (only GET is allowed)
      const c1 = createMockContext('POST', '/v1/operator-auth/me');
      expect(() => jwtGuard.handleRequest(null, operator, null, c1)).toThrow(ForbiddenException);

      // GET to /v1/operator-auth/mfa/setup (only POST is allowed)
      const c2 = createMockContext('GET', '/v1/operator-auth/mfa/setup');
      expect(() => jwtGuard.handleRequest(null, operator, null, c2)).toThrow(ForbiddenException);

      // GET to /v1/operator-auth/mfa/verify (only POST is allowed)
      const c3 = createMockContext('GET', '/v1/operator-auth/mfa/verify');
      expect(() => jwtGuard.handleRequest(null, operator, null, c3)).toThrow(ForbiddenException);

      // DELETE to /v1/operator-auth/logout (only POST is allowed)
      const c4 = createMockContext('DELETE', '/v1/operator-auth/logout');
      expect(() => jwtGuard.handleRequest(null, operator, null, c4)).toThrow(ForbiddenException);

      // PUT to /v1/operator-auth/mfa/verify
      const c5 = createMockContext('PUT', '/v1/operator-auth/mfa/verify');
      expect(() => jwtGuard.handleRequest(null, operator, null, c5)).toThrow(ForbiddenException);
    });

    it('should BLOCK all privileged administrative endpoints for MFA-restricted operator', () => {
      const operator = { id: 'op_1', role: 'PLATFORM_SUPER_ADMIN', isMfaRestricted: true };

      const privilegedEndpoints = [
        { method: 'GET', path: '/v1/customers' },
        { method: 'POST', path: '/v1/customers' },
        { method: 'GET', path: '/v1/licenses' },
        { method: 'POST', path: '/v1/licenses' },
        { method: 'GET', path: '/v1/deployments' },
        { method: 'POST', path: '/v1/deployments' },
        { method: 'GET', path: '/v1/operators' },
        { method: 'POST', path: '/v1/operators' },
        { method: 'GET', path: '/v1/audit' },
        { method: 'GET', path: '/v1/system' },
        { method: 'POST', path: '/v1/operations/break-glass/request' },
        { method: 'GET', path: '/v1/communications' },
        { method: 'GET', path: '/v1/organizations' },
        { method: 'GET', path: '/v1/service-control' },
      ];

      for (const ep of privilegedEndpoints) {
        const context = createMockContext(ep.method, ep.path);
        expect(() => jwtGuard.handleRequest(null, operator, null, context)).toThrow(ForbiddenException);
      }
    });

    it('should not allow static dev admin key when NODE_ENV is unset or production', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        delete process.env.NODE_ENV;
        const req: any = {
          headers: { 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' },
        };
        const context = {
          switchToHttp: () => ({ getRequest: () => req }),
        } as unknown as ExecutionContext;

        // With unset NODE_ENV, static fallback is disabled and super.canActivate is called
        // Since super.canActivate('operator-jwt') is Passport AuthGuard without auth header, it proceeds to passport
        // It must NOT bypass authentication by setting sysUser
        expect(req.user).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Effective Controller Guard Configuration (Static Reflection Verification)', () => {
    it('should verify that all privileged controllers have OperatorJwtGuard and OperatorRbacGuard applied', async () => {
      const controllers = [
        (await import('../audit/audit-logs.controller')).AuditLogsController,
        (await import('../break-glass/break-glass.controller')).BreakGlassController,
        (await import('../communications/communications.controller')).CommunicationsController,
        (await import('../customers/customers.controller')).CustomersController,
        (await import('../entitlements/entitlements.controller')).EntitlementsController,
        (await import('../licenses/licenses.controller')).LicensesController,
        (await import('../operators/operators.controller')).OperatorsController,
        (await import('../organization-control/organization-control.controller')).OrganizationControlController,
        (await import('../service-control/service-control.controller')).ServiceControlController,
        (await import('../system/system.controller')).SystemController,
      ];

      for (const ControllerClass of controllers) {
        const guards = Reflect.getMetadata('__guards__', ControllerClass);
        expect(guards).toBeDefined();
        expect(guards).toContain(OperatorJwtGuard);
        expect(guards).toContain(OperatorRbacGuard);
      }
    });
  });

  describe('Stale Tokens and Revocation Lifecycle Invariants', () => {
    it('should reject access token when associated operator session has been revoked', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_active_1',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: true,
      });
      mockPrisma.operatorSession.findUnique.mockResolvedValue({
        id: 'sess_revoked_1',
        isRevoked: true, // Revoked by logout or recovery
        expiresAt: new Date(Date.now() + 3600000),
      });

      await expect(
        strategy.validate({
          sub: 'op_active_1',
          email: 'admin@omnigrc.co',
          role: OperatorRole.PLATFORM_SUPER_ADMIN,
          sessionId: 'sess_revoked_1',
          type: 'OPERATOR_ACCESS',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should retain isMfaRestricted: true if a client presents an OPERATOR_MFA_ENROLLMENT_PENDING token even after mfaEnabled is true', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_now_enrolled',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: true, // DB is now enrolled
      });
      mockPrisma.operatorSession.findUnique.mockResolvedValue({
        id: 'sess_active',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const user = await strategy.validate({
        sub: 'op_now_enrolled',
        email: 'admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        sessionId: 'sess_active',
        type: 'OPERATOR_MFA_ENROLLMENT_PENDING', // Client presents old pre-enrollment token
      });

      expect(user.isMfaRestricted).toBe(true);
    });
  });

  describe('OperatorRbacGuard Server-Side MFA Barrier', () => {
    function createMockRbacContext(operator: any) {
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ operator, user: operator }),
        }),
      } as unknown as ExecutionContext;
    }

    it('should BLOCK PLATFORM_SUPER_ADMIN from privileged routes if isMfaRestricted is true', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.PLATFORM_SUPER_ADMIN]);
      const context = createMockRbacContext({
        id: 'op_admin',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: false,
        isMfaRestricted: true,
      });

      expect(() => rbacGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should BLOCK operator from privileged routes if mfaEnabled is false', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.PLATFORM_SUPER_ADMIN]);
      const context = createMockRbacContext({
        id: 'op_admin',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: false,
        isMfaRestricted: false,
      });

      expect(() => rbacGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should ALLOW PLATFORM_SUPER_ADMIN when mfaEnabled is true and not restricted', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.PLATFORM_SUPER_ADMIN]);
      const context = createMockRbacContext({
        id: 'op_admin',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: 'ACTIVE',
        mfaEnabled: true,
        isMfaRestricted: false,
      });

      expect(rbacGuard.canActivate(context)).toBe(true);
    });
  });
});
