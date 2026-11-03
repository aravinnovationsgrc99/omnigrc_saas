'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileCheck,
  Plus,
  CheckCircle2,
  Clock,
  ShieldAlert,
  FileText,
  Download,
  Edit2,
  Save,
  X,
  RefreshCw,
  FolderKanban,
  Check,
  Search,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Sparkles,
  Share2,
  Send,
  Upload,
  BookOpen,
  HelpCircle,
  Award,
  Layers,
  ChevronRight,
  Filter,
  Users,
  UserCheck,
  History,
  Lock,
  Eye,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  PolicyDto,
  PolicyStatus,
  MappingStatus,
  PaginatedPoliciesDto,
  PolicyCategoryDto,
  PolicyControlAssociationDto,
  PaginatedPolicyControlAssociationsDto,
  ControlDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { PolicyEditor } from './policy-editor';

interface PolicyListViewProps {
  initialStatus?: string;
  initialFilter?: string;
  initialTab?: string;
}

interface ValidationFinding {
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  section: string;
  title: string;
  description: string;
  recommendation: string;
}

interface ValidationResult {
  policyId: string;
  policyCode: string;
  overallScore: number;
  status: 'PASSED' | 'NEEDS_REVISION' | 'DEFICIENT';
  findings: ValidationFinding[];
  validatedAt: string;
  modelUsed: string;
}

