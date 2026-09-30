'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Megaphone,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  X,
  Lock,
  ChevronLeft,
  ChevronRight,
  Mail,
  Send,
  Calendar,
  Clock,
  Building2,
  Users,
  ShieldCheck,
  FileText,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import {
  PlatformAnnouncement,
  AnnouncementsResponse,
  AnnouncementSeverity,
  AnnouncementStatus,
  AnnouncementAudience,
  OrganizationControlState,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

export default function CommunicationsPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Core Data States
  const [announcementsData, setAnnouncementsData] = useState<AnnouncementsResponse | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationControlState[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Filter & Search States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Modal States
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<PlatformAnnouncement | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [publishingAnnouncement, setPublishingAnnouncement] = useState<PlatformAnnouncement | null>(null);

  // Form States
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formSeverity, setFormSeverity] = useState<AnnouncementSeverity>('INFO');
  const [formAudience, setFormAudience] = useState<AnnouncementAudience>('ALL_ORGANIZATIONS');
  const [formTargetOrgId, setFormTargetOrgId] = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formSendEmail, setFormSendEmail] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Role Permissions
  const canViewCommunications =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'COMMERCIAL_OPERATOR' ||
    operator?.role === 'OPERATIONS_ENGINEER' ||
    operator?.role === 'SUPPORT_ENGINEER' ||
    operator?.role === 'SECURITY_AUDIT' ||
    operator?.role === 'READ_ONLY_AUDITOR';

  const canCreateAnnouncement =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'COMMERCIAL_OPERATOR' ||
    operator?.role === 'OPERATIONS_ENGINEER' ||
    operator?.role === 'SUPPORT_ENGINEER';

  const canPublishAnnouncement =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'COMMERCIAL_OPERATOR' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  // Fetch Announcements
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [resp, orgs] = await Promise.all([
        controlPlaneApi.listAnnouncements({
          search: search.trim() || undefined,
          status: statusFilter !== 'ALL' ? (statusFilter as AnnouncementStatus) : undefined,
          severity: severityFilter !== 'ALL' ? (severityFilter as AnnouncementSeverity) : undefined,
          audience: audienceFilter !== 'ALL' ? (audienceFilter as AnnouncementAudience) : undefined,
          organizationId: selectedOrgId || undefined,
          page: currentPage,
          limit: pageSize,
        }),
        controlPlaneApi.listOrganizations().catch(() => []),
      ]);

      setAnnouncementsData(resp);
      setOrganizations(orgs || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to load platform communications'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, severityFilter, audienceFilter, selectedOrgId, currentPage, pageSize]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim() || formTitle.trim().length < 3) {
      setFormError('Title must be at least 3 characters long.');
      return;
    }

    if (!formBody.trim() || formBody.trim().length < 5) {
      setFormError('Body text must be at least 5 characters long.');
      return;
    }

    if (formAudience === 'SPECIFIC_ORGANIZATION' && !formTargetOrgId) {
      setFormError('Target organization must be selected for specific organization audience.');
      return;
    }

    setIsSubmitting(true);

    try {
      await controlPlaneApi.createAnnouncement({
        title: formTitle.trim(),
        body: formBody.trim(),
        severity: formSeverity,
        audience: formAudience,
        targetOrganizationId: formAudience === 'SPECIFIC_ORGANIZATION' ? formTargetOrgId : undefined,
        scheduledAt: formScheduledAt ? new Date(formScheduledAt).toISOString() : undefined,
        expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined,
        sendEmail: formSendEmail,
      });

      setIsCreateOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create platform announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Publish Announcement
  const handleConfirmPublish = async () => {
    if (!publishingAnnouncement) return;
    setIsSubmitting(true);

    try {
      await controlPlaneApi.publishAnnouncement(publishingAnnouncement.id);
      setPublishingAnnouncement(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to publish announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel Announcement
  const handleCancelAnnouncement = async (announcement: PlatformAnnouncement) => {
    if (!confirm(`Are you sure you want to cancel announcement "${announcement.title}"?`)) return;

    try {
      await controlPlaneApi.cancelAnnouncement(announcement.id);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel announcement.');
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormBody('');
    setFormSeverity('INFO');
    setFormAudience('ALL_ORGANIZATIONS');
    setFormTargetOrgId('');
    setFormScheduledAt('');
    setFormExpiresAt('');
    setFormSendEmail(false);
    setFormError(null);
  };

  // KPI Computations
  const announcementsList = announcementsData?.data || [];
  const meta = announcementsData?.meta || { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

  const stats = useMemo(() => {
    const published = announcementsList.filter((a) => a.status === 'PUBLISHED').length;
    const scheduled = announcementsList.filter((a) => a.status === 'SCHEDULED').length;
    const drafts = announcementsList.filter((a) => a.status === 'DRAFT').length;
    return { published, scheduled, drafts };
  }, [announcementsList]);

  const renderSeverityBadge = (severity: AnnouncementSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/20"><AlertOctagon className="h-3 w-3" /> CRITICAL</span>;
      case 'WARNING':
        return <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 border border-amber-500/20"><AlertTriangle className="h-3 w-3" /> WARNING</span>;
      case 'NOTICE':
        return <span className="inline-flex items-center gap-1 rounded bg-aravBlue-500/10 px-2 py-0.5 text-[11px] font-bold text-aravBlue-300 border border-aravBlue-500/20"><Info className="h-3 w-3" /> NOTICE</span>;
      case 'INFO':
      default:
        return <span className="inline-flex items-center gap-1 rounded bg-gray-500/10 px-2 py-0.5 text-[11px] font-bold text-gray-300 border border-gray-500/20"><Info className="h-3 w-3" /> INFO</span>;
    }
  };

  const renderStatusBadge = (status: AnnouncementStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return <StatusBadge status="ACTIVE" label="PUBLISHED" size="sm" />;
      case 'SCHEDULED':
        return <StatusBadge status="PENDING" label="SCHEDULED" size="sm" />;
      case 'DRAFT':
        return <StatusBadge status="SUSPENDED" label="DRAFT" size="sm" />;
      case 'CANCELLED':
      case 'EXPIRED':
        return <StatusBadge status="REVOKED" label={status} size="sm" />;
      default:
        return <StatusBadge status="SUSPENDED" label={status} size="sm" />;
    }
  };

  if (isAuthLoading || (isLoading && !announcementsData && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Platform Communications & Advisories API"
        requiredRole="PLATFORM_SUPER_ADMIN / COMMERCIAL_OPERATOR / OPERATIONS_ENGINEER / SUPPORT_ENGINEER / SECURITY_AUDIT / READ_ONLY_AUDITOR"
      />
    );
  }

  if (!canViewCommunications) {
    return (
      <AccessDenied
        resource="Platform Communications & Advisories"
        requiredRole="Control Plane Authorized Operator Roles"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load Platform Communications"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-aravBlue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Platform Communications & Advisories</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Control Plane platform announcements, maintenance advisories, and operational notices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs text-gray-300">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>Operator Access ({operator?.role})</span>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-cpDark-700 bg-cpDark-800 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white transition-colors focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-aravBlue-400' : ''}`} />
            <span>Refresh</span>
          </button>

          {canCreateAnnouncement && (
            <button
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded bg-aravBlue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-aravBlue-500 transition-colors focus-ring shadow-md"
            >
              <Plus className="h-4 w-4" />
              <span>Create Announcement</span>
            </button>
          )}
        </div>
      </div>

      {/* Scope Distinction Notice */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-950 p-4 text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-aravBlue-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>Control Plane Communication Authority</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] text-gray-400">
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-aravBlue-300 block mb-1">Platform Communications (This Module)</span>
            Administrative announcements, planned maintenance advisories, platform status updates, organization notices, and commercial alerts originating from Arav Control Plane operators.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-emerald-300 block mb-1">Tenant Notifications</span>
            User task reminders, risk escalations, policy approval requests, and localized workflow digests are isolated within Data Plane deployments and managed per customer database.
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Announcements</span>
          <div className="mt-1 text-2xl font-bold text-white">{meta.total}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Active Published</span>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{stats.published}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Scheduled Future</span>
          <div className="mt-1 text-2xl font-bold text-amber-300">{stats.scheduled}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Drafts</span>
          <div className="mt-1 text-2xl font-bold text-gray-300">{stats.drafts}</div>
        </div>
      </div>

      {/* Server-Side Filters Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search announcement title, text content, ID..."
              className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" />

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="NOTICE">NOTICE</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Audience Filter */}
            <select
              value={audienceFilter}
              onChange={(e) => {
                setAudienceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="ALL">All Audiences</option>
              <option value="ALL_ORGANIZATIONS">ALL_ORGANIZATIONS</option>
              <option value="ALL_OPERATORS">ALL_OPERATORS</option>
              <option value="SPECIFIC_ORGANIZATION">SPECIFIC_ORGANIZATION</option>
            </select>

            {/* Target Organization Selector */}
            <select
              value={selectedOrgId}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="">All Target Organizations</option>
              {organizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.organizationId} ({o.state})
                </option>
              ))}
            </select>

            {/* Page Size Bounded Selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Announcements Table */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-3">Announcement Title & Details</th>
                <th scope="col" className="px-4 py-3">Severity</th>
                <th scope="col" className="px-4 py-3">Audience / Target</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Created By</th>
                <th scope="col" className="px-4 py-3">Schedule / Published Date</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
              {announcementsList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                    No platform announcements match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                announcementsList.map((item) => (
                  <tr key={item.id} className="hover:bg-cpDark-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.sendEmail && (
                          <span className="inline-flex items-center text-[10px] text-aravBlue-400" title="Email Dispatch Enabled">
                            <Mail className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-[11px] truncate max-w-md">{item.body}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderSeverityBadge(item.severity)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                      <div className="font-semibold text-gray-200">{item.audience}</div>
                      {item.targetOrganizationId && (
                        <div className="text-aravBlue-300 font-mono text-[10px]">{item.targetOrganizationId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderStatusBadge(item.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                      <div className="text-gray-200 font-semibold">{item.creator?.fullName || 'Operator'}</div>
                      <div className="text-gray-500 font-mono">{item.creator?.role || 'SYSTEM'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[11px] text-gray-400">
                      {item.publishedAt ? (
                        <div>Published: {new Date(item.publishedAt).toLocaleString()}</div>
                      ) : item.scheduledAt ? (
                        <div>Scheduled: {new Date(item.scheduledAt).toLocaleString()}</div>
                      ) : (
                        <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedAnnouncement(item)}
                          className="rounded bg-cpDark-800 text-gray-300 border border-cpDark-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-cpDark-700 hover:text-white transition-colors"
                        >
                          Inspect
                        </button>

                        {canPublishAnnouncement && (item.status === 'DRAFT' || item.status === 'SCHEDULED') && (
                          <button
                            onClick={() => setPublishingAnnouncement(item)}
                            className="rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-600/30 hover:text-white transition-colors flex items-center gap-1"
                          >
                            <Send className="h-3 w-3" />
                            <span>Publish</span>
                          </button>
                        )}

                        {canPublishAnnouncement && (item.status === 'DRAFT' || item.status === 'SCHEDULED') && (
                          <button
                            onClick={() => handleCancelAnnouncement(item)}
                            className="rounded bg-rose-600/20 text-rose-300 border border-rose-500/30 px-2 py-1 text-[11px] font-semibold hover:bg-rose-600/30 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bounded Pagination Controls */}
        <div className="flex items-center justify-between border-t border-cpDark-800 bg-cpDark-950 px-4 py-3 text-xs text-gray-400">
          <div>
            Showing <strong className="text-white">{announcementsList.length}</strong> of <strong className="text-white">{meta.total}</strong> total announcements
            (Page {meta.page} of {meta.totalPages || 1})
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={!meta.hasPreviousPage || isLoading}
              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-900 px-3 py-1.5 text-xs text-gray-300 hover:bg-cpDark-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={!meta.hasNextPage || isLoading}
              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-900 px-3 py-1.5 text-xs text-gray-300 hover:bg-cpDark-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Announcement Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-aravBlue-400" />
                <h3 className="text-base font-bold text-white">Create Platform Announcement</h3>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-bold mb-1">Announcement Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Scheduled Infrastructure Upgrade Notice"
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-white focus-ring"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold mb-1">Body Text Content *</label>
                <textarea
                  required
                  rows={4}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Enter detailed notice information, operational instructions, or advisory text..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-white focus-ring font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Severity Level</label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value as AnnouncementSeverity)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
                  >
                    <option value="INFO">INFO (General Information)</option>
                    <option value="NOTICE">NOTICE (Operational Advisory)</option>
                    <option value="WARNING">WARNING (Service Degradation Notice)</option>
                    <option value="CRITICAL">CRITICAL (Emergency / Suspension Notice)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 font-bold mb-1">Target Audience</label>
                  <select
                    value={formAudience}
                    onChange={(e) => setFormAudience(e.target.value as AnnouncementAudience)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
                  >
                    <option value="ALL_ORGANIZATIONS">ALL_ORGANIZATIONS (All Platform Orgs)</option>
                    <option value="ALL_OPERATORS">ALL_OPERATORS (Control Plane Operators)</option>
                    <option value="SPECIFIC_ORGANIZATION">SPECIFIC_ORGANIZATION (Single Org)</option>
                  </select>
                </div>
              </div>

              {formAudience === 'SPECIFIC_ORGANIZATION' && (
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Target Organization *</label>
                  <select
                    required
                    value={formTargetOrgId}
                    onChange={(e) => setFormTargetOrgId(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring font-mono"
                  >
                    <option value="">Select target organization...</option>
                    {organizations.map((o) => (
                      <option key={o.organizationId} value={o.organizationId}>
                        {o.organizationId} ({o.state})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Scheduled Publication (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-bold mb-1">Expiration Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-cpDark-800">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={formSendEmail}
                  onChange={(e) => setFormSendEmail(e.target.checked)}
                  className="rounded border-cpDark-700 bg-cpDark-950 text-aravBlue-500 focus-ring"
                />
                <label htmlFor="sendEmail" className="text-xs text-gray-200 font-medium">
                  Dispatch email notification upon publication (Server-side Resend Mailer)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-cpDark-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-xs text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded bg-aravBlue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-aravBlue-500 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {publishingAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-emerald-500/40 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Confirm Announcement Publication</h3>
              </div>
              <button onClick={() => setPublishingAnnouncement(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300 bg-cpDark-950 p-4 rounded border border-cpDark-800 font-mono">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Title</span>
                <span className="font-bold text-white">{publishingAnnouncement.title}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Severity</span>
                <div>{renderSeverityBadge(publishingAnnouncement.severity)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Target Audience</span>
                <span className="font-semibold text-aravBlue-300">{publishingAnnouncement.audience}</span>
                {publishingAnnouncement.targetOrganizationId && (
                  <span className="text-gray-400 block text-[11px] font-mono">
                    Target Org: {publishingAnnouncement.targetOrganizationId}
                  </span>
                )}
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Email Dispatch</span>
                <span className={publishingAnnouncement.sendEmail ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                  {publishingAnnouncement.sendEmail ? 'Enabled (Server-Side Mailer)' : 'Disabled (In-Product Only)'}
                </span>
              </div>
            </div>

            <p className="text-xs text-amber-300 bg-amber-500/10 p-3 rounded border border-amber-500/20">
              Publishing will make this announcement visible to authorized recipients and generate an immutable audit log record.
            </p>

            <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
              <button
                type="button"
                onClick={() => setPublishingAnnouncement(null)}
                className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isSubmitting}
                className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSubmitting ? 'Publishing...' : 'Confirm & Publish Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forensic Detail View Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-aravBlue-400" />
                <h3 className="text-base font-bold text-white">Announcement Record: {selectedAnnouncement.id}</h3>
              </div>
              <button onClick={() => setSelectedAnnouncement(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-gray-300 bg-cpDark-950 p-4 rounded border border-cpDark-800 font-mono">
              <div className="col-span-2">
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Title</span>
                <span className="font-bold text-white text-sm">{selectedAnnouncement.title}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Severity Level</span>
                <div>{renderSeverityBadge(selectedAnnouncement.severity)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Status</span>
                <div>{renderStatusBadge(selectedAnnouncement.status)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Audience</span>
                <span className="font-semibold text-aravBlue-300">{selectedAnnouncement.audience}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Target Organization</span>
                <span>{selectedAnnouncement.targetOrganizationId || 'N/A (All Organizations)'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Created By Operator</span>
                <span>{selectedAnnouncement.creator?.fullName || selectedAnnouncement.createdByOperatorId}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Email Dispatch Status</span>
                <span className="font-bold text-gray-200">{selectedAnnouncement.emailDeliveryStatus}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Email Recipient Count</span>
                <span>{selectedAnnouncement.emailRecipientCount} recipients</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Published Date</span>
                <span>{selectedAnnouncement.publishedAt ? new Date(selectedAnnouncement.publishedAt).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 block text-[10px] uppercase font-bold mb-1">Body Text Content</span>
                <div className="p-3 bg-cpDark-900 border border-cpDark-800 rounded text-gray-200 whitespace-pre-wrap text-xs">
                  {selectedAnnouncement.body}
                </div>
              </div>
              {selectedAnnouncement.emailErrorDetails && (
                <div className="col-span-2 text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/20 text-[11px]">
                  <span className="font-bold block mb-1">Email Delivery Error Details:</span>
                  {selectedAnnouncement.emailErrorDetails}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-cpDark-800 pt-3">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
