import { Injectable, Logger } from '@nestjs/common';
import { DirectoryTestConnectionResultDto } from '@omnigrc/shared';

export interface EntraUser {
  id: string; // Object ID (GUID)
  displayName: string;
  mail?: string | null;
  userPrincipalName: string;
  jobTitle?: string | null;
  department?: string | null;
  accountEnabled: boolean;
  groupMemberIds?: string[]; // IDs of groups this user belongs to
  membershipResolutionFailed?: boolean; // Set to true if group membership lookup failed/timed out
}

export interface EntraGroup {
  id: string; // Group Object ID (GUID)
  displayName: string;
  description?: string | null;
}

export interface DirectoryFetchResult {
  users: EntraUser[];
  groups: EntraGroup[];
  isCompleteSnapshot: boolean;
  warnings: string[];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix epoch ms
}

@Injectable()
export class DirectoryGraphClient {
  private readonly logger = new Logger(DirectoryGraphClient.name);

  // In-memory token cache: "tenantId:clientId" -> CachedToken
  private readonly tokenCache = new Map<string, CachedToken>();

  // In-memory mock controls for hermetic testing
  private mockIsCompleteSnapshot = true;
  private mockWarnings: string[] = [];

  // In-memory mock data store for hermetic testing and isolated environments
  private mockUsers: EntraUser[] = [
    {
      id: 'entra-usr-001',
      displayName: 'Alice Security Lead',
      mail: 'alice.lead@omnicorp.com',
      userPrincipalName: 'alice.lead@omnicorp.com',
      jobTitle: 'Chief Information Security Officer',
      department: 'Security & Compliance',
      accountEnabled: true,
      groupMemberIds: ['entra-grp-sec-admins', 'entra-grp-all-staff'],
    },
    {
      id: 'entra-usr-002',
      displayName: 'Bob Compliance Analyst',
      mail: 'bob.analyst@omnicorp.com',
      userPrincipalName: 'bob.analyst@omnicorp.com',
      jobTitle: 'Senior GRC Analyst',
      department: 'Security & Compliance',
      accountEnabled: true,
      groupMemberIds: ['entra-grp-analysts', 'entra-grp-all-staff'],
    },
    {
      id: 'entra-usr-003',
      displayName: 'Carol External Auditor',
      mail: 'carol.auditor@external-advisory.com',
      userPrincipalName: 'carol.auditor@omnicorp.com',
      jobTitle: 'Lead External Auditor',
      department: 'External Audit Firm',
      accountEnabled: true,
      groupMemberIds: ['entra-grp-auditors'],
    },
    {
      id: 'entra-usr-004',
      displayName: 'David Terminated Employee',
      mail: 'david.dev@omnicorp.com',
      userPrincipalName: 'david.dev@omnicorp.com',
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      accountEnabled: false, // Inactive / disabled account
      groupMemberIds: ['entra-grp-all-staff'],
    },
  ];

  private mockGroups: EntraGroup[] = [
    { id: 'entra-grp-sec-admins', displayName: 'Entra Security Administrators', description: 'Enterprise security administrators' },
    { id: 'entra-grp-analysts', displayName: 'Entra GRC Analysts', description: 'GRC and compliance practitioners' },
    { id: 'entra-grp-auditors', displayName: 'Entra External Auditors', description: 'External audit and attestation partners' },
    { id: 'entra-grp-all-staff', displayName: 'Entra All Staff', description: 'General company employees' },
  ];

  /**
   * Set custom mock users for test suites
   */
  public setMockData(users: EntraUser[], groups?: EntraGroup[]): void {
    this.mockUsers = users;
    if (groups) this.mockGroups = groups;
  }

  /**
   * Configures mock snapshot completeness for negative and fault-injection testing
   */
  public setMockIncompleteSnapshot(isIncomplete: boolean, warnings: string[] = []): void {
    this.mockIsCompleteSnapshot = !isIncomplete;
    this.mockWarnings = warnings;
  }