export function PolicyListView({ initialStatus, initialFilter, initialTab }: PolicyListViewProps = {}) {
  const { addToast } = useToast();
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [categories, setCategories] = useState<PolicyCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>(initialStatus || 'ALL');
  const [filterOverdueCadence, setFilterOverdueCadence] = useState<boolean>(initialFilter === 'overdue');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDto | null>(null);

  // Create Form Mode & AI Drafting State
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Information Security');
  const [policyType, setPolicyType] = useState('INTERNAL');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [reviewDate, setReviewDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [ownerId, setOwnerId] = useState('CISO');
  const [targetAudience, setTargetAudience] = useState('All Personnel');
  const [standardOrFramework, setStandardOrFramework] = useState('ISO 27001 / SOC 2 Type II');
  const [keyRequirements, setKeyRequirements] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [initialContent, setInitialContent] = useState(
    '# Policy Title\n\n1. Objective & Purpose\n2. Scope\n3. Compliance Rules and Controls\n4. Enforcement & Violations',
  );
  const [reviewCadenceDays, setReviewCadenceDays] = useState(365);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAiDraft, setGeneratingAiDraft] = useState(false);
  const [aiProviderUsed, setAiProviderUsed] = useState<string | null>(null);

  // Acknowledgement Summary & Approval State
  const [ackSummary, setAckSummary] = useState<any | null>(null);
  const [loadingAckSummary, setLoadingAckSummary] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalWorkflows, setApprovalWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');

  // Rejection State
  const [rejectingPolicyId, setRejectingPolicyId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingRejection, setSubmittingRejection] = useState(false);

  // Edit Draft State
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPolicyType, setEditPolicyType] = useState('INTERNAL');
  const [editEffectiveDate, setEditEffectiveDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editReviewDate, setEditReviewDate] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Mapped Controls State
  const [mappedControls, setMappedControls] = useState<PolicyControlAssociationDto[]>([]);
  const [loadingMappedControls, setLoadingMappedControls] = useState(false);
  const [showMapControlModal, setShowMapControlModal] = useState(false);
  const [catalogueControls, setCatalogueControls] = useState<ControlDto[]>([]);
  const [loadingCatalogueControls, setLoadingCatalogueControls] = useState(false);
  const [selectedControlToMap, setSelectedControlToMap] = useState('');
  const [mappingRationale, setMappingRationale] = useState('');
  const [submittingMapping, setSubmittingMapping] = useState(false);
  const [unmappingControlId, setUnmappingControlId] = useState<string | null>(null);

  // AI Validation State
  const [validatingAi, setValidatingAi] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  // Policy Sharing & Access Control State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareActiveTab, setShareActiveTab] = useState<'members' | 'history' | 'email'>('members');
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [policyShares, setPolicyShares] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('VIEW');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [submittingInternalShare, setSubmittingInternalShare] = useState(false);
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);

  // Email Sharing State
  const [shareEmails, setShareEmails] = useState('');
  const [shareCustomMessage, setShareCustomMessage] = useState('');
  const [submittingShare, setSubmittingShare] = useState(false);

  // Document Import File Input Ref
  const docImportFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialStatus) {
      setFilterStatus(initialStatus);
    }
  }, [initialStatus]);

  useEffect(() => {
    if (initialFilter === 'overdue') {
      setFilterOverdueCadence(true);
    }
  }, [initialFilter]);

  useEffect(() => {
    fetchPolicies();
    fetchCategories();
    fetchApprovalWorkflows();
    fetchOrgDetails();
    fetchOrgMembers();
  }, [filterStatus]);

  async function fetchOrgDetails() {
    try {
      const details = await apiRequest<any>('/organization-members/details');
      setOrgDetails(details);
      if (details) {
        const parts = [
          details.name ? `Company: ${details.name}` : '',
          details.industry ? `Industry: ${details.industry}` : '',
          details.businessActivities ? `Activities: ${details.businessActivities}` : '',
          details.registeredAddress ? `Address: ${details.registeredAddress}` : '',
        ].filter(Boolean);
        if (parts.length > 0) {
          setCompanyContext((prev) => (prev ? prev : parts.join(' | ')));
        }
      }
    } catch {
      // ignore
    }
  }

  async function fetchOrgMembers() {
    try {
      const members = await apiRequest<any[]>('/organization-members');
      const list = Array.isArray(members) ? members : [];
      setOrgMembers(list);
      if (list.length > 0 && !selectedMemberId) {
        setSelectedMemberId(list[0].userId);
      }
    } catch {
      setOrgMembers([]);
    }
  }

  async function fetchPolicyShares(policyId: string) {
    setLoadingShares(true);
    try {
      const shares = await apiRequest<any[]>(`/policies/${policyId}/shares`);
      setPolicyShares(Array.isArray(shares) ? shares : []);
    } catch {
      setPolicyShares([]);
    } finally {
      setLoadingShares(false);
    }
  }

  function handleOpenShareModal(policy: PolicyDto) {
    setSelectedPolicy(policy);
    setShowShareModal(true);
    setShareActiveTab('members');
    fetchPolicyShares(policy.id);
    fetchOrgMembers();
  }

  async function handleGrantInternalShare(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPolicy || !selectedMemberId) {
      addToast('Please select a member to grant policy access.', 'error');
      return;
    }
    setSubmittingInternalShare(true);
    try {
      await apiRequest(`/policies/${selectedPolicy.id}/shares`, {
        method: 'POST',
        body: JSON.stringify({
          sharedWithUserId: selectedMemberId,
          permission: selectedPermission,
          expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : undefined,
        }),
      });
      addToast(`Access granted (${selectedPermission}) to user.`, 'success');
      fetchPolicyShares(selectedPolicy.id);
    } catch (err: any) {
      addToast(`Failed to grant share: ${err.message}`, 'error');
    } finally {
      setSubmittingInternalShare(false);
    }
  }

  async function handleRevokeInternalShare(shareId: string) {
    if (!selectedPolicy) return;
    setRevokingShareId(shareId);
    try {
      await apiRequest(`/policies/${selectedPolicy.id}/shares/${shareId}`, {
        method: 'DELETE',
      });
      addToast('User policy access revoked.', 'success');
      fetchPolicyShares(selectedPolicy.id);
    } catch (err: any) {
      addToast(`Failed to revoke share: ${err.message}`, 'error');
    } finally {
      setRevokingShareId(null);
    }
  }

  async function handleExportDocx(policy: PolicyDto) {
    try {
      addToast(`Generating branded Word document for ${policy.code}...`, 'info');
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('omnigrc_auth_token') || sessionStorage.getItem('omnigrc_auth_token')
          : '';
      const response = await fetch(`/api/policies/${policy.id}/export/docx`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Export failed: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sanitizedTitle = policy.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${policy.code}_${sanitizedTitle}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addToast(`Exported ${policy.code} as branded Word document (.docx).`, 'success');
    } catch (err: any) {
      addToast(`Word export failed: ${err.message}`, 'error');
    }
  }

  async function fetchPolicies() {
    setLoading(true);
    try {
      const queryParam = filterStatus !== 'ALL' ? `?status=${filterStatus}` : '';
      const res = await apiRequest<PaginatedPoliciesDto>(`/policies${queryParam}`);
      setPolicies(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load policies: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    setLoadingCategories(true);
    try {
      const data = await apiRequest<PolicyCategoryDto[]>('/policies/categories');
      setCategories(data || []);
      if (data && data.length > 0 && !category) {
        setCategory(data[0].name);
      }
    } catch {
      setCategories([
        { id: '1', name: 'Information Security', isDefault: true, policyCount: 0 },
        { id: '2', name: 'Data Privacy', isDefault: true, policyCount: 0 },
        { id: '3', name: 'Access Control', isDefault: true, policyCount: 0 },
        { id: '4', name: 'Acceptable Use', isDefault: true, policyCount: 0 },
        { id: '5', name: 'Incident Response', isDefault: true, policyCount: 0 },
        { id: '6', name: 'Business Continuity', isDefault: true, policyCount: 0 },
        { id: '7', name: 'Vendor Management', isDefault: true, policyCount: 0 },
        { id: '8', name: 'Compliance', isDefault: true, policyCount: 0 },
      ]);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function fetchApprovalWorkflows() {
    try {
      const res = await apiRequest<any>('/approval/workflows').catch(() => []);
      setApprovalWorkflows(Array.isArray(res) ? res : res.items || []);
    } catch {
      setApprovalWorkflows([]);
    }
  }

  async function fetchPolicyMappedControls(policyId: string) {
    setLoadingMappedControls(true);
    try {
      const res = await apiRequest<PaginatedPolicyControlAssociationsDto>(
        `/policy-controls/policies/${policyId}/controls`,
      );
      setMappedControls(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load mapped controls: ${err.message}`, 'error');
    } finally {
      setLoadingMappedControls(false);
    }
  }

  async function fetchCatalogueControls() {
    setLoadingCatalogueControls(true);
    try {
      const res = await apiRequest<any>('/controls?limit=100');
      setCatalogueControls(res.items || res || []);
    } catch (err: any) {
      addToast(`Failed to load controls catalogue: ${err.message}`, 'error');
    } finally {
      setLoadingCatalogueControls(false);
    }
  }

  async function handleGenerateAiDraft() {
    if (!title.trim()) {
      addToast('Please enter a policy title before generating with AI.', 'error');
      return;
    }
    setGeneratingAiDraft(true);
    try {
      const draft = await apiRequest<{
        content: string;
        suggestedTitle: string;
        suggestedCode: string;
        suggestedCategory: string;
        suggestedCadenceDays: number;
        providerUsed: string;
      }>('/policies/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          title,
          category,
          policyType,
          targetAudience,
          standardOrFramework,
          keyRequirements,
          companyContext: companyContext || undefined,
          pageDepth: 'STANDARD',
        }),
      });

      setInitialContent(draft.content);
      if (!code) setCode(draft.suggestedCode);
      if (draft.suggestedCadenceDays) setReviewCadenceDays(draft.suggestedCadenceDays);
      setAiProviderUsed(draft.providerUsed);
      setCreateMode('manual');
      addToast(`AI Draft generated successfully using ${draft.providerUsed}! Review and save as Draft.`, 'success');
    } catch (err: any) {
      addToast(`AI Draft generation failed: ${err.message}`, 'error');
    } finally {
      setGeneratingAiDraft(false);
    }
  }

  async function handleValidatePolicy(policyId: string) {
    setValidatingAi(true);
    try {
      const res = await apiRequest<ValidationResult>(`/policies/${policyId}/validate`, {
        method: 'POST',
      });
      setValidationResult(res);
      setShowValidationModal(true);
      addToast(`Policy validated with AI (${res.modelUsed}). Score: ${res.overallScore}%`, 'success');
    } catch (err: any) {
      addToast(`Validation failed: ${err.message}`, 'error');
    } finally {
      setValidatingAi(false);
    }
  }

  async function handleSharePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPolicy) return;
    const emails = shareEmails.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes('@'));
    if (emails.length === 0) {
      addToast('Please enter at least one valid recipient email.', 'error');
      return;
    }
    setSubmittingShare(true);
    try {
      await apiRequest(`/policies/${selectedPolicy.id}/share`, {
        method: 'POST',
        body: JSON.stringify({
          recipientEmails: emails,
          message: shareCustomMessage || undefined,
        }),
      });
      addToast(`Policy successfully shared with ${emails.length} recipient(s).`, 'success');
      setShowShareModal(false);
      setShareEmails('');
      setShareCustomMessage('');
    } catch (err: any) {
      addToast(`Failed to share policy: ${err.message}`, 'error');
    } finally {
      setSubmittingShare(false);
    }
  }

  async function handleImportDocumentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await apiRequest<{
        extractedContent: string;
        suggestedTitle?: string;
        wordCount: number;
      }>('/policies/import-doc', {
        method: 'POST',
        body: JSON.stringify({
          content: text,
          filename: file.name,
          fileType: file.name.endsWith('.docx') ? 'docx' : 'markdown',
        }),
      });

      setInitialContent(res.extractedContent);
      if (res.suggestedTitle && !title) setTitle(res.suggestedTitle);
      addToast(`Imported ${file.name} (${res.wordCount} words) into policy draft.`, 'success');
    } catch (err: any) {
      addToast(`Import failed: ${err.message}`, 'error');
    } finally {
      if (docImportFileRef.current) docImportFileRef.current.value = '';
    }
  }

  async function handleAssociateControl(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPolicy || !selectedControlToMap) return;
    setSubmittingMapping(true);
    try {
      await apiRequest(
        `/policy-controls/policies/${selectedPolicy.id}/controls/${selectedControlToMap}`,
        {
          method: 'POST',
          body: JSON.stringify({
            rationale: mappingRationale || undefined,
            status: MappingStatus.APPROVED,
          }),
        },
      );
      addToast('Control mapped to policy successfully.', 'success');
      setShowMapControlModal(false);
      setSelectedControlToMap('');
      setMappingRationale('');
      fetchPolicyMappedControls(selectedPolicy.id);
      fetchPolicies();
    } catch (err: any) {
      addToast(`Failed to map control: ${err.message}`, 'error');
    } finally {
      setSubmittingMapping(false);
    }
  }

  async function handleDisassociateControl(controlId: string) {
    if (!selectedPolicy) return;
    setUnmappingControlId(controlId);
    try {
      const mapping = mappedControls.find((c) => c.controlId === controlId);
      const expectedVersion = mapping?.version ?? 1;
      await apiRequest(
        `/policy-controls/policies/${selectedPolicy.id}/controls/${controlId}?expectedVersion=${expectedVersion}`,
        {
          method: 'DELETE',
        },
      );
      addToast('Control unmapped from policy.', 'success');
      fetchPolicyMappedControls(selectedPolicy.id);
      fetchPolicies();
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('conflict') || err.message?.includes('409')) {
        addToast(`Conflict: Mapping was modified concurrently. Refreshing...`, 'error');
        fetchPolicyMappedControls(selectedPolicy.id);
      } else {
        addToast(`Failed to unmap control: ${err.message}`, 'error');
      }
    } finally {
      setUnmappingControlId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveDate && expiryDate) {
      if (new Date(expiryDate).getTime() < new Date(effectiveDate).getTime()) {
        addToast('Expiry date must be on or after the effective date.', 'error');
        return;
      }
    }
    setSubmitting(true);
    try {
      await apiRequest('/policies', {
        method: 'POST',
        body: JSON.stringify({
          code,
          title,
          description,
          category,
          policyType,
          effectiveDate: effectiveDate ? new Date(effectiveDate).toISOString() : undefined,
          expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
          reviewDate: reviewDate ? new Date(reviewDate).toISOString() : undefined,
          ownerId,
          reviewCadenceDays: Number(reviewCadenceDays),
          initialContent,
        }),
      });
      addToast(`Policy "${title}" created as DRAFT.`, 'success');
      setShowCreateModal(false);
      setCode('');
      setTitle('');
      setDescription('');
      setReviewCadenceDays(365);
      setAiProviderUsed(null);
      setInitialContent(
        '# Policy Title\n\n1. Objective & Purpose\n2. Scope\n3. Compliance Rules and Controls\n4. Enforcement & Violations',
      );
      fetchPolicies();
      fetchCategories();
    } catch (err: any) {
      addToast(`Failed to create policy: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenPolicy(policy: PolicyDto) {
    setSelectedPolicy(policy);
    setIsEditingDraft(false);
    setEditTitle(policy.title);
    setEditCode(policy.code);
    setEditCategory(policy.category);
    setEditDescription(policy.description || '');
    setEditPolicyType(policy.policyType || 'INTERNAL');
    setEditEffectiveDate((policy as any).effectiveDate ? (policy as any).effectiveDate.split('T')[0] : '');
    setEditExpiryDate((policy as any).expiryDate ? (policy as any).expiryDate.split('T')[0] : '');
    setEditReviewDate(
      policy.reviewDate
        ? typeof policy.reviewDate === 'string'
          ? policy.reviewDate.split('T')[0]
          : new Date(policy.reviewDate).toISOString().split('T')[0]
        : '',
    );

    const currentContent =
      policy.versions && policy.versions.length > 0
        ? policy.versions[0].content
        : policy.publishedVersion?.content || '';
    setEditContent(currentContent);

    setLoadingAckSummary(true);
    apiRequest<any>(`/policies/${policy.id}/acknowledgement-summary`)
      .then((data) => setAckSummary(data))
      .catch(() => setAckSummary(null))
      .finally(() => setLoadingAckSummary(false));

    fetchPolicyMappedControls(policy.id);
  }

  async function handleSubmitApproval() {
    if (!selectedPolicy) return;
    setSubmittingApproval(true);
    try {
      await apiRequest(`/policies/${selectedPolicy.id}/submit-approval`, {
        method: 'POST',
        body: JSON.stringify({
          title: `Formal Approval for Policy: ${selectedPolicy.title}`,
          workflowId: selectedWorkflowId || undefined,
          dueDays: 14,
        }),
      });
      addToast('Submitted policy for formal approval.', 'success');
      fetchPolicies();
    } catch (err: any) {
      addToast(`Failed to submit approval: ${err.message}`, 'error');
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleSaveDraft() {
    if (!selectedPolicy) return;
    if (editEffectiveDate && editExpiryDate) {
      if (new Date(editExpiryDate).getTime() < new Date(editEffectiveDate).getTime()) {
        addToast('Expiry date must be on or after the effective date.', 'error');
        return;
      }
    }
    setSavingDraft(true);
    try {
      const updated = await apiRequest<PolicyDto>(`/policies/${selectedPolicy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle,
          code: editCode,
          category: editCategory,
          description: editDescription,
          content: editContent,
          policyType: editPolicyType,
          effectiveDate: editEffectiveDate ? new Date(editEffectiveDate).toISOString() : undefined,
          expiryDate: editExpiryDate ? new Date(editExpiryDate).toISOString() : undefined,
          reviewDate: editReviewDate ? new Date(editReviewDate).toISOString() : undefined,
          expectedUpdatedAt: selectedPolicy.updatedAt,
          expectedVersion: selectedPolicy.version,
        }),
      });
      setSelectedPolicy(updated);
      setIsEditingDraft(false);
      addToast(`Draft policy "${editTitle}" updated successfully.`, 'success');
      fetchPolicies();
      fetchCategories();
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.statusCode === 409 ||
        err.message?.includes('409') ||
        err.message?.toLowerCase().includes('conflict')
      ) {
        addToast(
          'Conflict detected: This policy was modified concurrently. Reloading latest version...',
          'error',
        );
        try {
          const latest = await apiRequest<PolicyDto>(`/policies/${selectedPolicy.id}`);
          setSelectedPolicy(latest);
          setEditTitle(latest.title);
          setEditCode(latest.code);
          setEditCategory(latest.category);
          setEditDescription(latest.description || '');
          setEditContent(
            latest.versions?.[0]?.content || latest.publishedVersion?.content || '',
          );
        } catch {
          // ignore reload error
        }
      } else {
        addToast(`Failed to save draft: ${err.message}`, 'error');
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleRejectPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectingPolicyId) return;
    const targetPolicy = policies.find((p) => p.id === rejectingPolicyId) || (selectedPolicy?.id === rejectingPolicyId ? selectedPolicy : null);
    setSubmittingRejection(true);
    try {
      await apiRequest(`/policies/${rejectingPolicyId}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rejectionReason,
          expectedVersion: targetPolicy?.version || 1,
        }),
      });
      addToast('Policy review rejected and returned to Draft.', 'success');
      setRejectingPolicyId(null);
      setRejectionReason('');
      fetchPolicies();
      if (selectedPolicy && selectedPolicy.id === rejectingPolicyId) {
        const updated = await apiRequest<PolicyDto>(`/policies/${rejectingPolicyId}`);
        setSelectedPolicy(updated);
      }
    } catch (err: any) {
      addToast(`Rejection failed: ${err.message}`, 'error');
    } finally {
      setSubmittingRejection(false);
    }
  }

  async function handleStatusTransition(policyId: string, action: string) {
    const targetPolicy = policies.find((p) => p.id === policyId) || (selectedPolicy?.id === policyId ? selectedPolicy : null);
    try {
      await apiRequest(`/policies/${policyId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: targetPolicy?.version || 1,
        }),
      });
      addToast(`Policy status updated.`, 'success');
      fetchPolicies();
      if (selectedPolicy && selectedPolicy.id === policyId) {
        const updated = await apiRequest<PolicyDto>(`/policies/${policyId}`);
        setSelectedPolicy(updated);
      }
    } catch (err: any) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  }

  async function handleAttest(versionId: string) {
    try {
      await apiRequest(`/policies/versions/${versionId}/attest`, { method: 'POST' });
      addToast('Policy version successfully attested!', 'success');
    } catch (err: any) {
      addToast(`Attestation failed: ${err.message}`, 'error');
    }
  }

  function downloadPolicyContent(p: PolicyDto, content: string, format: 'md' | 'doc' = 'md') {
    const blob = new Blob([content], {
      type: format === 'md' ? 'text/markdown;charset=utf-8' : 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.code || 'policy'}_${p.title.replace(/\s+/g, '_')}.${format === 'md' ? 'md' : 'doc'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`Exported policy document (.${format === 'md' ? 'md' : 'doc'}).`, 'success');
  }

  // Summary Metrics Computation
  const publishedCount = policies.filter((p) => p.status === 'PUBLISHED').length;
  const underReviewCount = policies.filter((p) => p.status === 'UNDER_REVIEW').length;
  const approvedCount = policies.filter((p) => p.status === 'APPROVED').length;
  const draftCount = policies.filter((p) => p.status === 'DRAFT').length;
  const retiredCount = policies.filter((p) => p.status === 'RETIRED').length;
  const overdueCadenceCount = policies.filter(
    (p) => p.reviewDate && new Date(p.reviewDate) < new Date(),
  ).length;

  const filteredPolicies = policies.filter((p) => {
    if (filterOverdueCadence) {
      const isOverdue = p.reviewDate && new Date(p.reviewDate) < new Date();
      if (!isOverdue) return false;
    }

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.code.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      {/* Hidden file input for DOC / MD Import */}
      <input
        type="file"
        ref={docImportFileRef}
        onChange={handleImportDocumentFile}
        accept=".md,.txt,.doc,.docx"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Policy Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Controlled policy lifecycle (Draft → Review → Approved → Published → Retired), AI drafting, framework control mappings, and attestation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCreateMode('ai');
              setShowCreateModal(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors shadow-2xs"
          >
            <Sparkles size={14} className="text-teal-600" /> Draft with AI
          </button>
          <button
            onClick={() => {
              setCreateMode('manual');
              setShowCreateModal(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={15} /> Create Policy Draft
          </button>
        </div>
      </div>

      {/* Policy Status Overview Metrics Strip (Clickable Drilldown) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2.5 mb-6">
        <div
          onClick={() => {
            setFilterStatus('ALL');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'ALL' && !filterOverdueCadence ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'
          }`}
          title="Filter All Policies"
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total</span>
          <span className="text-xl font-bold text-slate-900 omni-mono mt-0.5 block">{policies.length}</span>
        </div>

        <div
          onClick={() => {
            setFilterStatus('PUBLISHED');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'PUBLISHED' && !filterOverdueCadence ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'
          }`}
          title="Filter Published Policies"
        >
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Published</span>
          <span className="text-xl font-bold text-emerald-800 omni-mono mt-0.5 block">{publishedCount}</span>
        </div>

        <div
          onClick={() => {
            setFilterStatus('UNDER_REVIEW');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'UNDER_REVIEW' && !filterOverdueCadence ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200'
          }`}
          title="Filter Policies Under Review"
        >
          <span className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider block">In Review</span>
          <span className="text-xl font-bold text-sky-800 omni-mono mt-0.5 block">{underReviewCount}</span>
        </div>

        <div
          onClick={() => {
            setFilterStatus('APPROVED');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'APPROVED' && !filterOverdueCadence ? 'border-amber-500 ring-2 ring-amber-100' : 'border-slate-200'
          }`}
          title="Filter Approved Policies"
        >
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">Approved</span>
          <span className="text-xl font-bold text-amber-800 omni-mono mt-0.5 block">{approvedCount}</span>
        </div>

        <div
          onClick={() => {
            setFilterStatus('DRAFT');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'DRAFT' && !filterOverdueCadence ? 'border-slate-500 ring-2 ring-slate-100' : 'border-slate-200'
          }`}
          title="Filter Draft Policies"
        >
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">Drafts</span>
          <span className="text-xl font-bold text-slate-700 omni-mono mt-0.5 block">{draftCount}</span>
        </div>

        <div
          onClick={() => {
            setFilterStatus('RETIRED');
            setFilterOverdueCadence(false);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterStatus === 'RETIRED' && !filterOverdueCadence ? 'border-slate-500 ring-2 ring-slate-100' : 'border-slate-200'
          }`}
          title="Filter Retired Policies"
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Retired</span>
          <span className="text-xl font-bold text-slate-600 omni-mono mt-0.5 block">{retiredCount}</span>
        </div>

        <div
          onClick={() => {
            setFilterOverdueCadence((prev) => !prev);
          }}
          className={`p-3 bg-white border rounded-xl shadow-2xs cursor-pointer transition-all hover:shadow-xs ${
            filterOverdueCadence ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'
          }`}
          title="Filter Policies Overdue for Review"
        >
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">Overdue Review</span>
          <span className="text-xl font-bold text-rose-800 omni-mono mt-0.5 block">{overdueCadenceCount}</span>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 flex-1">
          {['ALL', 'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setFilterStatus(st);
                setFilterOverdueCadence(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors whitespace-nowrap ${
                filterStatus === st && !filterOverdueCadence
                  ? 'bg-white border border-slate-200 border-b-white text-teal-800 -mb-px'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
          {filterOverdueCadence && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-800 border border-rose-200">
              <Clock size={12} /> Overdue Review Only
              <button
                onClick={() => setFilterOverdueCadence(false)}
                className="ml-1 text-rose-600 hover:text-rose-900 font-bold"
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search code, title, desc..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Policy List Grid */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">Loading policies...</div>
      ) : filteredPolicies.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          {searchQuery
            ? `No policies matching search query "${searchQuery}".`
            : filterOverdueCadence
            ? 'No policies currently overdue for annual review.'
            : `No policies found for state "${filterStatus}".`}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPolicies.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="omni-mono text-xs font-bold text-slate-500">{p.code}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        p.policyType === 'PUBLIC'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : p.policyType === 'EXTERNAL'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : p.policyType === 'PRIVATE'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {p.policyType || 'INTERNAL'}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      p.status === 'PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.status === 'APPROVED'
                        ? 'bg-blue-100 text-blue-800'
                        : p.status === 'UNDER_REVIEW'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-base mb-1">{p.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                  {p.description || 'No description'}
                </p>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    <strong>Category:</strong> {p.category}
                  </div>
                  <div>
                    <strong>Owner:</strong> {p.ownerId}
                  </div>
                  {p.publishedVersion && (
                    <div>
                      <strong>Version:</strong> v{p.publishedVersion.versionNumber}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <ShieldCheck size={12} />
                      {p.mappedControlCount ?? 0} Mapped{' '}
                      {p.mappedControlCount === 1 ? 'Control' : 'Controls'}
                    </span>
                    {p.version && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        (r{p.version})
                      </span>
                    )}
                  </div>
                </div>

                {/* 5 Distinct Dates */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 pt-2 border-t border-slate-100 my-2 bg-slate-50/50 p-2 rounded-lg">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Created:</span>
                    <span className="font-medium text-slate-700">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Effective:</span>
                    <span className="font-medium text-slate-700">
                      {(p as any).effectiveDate ? new Date((p as any).effectiveDate).toLocaleDateString() : 'Immediate'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Expiry:</span>
                    <span className="font-medium text-slate-700">
                      {(p as any).expiryDate ? new Date((p as any).expiryDate).toLocaleDateString() : 'Continuous'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Next Review:</span>
                    <span className="font-medium text-slate-700">
                      {p.reviewDate ? new Date(p.reviewDate).toLocaleDateString() : 'Annual'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10px]">Published:</span>
                    <span className="font-medium text-slate-700">
                      {(p as any).publishedAt
                        ? new Date((p as any).publishedAt).toLocaleDateString()
                        : p.status === 'PUBLISHED'
                        ? new Date(p.updatedAt).toLocaleDateString()
                        : 'Unpublished'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenPolicy(p)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    View Details & Content
                  </button>
                  <button
                    onClick={() => handleExportDocx(p)}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 transition"
                    title="Export genuine branded OOXML Word document"
                  >
                    <FileText size={12} className="text-blue-600" /> Word
                  </button>
                  <button
                    onClick={() => handleOpenShareModal(p)}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 transition"
                    title="Manage team access & sharing"
                  >
                    <Share2 size={12} className="text-teal-600" /> Share
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {p.status === 'DRAFT' && (
                    <button
                      onClick={() => handleStatusTransition(p.id, 'submit-for-review')}
                      className="px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 rounded"
                    >
                      Submit Review
                    </button>
                  )}
                  {p.status === 'UNDER_REVIEW' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStatusTransition(p.id, 'approve')}
                        className="px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 rounded"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejectingPolicyId(p.id);
                          setRejectionReason('');
                        }}
                        className="px-2 py-1 text-xs font-semibold bg-rose-50 text-rose-800 hover:bg-rose-100 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {p.status === 'APPROVED' && (
                    <button
                      onClick={() => handleStatusTransition(p.id, 'publish')}
                      className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Review Modal */}
      {rejectingPolicyId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle size={18} />
                <h2 className="text-base font-bold text-slate-900">Reject Policy Review</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRejectingPolicyId(null);
                  setRejectionReason('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRejectPolicy} className="space-y-4">
              <p className="text-xs text-slate-600">
                Rejecting this policy will return its status back to <strong>DRAFT</strong> and increment its revision number.
                Please provide revision notes for the author.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason / Revision Notes
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Needs clarification on section 3.2 data retention rules."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingPolicyId(null);
                    setRejectionReason('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRejection || !rejectionReason.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg disabled:opacity-50"
                >
                  {submittingRejection ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal (with AI Drafting & Document Import) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {createMode === 'ai' ? 'Draft GRC Policy with AI' : 'Create New Policy Draft'}
                </h2>
                <p className="text-xs text-slate-500">
                  {createMode === 'ai'
                    ? 'AI-assisted standard-aligned policy generation using Claude & Gemini with enterprise governance context.'
                    : 'Standardized GRC policy document with Markdown authoring, document import, and category assignment.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setCreateMode('manual')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded ${
                      createMode === 'manual' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode('ai')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 ${
                      createMode === 'ai' ? 'bg-teal-700 text-white shadow-2xs' : 'text-teal-700'
                    }`}
                  >
                    <Sparkles size={12} /> AI Draft
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* AI Drafting Assistant Form */}
            {createMode === 'ai' ? (
              <div className="space-y-4">
                <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-lg text-xs text-teal-900 flex items-start gap-2">
                  <Sparkles size={16} className="text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Enterprise AI Policy Authoring</span>
                    Claude and Gemini generate complete, structured clauses tailored to your classification, standard benchmarks, and business scope.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Policy Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cloud Security & Infrastructure Access Policy"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Classification
                    </label>
                    <select
                      value={policyType}
                      onChange={(e) => setPolicyType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                    >
                      <option value="INTERNAL">Internal</option>
                      <option value="EXTERNAL">External</option>
                      <option value="PUBLIC">Public</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Applicable Framework
                    </label>
                    <select
                      value={standardOrFramework}
                      onChange={(e) => setStandardOrFramework(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                    >
                      <option value="ISO 27001:2022">ISO 27001:2022</option>
                      <option value="SOC 2 Type II">SOC 2 Type II</option>
                      <option value="NIST CSF 2.0">NIST CSF 2.0</option>
                      <option value="HIPAA Security Rule">HIPAA Security Rule</option>
                      <option value="GDPR / Data Privacy">GDPR / Data Privacy</option>
                      <option value="PCI-DSS v4.0">PCI-DSS v4.0</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. All Staff, DevOps & SecOps"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Organization Context & Profile
                    </label>
                    <span className="text-[10px] text-teal-700 font-medium">Pre-populated from Profile</span>
                  </div>
                  <textarea
                    rows={2}
                    value={companyContext}
                    onChange={(e) => setCompanyContext(e.target.value)}
                    placeholder="e.g. Meridian Health Pvt. Ltd. | Healthcare & Telehealth | HIPAA & ISO 27001 scope"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-slate-50"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Note: Editing company context here applies exclusively to this AI generation and will not alter canonical organization settings.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Specific Requirements or Organizational Mandates (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Mandatory MFA on all AWS root accounts, AES-256 at rest, quarterly key rotation, 30-day incident log retention."
                    value={keyRequirements}
                    onChange={(e) => setKeyRequirements(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCreateMode('manual')}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Switch to Manual
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAiDraft}
                    disabled={generatingAiDraft || !title.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Sparkles size={14} className={generatingAiDraft ? 'animate-spin' : ''} />
                    {generatingAiDraft ? 'Drafting Policy with AI...' : 'Generate Policy Draft'}
                  </button>
                </div>
              </div>
            ) : (
              /* Manual Policy Creation Form */
              <form onSubmit={handleCreate} className="space-y-4">
                {aiProviderUsed && (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Sparkles size={14} /> Draft populated using {aiProviderUsed}. Review and save.
                    </span>
                    <button
                      type="button"
                      onClick={() => setAiProviderUsed(null)}
                      className="text-emerald-700 hover:text-emerald-900"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Policy Code
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. POL-SEC-001"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 omni-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name} {c.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Information Security & Acceptable Use Policy"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Summary / Scope Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mandatory user obligations and security rules"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Review Cadence (Days)
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="730"
                      value={reviewCadenceDays}
                      onChange={(e) => setReviewCadenceDays(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Classification
                    </label>
                    <select
                      value={policyType}
                      onChange={(e) => setPolicyType(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                    >
                      <option value="INTERNAL">Internal</option>
                      <option value="EXTERNAL">External</option>
                      <option value="PUBLIC">Public</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Review Date
                    </label>
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(e) => setReviewDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Policy Content & Clauses
                    </label>
                    <button
                      type="button"
                      onClick={() => docImportFileRef.current?.click()}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                    >
                      <Upload size={12} /> Import Document (.md / .docx)
                    </button>
                  </div>
                  <PolicyEditor
                    content={initialContent}
                    onChange={setInitialContent}
                    documentTitle={title || code || 'new-policy-draft'}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Policy Draft'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Map Control to Policy Modal */}
      {showMapControlModal && selectedPolicy && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Map Control to Policy</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowMapControlModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAssociateControl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Control from Catalogue
                </label>
                {loadingCatalogueControls ? (
                  <div className="text-xs text-slate-500 py-2">Loading controls catalogue...</div>
                ) : (
                  <select
                    required
                    value={selectedControlToMap}
                    onChange={(e) => setSelectedControlToMap(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    <option value="">-- Choose Control --</option>
                    {catalogueControls
                      .filter((c) => !mappedControls.some((mc) => mc.controlId === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.category ? `(${c.category})` : ''}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mapping Rationale / Enforcement Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. This policy enforces access controls and password rules mandated by AC-2."
                  value={mappingRationale}
                  onChange={(e) => setMappingRationale(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMapControlModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMapping || !selectedControlToMap}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                >
                  {submittingMapping ? 'Mapping...' : 'Associate Control'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Sharing & Granular Access Control Drawer / Modal */}
      {showShareModal && selectedPolicy && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2 text-teal-800">
                <Share2 size={18} />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Policy Access & Sharing: {selectedPolicy.code}
                  </h2>
                  <p className="text-xs text-slate-500">{selectedPolicy.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 mb-4 pb-1">
              <button
                type="button"
                onClick={() => setShareActiveTab('members')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition ${
                  shareActiveTab === 'members'
                    ? 'bg-teal-50 text-teal-900 border-b-2 border-teal-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Users size={13} /> Internal Team Access
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShareActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition ${
                  shareActiveTab === 'history'
                    ? 'bg-teal-50 text-teal-900 border-b-2 border-teal-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <History size={13} /> Revocation & Audit History
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShareActiveTab('email')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition ${
                  shareActiveTab === 'email'
                    ? 'bg-teal-50 text-teal-900 border-b-2 border-teal-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Send size={13} /> Email Notification
                </span>
              </button>
            </div>

            {/* TAB 1: Team Access */}
            {shareActiveTab === 'members' && (
              <div className="space-y-5">
                {/* Grant Access Form */}
                <form
                  onSubmit={handleGrantInternalShare}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                >
                  <span className="text-xs font-bold text-slate-800 block uppercase tracking-wider">
                    Grant Granular User Permission
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Member
                      </label>
                      <select
                        value={selectedMemberId}
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        {orgMembers.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name || m.email} ({m.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Permission Level
                      </label>
                      <select
                        value={selectedPermission}
                        onChange={(e) => setSelectedPermission(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="VIEW">VIEW (Read & Attest)</option>
                        <option value="DOWNLOAD">DOWNLOAD (Read & Export DOCX/MD)</option>
                        <option value="EDIT">EDIT (Modify Drafts & Metadata)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Access Expiry (Optional)
                      </label>
                      <input
                        type="date"
                        value={shareExpiresAt}
                        onChange={(e) => setShareExpiresAt(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={submittingInternalShare || !selectedMemberId}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition"
                    >
                      <UserCheck size={13} />
                      {submittingInternalShare ? 'Granting...' : 'Grant Access'}
                    </button>
                  </div>
                </form>

                {/* Active Shares List */}
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Active Permissions for this Policy
                  </h3>
                  {loadingShares ? (
                    <div className="text-xs text-slate-500 py-3 text-center">Loading active shares...</div>
                  ) : policyShares.filter((s) => !s.revokedAt).length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                      No explicit granular shares granted. Organization members access this policy based on default role permissions.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <tr>
                            <th className="px-3 py-2">User</th>
                            <th className="px-3 py-2">Permission</th>
                            <th className="px-3 py-2">Granted By</th>
                            <th className="px-3 py-2">Granted At</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {policyShares
                            .filter((s) => !s.revokedAt)
                            .map((share) => (
                              <tr key={share.id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-slate-900">{share.sharedWithUserName || 'Member'}</div>
                                  <div className="text-[11px] text-slate-400 font-mono">{share.sharedWithUserEmail}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                      share.permission === 'EDIT'
                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                        : share.permission === 'DOWNLOAD'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                  >
                                    {share.permission}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-600">{share.sharedByUserName || 'Admin'}</td>
                                <td className="px-3 py-2 text-slate-500">
                                  {new Date(share.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeInternalShare(share.id)}
                                    disabled={revokingShareId === share.id}
                                    className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded transition disabled:opacity-50"
                                  >
                                    {revokingShareId === share.id ? 'Revoking...' : 'Revoke'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Revocation & Audit History */}
            {shareActiveTab === 'history' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Historical Share & Revocation Log
                </h3>
                {policyShares.filter((s) => s.revokedAt).length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                    No historical share revocations recorded for this policy.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">User</th>
                          <th className="px-3 py-2">Level</th>
                          <th className="px-3 py-2">Revoked By</th>
                          <th className="px-3 py-2">Revoked Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {policyShares
                          .filter((s) => s.revokedAt)
                          .map((share) => (
                            <tr key={share.id} className="text-slate-500 bg-slate-50/30">
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-700">{share.sharedWithUserName || 'Member'}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{share.sharedWithUserEmail}</div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                                  {share.permission}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-700">{share.revokedByUserName || 'Administrator'}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">
                                {new Date(share.revokedAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Email Notification */}
            {shareActiveTab === 'email' && (
              <form onSubmit={handleSharePolicy} className="space-y-4">
                <p className="text-xs text-slate-600">
                  Send an email notification with direct portal link to <strong>{selectedPolicy.code} - {selectedPolicy.title}</strong>.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Email Addresses (comma separated)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. auditor@enterprise.com, ciso@enterprise.com"
                    value={shareEmails}
                    onChange={(e) => setShareEmails(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Message (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please review section 4 on access control requirements before the upcoming audit."
                    value={shareCustomMessage}
                    onChange={(e) => setShareCustomMessage(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowShareModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingShare}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send size={13} />
                    {submittingShare ? 'Sending...' : 'Send Notification'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* AI Validation Results Modal */}
      {showValidationModal && validationResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  AI Compliance Validation Report
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Score strip */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">Audit Readiness Score</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold text-slate-900 omni-mono">
                      {validationResult.overallScore}%
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        validationResult.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : validationResult.status === 'NEEDS_REVISION'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {validationResult.status}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block font-mono">
                    Model: {validationResult.modelUsed}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(validationResult.validatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Findings */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Validation Findings & Actionable Gaps ({validationResult.findings.length})
                </h4>
                {validationResult.findings.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 text-center font-medium">
                    No compliance gaps detected. The policy meets all standard GRC requirements!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {validationResult.findings.map((f, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{f.title}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              f.severity === 'HIGH'
                                ? 'bg-rose-100 text-rose-800'
                                : f.severity === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800'
                                : f.severity === 'LOW'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11.5px]">{f.description}</p>
                        <p className="text-teal-800 text-[11px] font-medium pt-0.5">
                          <strong>Recommendation:</strong> {f.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowValidationModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Policy Details & Editor Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded border border-teal-200">
                  {selectedPolicy.code}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    selectedPolicy.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedPolicy.status === 'APPROVED'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedPolicy.status === 'UNDER_REVIEW'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedPolicy.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleValidatePolicy(selectedPolicy.id)}
                  disabled={validatingAi}
                  className="px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded flex items-center gap-1 transition"
                  title="Run AI completeness & compliance gap audit"
                >
                  <Sparkles size={13} className={validatingAi ? 'animate-spin' : ''} />
                  {validatingAi ? 'Auditing...' : 'Validate with AI'}
                </button>
                <button
                  onClick={() => handleExportDocx(selectedPolicy)}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded flex items-center gap-1 transition"
                  title="Export branded OOXML Word document (.docx)"
                >
                  <FileText size={13} className="text-blue-700" /> Export Word (.docx)
                </button>
                <button
                  onClick={() => handleOpenShareModal(selectedPolicy)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center gap-1 transition"
                  title="Manage team access permissions & sharing"
                >
                  <Share2 size={13} /> Share Access
                </button>
                {selectedPolicy.status === 'DRAFT' && !isEditingDraft && (
                  <button
                    onClick={() => setIsEditingDraft(true)}
                    className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded flex items-center gap-1"
                  >
                    <Edit2 size={13} /> Edit Draft
                  </button>
                )}
                <button
                  onClick={() => setSelectedPolicy(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* DRAFT EDIT MODE */}
            {selectedPolicy.status === 'DRAFT' && isEditingDraft ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Policy Code
                    </label>
                    <input
                      type="text"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Classification
                    </label>
                    <select
                      value={editPolicyType}
                      onChange={(e) => setEditPolicyType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="INTERNAL">Internal</option>
                      <option value="EXTERNAL">External</option>
                      <option value="PUBLIC">Public</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={editEffectiveDate}
                      onChange={(e) => setEditEffectiveDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Review Date
                    </label>
                    <input
                      type="date"
                      value={editReviewDate}
                      onChange={(e) => setEditReviewDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Content Editor
                  </label>
                  <PolicyEditor
                    content={editContent}
                    onChange={setEditContent}
                    documentTitle={editTitle || editCode}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    {savingDraft ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW / READER MODE */
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedPolicy.title}</h2>
                <p className="text-xs text-slate-500 mb-4">{selectedPolicy.description}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs mb-4">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Classification</span>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border ${
                        selectedPolicy.policyType === 'PUBLIC'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : selectedPolicy.policyType === 'EXTERNAL'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : selectedPolicy.policyType === 'PRIVATE'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {selectedPolicy.policyType || 'INTERNAL'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Category</span>
                    <strong className="text-slate-800 text-xs mt-0.5 block">{selectedPolicy.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Owner</span>
                    <strong className="text-slate-800 text-xs mt-0.5 block">{selectedPolicy.ownerId}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold uppercase">Status</span>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded ${
                        selectedPolicy.status === 'PUBLISHED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedPolicy.status === 'APPROVED'
                          ? 'bg-blue-100 text-blue-800'
                          : selectedPolicy.status === 'UNDER_REVIEW'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {selectedPolicy.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Created At:</span>
                    <strong className="text-slate-700 font-mono text-[11px]">
                      {new Date(selectedPolicy.createdAt).toLocaleDateString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Effective Date:</span>
                    <strong className="text-slate-700 font-mono text-[11px]">
                      {(selectedPolicy as any).effectiveDate
                        ? new Date((selectedPolicy as any).effectiveDate).toLocaleDateString()
                        : 'Immediate'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Expiry Date:</span>
                    <strong className="text-slate-700 font-mono text-[11px]">
                      {(selectedPolicy as any).expiryDate
                        ? new Date((selectedPolicy as any).expiryDate).toLocaleDateString()
                        : 'Continuous Renewal'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Next Review:</span>
                    <strong className="text-slate-700 font-mono text-[11px]">
                      {selectedPolicy.reviewDate
                        ? new Date(selectedPolicy.reviewDate).toLocaleDateString()
                        : `${selectedPolicy.reviewCadenceDays} Days`}
                    </strong>
                  </div>
                  <div className="col-span-2 sm:col-span-4 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Published At:{' '}
                      <strong className="text-slate-700 font-mono">
                        {(selectedPolicy as any).publishedAt
                          ? new Date((selectedPolicy as any).publishedAt).toLocaleDateString()
                          : selectedPolicy.status === 'PUBLISHED'
                          ? new Date(selectedPolicy.updatedAt).toLocaleDateString()
                          : 'Unpublished'}
                      </strong>
                    </span>
                    <span>Review Cadence: <strong>{selectedPolicy.reviewCadenceDays} days</strong></span>
                  </div>
                </div>

                {/* Acknowledgement Tracking & Formal Approval Panel */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Attestation & Acknowledgement Tracking
                    </span>
                    <div className="flex items-center gap-2">
                      {approvalWorkflows.length > 0 && (
                        <select
                          value={selectedWorkflowId}
                          onChange={(e) => setSelectedWorkflowId(e.target.value)}
                          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                        >
                          <option value="">Default Workflow</option>
                          {approvalWorkflows.map((w: any) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={handleSubmitApproval}
                        disabled={submittingApproval}
                        className="px-3 py-1 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 transition"
                      >
                        <CheckCircle2 size={13} />
                        {submittingApproval ? 'Submitting...' : 'Submit for Formal Approval'}
                      </button>
                    </div>
                  </div>

                  {loadingAckSummary ? (
                    <div className="text-xs text-slate-500 py-1">Loading acknowledgement metrics...</div>
                  ) : ackSummary ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Compliance Rate</span>
                        <span className="text-sm font-bold text-teal-800">{ackSummary.compliancePercentage || 0}%</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Acknowledged</span>
                        <span className="text-sm font-bold text-emerald-800">{ackSummary.attestedUsersCount || 0} users</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Pending</span>
                        <span className="text-sm font-bold text-amber-800">{ackSummary.pendingUsersCount || 0} users</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Eligible Total</span>
                        <span className="text-sm font-bold text-slate-800">{ackSummary.totalEligibleUsers || 0}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No active attestation campaign recorded.</div>
                  )}
                </div>

                {/* Mapped Controls & Framework Coverage Panel */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-teal-700" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Mapped Controls & Framework Coverage ({mappedControls.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMapControlModal(true);
                        fetchCatalogueControls();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-white border border-teal-300 hover:bg-teal-50 rounded-lg flex items-center gap-1 shadow-xs transition"
                    >
                      <Plus size={13} /> Map Control
                    </button>
                  </div>

                  {loadingMappedControls ? (
                    <div className="text-xs text-slate-500 py-2">Loading mapped controls...</div>
                  ) : mappedControls.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 bg-white rounded-lg border border-dashed border-slate-200 text-center">
                      No controls currently mapped to this policy. Associate controls to establish framework compliance coverage.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {mappedControls.map((mc) => (
                        <div
                          key={mc.id}
                          className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-start justify-between gap-3 text-xs shadow-xs"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{mc.controlName}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  mc.status === MappingStatus.APPROVED
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {mc.status}
                              </span>
                            </div>
                            {mc.controlDescription && (
                              <p className="text-[11px] text-slate-500 line-clamp-1">
                                {mc.controlDescription}
                              </p>
                            )}
                            {mc.rationale && (
                              <p className="text-[11px] text-slate-600 italic">
                                Rationale: {mc.rationale}
                              </p>
                            )}
                            {mc.frameworkMappings && mc.frameworkMappings.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {mc.frameworkMappings.map((fm, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-200"
                                  >
                                    {fm.frameworkName} {fm.clauseCode ? `(${fm.clauseCode})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDisassociateControl(mc.controlId)}
                            disabled={unmappingControlId === mc.controlId}
                            title="Remove mapping"
                            className="text-slate-400 hover:text-rose-600 p-1 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPolicy.publishedVersion ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 bg-teal-50/50 border border-teal-100 p-3 rounded-lg">
                      <div>
                        Published Version: <strong>v{selectedPolicy.publishedVersion.versionNumber}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExportDocx(selectedPolicy)}
                          className="px-2.5 py-1 text-xs text-white bg-blue-700 border border-blue-800 rounded hover:bg-blue-800 flex items-center gap-1 font-semibold shadow-2xs"
                          title="Export branded OOXML Word document (.docx)"
                        >
                          <FileText size={13} /> Export .docx
                        </button>
                        <button
                          onClick={() =>
                            downloadPolicyContent(
                              selectedPolicy,
                              selectedPolicy.publishedVersion?.content || '',
                              'md',
                            )
                          }
                          className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Download size={13} /> Export .md
                        </button>
                        <button
                          onClick={() =>
                            downloadPolicyContent(
                              selectedPolicy,
                              selectedPolicy.publishedVersion?.content || '',
                              'doc',
                            )
                          }
                          className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                        >
                          <FileText size={13} /> Export .doc
                        </button>
                        <button
                          onClick={() => handleAttest(selectedPolicy.publishedVersion!.id)}
                          className="px-3 py-1 bg-teal-700 text-white font-semibold rounded hover:bg-teal-800"
                        >
                          Attest Policy Compliance
                        </button>
                      </div>
                    </div>
                    <PolicyEditor
                      content={selectedPolicy.publishedVersion.content}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                ) : selectedPolicy.versions && selectedPolicy.versions.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 bg-amber-50 border border-amber-100 p-2.5 rounded-lg">
                      <span>
                        Draft Version <strong>v{selectedPolicy.versions[0].versionNumber}</strong> ({selectedPolicy.status})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExportDocx(selectedPolicy)}
                          className="px-2.5 py-1 text-xs text-white bg-blue-700 border border-blue-800 rounded hover:bg-blue-800 flex items-center gap-1 font-semibold shadow-2xs"
                          title="Export branded OOXML Word document (.docx)"
                        >
                          <FileText size={13} /> Export .docx
                        </button>
                        <button
                          onClick={() =>
                            downloadPolicyContent(
                              selectedPolicy,
                              selectedPolicy.versions?.[0]?.content || '',
                              'md',
                            )
                          }
                          className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Download size={13} /> Export .md
                        </button>
                        <button
                          onClick={() =>
                            downloadPolicyContent(
                              selectedPolicy,
                              selectedPolicy.versions?.[0]?.content || '',
                              'doc',
                            )
                          }
                          className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                        >
                          <FileText size={13} /> Export .doc
                        </button>
                      </div>
                    </div>
                    <PolicyEditor
                      content={selectedPolicy.versions[0].content}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-6 text-center">
                    No content recorded for this policy document yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
