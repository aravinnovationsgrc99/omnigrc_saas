import { validateTestDatabaseTarget } from './e2e-safety-guard';

describe('E2E Test Safety Guard & Database Isolation Unit Suite', () => {
  it('1. should FAIL-CLOSED when database URL is missing', () => {
    const res = validateTestDatabaseTarget(undefined);
    expect(res.isSafe).toBe(false);
    expect(res.error).toMatch(/Missing database connection URL/i);
  });

  it('2. should FAIL-CLOSED in production environment', () => {
    const res = validateTestDatabaseTarget('postgresql://user:pass@localhost:5432/mydb', {
      nodeEnv: 'production',
    });
    expect(res.isSafe).toBe(false);
    expect(res.error).toMatch(/strictly blocked in production/i);
  });

  it('3. should FAIL-CLOSED in staging environment', () => {
    const res = validateTestDatabaseTarget('postgresql://user:pass@localhost:5432/mydb', {
      nodeEnv: 'staging',
    });
    expect(res.isSafe).toBe(false);
    expect(res.error).toMatch(/strictly blocked in production/i);
  });

  it('4. should PASS for local test database (localhost / 127.0.0.1)', () => {
    const res1 = validateTestDatabaseTarget('postgresql://postgres:pass@localhost:5432/testdb', {
      nodeEnv: 'test',
    });
    expect(res1.isSafe).toBe(true);
    expect(res1.isLocal).toBe(true);

    const res2 = validateTestDatabaseTarget('postgresql://postgres:pass@127.0.0.1:5432/testdb', {
      nodeEnv: 'test',
    });
    expect(res2.isSafe).toBe(true);
    expect(res2.isLocal).toBe(true);
  });

  it('5. should FAIL-CLOSED for remote database when remote test flag is missing', () => {
    const remoteUrl = 'postgresql://postgres.remote-proj:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const res = validateTestDatabaseTarget(remoteUrl, {
      nodeEnv: 'test',
      allowRemoteTestDb: false,
    });
    expect(res.isSafe).toBe(false);
    expect(res.error).toMatch(/Target database is remote/i);
  });

  it('6. should FAIL-CLOSED when remote target project does not match approved test reference', () => {
    const remoteUrl = 'postgresql://postgres.unapproved-proj:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const res = validateTestDatabaseTarget(remoteUrl, {
      nodeEnv: 'test',
      allowRemoteTestDb: true,
      approvedTestProjectRef: 'approved-test-ref',
    });
    expect(res.isSafe).toBe(false);
    expect(res.error).toMatch(/does not match approved test reference/i);
  });

  it('7. should PASS for approved remote test project when explicitly allowed', () => {
    const remoteUrl = 'postgresql://postgres.approved-test-ref:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    const res = validateTestDatabaseTarget(remoteUrl, {
      nodeEnv: 'test',
      allowRemoteTestDb: true,
      approvedTestProjectRef: 'approved-test-ref',
    });
    expect(res.isSafe).toBe(true);
    expect(res.targetIdentity).toBe('approved-test-ref');
  });
});