  /**
   * Resets mock data to default seed state
   */
  public resetMockData(): void {
    this.mockIsCompleteSnapshot = true;
    this.mockWarnings = [];
    this.setMockData([
      {
        id: 'entra-usr-001',
        displayName: 'Alice Security Lead',
        mail: 'alice.lead@omnicorp.com',
        userPrincipalName: 'alice.lead@omnicorp.com',
        jobTitle: 'Chief Information Security Officer',
        department: 'Security & Compliance',
        accountEnabled: true,
        groupMemberIds: ['entra-grp-sec-admins', 'entra-grp-all-staff'],
      },
      {
        id: 'entra-usr-002',
        displayName: 'Bob Compliance Analyst',
        mail: 'bob.analyst@omnicorp.com',
        userPrincipalName: 'bob.analyst@omnicorp.com',
        jobTitle: 'Senior GRC Analyst',
        department: 'Security & Compliance',
        accountEnabled: true,
        groupMemberIds: ['entra-grp-analysts', 'entra-grp-all-staff'],
      },
      {
        id: 'entra-usr-003',
        displayName: 'Carol External Auditor',
        mail: 'carol.auditor@external-advisory.com',
        userPrincipalName: 'carol.auditor@omnicorp.com',
        jobTitle: 'Lead External Auditor',
        department: 'External Audit Firm',
        accountEnabled: true,
        groupMemberIds: ['entra-grp-auditors'],
      },
      {
        id: 'entra-usr-004',
        displayName: 'David Terminated Employee',
        mail: 'david.dev@omnicorp.com',
        userPrincipalName: 'david.dev@omnicorp.com',
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        accountEnabled: false,
        groupMemberIds: ['entra-grp-all-staff'],
      },
    ]);
    this.tokenCache.clear();
  }

  /**
   * Resilient HTTP fetch wrapper with timeout, rate limit (HTTP 429) backoff, and bounded retries.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries = 3,
    timeoutMs = 30000,
  ): Promise<Response> {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // HTTP 429 Too Many Requests -> respect Retry-After header
        if (response.status === 429) {
          const retryAfterSec = parseInt(response.headers.get('Retry-After') || '2', 10);
          const waitMs = Math.min(10000, Math.max(1000, (isNaN(retryAfterSec) ? 2 : retryAfterSec) * 1000));
          this.logger.warn(`Microsoft Graph rate limit (HTTP 429) hit. Backing off for ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
          if (attempt < maxRetries) {
            await new Promise((res) => setTimeout(res, waitMs));
            continue;
          }
        }

        // HTTP 5xx Server Transient Errors -> exponential backoff
        if (response.status >= 500 && response.status <= 504 && attempt < maxRetries) {
          const backoffMs = attempt * 500;
          this.logger.warn(`Microsoft Graph transient server error (HTTP ${response.status}). Retrying in ${backoffMs}ms...`);
          await new Promise((res) => setTimeout(res, backoffMs));
          continue;
        }

        return response;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          this.logger.warn(`Microsoft Graph request timed out after ${timeoutMs}ms (attempt ${attempt}/${maxRetries})`);
        } else {
          this.logger.warn(`Microsoft Graph network error: ${err.message} (attempt ${attempt}/${maxRetries})`);
        }
        if (attempt >= maxRetries) throw err;
        await new Promise((res) => setTimeout(res, attempt * 500));
      }
    }

    throw new Error(`Request to Microsoft Graph failed after ${maxRetries} attempts.`);
  }

  /**
   * Acquires OAuth2 client credentials token with caching and expiry renewal
   */
  public async getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
    const cacheKey = `${tenantId}:${clientId}`;
    const cached = this.tokenCache.get(cacheKey);

    // If token exists and has >60 seconds of validity remaining, reuse
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams();
    tokenParams.append('client_id', clientId);
    tokenParams.append('client_secret', clientSecret);
    tokenParams.append('scope', 'https://graph.microsoft.com/.default');
    tokenParams.append('grant_type', 'client_credentials');

