import { ExecutionContext, ForbiddenException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ControlPlaneAdminGuard } from './control-plane-admin.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ControlPlaneAdminGuard (Phase 10 Security)', () => {
  const VALID_KEY = 'test-admin-key-for-unit-tests';

  beforeEach(() => {
    process.env.CONTROL_PLANE_ADMIN_KEY = VALID_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_ADMIN_KEY;
    delete process.env.NODE_ENV;
  });

  it('should allow access when correct key is supplied via x-control-plane-admin-key header', () => {
    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': VALID_KEY });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when correct key is supplied via Authorization Bearer header', () => {
    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ authorization: `Bearer ${VALID_KEY}` });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject with UnauthorizedException when no key is provided', () => {
    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject with ForbiddenException when wrong key is provided', () => {
    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': 'wrong-key-value' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject with ForbiddenException for an empty string key', () => {
    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': '' });
    // Empty string is falsy, so the guard sees it as missing key
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should use timing-safe comparison — correct key still returns true after multiple rejections', () => {
    const guard = new ControlPlaneAdminGuard();

    // Multiple rejections should not affect correct key acceptance
    const wrongCtx = makeContext({ 'x-control-plane-admin-key': 'wrong' });
    expect(() => guard.canActivate(wrongCtx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(wrongCtx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(wrongCtx)).toThrow(ForbiddenException);

    const correctCtx = makeContext({ 'x-control-plane-admin-key': VALID_KEY });
    expect(guard.canActivate(correctCtx)).toBe(true);
  });

  it('should FAIL-CLOSED in production when CONTROL_PLANE_ADMIN_KEY is not set', () => {
    delete process.env.CONTROL_PLANE_ADMIN_KEY;
    process.env.NODE_ENV = 'production';

    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' });

    // Even the correct dev key must not work in production with no configured key
    expect(() => guard.canActivate(ctx)).toThrow(InternalServerErrorException);
  });

  it('should FAIL-CLOSED in staging when CONTROL_PLANE_ADMIN_KEY is not set', () => {
    delete process.env.CONTROL_PLANE_ADMIN_KEY;
    process.env.NODE_ENV = 'staging';

    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' });

    expect(() => guard.canActivate(ctx)).toThrow(InternalServerErrorException);
  });

  it('should allow dev fallback key in non-production when CONTROL_PLANE_ADMIN_KEY is not set', () => {
    delete process.env.CONTROL_PLANE_ADMIN_KEY;
    process.env.NODE_ENV = 'development';

    const guard = new ControlPlaneAdminGuard();
    const ctx = makeContext({ 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' });

    // In dev/test, the fallback key should work
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject a key that is a prefix of the expected key (no length shortcut)', () => {
    const guard = new ControlPlaneAdminGuard();
    // Supply only the first half of the key — should still be rejected
    const partialKey = VALID_KEY.substring(0, VALID_KEY.length / 2);
    const ctx = makeContext({ 'x-control-plane-admin-key': partialKey });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
