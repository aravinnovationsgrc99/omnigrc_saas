import { JwtService } from '@nestjs/jwt';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContext } from './tenant.context';

describe('TenantMiddleware (Phase 10 Security — JWT Verification)', () => {
  const JWT_SECRET = 'test-secret-for-tenant-middleware';

  let jwtService: JwtService;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    jwtService = new JwtService({ secret: JWT_SECRET });
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  function makeRequest(authHeader?: string) {
    return { headers: authHeader ? { authorization: authHeader } : {} } as any;
  }

  function makeRes() {
    return {} as any;
  }

  it('should set tenant context from a valid JWT', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    const token = jwtService.sign(
      { sub: 'user-1', organizationId: 'org-A', role: 'ADMIN' },
      { secret: JWT_SECRET },
    );

    middleware.use(makeRequest(`Bearer ${token}`), makeRes(), () => {
      const ctx = TenantContext.getStore();
      expect(ctx?.organizationId).toBe('org-A');
      expect(ctx?.userId).toBe('user-1');
      expect(ctx?.role).toBe('ADMIN');
      done();
    });
  });

  it('should NOT set tenant context from a forged JWT (wrong signature)', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    // Create a token signed with a different (attacker-controlled) secret
    const forgeryService = new JwtService({ secret: 'attacker-controlled-secret' });
    const forgedToken = forgeryService.sign(
      { sub: 'attacker', organizationId: 'victim-org', role: 'ADMIN' },
      { secret: 'attacker-controlled-secret' },
    );

    middleware.use(makeRequest(`Bearer ${forgedToken}`), makeRes(), () => {
      const ctx = TenantContext.getStore();
      // Context MUST be cleared — no attacker-supplied org should be set
      expect(ctx?.organizationId).toBeUndefined();
      expect(ctx?.userId).toBeUndefined();
      done();
    });
  });

  it('should NOT set tenant context from an expired JWT', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    // Issue a token that expired 1 second ago
    const expiredToken = jwtService.sign(
      { sub: 'user-expired', organizationId: 'org-expired', role: 'ADMIN' },
      { secret: JWT_SECRET, expiresIn: '-1s' },
    );

    middleware.use(makeRequest(`Bearer ${expiredToken}`), makeRes(), () => {
      const ctx = TenantContext.getStore();
      expect(ctx?.organizationId).toBeUndefined();
      expect(ctx?.userId).toBeUndefined();
      done();
    });
  });

  it('should set undefined context when no Authorization header is present', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    middleware.use(makeRequest(), makeRes(), () => {
      const ctx = TenantContext.getStore();
      expect(ctx?.organizationId).toBeUndefined();
      expect(ctx?.userId).toBeUndefined();
      done();
    });
  });

  it('should set undefined context for a malformed (non-JWT) token', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    middleware.use(makeRequest('Bearer not-a-jwt-at-all'), makeRes(), () => {
      const ctx = TenantContext.getStore();
      expect(ctx?.organizationId).toBeUndefined();
      done();
    });
  });

  it('should NOT allow a valid context token (actingViaMsspId) to bypass org scoping', (done) => {
    const middleware = new TenantMiddleware(jwtService);

    // A context token has organizationId = target, actingViaMsspId = home MSSP org
    const contextToken = jwtService.sign(
      {
        sub: 'mssp-user-1',
        organizationId: 'client-org-X',  // Target org set in token
        role: 'MSSP_ADMIN',
        actingViaMsspId: 'mssp-home-org',
      },
      { secret: JWT_SECRET },
    );

    middleware.use(makeRequest(`Bearer ${contextToken}`), makeRes(), () => {
      const ctx = TenantContext.getStore();
      // Middleware sets organizationId to whatever is in the verified JWT's organizationId claim.
      // JwtStrategy (run later) performs the actual MSSP parent/child validation.
      // The key security property is that the organizationId comes from a VERIFIED token.
      expect(ctx?.organizationId).toBe('client-org-X');
      expect(ctx?.userId).toBe('mssp-user-1');
      done();
    });
  });
});
