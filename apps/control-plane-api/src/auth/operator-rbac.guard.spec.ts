import { OperatorRbacGuard } from './operator-rbac.guard';
import { Reflector } from '@nestjs/core';
import { OperatorRole } from '@prisma/control-plane-client';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('OperatorRbacGuard', () => {
  let guard: OperatorRbacGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OperatorRbacGuard(reflector);
  });

  const createMockContext = (operator: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          operator: {
            mfaEnabled: true,
            isMfaRestricted: false,
            ...operator,
          },
        }),
      }),
    } as any);

  it('should allow access if no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: OperatorRole.COMMERCIAL_OPERATOR, status: 'ACTIVE' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow PLATFORM_SUPER_ADMIN full access regardless of required role when MFA is verified', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.PLATFORM_SUPER_ADMIN, status: 'ACTIVE' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow matching role access when MFA is verified', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.COMMERCIAL_OPERATOR, status: 'ACTIVE' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should block even PLATFORM_SUPER_ADMIN if mfaEnabled is false', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.PLATFORM_SUPER_ADMIN, status: 'ACTIVE', mfaEnabled: false });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should block operator if isMfaRestricted is true', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.COMMERCIAL_OPERATOR, status: 'ACTIVE', isMfaRestricted: true });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject non-matching role access with ForbiddenException', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.OPERATIONS_ENGINEER, status: 'ACTIVE' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject suspended operator even with matching role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([OperatorRole.COMMERCIAL_OPERATOR]);
    const context = createMockContext({ role: OperatorRole.COMMERCIAL_OPERATOR, status: 'SUSPENDED' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
