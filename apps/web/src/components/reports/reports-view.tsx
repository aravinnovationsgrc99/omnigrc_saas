'use client';

import React, { useState, useEffect } from 'react';
import {
  ReportType,
  ReportResponseDto,
  ExportFormat,
} from '@omnigrc/shared';
import { FRONTEND_REPORTS } from './report-registry';
import { apiRequest } from '@/lib/api-client';
import {
  FileSpreadsheet,
  Download,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

export function ReportsView() {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>(
    ReportType.EXECUTIVE_GRC_POSTURE,
  );

  const meta = FRONTEND_REPORTS[selectedReportType];

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [criticality, setCriticality] = useState('');
  const [environment, setEnvironment] = useState('');
  const [type, setType] = useState('');
  const [cadence, setCadence] = useState('');
  const [scoreBand, setScoreBand] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [upcoming, setUpcoming] = useState(false);

  const [sortBy, setSortBy] = useState(meta?.defaultSortBy || '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    meta?.defaultSortDirection || 'desc',
  );
  const [page, setPage] = useState(1);
  const limit = 20;

  const [reportData, setReportData] = useState<ReportResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset filters when switching reports
  useEffect(() => {
    const newMeta = FRONTEND_REPORTS[selectedReportType];
    setSearch('');
    setStatus('');
    setSeverity('');
    setCriticality('');
    setEnvironment('');
    setType('');
    setCadence('');
    setScoreBand('');
    setOverdue(false);
    setUpcoming(false);
    setSortBy(newMeta?.defaultSortBy || '');
    setSortDirection(newMeta?.defaultSortDirection || 'desc');
    setPage(1);
  }, [selectedReportType]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (search) params.append('search', search);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortDirection) params.append('sortDirection', sortDirection);
      if (status) params.append('status', status);
      if (severity) params.append('severity', severity);
      if (criticality) params.append('criticality', criticality);
      if (environment) params.append('environment', environment);
      if (type) params.append('type', type);
      if (cadence) params.append('cadence', cadence);
      if (scoreBand) params.append('scoreBand', scoreBand);
      if (overdue) params.append('overdue', 'true');
      if (upcoming) params.append('upcoming', 'true');

      const data = await apiRequest<ReportResponseDto>(
        `/reports/${selectedReportType}?${params.toString()}`,
      );
      setReportData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [
    selectedReportType,
    page,
    status,
    severity,
    criticality,
    environment,
    type,
    cadence,
    scoreBand,
    overdue,
    upcoming,
    sortBy,
    sortDirection,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchReport();
  };

  const handleExport = async (format: ExportFormat) => {
    try {
      setExporting(format);
      const params = new URLSearchParams();
      params.append('format', format);
      if (search) params.append('search', search);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortDirection) params.append('sortDirection', sortDirection);
      if (status) params.append('status', status);
      if (severity) params.append('severity', severity);
      if (criticality) params.append('criticality', criticality);
      if (environment) params.append('environment', environment);
      if (type) params.append('type', type);
      if (cadence) params.append('cadence', cadence);
      if (scoreBand) params.append('scoreBand', scoreBand);
      if (overdue) params.append('overdue', 'true');
      if (upcoming) params.append('upcoming', 'true');

      const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const token = typeof window !== 'undefined' ? localStorage.getItem('omnigrc_access_token') : null;

      const res = await fetch(`${API_BASE_URL}/reports/${selectedReportType}/export?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedReportType}_${new Date().toISOString().split('T')[0]}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  const renderBadge = (val: any) => {
    if (!val) return 'N/A';
    const strVal = String(val);

    let bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (['HIGH', 'CRITICAL', 'NON_COMPLIANT'].includes(strVal)) {
      bgClass = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (['MEDIUM', 'PARTIALLY_COMPLIANT', 'IN_PROGRESS', 'UNDER_REVIEW'].includes(strVal)) {
      bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (['LOW', 'COMPLIANT', 'RESOLVED', 'PUBLISHED', 'ACTIVE', 'COMPLETE'].includes(strVal)) {
      bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }

    return (
      <span className={`px-2 py-0.5 border text-[11px] font-semibold rounded-full uppercase tracking-wide ${bgClass}`}>
        {strVal}
      </span>
    );
  };

  const renderCellContent = (colKey: string, dataType: string | undefined, value: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-slate-400">N/A</span>;

    if (dataType === 'badge') {
      return renderBadge(value);
    }

    if (dataType === 'boolean') {
      return value ? (
        <span className="text-rose-600 font-semibold text-xs">Yes</span>
      ) : (
        <span className="text-slate-500 text-xs">No</span>
      );
    }

    if (dataType === 'number') {
      return <span className="omni-mono font-semibold text-slate-900">{value}</span>;
    }

    return <span className="text-slate-800 text-xs">{String(value)}</span>;
  };

  const totalPages = reportData ? Math.ceil(reportData.total / limit) : 1;

  return (
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Reports & Exports</h1>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-semibold rounded-full uppercase tracking-wider">
              Authoritative V1
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Server-side authoritative reporting, filtered query capabilities, and CSV/XLSX downloads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null || loading}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <Download size={14} className="text-slate-500" />
            {exporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
          </button>

          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting !== null || loading}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'xlsx' ? 'Exporting XLSX...' : 'Export XLSX'}
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar & Content */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Report Selector Sidebar */}
        <div className="w-full lg:w-72 bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-1 shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2 block border-b border-slate-100">
            Available Reports
          </span>
          {Object.values(FRONTEND_REPORTS).map((report) => {
            const Icon = report.icon;
            const isSelected = report.id === selectedReportType;
            return (
              <button
                key={report.id}
                onClick={() => setSelectedReportType(report.id)}
                className={`flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-teal-50 border border-teal-200/80 text-teal-900 font-semibold shadow-2xs'
                    : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                }`}
              >
                <div className={`p-1.5 rounded-md ${isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={16} />
                </div>
                <div>
                  <span className="text-xs font-medium block text-slate-900">{report.title}</span>
                  <span className="text-[10px] text-slate-500 block">{report.category}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Report Content Panel */}
        <div className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          {/* Report Description */}
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">{meta.title}</h2>
            <p className="text-xs text-slate-500 mt-1">{meta.description}</p>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-3.5 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
              {meta.supportedFilters.includes('search') && (
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search report records..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              )}

              {meta.supportedFilters.includes('status') && (
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CLOSED">Closed</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ACTIVE">Active</option>
                </select>
              )}

              {meta.supportedFilters.includes('severity') && (
                <select
                  value={severity}
                  onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              )}

              {meta.supportedFilters.includes('criticality') && (
                <select
                  value={criticality}
                  onChange={(e) => { setCriticality(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">All Criticalities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              )}

              {meta.supportedFilters.includes('environment') && (
                <select
                  value={environment}
                  onChange={(e) => { setEnvironment(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">All Environments</option>
                  <option value="PRODUCTION">Production</option>
                  <option value="STAGING">Staging</option>
                  <option value="DEVELOPMENT">Development</option>
                </select>
              )}

              {meta.supportedFilters.includes('scoreBand') && (
                <select
                  value={scoreBand}
                  onChange={(e) => { setScoreBand(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">All Risk Bands</option>
                  <option value="HIGH">High (≥15)</option>
                  <option value="MEDIUM">Medium (8–14)</option>
                  <option value="LOW">Low (1–7)</option>
                </select>
              )}

              {meta.allowlistedSortFields.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown size={13} className="text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                  >
                    {meta.allowlistedSortFields.map((field) => (
                      <option key={field} value={field}>
                        Sort by {field}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 uppercase"
                  >
                    {sortDirection}
                  </button>
                </div>
              )}
            </form>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium text-rose-800 flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Table Container */}
          {loading ? (
            <div className="py-12 text-center text-xs font-medium text-slate-500 animate-pulse flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-teal-700" /> Loading Report Data...
            </div>
          ) : reportData && reportData.data.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    {meta.columns.map((col) => (
                      <th key={col.key} className="py-2.5 px-3">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.data.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      {meta.columns.map((col) => (
                        <td key={col.key} className="py-2.5 px-3">
                          {renderCellContent(col.key, col.dataType, row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <Filter size={20} className="text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-700">No report records found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Try adjusting query parameters or clearing active filters.</p>
            </div>
          )}

          {/* Pagination Footer */}
          {reportData && reportData.total > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
              <span>
                Showing <strong className="text-slate-900">{reportData.data.length}</strong> of{' '}
                <strong className="text-slate-900">{reportData.total}</strong> records
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-medium text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
