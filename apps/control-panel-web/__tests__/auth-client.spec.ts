import { setAuthTokens, getAccessToken, getRefreshToken, clearAuthTokens, ControlPlaneApiError } from '../src/lib/control-plane-api';

describe('Control Plane Frontend API Client & Token Security', () => {
  beforeEach(() => {
    clearAuthTokens();
  });

  it('1. should securely manage in-memory access and refresh tokens without persisting in localStorage/sessionStorage', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();

    setAuthTokens('test_access_jwt_123', 'test_refresh_token_456');

    expect(getAccessToken()).toBe('test_access_jwt_123');
    expect(getRefreshToken()).toBe('test_refresh_token_456');

    clearAuthTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('2. should format structured ControlPlaneApiError with status code, message, and correlation ID', () => {
    const error = new ControlPlaneApiError(
      403,
      'Access Denied by Arav Platform Authority',
      'FORBIDDEN_OPERATOR_ROLE',
      'cp_req_9999',
    );

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Access Denied by Arav Platform Authority');
    expect(error.code).toBe('FORBIDDEN_OPERATOR_ROLE');
    expect(error.correlationId).toBe('cp_req_9999');
  });
});