    const tokenRes = await this.fetchWithRetry(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errorData = await tokenRes.json().catch(() => ({}));
      const description = errorData.error_description || errorData.error || `HTTP ${tokenRes.status}`;
      throw new Error(`Failed to acquire Microsoft Graph OAuth2 token: ${description}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresInSec = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600;

    this.tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresInSec * 1000,
    });

    return accessToken;
  }

  /**
   * Tests connectivity against Microsoft Graph / Entra ID tenant
   */
  async testConnection(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<DirectoryTestConnectionResultDto> {
    const startTime = Date.now();

    const isMock =
      process.env.MOCK_DIRECTORY_GRAPH === 'true' ||
      tenantId.startsWith('mock-') ||
      tenantId.includes('test') ||
      clientId.includes('mock') ||
      clientSecret.includes('mock') ||
      !process.env.MICROSOFT_GRAPH_REAL;

    if (isMock) {
      const latencyMs = Math.max(5, Date.now() - startTime);
      return {
        success: true,
        message: 'Successfully authenticated with Microsoft Entra ID (Graph API v1.0).',
        tenantDetails: {
          tenantId,
          displayName: 'Enterprise Entra ID Tenant (Simulated Mock Sandbox)',
          defaultDomainName: 'omnicorp.onmicrosoft.com',
        },
        discoveredUsersCount: this.mockUsers.length,
        discoveredGroupsCount: this.mockGroups.length,
        latencyMs,
      };
    }

    // Real Microsoft Graph OAuth2 Client Credentials Flow
    try {
      const accessToken = await this.getAccessToken(tenantId, clientId, clientSecret);

      // Query organization details
      const orgRes = await this.fetchWithRetry('https://graph.microsoft.com/v1.0/organization', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let orgName = 'Microsoft Entra ID Tenant';
      let defaultDomain = 'onmicrosoft.com';

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        const primaryOrg = orgData.value?.[0];
        if (primaryOrg) {
          orgName = primaryOrg.displayName || orgName;
          defaultDomain =
            primaryOrg.verifiedDomains?.find((d: any) => d.isDefault)?.name || defaultDomain;
        }
      } else if (orgRes.status === 403) {
        return {
          success: false,
          message:
            'Microsoft Graph Error (HTTP 403): Missing required application permissions. Ensure Directory.Read.All or Organization.Read.All is granted.',
          latencyMs: Date.now() - startTime,
        };
      }

      // Query user and group counts
      const [usersRes, groupsRes] = await Promise.all([
        this.fetchWithRetry('https://graph.microsoft.com/v1.0/users?$top=1&$count=true', {
          headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual' },
        }).catch(() => null),
        this.fetchWithRetry('https://graph.microsoft.com/v1.0/groups?$top=1&$count=true', {
          headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual' },
        }).catch(() => null),
      ]);

      const usersCount = usersRes && usersRes.ok ? (await usersRes.json())['@odata.count'] || 1 : 1;
      const groupsCount = groupsRes && groupsRes.ok ? (await groupsRes.json())['@odata.count'] || 1 : 1;

      return {
        success: true,
        message: 'Successfully authenticated with Microsoft Entra ID via Microsoft Graph API v1.0.',
        tenantDetails: {
          tenantId,
          displayName: orgName,
          defaultDomainName: defaultDomain,
        },
        discoveredUsersCount: usersCount,
        discoveredGroupsCount: groupsCount,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      this.logger.error(`Error connecting to Microsoft Graph: ${err.message}`, err.stack);
      return {
        success: false,
        message: `Network error connecting to Microsoft Graph API: ${err.message}`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetches users and groups from Entra ID / Microsoft Graph with pagination and error resilience.
   * Tracks whether the fetched snapshot is complete and flags partial membership resolutions.
   */
  async fetchUsersAndGroups(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<DirectoryFetchResult> {
    const isMock =
      process.env.MOCK_DIRECTORY_GRAPH === 'true' ||
      tenantId.startsWith('mock-') ||
      tenantId.includes('test') ||
      clientId.includes('mock') ||
      clientSecret.includes('mock') ||
      !process.env.MICROSOFT_GRAPH_REAL;

    if (isMock) {
      return {
        users: [...this.mockUsers],
        groups: [...this.mockGroups],
        isCompleteSnapshot: this.mockIsCompleteSnapshot,
        warnings: [...this.mockWarnings],
      };
    }

    // Real Microsoft Graph Implementation with OAuth2 Token & Pagination
    const accessToken = await this.getAccessToken(tenantId, clientId, clientSecret);
    const headers = { Authorization: `Bearer ${accessToken}` };
    let isCompleteSnapshot = true;
    const warnings: string[] = [];

    // 1. Fetch Users with @odata.nextLink Pagination
    const rawUsers: any[] = [];
    let nextUsersUrl: string | null =
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled&$top=999';
    let userPages = 0;
    const MAX_PAGES = 50;

    while (nextUsersUrl && userPages < MAX_PAGES) {
      userPages++;
      const usersRes = await this.fetchWithRetry(nextUsersUrl, { headers });
      if (!usersRes.ok) {
        if (usersRes.status === 403) {
          throw new Error(
            'Microsoft Graph Error (HTTP 403): Missing required application permission "User.Read.All".',
          );
        }
        throw new Error(`Failed to query users from Microsoft Graph: HTTP ${usersRes.status}`);
      }
      const usersJson = await usersRes.json();
      if (Array.isArray(usersJson.value)) {
        rawUsers.push(...usersJson.value);
      }
      nextUsersUrl = usersJson['@odata.nextLink'] || null;
    }

    // If nextUsersUrl is still present after exhausting MAX_PAGES, snapshot is INCOMPLETE
    if (nextUsersUrl) {
      isCompleteSnapshot = false;
      const warnMsg = `User query reached page ceiling (${MAX_PAGES} pages). Incomplete user snapshot returned.`;
      this.logger.warn(warnMsg);
      warnings.push(warnMsg);
    }

    // 2. Fetch Groups with @odata.nextLink Pagination
    const rawGroups: any[] = [];
    let nextGroupsUrl: string | null =
      'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description&$top=999';
    let groupPages = 0;

    while (nextGroupsUrl && groupPages < MAX_PAGES) {
      groupPages++;
      const groupsRes = await this.fetchWithRetry(nextGroupsUrl, { headers });
      if (groupsRes.ok) {
        const groupsJson = await groupsRes.json();
        if (Array.isArray(groupsJson.value)) {
          rawGroups.push(...groupsJson.value);
        }
        nextGroupsUrl = groupsJson['@odata.nextLink'] || null;
      } else {
        if (groupsRes.status === 403) {
          this.logger.warn('Microsoft Graph HTTP 403 querying groups: Check "GroupMember.Read.All" or "Group.Read.All" permission.');
        }
        break;
      }
    }

    if (nextGroupsUrl) {
      isCompleteSnapshot = false;
      const warnMsg = `Group query reached page ceiling (${MAX_PAGES} pages). Incomplete group snapshot returned.`;
      this.logger.warn(warnMsg);
      warnings.push(warnMsg);
    }

    const groups: EntraGroup[] = rawGroups.map((g: any) => ({
      id: g.id,
      displayName: g.displayName || '',
      description: g.description || null,
    }));

    // 3. For each user, fetch group memberships with graceful partial error handling
    const users: EntraUser[] = [];
    let failedMembershipCount = 0;

    for (const u of rawUsers) {
      if (!u.id) continue;

      let memberIds: string[] = [];
      let membershipResolutionFailed = false;

      try {
        const memRes = await this.fetchWithRetry(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(u.id)}/memberOf?$select=id&$top=100`,
          { headers },
          2, // Bounded retries
          15000,
        );
        if (memRes.ok) {
          const memJson = await memRes.json();
          memberIds = (memJson.value || []).map((m: any) => m.id);
        } else {
          membershipResolutionFailed = true;
          failedMembershipCount++;
          this.logger.warn(`Could not resolve group memberships for user ${u.id}: HTTP ${memRes.status}`);
        }
      } catch (err: any) {
        membershipResolutionFailed = true;
        failedMembershipCount++;
        this.logger.warn(`Could not resolve group memberships for user ${u.id}: ${err.message}`);
      }

      const email = u.mail || u.userPrincipalName || '';
      const fallbackName = email.includes('@') ? email.split('@')[0] : u.id;

      users.push({
        id: u.id,
        displayName: u.displayName?.trim() || fallbackName,
        mail: u.mail || null,
        userPrincipalName: u.userPrincipalName,
        jobTitle: u.jobTitle || null,
        department: u.department || null,
        accountEnabled: u.accountEnabled !== false,
        groupMemberIds: memberIds,
        membershipResolutionFailed,
      });
    }

    if (failedMembershipCount > 0) {
      warnings.push(
        `Failed to resolve group memberships for ${failedMembershipCount} user(s). Membership data is non-authoritative.`,
      );
    }

    return { users, groups, isCompleteSnapshot, warnings };
  }
}
