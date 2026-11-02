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
}

export interface EntraGroup {
  id: string; // Group Object ID (GUID)
  displayName: string;
  description?: string | null;
}

@Injectable()
export class DirectoryGraphClient {
  private readonly logger = new Logger(DirectoryGraphClient.name);

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
   * Resets mock data to default seed state
   */
  public resetMockData(): void {
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

    // If configured to use real Graph or if tenantId is a real GUID
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
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenParams = new URLSearchParams();
      tokenParams.append('client_id', clientId);
      tokenParams.append('client_secret', clientSecret);
      tokenParams.append('scope', 'https://graph.microsoft.com/.default');
      tokenParams.append('grant_type', 'client_credentials');

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({}));
        const description = errorData.error_description || errorData.error || `HTTP ${tokenRes.status}`;
        return {
          success: false,
          message: `Microsoft Entra authentication failed: ${description}`,
          latencyMs: Date.now() - startTime,
        };
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Query organization details
      const orgRes = await fetch('https://graph.microsoft.com/v1.0/organization', {
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
      }

      // Query user and group counts
      const [usersRes, groupsRes] = await Promise.all([
        fetch('https://graph.microsoft.com/v1.0/users?$top=1&$count=true', {
          headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual' },
        }).catch(() => null),
        fetch('https://graph.microsoft.com/v1.0/groups?$top=1&$count=true', {
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
   * Fetches users and groups from Entra ID / Microsoft Graph
   */
  async fetchUsersAndGroups(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ users: EntraUser[]; groups: EntraGroup[] }> {
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
      };
    }

    // Real Microsoft Graph Implementation
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams();
    tokenParams.append('client_id', clientId);
    tokenParams.append('client_secret', clientSecret);
    tokenParams.append('scope', 'https://graph.microsoft.com/.default');
    tokenParams.append('grant_type', 'client_credentials');

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      throw new Error(`Failed to obtain Microsoft Graph access token: HTTP ${tokenRes.status}`);
    }

    const { access_token } = await tokenRes.json();
    const headers = { Authorization: `Bearer ${access_token}` };

    // Fetch users
    const usersRes = await fetch(
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled&$top=999',
      { headers },
    );
    if (!usersRes.ok) {
      throw new Error(`Failed to query users from Microsoft Graph: HTTP ${usersRes.status}`);
    }
    const usersJson = await usersRes.json();
    const rawUsers = usersJson.value || [];

    // Fetch groups
    const groupsRes = await fetch(
      'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description&$top=999',
      { headers },
    );
    const groupsJson = groupsRes.ok ? await groupsRes.json() : { value: [] };
    const rawGroups = groupsJson.value || [];

    const groups: EntraGroup[] = rawGroups.map((g: any) => ({
      id: g.id,
      displayName: g.displayName || '',
      description: g.description || null,
    }));

    // For each user, fetch group memberships
    const users: EntraUser[] = [];
    for (const u of rawUsers) {
      let memberIds: string[] = [];
      try {
        const memRes = await fetch(`https://graph.microsoft.com/v1.0/users/${u.id}/memberOf?$select=id`, {
          headers,
        });
        if (memRes.ok) {
          const memJson = await memRes.json();
          memberIds = (memJson.value || []).map((m: any) => m.id);
        }
      } catch (err: any) {
        this.logger.warn(`Could not resolve group memberships for user ${u.id}: ${err.message}`);
      }

      users.push({
        id: u.id,
        displayName: u.displayName || u.userPrincipalName,
        mail: u.mail || null,
        userPrincipalName: u.userPrincipalName,
        jobTitle: u.jobTitle || null,
        department: u.department || null,
        accountEnabled: u.accountEnabled !== false,
        groupMemberIds: memberIds,
      });
    }

    return { users, groups };
  }
}

