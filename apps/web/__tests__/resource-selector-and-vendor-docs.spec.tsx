import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { VendorListView } from '../src/components/vendors/vendor-list-view';
import { EvidenceVaultView } from '../src/components/evidence/evidence-vault-view';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import { Role, VendorCriticality, VendorStatus, EvidenceStatus, EvidenceScanStatus } from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 1 Frontend UI: Evidence Resource Selector & Vendor Documents', () => {
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
      user: { id: 'u-1', email: 'auditor@test.com', role: Role.ADMIN },
      organization: { id: 'org-1', name: 'Alpha Tenant' },
      role: Role.ADMIN,
      token: 'jwt-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  describe('VendorListView - Document Attachments Flow', () => {
    const mockVendors = [
      {
        id: 'ven-aws-1',
        name: 'Amazon Web Services',
        category: 'Cloud Infrastructure',
        criticality: VendorCriticality.CRITICAL,
        status: VendorStatus.ACTIVE,
        owner: 'DevOps Lead',
        reviewCadenceDays: 365,
        documentCount: 2,
        assessments: [{ score: 92 }],
      },
      {
        id: 'ven-empty-docs',
        name: 'Slack Technologies',
        category: 'Communication',
        criticality: VendorCriticality.MEDIUM,
        status: VendorStatus.ACTIVE,
        owner: 'IT Ops',
        reviewCadenceDays: 365,
        documentCount: 0,
        assessments: [{ score: 75 }],
      },
    ];

    const mockDocs = [
      {
        id: 've-1',
        vendorId: 'ven-aws-1',
        evidenceId: 'evi-soc2',
        attachedAt: '2026-10-18T10:00:00.000Z',
        title: 'AWS SOC 2 Type II Report',
        description: 'Annual compliance report',
        fileName: 'aws_soc2_type2.pdf',
        fileSize: 2048576,
        mimeType: 'application/pdf',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: 'u-1',
        uploaderName: 'Auditor Lead',
      },
      {
        id: 've-2',
        vendorId: 'ven-aws-1',
        evidenceId: 'evi-sla',
        attachedAt: '2026-10-18T11:00:00.000Z',
        title: 'Master Services Agreement',
        description: 'Enterprise contract',
        fileName: 'aws_enterprise_msa.docx',
        fileSize: 524288,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: 'u-1',
        uploaderName: 'Legal Counsel',
      },
    ];

    it('renders vendor list and opens document attachments modal on click', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/vendors' || url.startsWith('/vendors?')) {
          return { items: mockVendors, total: 2 };
        }
        if (url === '/vendors/ven-aws-1/documents') {
          return { items: mockDocs, total: 2 };
        }
        return {};
      });

      render(<VendorListView />);

      await waitFor(() => {
        expect(screen.getByText('Amazon Web Services')).toBeInTheDocument();
        expect(screen.getByText('Slack Technologies')).toBeInTheDocument();
      });

      // Click on documents button for AWS
      const docButtons = screen.getAllByRole('button', { name: /documents/i });
      fireEvent.click(docButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('aws_soc2_type2.pdf')).toBeInTheDocument();
        expect(screen.getByText('aws_enterprise_msa.docx')).toBeInTheDocument();
        expect(screen.getByText('Attached Documents (2)')).toBeInTheDocument();
      });
    });

    it('displays empty state when vendor has no attached documents', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/vendors' || url.startsWith('/vendors?')) {
          return { items: mockVendors, total: 2 };
        }
        if (url === '/vendors/ven-empty-docs/documents') {
          return { items: [], total: 0 };
        }
        return {};
      });

      render(<VendorListView />);

      await waitFor(() => {
        expect(screen.getByText('Slack Technologies')).toBeInTheDocument();
      });

      const docButtons = screen.getAllByRole('button', { name: /documents/i });
      // Click second vendor's documents button
      fireEvent.click(docButtons[1]);

      await waitFor(() => {
        expect(screen.getByText('No documents attached yet')).toBeInTheDocument();
      });
    });

    it('filters vendor attachments by search query', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/vendors' || url.startsWith('/vendors?')) {
          return { items: [mockVendors[0]], total: 1 };
        }
        if (url === '/vendors/ven-aws-1/documents') {
          return { items: mockDocs, total: 2 };
        }
        return {};
      });

      render(<VendorListView />);

      await waitFor(() => {
        expect(screen.getByText('Amazon Web Services')).toBeInTheDocument();
      });

      const docButtons = screen.getAllByRole('button', { name: /documents/i });
      fireEvent.click(docButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('aws_soc2_type2.pdf')).toBeInTheDocument();
      });

      // Filter attachments
      const searchInput = screen.getByPlaceholderText(/filter attachments/i);
      fireEvent.change(searchInput, { target: { value: 'msa' } });

      expect(screen.getByText('aws_enterprise_msa.docx')).toBeInTheDocument();
      expect(screen.queryByText('aws_soc2_type2.pdf')).not.toBeInTheDocument();
    });

    it('handles document loading API error gracefully with toast message', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/vendors' || url.startsWith('/vendors?')) {
          return { items: [mockVendors[0]], total: 1 };
        }
        if (url === '/vendors/ven-aws-1/documents') {
          throw new Error('Connection refused');
        }
        return {};
      });

      render(<VendorListView />);

      await waitFor(() => {
        expect(screen.getByText('Amazon Web Services')).toBeInTheDocument();
      });

      const docButtons = screen.getAllByRole('button', { name: /documents/i });
      fireEvent.click(docButtons[0]);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load vendor documents'),
          'error',
        );
      });
    });
  });

  describe('EvidenceVaultView - Searchable Target Resource Selector', () => {
    const mockEvidenceItems = [
      {
        id: 'evi-1',
        title: 'Firewall Policy Approval',
        fileName: 'fw_policy.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedAt: '2026-10-18T10:00:00.000Z',
        uploadedById: 'u-1',
        uploaderName: 'Auditor Lead',
        associations: [],
      },
    ];

    const mockControls = [
      { id: 'ctrl-1', name: 'Access Control Policy', type: 'CONTROL', details: 'Access control standards' },
      { id: 'ctrl-2', name: 'MFA Enforcement', type: 'CONTROL', details: 'Multi-factor authentication' },
    ];

    it('renders evidence vault and opens upload modal with searchable resource selector', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') {
          return [];
        }
        if (url.startsWith('/evidence/vault')) {
          return { items: mockEvidenceItems, total: 1 };
        }
        if (url.startsWith('/evidence/target-resources?type=CONTROL')) {
          return mockControls;
        }
        return [];
      });

      render(<EvidenceVaultView />);

      await waitFor(() => {
        expect(screen.getByText('Firewall Policy Approval')).toBeInTheDocument();
      });

      // Click "Upload Evidence"
      const uploadButton = screen.getByRole('button', { name: /upload evidence/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/Proof File \(PDF, DOCX, XLSX, PNG, CSV max 25MB\)/i)).toBeInTheDocument();
      });

      // Target Resource Type dropdown defaults to None (Unattached)
      const resourceTypeSelect = screen.getByLabelText(/Target GRC Resource Type/i);
      expect(resourceTypeSelect).toHaveValue('');

      // Change resource type to CONTROL
      fireEvent.change(resourceTypeSelect, { target: { value: 'CONTROL' } });

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          expect.stringContaining('/evidence/target-resources?type=CONTROL'),
        );
      });

      // Check that the selector button exists
      const selectBtn = screen.getByText(/Select a control/i);
      expect(selectBtn).toBeInTheDocument();

      // Click to open dropdown list
      fireEvent.click(selectBtn);

      await waitFor(() => {
        expect(screen.getByText('Access Control Policy')).toBeInTheDocument();
        expect(screen.getByText('MFA Enforcement')).toBeInTheDocument();
      });

      // Select MFA Enforcement
      fireEvent.click(screen.getByText('MFA Enforcement'));

      // Selected control should now be displayed with a badge and change button
      expect(screen.getByText('MFA Enforcement')).toBeInTheDocument();
      expect(screen.getByTitle('Change selection')).toBeInTheDocument();
    });

    it('shows empty state when no resources exist for the selected type', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') {
          return [];
        }
        if (url.startsWith('/evidence/vault')) {
          return { items: mockEvidenceItems, total: 1 };
        }
        if (url.startsWith('/evidence/target-resources?type=RISK')) {
          return [];
        }
        return [];
      });

      render(<EvidenceVaultView />);

      await waitFor(() => {
        expect(screen.getByText('Firewall Policy Approval')).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', { name: /upload evidence/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/Proof File \(PDF, DOCX, XLSX, PNG, CSV max 25MB\)/i)).toBeInTheDocument();
      });

      const resourceTypeSelect = screen.getByLabelText(/Target GRC Resource Type/i);
      fireEvent.change(resourceTypeSelect, { target: { value: 'RISK' } });

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          expect.stringContaining('/evidence/target-resources?type=RISK'),
        );
      });

      const selectBtn = screen.getByText(/Select a risk/i);
      fireEvent.click(selectBtn);

      await waitFor(() => {
        expect(screen.getByText(/No risks found/i)).toBeInTheDocument();
      });
    });

    it('handles resource fetching error with error notification', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') {
          return [];
        }
        if (url.startsWith('/evidence/vault')) {
          return { items: mockEvidenceItems, total: 1 };
        }
        if (url.startsWith('/evidence/target-resources?type=POLICY')) {
          throw new Error('Service unavailable');
        }
        return [];
      });

      render(<EvidenceVaultView />);

      await waitFor(() => {
        expect(screen.getByText('Firewall Policy Approval')).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', { name: /upload evidence/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/Proof File \(PDF, DOCX, XLSX, PNG, CSV max 25MB\)/i)).toBeInTheDocument();
      });

      const resourceTypeSelect = screen.getByLabelText(/Target GRC Resource Type/i);
      fireEvent.change(resourceTypeSelect, { target: { value: 'POLICY' } });

      await waitFor(() => {
        expect(screen.getByText('Service unavailable')).toBeInTheDocument();
      });
    });

    it('clears selection when user switches resource type', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') {
          return [];
        }
        if (url.startsWith('/evidence/vault')) {
          return { items: mockEvidenceItems, total: 1 };
        }
        if (url.startsWith('/evidence/target-resources?type=CONTROL')) {
          return mockControls;
        }
        return [];
      });

      render(<EvidenceVaultView />);

      const uploadButton = screen.getByRole('button', { name: /upload evidence/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/Proof File \(PDF, DOCX, XLSX, PNG, CSV max 25MB\)/i)).toBeInTheDocument();
      });

      const resourceTypeSelect = screen.getByLabelText(/Target GRC Resource Type/i);
      fireEvent.change(resourceTypeSelect, { target: { value: 'CONTROL' } });

      await waitFor(() => {
        expect(screen.getByText(/Select a control/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Select a control/i));
      await waitFor(() => {
        expect(screen.getByText('Access Control Policy')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Access Control Policy'));

      expect(screen.getByText('Access Control Policy')).toBeInTheDocument();

      // Switch resource type to None
      fireEvent.change(resourceTypeSelect, { target: { value: '' } });

      // Selector should disappear and selection reset
      expect(screen.queryByText('Access Control Policy')).not.toBeInTheDocument();
      expect(screen.queryByText(/Select a control/i)).not.toBeInTheDocument();
    });
  });
});
