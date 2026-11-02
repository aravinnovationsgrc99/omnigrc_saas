import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { VendorImportWizardModal } from '../src/components/vendors/vendor-import-wizard-modal';
import { DirectoryIntegrationSettingsCard } from '../src/components/settings/directory-integration-settings-card';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import {
  Role,
  VendorCriticality,
  VendorImportStatus,
  DirectoryProvider,
  DirectorySyncSchedule,
  DirectorySyncStatus,
} from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 5: Vendor Risk Automation & Active Directory Integration UI', () => {
  const mockAddToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      addToast: mockAddToast,
      showToast: mockAddToast,
      toasts: [],
      removeToast: jest.fn(),
    } as any);

    mockedUseAuth.mockReturnValue({
      user: { id: 'usr-admin-1', email: 'admin@omnigrc.io', role: Role.ADMIN },
      organization: { id: 'org-phase5-web', name: 'Phase 5 Web Tenant', isReadOnly: false },
      role: Role.ADMIN,
      token: 'mock-jwt-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  describe('VendorImportWizardModal Workflows', () => {
    it('should render step 1 with upload dropzone and formula injection security shield', () => {
      render(
        <VendorImportWizardModal
          isOpen={true}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );

      expect(screen.getByText('Vendor Import & Onboarding Wizard')).toBeInTheDocument();
      expect(screen.getByText('Formula Injection Shield Active:')).toBeInTheDocument();
      expect(screen.getByText(/Choose an Excel \(\.xlsx\) or CSV \(\.csv\) file/i)).toBeInTheDocument();
    });

    it('should parse file, advance to Step 2 AI column mapping, and display confidence badges', async () => {
      mockedApiRequest.mockResolvedValueOnce({
        fileName: 'vendors.xlsx',
        fileType: 'XLSX',
        headers: ['Company Name', 'Risk Tier', 'Internal Owner'],
        totalRows: 2,
        suggestedMapping: {
          'Company Name': 'name',
          'Risk Tier': 'criticality',
          'Internal Owner': 'owner',
        },
        confidenceScores: {
          'Company Name': 0.98,
          'Risk Tier': 0.88,
          'Internal Owner': 0.85,
        },
        rows: [
          { 'Company Name': 'Acme Cloud', 'Risk Tier': 'HIGH', 'Internal Owner': 'DevOps' },
          { 'Company Name': 'Beta Security', 'Risk Tier': 'LOW', 'Internal Owner': 'SecOps' },
        ],
        preview: {
          totalRows: 2,
          validRows: 2,
          invalidRows: 0,
          duplicateRows: 0,
          previewRows: [],
        },
      });

      render(
        <VendorImportWizardModal
          isOpen={true}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );

      // Simulate file selection
      const file = new File(['dummy'], 'vendors.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const input = screen.getByLabelText(/Browse File/i);
      fireEvent.change(input, { target: { files: [file] } });

      const continueBtn = screen.getByRole('button', { name: /Continue to Mapping/i });
      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(screen.getByText('AI-Assisted Column Mapping')).toBeInTheDocument();
      });

      expect(screen.getByText('Company Name')).toBeInTheDocument();
      expect(screen.getByText('98% Match')).toBeInTheDocument();
      expect(screen.getByText('88% Match')).toBeInTheDocument();
    });

    it('should advance to Step 3 Preview, show duplicate options, and execute bulk import', async () => {
      // Step 1 -> Step 2 Parse
      mockedApiRequest.mockResolvedValueOnce({
        fileName: 'vendors.csv',
        fileType: 'CSV',
        headers: ['Vendor Name', 'Tier'],
        totalRows: 2,
        suggestedMapping: { 'Vendor Name': 'name', 'Tier': 'criticality' },
        confidenceScores: { 'Vendor Name': 0.98, 'Tier': 0.88 },
        rows: [
          { 'Vendor Name': 'Acme Cloud', 'Tier': 'HIGH' },
          { 'Vendor Name': 'Beta Security', 'Tier': 'LOW' },
        ],
        preview: {
          totalRows: 2,
          validRows: 2,
          invalidRows: 0,
          duplicateRows: 1,
          previewRows: [
            {
              rowNumber: 2,
              rawData: { 'Vendor Name': 'Acme Cloud', 'Tier': 'HIGH' },
              mappedData: { name: 'Acme Cloud', criticality: VendorCriticality.HIGH, owner: 'Compliance Officer' },
              isValid: true,
              errors: [],
              isDuplicate: true,
              duplicateReason: 'Exact match with existing vendor "Acme Cloud".',
              existingVendorId: 'v-101',
            },
            {
              rowNumber: 3,
              rawData: { 'Vendor Name': 'Beta Security', 'Tier': 'LOW' },
              mappedData: { name: 'Beta Security', criticality: VendorCriticality.LOW, owner: 'Compliance Officer' },
              isValid: true,
              errors: [],
              isDuplicate: false,
            },
          ],
        },
      });

      // Step 2 -> Step 3 Preview Refresh
      mockedApiRequest.mockResolvedValueOnce({
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
        duplicateRows: 1,
        previewRows: [
          {
            rowNumber: 2,
            rawData: { 'Vendor Name': 'Acme Cloud', 'Tier': 'HIGH' },
            mappedData: { name: 'Acme Cloud', criticality: VendorCriticality.HIGH },
            isValid: true,
            errors: [],
            isDuplicate: true,
          },
        ],
      });

      // Step 3 -> Step 4 Execute
      mockedApiRequest.mockResolvedValueOnce({
        batchId: 'batch-test-uuid-99',
        totalRows: 2,
        importedCount: 1,
        updatedCount: 1,
        skippedCount: 0,
        errorCount: 0,
        status: VendorImportStatus.COMPLETED,
        errors: [],
      });

      const mockOnSuccess = jest.fn();

      render(
        <VendorImportWizardModal
          isOpen={true}
          onClose={jest.fn()}
          onSuccess={mockOnSuccess}
        />,
      );

      // Select file & parse
      const file = new File(['content'], 'vendors.csv', { type: 'text/csv' });
      const input = screen.getByLabelText(/Browse File/i);
      fireEvent.change(input, { target: { files: [file] } });
      fireEvent.click(screen.getByRole('button', { name: /Continue to Mapping/i }));

      await waitFor(() => {
        expect(screen.getByText('AI-Assisted Column Mapping')).toBeInTheDocument();
      });

      // Review preview button
      fireEvent.click(screen.getByRole('button', { name: /Review Preview/i }));

      await waitFor(() => {
        expect(screen.getByText('Duplicate Resolution Strategy:')).toBeInTheDocument();
        expect(screen.getByText('Skip Duplicates')).toBeInTheDocument();
        expect(screen.getByText('Update Existing')).toBeInTheDocument();
      });

      // Execute bulk import
      fireEvent.click(screen.getByRole('button', { name: /Execute Bulk Import/i }));

      await waitFor(() => {
        expect(screen.getByText('Vendor Import Processed Successfully')).toBeInTheDocument();
      });

      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  describe('DirectoryIntegrationSettingsCard Workflows', () => {
    const mockDirectoryConfig = {
      id: 'cfg-test-101',
      organizationId: 'org-phase5-web',
      provider: DirectoryProvider.ENTRA_ID,
      tenantId: '00001111-2222-3333-4444-555566667777',
      clientId: 'aaaa1111-bbbb-2222-cccc-333344445555',
      clientSecretMasked: '••••••••••••4321',
      domain: 'enterprise.onmicrosoft.com',
      enabled: true,
      defaultRole: Role.ANALYST,
      syncSchedule: DirectorySyncSchedule.HOURLY,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: DirectorySyncStatus.SUCCESS,
      lastSyncMessage: 'Sync completed: 5 created, 12 updated.',
      autoDeactivateUsers: true,
      deactivationThresholdPct: 20,
      groupMappings: [
        {
          id: 'gm-1',
          configId: 'cfg-test-101',
          organizationId: 'org-phase5-web',
          directoryGroupId: 'entra-grp-analysts',
          directoryGroupName: 'Entra GRC Analysts',
          targetRole: Role.ANALYST,
          priority: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should render configured directory settings with masked secret and group mappings', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockDirectoryConfig);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Entra ID / Active Directory Integration')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('00001111-2222-3333-4444-555566667777')).toBeInTheDocument();
      expect(screen.getByDisplayValue('aaaa1111-bbbb-2222-cccc-333344445555')).toBeInTheDocument();
      expect(screen.getByText('Entra GRC Analysts')).toBeInTheDocument();
      expect(screen.getByText('Zero-Plaintext Vault Storage:')).toBeInTheDocument();
    });

    it('should test connection diagnostics and display latency & discovered user counts', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockDirectoryConfig);
      mockedApiRequest.mockResolvedValueOnce({
        success: true,
        message: 'Successfully authenticated with Microsoft Entra ID via Microsoft Graph API v1.0.',
        tenantDetails: {
          tenantId: '00001111-2222-3333-4444-555566667777',
          displayName: 'Enterprise Production Tenant',
          defaultDomainName: 'enterprise.onmicrosoft.com',
        },
        discoveredUsersCount: 42,
        discoveredGroupsCount: 8,
        latencyMs: 38,
      });

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Test Connection/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/Successfully authenticated with Microsoft Entra ID/i)).toBeInTheDocument();
        expect(screen.getByText(/42 users, 8 groups discovered/i)).toBeInTheDocument();
      });
    });

    it('should display privilege escalation security warning when mapping group to ADMIN', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockDirectoryConfig);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Group Mapping/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Group Mapping/i }));

      expect(screen.getByText('Map Entra Group to Role')).toBeInTheDocument();

      // Change target role to ADMIN in the open modal
      const selects = screen.getAllByRole('combobox');
      const targetRoleSelect = selects[selects.length - 1]; // Modal's select is the last one rendered
      fireEvent.change(targetRoleSelect, { target: { value: Role.ADMIN } });

      expect(screen.getByText(/Privilege Escalation Warning:/i)).toBeInTheDocument();
      expect(screen.getByText(/Users synced from this directory group will receive full administrative access/i)).toBeInTheDocument();
    });

    it('should trigger manual directory sync and display sync result toast', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockDirectoryConfig);
      mockedApiRequest.mockResolvedValueOnce({
        id: 'sync-log-99',
        configId: 'cfg-test-101',
        organizationId: 'org-phase5-web',
        syncType: 'MANUAL',
        status: DirectorySyncStatus.SUCCESS,
        discoveredCount: 15,
        createdCount: 2,
        updatedCount: 12,
        deactivatedCount: 1,
        skippedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      mockedApiRequest.mockResolvedValueOnce(mockDirectoryConfig);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Sync Now/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.stringContaining('Directory synchronized: 2 created, 12 updated, 1 deactivated.'),
          'success',
        );
      });
    });
  });
});
