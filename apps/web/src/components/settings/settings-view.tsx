'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { apiRequest } from '@/lib/api-client';
import {
  RegionalPodDto,
  PodStatus,
  Role,
  OrganizationDetailsDto,
  OrganizationEntitlementDetailDto,
} from '@omnigrc/shared';
import {
  Globe2,
  ShieldAlert,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Send,
  Mail,
  Building2,
  Edit2,
  Shield,
  BookOpen,
  Users,
  FolderKanban,
  Layers,
  Check,
  RefreshCw,
  UploadCloud,
  Trash2,
  Camera,
  Image as ImageIcon,
  MapPin,
  Phone,
  Briefcase,
} from 'lucide-react';
import { SkeletonLine } from '@/components/ui/skeleton';
import { InlineErrorState } from '@/components/ui/inline-error-state';

import { TeamInvitationsView } from './team-invitations-view';
import { OrganizationHierarchyView } from '@/components/organization/organization-hierarchy-view';
import { PolicyCategoriesSettingsCard } from './policy-categories-settings-card';
import { DirectoryIntegrationSettingsCard } from './directory-integration-settings-card';

export function SettingsView() {
  const { user, organization } = useAuth();
  const { addToast } = useToast();

  // Organization Details State
  const [orgDetails, setOrgDetails] = useState<OrganizationDetailsDto | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [showEditOrgModal, setShowEditOrgModal] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  const [editPrimaryRegion, setEditPrimaryRegion] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBusinessActivities, setEditBusinessActivities] = useState('');
  const [editRegisteredAddress, setEditRegisteredAddress] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // Logo Upload State
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  // Regional Pods State
  const [pods, setPods] = useState<RegionalPodDto[]>([]);
  const [loadingPods, setLoadingPods] = useState(true);
  const [podError, setPodError] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<RegionalPodDto | null>(null);
  const [podAckChecked, setPodAckChecked] = useState(false);
  const [updatingPod, setUpdatingPod] = useState(false);
  const [podModalError, setPodModalError] = useState<string | null>(null);

  // User Preferences State
  const [emailNotifs, setEmailNotifs] = useState(user?.emailNotifications ?? true);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [savingEmailPref, setSavingEmailPref] = useState(false);

  // Slack Integration state
  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.MSSP_ADMIN;

  const fetchOrgDetails = async () => {
    setLoadingOrg(true);
    setOrgError(null);
    try {
      const data = await apiRequest<OrganizationDetailsDto>('/organization-members/details');
      setOrgDetails(data);
    } catch (err: any) {
      setOrgError(err.message || 'Failed to load organization details');
    } finally {
      setLoadingOrg(false);
    }
  };

  const fetchPods = async () => {
    setLoadingPods(true);
    setPodError(null);
    try {
      const data = await apiRequest<RegionalPodDto[]>('/regional-pods');
      setPods(data);
    } catch (err: any) {
      setPodError(err.message || 'Unable to retrieve regional hosting pod configuration.');
      setPods([]);
    } finally {
      setLoadingPods(false);
    }
  };

  const fetchSlackStatus = async () => {
    try {
      const res = await apiRequest<{ configured: boolean; webhookUrl: string | null }>('/integrations/slack');
      setSlackConfigured(res.configured);
      if (res.webhookUrl) setSlackWebhook(res.webhookUrl);
    } catch {
      // Ignore fallback
    }
  };

  useEffect(() => {
    fetchOrgDetails();
    fetchPods();
    fetchSlackStatus();
  }, []);

  const regionNameMap: Record<string, string> = {
    INDIA: 'India (ap-south-1)',
    UK: 'United Kingdom (eu-west-2)',
    EU: 'European Union (eu-central-1)',
    AUSTRALIA: 'Australia (ap-southeast-2)',
  };

  // Edit Organization Handler
  const handleOpenEditOrg = () => {
    if (!orgDetails || !isAdmin) return;
    setEditOrgName(orgDetails.name);
    setEditPrimaryRegion(orgDetails.primaryRegion);
    setEditIndustry(orgDetails.industry || '');
    setEditDescription(orgDetails.description || '');
    setEditBusinessActivities(orgDetails.businessActivities || '');
    setEditRegisteredAddress(orgDetails.registeredAddress || '');
    setEditContactEmail(orgDetails.contactEmail || '');
    setEditContactPhone(orgDetails.contactPhone || '');
    setShowEditOrgModal(true);
  };

  const handleSaveOrgDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrgName.trim() || savingOrg) return;
    setSavingOrg(true);
    try {
      const updated = await apiRequest<OrganizationDetailsDto>('/organization-members/details', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editOrgName.trim(),
          primaryRegion: editPrimaryRegion.trim(),
          industry: editIndustry.trim() || null,
          description: editDescription.trim() || null,
          businessActivities: editBusinessActivities.trim() || null,
          registeredAddress: editRegisteredAddress.trim() || null,
          contactEmail: editContactEmail.trim() || null,
          contactPhone: editContactPhone.trim() || null,
        }),
      });
      setOrgDetails(updated);
      setShowEditOrgModal(false);
      addToast('Organization profile and company information updated successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update organization settings', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      addToast('Invalid file format. Please upload PNG, JPEG, WebP, or SVG.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast('File size exceeds 2MB limit.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setLogoFile(file);
  };

  const handleUploadLogoConfirm = async () => {
    if (!logoPreview || !logoFile || logoUploading) return;
    setLogoUploading(true);
    try {
      await apiRequest<{ success: boolean; logoUrl: string }>('/organization-members/logo', {
        method: 'POST',
        body: JSON.stringify({
          data: logoPreview,
          mimeType: logoFile.type,
          filename: logoFile.name,
        }),
      });
      addToast('Company logo updated and persisted successfully', 'success');
      setLogoFile(null);
      setLogoPreview(null);
      fetchOrgDetails();
    } catch (err: any) {
      addToast(err.message || 'Failed to upload logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm('Are you sure you want to remove the company logo?')) return;
    setLogoUploading(true);
    try {
      await apiRequest('/organization-members/logo', { method: 'DELETE' });
      addToast('Company logo removed', 'success');
      setLogoPreview(null);
      setLogoFile(null);
      fetchOrgDetails();
    } catch (err: any) {
      addToast(err.message || 'Failed to remove logo', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  // Regional Pod Toggle Handler
  const handleToggleClick = (pod: RegionalPodDto) => {
    if (!isAdmin) return;
    setSelectedPod(pod);
    setPodAckChecked(false);
    setPodModalError(null);
  };

  const handleConfirmToggle = async () => {
    if (!selectedPod || !podAckChecked) return;
    const nextStatus = selectedPod.status === PodStatus.ACTIVE ? PodStatus.INACTIVE : PodStatus.ACTIVE;
    setUpdatingPod(true);
    setPodModalError(null);

    try {
      const updatedPod = await apiRequest<RegionalPodDto>(`/regional-pods/${selectedPod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });

      setPods((prev) => prev.map((p) => (p.id === updatedPod.id ? updatedPod : p)));
      setSelectedPod(null);
      addToast(`Updated hosting pod status for ${selectedPod.region} to ${nextStatus}`, 'success');
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update regional pod status.';
      setPodModalError(errMsg);
      addToast(errMsg, 'error');
    } finally {
      setUpdatingPod(false);
    }
  };

  // Email Notification Preference Handler
  const handleOpenEmailModal = () => {
    setShowEmailModal(true);
  };

  const handleConfirmEmailPref = async () => {
    const nextVal = !emailNotifs;
    setShowEmailModal(false);
    setEmailNotifs(nextVal);
    setSavingEmailPref(true);
    try {
      await apiRequest('/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ emailNotifications: nextVal }),
      });
      addToast(`Email notifications ${nextVal ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      setEmailNotifs(!nextVal);
      addToast('Failed to update email preferences', 'error');
    } finally {
      setSavingEmailPref(false);
    }
  };

  // Slack Integration Handlers
  const handleOpenSlackModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !slackWebhook.trim()) return;
    setShowSlackModal(true);
  };

  const handleConfirmSlackSave = async () => {
    setShowSlackModal(false);
    if (!isAdmin) return;
    setSavingSlack(true);
    try {
      const res = await apiRequest<{ message: string; configured: boolean }>('/integrations/slack/webhook-url', {
        method: 'POST',
        body: JSON.stringify({ webhookUrl: slackWebhook }),
      });
      setSlackConfigured(res.configured);
      addToast('Slack webhook URL configured successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save Slack webhook URL.', 'error');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlack = async () => {
    if (!isAdmin) return;
    setTestingSlack(true);
    try {
      await apiRequest<{ success: boolean; message: string }>('/integrations/slack/test', {
        method: 'POST',
      });
      addToast('Test message sent to Slack channel!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to deliver test message to Slack webhook.', 'error');
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <div className="omni-fade-in px-4 py-6 md:px-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430] flex items-center gap-2">
          <Building2 className="text-teal-700" size={22} /> Organization Administration & Settings
        </h1>
        <p className="text-xs text-[#5B6672] mt-1">
          Centralized administrative controls for tenant identity, commercial framework entitlements, employee access control, and security preferences.
        </p>
      </div>

      {/* 1. ORGANIZATION CONTEXT & COMPANY INFORMATION CARD */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm space-y-5">
        <div className="flex justify-between items-center border-b border-[#EDEFED] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
              <Building2 size={16} className="text-teal-700" /> Company Information & Organization Branding
            </h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Canonical company profile, registered details, and branded logo used across policy documents and exports.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleOpenEditOrg}
              className="omni-btn-ghost text-xs h-7 px-3 flex items-center gap-1.5 text-teal-700 hover:bg-teal-50 border border-teal-200 rounded"
            >
              <Edit2 size={13} /> Edit Company Info
            </button>
          )}
        </div>

        {loadingOrg ? (
          <div className="space-y-2 py-2">
            <SkeletonLine height="20px" width="100%" />
            <SkeletonLine height="20px" width="100%" />
            <SkeletonLine height="20px" width="100%" />
          </div>
        ) : orgError ? (
          <InlineErrorState message={orgError} onRetry={fetchOrgDetails} />
        ) : orgDetails ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
            {/* Left: Logo Upload & Visual Branding Section */}
            <div className="lg:col-span-4 bg-slate-50 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider block mb-2">
                  Official Company Logo
                </span>
                <div className="w-full h-32 bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center p-3 relative overflow-hidden group">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : orgDetails.logoUrl ? (
                    <img
                      src={orgDetails.logoUrl}
                      alt={`${orgDetails.name} Logo`}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        // Fallback if logo failed to load
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-center text-slate-400">
                      <ImageIcon size={32} className="mx-auto mb-1 text-slate-300" />
                      <span className="text-[11px]">No logo uploaded</span>
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoFileSelect}
                  className="hidden"
                />

                <p className="text-[10px] text-slate-500 mt-2 text-center">
                  Formats: PNG, JPEG, WebP, SVG • Maximum size: 2MB
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex flex-col gap-2">
                {logoPreview ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={handleUploadLogoConfirm}
                      className="flex-1 omni-btn-primary text-xs py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold flex items-center justify-center gap-1.5"
                    >
                      <UploadCloud size={13} /> {logoUploading ? 'Saving...' : 'Confirm Upload'}
                    </button>
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => {
                        setLogoPreview(null);
                        setLogoFile(null);
                      }}
                      className="omni-btn-ghost text-xs py-1.5 px-2.5 text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                        className="flex-1 omni-btn-ghost text-xs py-1.5 text-teal-700 border border-teal-200 bg-white hover:bg-teal-50 font-semibold flex items-center justify-center gap-1.5"
                      >
                        <UploadCloud size={13} /> {orgDetails.logoUrl ? 'Change Logo' : 'Upload Logo'}
                      </button>
                    )}
                    {isAdmin && orgDetails.logoUrl && (
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={handleRemoveLogo}
                        className="omni-btn-ghost text-xs py-1.5 px-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200"
                        title="Remove logo"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detailed Metadata & Company Context */}
            <div className="lg:col-span-8 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                  <span className="text-[11px] text-[#5B6672] block">Registered Entity Name</span>
                  <span className="font-semibold text-[#1B2430] text-sm">{orgDetails.name}</span>
                </div>
                <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                  <span className="text-[11px] text-[#5B6672] block">Industry & Sector</span>
                  <span className="font-semibold text-teal-800 text-sm">
                    {orgDetails.industry || 'Healthcare & Life Sciences'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                <span className="text-[11px] text-[#5B6672] block mb-0.5">Organization Description</span>
                <p className="text-slate-800 leading-relaxed text-xs">
                  {orgDetails.description ||
                    'Integrated multi-speciality tertiary healthcare hospital network providing clinical diagnostics, surgical procedures, and inpatient care.'}
                </p>
              </div>

              <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                <span className="text-[11px] text-[#5B6672] block mb-0.5">Business Activities & Scope</span>
                <p className="text-slate-800 leading-relaxed text-xs">
                  {orgDetails.businessActivities ||
                    'Inpatient healthcare delivery, outpatient clinics, electronic health records (EHR) management, telemedicine services, and medical imaging infrastructure.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                  <span className="text-[11px] text-[#5B6672] block mb-0.5 flex items-center gap-1">
                    <MapPin size={11} className="text-teal-700" /> Registered Address
                  </span>
                  <span className="text-slate-800 font-medium block">
                    {orgDetails.registeredAddress || 'Plot 42, Healthcare City, Cyberabad, Hyderabad, Telangana 500081, India'}
                  </span>
                </div>
                <div className="bg-slate-50/70 p-2.5 rounded border border-slate-200/70">
                  <span className="text-[11px] text-[#5B6672] block mb-0.5 flex items-center gap-1">
                    <Mail size={11} className="text-teal-700" /> Official Contact Info
                  </span>
                  <div className="text-slate-800 font-medium space-y-0.5">
                    <div>{orgDetails.contactEmail || 'compliance@meridianhealth.in'}</div>
                    <div className="text-[11px] text-slate-600">{orgDetails.contactPhone || '+91 40 4567 8900'}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#EDEFED] text-[11px]">
                <div>
                  <span className="text-[#5B6672] block">Organization ID</span>
                  <span className="omni-mono text-[10px] text-slate-700 font-medium truncate block" title={orgDetails.id}>
                    {orgDetails.id}
                  </span>
                </div>
                <div>
                  <span className="text-[#5B6672] block">Primary Region</span>
                  <span className="font-semibold text-slate-800">{orgDetails.primaryRegion}</span>
                </div>
                <div>
                  <span className="text-[#5B6672] block">License State</span>
                  <span
                    className={`omni-badge ${
                      orgDetails.licenseState === 'ACTIVE'
                        ? 'omni-badge-teal'
                        : orgDetails.licenseState === 'EXPIRED'
                        ? 'omni-badge-rose'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {orgDetails.licenseState}
                  </span>
                </div>
                <div>
                  <span className="text-[#5B6672] block">Members & Pods</span>
                  <span className="font-semibold text-slate-800">
                    {orgDetails.activeMemberCount} Users · {orgDetails.departmentCount} Depts
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2. FRAMEWORK COMMERCIAL ENTITLEMENTS CARD */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
              <BookOpen size={16} className="text-teal-700" /> Commercial Framework Entitlements
            </h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Framework access provisioned for this organization by Arav Control Plane licensing authority.
            </p>
          </div>
          <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
            <Lock size={12} /> Managed by Arav Control Plane
          </span>
        </div>

        {loadingOrg ? (
          <div className="space-y-2 py-2">
            <SkeletonLine height="24px" width="100%" />
            <SkeletonLine height="24px" width="100%" />
          </div>
        ) : !orgDetails || orgDetails.entitlements.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-[#EDEFED] rounded-lg bg-[#FAFBFB]">
            <Shield size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-xs text-[#5B6672]">No framework commercial entitlements currently provisioned.</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Contact Arav Innovations Platform Support to activate framework catalog licenses.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                  <th className="py-2.5 px-3">Framework Code</th>
                  <th className="py-2.5 px-3">Framework Name</th>
                  <th className="py-2.5 px-3">Version Scope</th>
                  <th className="py-2.5 px-3">Entitlement Status</th>
                  <th className="py-2.5 px-3">Provenance / Source</th>
                </tr>
              </thead>
              <tbody>
                {orgDetails.entitlements.map((e) => (
                  <tr key={e.id} className="border-b border-[#EDEFED] hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-semibold text-[#1B2430]">
                      <span className="omni-mono text-[11px] bg-[#EDEFED] px-1.5 py-0.5 rounded text-teal-800">
                        {e.frameworkCode}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#1B2430] font-medium">{e.frameworkName}</td>
                    <td className="py-2.5 px-3 text-[#5B6672]">{e.versionName || 'Framework-wide (All Versions)'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`omni-badge ${
                          e.status === 'ACTIVE'
                            ? 'omni-badge-teal'
                            : e.status === 'EXPIRED'
                            ? 'omni-badge-rose'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#5B6672] omni-mono text-[11px]">{e.source || 'ARAV_CONTROL_PLANE'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. ORGANIZATION HIERARCHY, MEMBERS, DEPARTMENTS & PROJECTS */}
      <OrganizationHierarchyView />

      {/* 4. TEAM & SECURE INVITATIONS MANAGEMENT */}
      <TeamInvitationsView />

      {/* 5. POLICY GOVERNANCE & CATEGORIES MANAGEMENT */}
      <PolicyCategoriesSettingsCard />

      {/* 6. ACTIVE DIRECTORY / MICROSOFT ENTRA ID INTEGRATION */}
      <DirectoryIntegrationSettingsCard />

      {/* 7. USER PREFERENCES CARD */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1B2430] mb-3.5">User Preferences</h2>
        <div className="flex justify-between items-center py-2">
          <div className="flex items-center gap-2.5">
            <Mail size={16} className="text-teal-700" />
            <div>
              <span className="text-xs font-medium text-[#1B2430]">Email Notifications & Reminders</span>
              <p className="text-[11.5px] text-[#5B6672] m-0">Receive email alerts for task assignments and due-date reminders</p>
            </div>
          </div>
          <button
            onClick={handleOpenEmailModal}
            disabled={savingEmailPref}
            className={`omni-badge transition-all cursor-pointer ${
              emailNotifs ? 'omni-badge-teal' : 'bg-gray-100 text-gray-600 border-gray-300'
            }`}
            aria-label={`Toggle email notifications, currently ${emailNotifs ? 'enabled' : 'disabled'}`}
          >
            {emailNotifs ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* 6. PLATFORM INTEGRATIONS CARD */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3.5">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430]">Platform Integrations</h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Connect external messaging platforms, issue trackers, and identity directories
            </p>
          </div>
          {!isAdmin && (
            <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {/* Slack Integration Block */}
        <div className="border border-[#EDEFED] rounded-lg p-3.5 mb-3 bg-[#FAFBFB]">
          <div className="flex justify-between items-center mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <div>
                <span className="text-xs font-semibold text-[#1B2430]">Slack Incoming Webhook</span>
                <span className="text-[11px] text-[#5B6672] ml-2">Org-level critical alerts (<code className="omni-mono">MAPPING_OVERRIDDEN</code>, <code className="omni-mono">POD_STATUS_CHANGED</code>)</span>
              </div>
            </div>
            <span className={`omni-badge ${slackConfigured ? 'omni-badge-teal' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {slackConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
            </span>
          </div>

          <form onSubmit={handleOpenSlackModal} className="flex gap-2 flex-wrap md:flex-nowrap">
            <input
              type="text"
              placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              disabled={!isAdmin || savingSlack}
              className="omni-input flex-1 h-8 text-xs"
              aria-label="Slack Webhook URL"
            />
            {isAdmin && (
              <>
                <button
                  type="submit"
                  disabled={savingSlack || !slackWebhook.trim()}
                  className="omni-btn-ghost text-xs h-8 px-3 whitespace-nowrap omni-btn-primary"
                >
                  {savingSlack ? 'Saving...' : 'Save Webhook'}
                </button>
                {slackConfigured && (
                  <button
                    type="button"
                    onClick={handleTestSlack}
                    disabled={testingSlack}
                    className="omni-btn-ghost text-xs h-8 px-3 flex items-center gap-1 whitespace-nowrap"
                    aria-label="Send test notification to Slack"
                  >
                    <Send size={12} />
                    {testingSlack ? 'Sending...' : 'Test Alert'}
                  </button>
                )}
              </>
            )}
          </form>
        </div>
      </div>

      {/* 7. REGIONAL HOSTING PODS CARD */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3.5">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430]">Regional Hosting Pods</h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Multi-region cloud infrastructure tenancy & data residency options
            </p>
          </div>
          {!isAdmin && (
            <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {podError ? (
          <InlineErrorState message={podError} onRetry={fetchPods} />
        ) : loadingPods ? (
          <div className="space-y-3 py-2">
            <SkeletonLine height="24px" width="100%" />
            <SkeletonLine height="24px" width="100%" />
          </div>
        ) : pods.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-[#EDEFED] rounded-lg bg-[#FAFBFB]">
            <Globe2 size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-xs text-[#5B6672]">No regional hosting pod configurations returned from backend.</p>
          </div>
        ) : (
          pods.map((r, i, arr) => {
            const isActive = r.status === PodStatus.ACTIVE;
            return (
              <div key={r.id || r.region} className={`text-xs flex justify-between items-center py-3 ${
                i < arr.length - 1 ? 'border-b border-[#EDEFED]' : ''
              }`}>
                <div className="flex items-center gap-2.5">
                  <Globe2 size={16} className={isActive ? 'text-teal-700' : 'text-gray-400'} />
                  <div>
                    <span className="text-[#1B2430] font-medium">{regionNameMap[r.region] || r.region}</span>
                    {r.region === 'INDIA' && (
                      <span className="ml-2 omni-badge omni-badge-teal text-[10px] py-0 px-1.5">Primary</span>
                    )}
                  </div>
                </div>

                {isAdmin ? (
                  <button
                    onClick={() => handleToggleClick(r)}
                    className={`omni-badge transition-all cursor-pointer ${
                      isActive ? 'omni-badge-teal' : 'omni-badge-rose'
                    }`}
                    aria-label={`Toggle pod status for ${r.region}, currently ${r.status}`}
                  >
                    <span>{r.status}</span>
                    <span className="text-[10px] opacity-75 ml-1">(Toggle)</span>
                  </button>
                ) : (
                  <span className={`omni-badge ${isActive ? 'omni-badge-teal' : 'omni-badge-rose'}`}>
                    {r.status}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* EDIT ORGANIZATION & COMPANY PROFILE MODAL */}
      {showEditOrgModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-teal-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Edit Company Information & Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update canonical organization metadata, business scope, registered address, and official contacts.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveOrgDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">Company / Registered Name *</label>
                  <input
                    type="text"
                    required
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    className="omni-input w-full text-xs"
                    placeholder="e.g. Meridian Health Pvt. Ltd."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">Industry & Sector</label>
                  <input
                    type="text"
                    value={editIndustry}
                    onChange={(e) => setEditIndustry(e.target.value)}
                    className="omni-input w-full text-xs"
                    placeholder="e.g. Healthcare & Life Sciences"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1B2430] mb-1">Organization Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="omni-input w-full text-xs"
                  placeholder="Summary of organizational purpose, mission, and scope..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1B2430] mb-1">Business Activities & Services</label>
                <textarea
                  rows={2}
                  value={editBusinessActivities}
                  onChange={(e) => setEditBusinessActivities(e.target.value)}
                  className="omni-input w-full text-xs"
                  placeholder="Primary clinical, commercial, or operational business activities..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1B2430] mb-1">Registered Address</label>
                <textarea
                  rows={2}
                  value={editRegisteredAddress}
                  onChange={(e) => setEditRegisteredAddress(e.target.value)}
                  className="omni-input w-full text-xs"
                  placeholder="Official legal/registered corporate address..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">Official Contact Email</label>
                  <input
                    type="email"
                    value={editContactEmail}
                    onChange={(e) => setEditContactEmail(e.target.value)}
                    className="omni-input w-full text-xs"
                    placeholder="e.g. compliance@meridianhealth.in"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">Official Contact Phone</label>
                  <input
                    type="tel"
                    value={editContactPhone}
                    onChange={(e) => setEditContactPhone(e.target.value)}
                    className="omni-input w-full text-xs"
                    placeholder="e.g. +91 40 4567 8900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1B2430] mb-1">Primary Region</label>
                <input
                  type="text"
                  required
                  value={editPrimaryRegion}
                  onChange={(e) => setEditPrimaryRegion(e.target.value)}
                  className="omni-input w-full text-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditOrgModal(false)}
                  className="omni-btn-ghost text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOrg || !editOrgName.trim()}
                  className="omni-btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold"
                >
                  {savingOrg ? 'Saving...' : 'Save Company Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGIONAL POD CAUTION CONFIRMATION MODAL */}
      {selectedPod && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl border-2 border-red-200">
            <div className="flex items-start gap-3 mb-4 pb-3 border-b border-red-100">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <ShieldAlert size={22} className="text-red-700" />
              </div>
              <div>
                <div className="inline-block px-2 py-0.5 rounded bg-red-700 text-white font-mono text-[10px] font-bold tracking-wider uppercase mb-1">
                  EXTREME CAUTION REQUIRED
                </div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Toggle Data Hosting Pod Status
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {regionNameMap[selectedPod.region]} · <span className="font-mono font-bold text-slate-900">{selectedPod.status}</span> → <span className="font-mono font-bold text-red-600">{selectedPod.status === PodStatus.ACTIVE ? PodStatus.INACTIVE : PodStatus.ACTIVE}</span>
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2 mb-4 leading-relaxed">
              <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs text-red-700">
                <AlertTriangle size={14} /> Data Residency & Compliance Consequences:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>Toggling hosting pod status impacts regional data residency compliance boundaries (GDPR / DPDP / HIPAA).</li>
                <li>This updates the organization's tenant routing table record in the platform database.</li>
                <li>At least one regional hosting pod must remain ACTIVE for tenant operation.</li>
              </ul>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs font-semibold text-red-950 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={podAckChecked}
                onChange={(e) => setPodAckChecked(e.target.checked)}
                className="mt-0.5 accent-red-700 w-4 h-4 rounded shrink-0"
              />
              <span>
                I confirm that I am an authorized Administrator and understand that changing regional hosting pod tenancy impacts data residency compliance.
              </span>
            </label>

            {podModalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs mb-4 flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" />
                <span>{podModalError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                disabled={updatingPod}
                onClick={() => setSelectedPod(null)}
                className="omni-btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                disabled={updatingPod || !podAckChecked}
                onClick={handleConfirmToggle}
                className={`omni-btn-primary text-xs px-4 py-2 font-bold ${
                  !podAckChecked
                    ? 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-600 border-none'
                    : selectedPod.status === PodStatus.ACTIVE
                    ? 'bg-red-700 hover:bg-red-800 text-white'
                    : 'bg-teal-700 hover:bg-teal-800 text-white'
                }`}
              >
                {updatingPod ? 'Updating Status...' : selectedPod.status === PodStatus.ACTIVE ? 'Confirm Deactivation' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER EMAIL NOTIFICATION MODAL */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Mail size={20} className="text-teal-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Confirm Email Notification Preference
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update alert settings for <span className="font-semibold">{user?.email}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 p-3.5 rounded-xl mb-5">
              {emailNotifs
                ? 'Disabling email notifications will stop automated alerts for compliance task assignments, 30/60/90 day rolling deadlines, and pod status changes. You can re-enable this preference at any time.'
                : 'Enabling email notifications will send automated alerts for compliance task assignments, rolling deadlines, and regional pod status changes to your account email.'}
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowEmailModal(false)}
                className="omni-btn-ghost text-xs px-4 py-2"
              >
                Keep Current
              </button>
              <button
                onClick={handleConfirmEmailPref}
                className="omni-btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold"
              >
                Confirm Preference Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLACK INTEGRATION MODAL */}
      {showSlackModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Confirm Slack Webhook Integration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Organization-level alert routing
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 p-3.5 rounded-xl mb-5">
              Connecting or updating this Slack Incoming Webhook will route all high-severity platform alerts (such as <code className="omni-mono text-slate-800">MAPPING_OVERRIDDEN</code> and <code className="omni-mono text-slate-800">POD_STATUS_CHANGED</code>) directly to your designated Slack channel.
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowSlackModal(false)}
                className="omni-btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSlackSave}
                className="omni-btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold"
              >
                Confirm & Connect Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
