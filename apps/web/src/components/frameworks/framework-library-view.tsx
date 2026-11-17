'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FrameworkItemDto, CustomFrameworkImportDto, FrameworkVersionDto, FrameworkReferenceDto } from '@omnigrc/shared';
import { Library, Search, Shield, X, Upload, ShieldCheck, ChevronDown, Filter, FileText, CheckCircle2 } from 'lucide-react';
import { FrameworkCoverageView } from './framework-coverage-view';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiRequest } from '@/lib/api-client';

const DEMO_FRAMEWORKS: FrameworkItemDto[] = [
  { id: 'fw-iso-27001', code: 'ISO27001', name: 'ISO/IEC 27001:2022 Information Security Management', clausesCount: 93, isSystem: true, version: '2022', createdAt: new Date().toISOString() },
  { id: 'fw-soc-2', code: 'SOC2', name: 'SOC 2 Type II AICPA Trust Services Criteria', clausesCount: 64, isSystem: true, version: '2017', createdAt: new Date().toISOString() },
  { id: 'fw-dpdp-2023', code: 'DPDP', name: 'Digital Personal Data Protection Act (India DPDP 2023)', clausesCount: 44, isSystem: true, version: '2023', createdAt: new Date().toISOString() },
  { id: 'fw-hipaa', code: 'HIPAA', name: 'Health Insurance Portability and Accountability Act Security Rule', clausesCount: 54, isSystem: true, version: '2013', createdAt: new Date().toISOString() },
  { id: 'fw-rbi-itg', code: 'RBI-ITG', name: 'Reserve Bank of India Master Direction on IT Governance & Risk', clausesCount: 38, isSystem: true, version: '2023', createdAt: new Date().toISOString() },
];

const DEMO_CLAUSES: Record<string, FrameworkReferenceDto[]> = {
  ISO27001: [
    { id: 'c-1', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.5.1', title: 'Policies for information security', description: 'Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel.', normativeText: null, sortOrder: 1, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-2', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.5.15', title: 'Access control', description: 'Rules to control physical and logical access to information and other associated assets shall be established and implemented based on business and information security requirements.', normativeText: null, sortOrder: 2, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-3', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.8.24', title: 'Use of cryptography', description: 'Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.', normativeText: null, sortOrder: 3, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-4', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.8.16', title: 'Monitoring activities', description: 'Networks, systems and applications shall be monitored for anomalous behavior and appropriate actions taken to evaluate potential information security incidents.', normativeText: null, sortOrder: 4, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-5', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.5.23', title: 'Information security for use of cloud services', description: 'Processes for acquisition, use, management and exit from cloud services shall be established in accordance with the organization’s information security requirements.', normativeText: null, sortOrder: 5, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-6', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.8.7', title: 'Protection against malware', description: 'Protection against malware shall be implemented and supported by appropriate user awareness.', normativeText: null, sortOrder: 6, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'c-7', frameworkVersionId: 'v-2022', parentRefId: null, type: 'CLAUSE' as any, identifier: 'A.8.12', title: 'Data leakage prevention', description: 'Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit sensitive information.', normativeText: null, sortOrder: 7, createdAt: new Date() as any, updatedAt: new Date() as any },
  ],
  SOC2: [
    { id: 's-1', frameworkVersionId: 'v-2017', parentRefId: null, type: 'CRITERIA' as any, identifier: 'CC6.1', title: 'Logical Access Security', description: 'The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events to meet the entity’s objectives.', normativeText: null, sortOrder: 1, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 's-2', frameworkVersionId: 'v-2017', parentRefId: null, type: 'CRITERIA' as any, identifier: 'CC6.7', title: 'Transmission & Data Protection', description: 'The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes.', normativeText: null, sortOrder: 2, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 's-3', frameworkVersionId: 'v-2017', parentRefId: null, type: 'CRITERIA' as any, identifier: 'CC7.2', title: 'System Monitoring & Anomalies', description: 'The entity monitors system components and the operation of controls for anomalies that are indicative of malicious acts, natural disasters, and errors.', normativeText: null, sortOrder: 3, createdAt: new Date() as any, updatedAt: new Date() as any },
  ],
  DPDP: [
    { id: 'd-1', frameworkVersionId: 'v-2023', parentRefId: null, type: 'SECTION' as any, identifier: 'Sec. 6', title: 'Consent & Notice Requirements', description: 'Data Principal shall be given an itemised notice containing clear information on personal data sought and specified purpose of processing.', normativeText: null, sortOrder: 1, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'd-2', frameworkVersionId: 'v-2023', parentRefId: null, type: 'SECTION' as any, identifier: 'Sec. 8', title: 'Obligations of Data Fiduciary (Security Safeguards & Breach Notification)', description: 'A Data Fiduciary shall protect personal data in its possession or under its control by taking reasonable security safeguards to prevent personal data breach.', normativeText: null, sortOrder: 2, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'd-3', frameworkVersionId: 'v-2023', parentRefId: null, type: 'SECTION' as any, identifier: 'Sec. 10', title: 'Additional Obligations of Significant Data Fiduciary', description: 'Significant Data Fiduciary shall appoint a Data Protection Officer based in India and conduct periodic Data Protection Impact Assessments (DPIA).', normativeText: null, sortOrder: 3, createdAt: new Date() as any, updatedAt: new Date() as any },
  ],
  HIPAA: [
    { id: 'h-1', frameworkVersionId: 'v-2013', parentRefId: null, type: 'SPECIFICATION' as any, identifier: '§ 164.312(a)(1)', title: 'Access Control Requirements', description: 'Implement technical policies and procedures for electronic information systems that maintain electronic protected health information to allow access only to those persons or software programs that have been granted access rights.', normativeText: null, sortOrder: 1, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'h-2', frameworkVersionId: 'v-2013', parentRefId: null, type: 'SPECIFICATION' as any, identifier: '§ 164.312(e)(1)', title: 'Transmission Security & Cryptography', description: 'Implement technical security measures to guard against unauthorized access to electronic protected health information that is being transmitted over an electronic communications network.', normativeText: null, sortOrder: 2, createdAt: new Date() as any, updatedAt: new Date() as any },
  ],
  'RBI-ITG': [
    { id: 'r-1', frameworkVersionId: 'v-2023', parentRefId: null, type: 'MANDATE' as any, identifier: 'Sec. 8.2', title: 'Multi-Factor Authentication on All Financial Operations', description: 'Regulated entities shall mandate robust multi-factor authentication for administrative access, customer transactions, and critical gateway endpoints.', normativeText: null, sortOrder: 1, createdAt: new Date() as any, updatedAt: new Date() as any },
    { id: 'r-2', frameworkVersionId: 'v-2023', parentRefId: null, type: 'MANDATE' as any, identifier: 'Sec. 14.1', title: 'Mandatory 6-Hour Statutory Cyber Incident Reporting', description: 'Any unusual cybersecurity incident or breach shall be reported to the Reserve Bank within six hours of detection.', normativeText: null, sortOrder: 2, createdAt: new Date() as any, updatedAt: new Date() as any },
  ],
};

export function FrameworkLibraryView() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'coverage'>('catalog');
  const [frameworks, setFrameworks] = useState<FrameworkItemDto[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkItemDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Versioning state
  const [versions, setVersions] = useState<FrameworkVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Clauses/References state for active version
  const [clauses, setClauses] = useState<FrameworkReferenceDto[]>([]);
  const [loadingClauses, setLoadingClauses] = useState(false);
  const [clausesError, setClausesError] = useState<string | null>(null);

  // Filters & Search
  const [searchClause, setSearchClause] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchFrameworks = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiRequest<FrameworkItemDto[]>('/frameworks');
      if (list && list.length > 0) {
        setFrameworks(list);
        if (!selectedFramework) {
          handleSelectFramework(list[0]);
        }
      } else {
        setFrameworks(DEMO_FRAMEWORKS);
        if (!selectedFramework) {
          handleSelectFramework(DEMO_FRAMEWORKS[0]);
        }
      }
    } catch {
      setFrameworks(DEMO_FRAMEWORKS);
      if (!selectedFramework) {
        handleSelectFramework(DEMO_FRAMEWORKS[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadVersionClauses = async (frameworkIdOrCode: string, versionId: string) => {
    setLoadingClauses(true);
    setClausesError(null);
    try {
      const data = await apiRequest<FrameworkReferenceDto[]>(
        `/frameworks/${frameworkIdOrCode}/versions/${versionId}/clauses`
      );
      if (data && data.length > 0) {
        setClauses(data);
      } else {
        const fallback = DEMO_CLAUSES[frameworkIdOrCode] || DEMO_CLAUSES.ISO27001;
        setClauses(fallback);
      }
    } catch {
      const fallback = DEMO_CLAUSES[frameworkIdOrCode] || DEMO_CLAUSES.ISO27001;
      setClauses(fallback);
    } finally {
      setLoadingClauses(false);
    }
  };

  const handleSelectFramework = async (fw: FrameworkItemDto) => {
    setSelectedFramework(fw);
    setSelectedVersionId('');
    setClauses([]);
    setSearchClause('');
    setTypeFilter('');
    setLoadingVersions(true);

    try {
      const versionList = await apiRequest<FrameworkVersionDto[]>(`/frameworks/${fw.code || fw.id}/versions`);
      if (versionList && versionList.length > 0) {
        setVersions(versionList);
        const activeVer = versionList.find((v) => v.status === 'ACTIVE') || versionList[0];
        setSelectedVersionId(activeVer.id);
        loadVersionClauses(fw.code || fw.id, activeVer.id);
      } else {
        const defaultVersions: FrameworkVersionDto[] = [
          {
            id: 'v-active',
            frameworkId: fw.id,
            version: fw.version || '2022',
            name: `${fw.code} Active Standard`,
            status: 'ACTIVE' as any,
            effectiveDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
        setVersions(defaultVersions);
        setSelectedVersionId(defaultVersions[0].id);
        const fallback = DEMO_CLAUSES[fw.code] || DEMO_CLAUSES.ISO27001;
        setClauses(fallback);
      }
    } catch {
      const defaultVersions: FrameworkVersionDto[] = [
        {
          id: 'v-active',
          frameworkId: fw.id,
          version: fw.version || '2022',
          name: `${fw.code} Active Standard`,
          status: 'ACTIVE' as any,
          effectiveDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setVersions(defaultVersions);
      setSelectedVersionId(defaultVersions[0].id);
      const fallback = DEMO_CLAUSES[fw.code] || DEMO_CLAUSES.ISO27001;
      setClauses(fallback);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleVersionChange = (newVersionId: string) => {
    setSelectedVersionId(newVersionId);
    setSearchClause('');
    if (selectedFramework && newVersionId) {
      loadVersionClauses(selectedFramework.code || selectedFramework.id, newVersionId);
    }
  };

  useEffect(() => {
    fetchFrameworks();
  }, []);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJson.trim()) return;

    setImporting(true);
    try {
      const parsed: CustomFrameworkImportDto = JSON.parse(importJson);

      await apiRequest('/frameworks/import', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });

      setIsImportOpen(false);
      setImportJson('');
      fetchFrameworks();
    } catch (err: any) {
      alert(err.message || 'Invalid JSON format or framework code already exists.');
    } finally {
      setImporting(false);
    }
  };

  // Distinct types available in current clauses
  const availableTypes = Array.from(new Set(clauses.map((c) => c.type).filter(Boolean)));

  const filteredClauses = clauses.filter((c) => {
    const q = searchClause.toLowerCase();
    const matchesSearch =
      (c.identifier || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.description ? c.description.toLowerCase().includes(q) : false);
    const matchesType = !typeFilter || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeVersion = versions.find((v) => v.id === selectedVersionId);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Standardized Page Header */}
      <PageHeader
        title="Compliance Frameworks"
        description="Authoritative regulatory baselines, versioned clause hierarchies, and coverage gap assessments."
        icon={Library}
        currentView="frameworks"
        actions={
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition"
          >
            <Upload className="w-4 h-4" /> Import Custom Framework
          </button>
        }
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-4 sm:gap-6 overflow-x-auto omni-scroll no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'catalog'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Library className="w-4 h-4" /> Framework Catalog & Clauses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('coverage')}
          className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'coverage'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Coverage & Gap Analysis
        </button>
      </div>

      {activeTab === 'coverage' ? (
        <FrameworkCoverageView />
      ) : loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading framework catalog...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Framework List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Entitled Frameworks</h3>
              <span className="text-[11px] font-semibold text-slate-400">{frameworks.length} available</span>
            </div>

            <div className="space-y-2">
              {frameworks.map((fw) => {
                const isSelected = selectedFramework?.id === fw.id || selectedFramework?.code === fw.code;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => handleSelectFramework(fw)}
                    className={`w-full text-left p-4 rounded-xl border transition shadow-sm cursor-pointer ${
                      isSelected
                        ? 'bg-white border-2 border-teal-700 text-slate-900 shadow-md ring-2 ring-teal-600/10'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-base flex items-center gap-2 text-slate-900 min-w-0">
                        <Shield className={`w-4 h-4 shrink-0 ${isSelected ? 'text-teal-700' : 'text-slate-400'}`} />
                        <span className="truncate">{fw.code}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 shrink-0 font-mono">
                        {fw.clausesCount} items
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-1 line-clamp-1">{fw.name}</div>
                    {fw.version && (
                      <div className="text-[10px] text-teal-800 font-mono mt-1 font-semibold">
                        Version {fw.version} · Active
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clause Details Viewer */}
          <div className="lg:col-span-8 space-y-4">
            {selectedFramework ? (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
                {/* Framework & Version Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={selectedFramework.isSystem ? 'Authoritative Standard' : 'Custom Framework'}
                        variant={selectedFramework.isSystem ? 'teal' : 'purple'}
                        size="sm"
                      />
                      {activeVersion?.status && (
                        <StatusBadge
                          label={activeVersion.status}
                          variant={activeVersion.status === 'ACTIVE' ? 'teal' : 'amber'}
                          size="sm"
                          dot
                        />
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      {selectedFramework.code} — {selectedFramework.name}
                    </h2>
                  </div>

                  {/* Version Selector Dropdown */}
                  {versions.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label htmlFor="framework-version-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        Version:
                      </label>
                      <select
                        id="framework-version-select"
                        value={selectedVersionId}
                        onChange={(e) => handleVersionChange(e.target.value)}
                        disabled={loadingVersions}
                        className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version} ({v.name || v.version})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search clause identifier, title, or requirements..."
                      value={searchClause}
                      onChange={(e) => setSearchClause(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition"
                    />
                  </div>

                  {availableTypes.length > 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Filter size={14} className="text-slate-400" />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="">All Types ({clauses.length})</option>
                        {availableTypes.map((t) => (
                          <option key={t} value={t}>
                            {t} ({clauses.filter((c) => c.type === t).length})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Clauses Count Indicator */}
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
                  <span>
                    Showing {filteredClauses.length} of {clauses.length} normative references
                  </span>
                  {(searchClause || typeFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchClause('');
                        setTypeFilter('');
                      }}
                      className="text-teal-700 hover:text-teal-800 font-medium"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {/* Clauses Table / Cards List */}
                {loadingClauses ? (
                  <div className="py-16 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
                    <span>Loading authoritative clauses...</span>
                  </div>
                ) : clausesError ? (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
                    {clausesError}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto omni-scroll pr-1">
                    {filteredClauses.length > 0 ? (
                      filteredClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200 hover:border-slate-300 hover:bg-white transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-teal-900 bg-teal-100/80 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                              {clause.identifier}
                            </span>
                            {clause.type && (
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {clause.type}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-sm text-slate-900 mt-1.5">{clause.title}</div>
                          {clause.description && clause.description !== clause.title && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                              {clause.description}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center text-slate-500 text-xs font-medium">
                        No clauses found matching your filter criteria.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-500 font-medium">
                Select a framework from the catalog to inspect clauses.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Import Custom Framework (JSON)</h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  JSON Definition (Code, Name, Clauses Array)
                </label>
                <textarea
                  rows={8}
                  placeholder={`{\n  "code": "CUSTOM_ISO",\n  "name": "Custom ISO Standard",\n  "clauses": [\n    { "code": "A.5.1", "title": "Policies for information security" }\n  ]\n}`}
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="w-full font-mono text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="px-4 py-2 text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-sm disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Validate & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
