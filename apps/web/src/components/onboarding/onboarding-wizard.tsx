'use client';

import React, { useState } from 'react';
import { FrameworkCode, Role, AssetType, AssetCriticality } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import {
  Check,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  ShieldCheck,
  Users,
  Server,
  Info,
  FileSpreadsheet,
} from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Max 2 Frameworks Selection State
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([FrameworkCode.ISO27001]);
  const [limitWarning, setLimitWarning] = useState<boolean>(false);

  // Step 2: Assets state
  const [assets, setAssets] = useState<Array<{ name: string; type: AssetType; owner: string; criticality: AssetCriticality }>>([
    { name: 'Core API Gateway', type: AssetType.SOFTWARE, owner: 'SecOps', criticality: AssetCriticality.HIGH },
    { name: 'Production Database', type: AssetType.DATA_STORE, owner: 'DBA', criticality: AssetCriticality.HIGH },
  ]);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetType>(AssetType.SOFTWARE);
  const [newAssetOwner, setNewAssetOwner] = useState('');
  const [newAssetCriticality, setNewAssetCriticality] = useState<AssetCriticality>(AssetCriticality.MEDIUM);
  const [csvContent, setCsvContent] = useState('');
  const [showCsvBox, setShowCsvBox] = useState(false);

  // Step 3: Invites state
  const [invites, setInvites] = useState<Array<{ email: string; role: Role; name: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>(Role.ANALYST);
  const [inviteName, setInviteName] = useState('');

  const frameworks = [
    { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001', desc: 'Information Security Management System', tag: 'Security Standard' },
    { code: FrameworkCode.SOC2, name: 'SOC 2 Type II', desc: 'Trust Services Criteria (Security, Availability, Confidentiality)', tag: 'Auditing Standard' },
    { code: FrameworkCode.GDPR, name: 'EU GDPR', desc: 'General Data Protection Regulation', tag: 'Data Privacy' },
    { code: FrameworkCode.DPDP, name: 'India DPDP 2023', desc: 'Digital Personal Data Protection Act', tag: 'Data Protection' },
    { code: FrameworkCode.ISO42001, name: 'ISO/IEC 42001', desc: 'Artificial Intelligence Management System', tag: 'AI & Ethics' },
    { code: FrameworkCode.HIPAA, name: 'HIPAA Security', desc: 'Health Insurance Portability and Accountability Act', tag: 'Healthcare Compliance' },
  ];

  const toggleFramework = (code: string) => {
    if (selectedFrameworks.includes(code)) {
      if (selectedFrameworks.length === 1) return; // Keep at least 1 selected
      setSelectedFrameworks((prev) => prev.filter((c) => c !== code));
      setLimitWarning(false);
    } else {
      if (selectedFrameworks.length >= 2) {
        setLimitWarning(true);
        setTimeout(() => setLimitWarning(false), 4000);
        return;
      }
      setSelectedFrameworks((prev) => [...prev, code]);
      setLimitWarning(false);
    }
  };

  const handleAddAsset = () => {
    if (!newAssetName.trim()) return;
    setAssets((prev) => [
      ...prev,
      {
        name: newAssetName.trim(),
        type: newAssetType,
        owner: newAssetOwner.trim() || 'Unassigned',
        criticality: newAssetCriticality,
      },
    ]);
    setNewAssetName('');
    setNewAssetOwner('');
  };

  const handleRemoveAsset = (index: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParseCsv = () => {
    if (!csvContent.trim()) return;
    const lines = csvContent.trim().split('\n');
    const parsed: Array<{ name: string; type: AssetType; owner: string; criticality: AssetCriticality }> = [];
    lines.forEach((line) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 1 && parts[0]) {
        const name = parts[0];
        const typeStr = (parts[1] || 'SOFTWARE').toUpperCase();
        const owner = parts[2] || 'Imported Owner';
        const critStr = (parts[3] || 'MEDIUM').toUpperCase();

        const type = (Object.values(AssetType).includes(typeStr as AssetType) ? typeStr : AssetType.SOFTWARE) as AssetType;
        const criticality = (Object.values(AssetCriticality).includes(critStr as AssetCriticality) ? critStr : AssetCriticality.MEDIUM) as AssetCriticality;

        parsed.push({ name, type, owner, criticality });
      }
    });
    if (parsed.length > 0) {
      setAssets((prev) => [...prev, ...parsed]);
      setCsvContent('');
      setShowCsvBox(false);
    }
  };

  const handleAddInvite = () => {
    if (!inviteEmail.trim()) return;
    setInvites((prev) => [...prev, { email: inviteEmail.trim(), role: inviteRole, name: inviteName.trim() }]);
    setInviteEmail('');
    setInviteName('');
  };

  const handleRemoveInvite = (index: number) => {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await apiRequest('/auth/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          primaryFramework: selectedFrameworks[0] || FrameworkCode.ISO27001,
          selectedFrameworks: selectedFrameworks,
          assets: assets,
        }),
      });

      for (const inv of invites) {
        try {
          await apiRequest('/auth/onboarding/invite', {
            method: 'POST',
            body: JSON.stringify(inv),
          });
        } catch {
          // Ignore individual invite errors during bulk onboarding finish
        }
      }

      await refreshUser();
      onComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to save onboarding selections');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await apiRequest('/auth/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshUser();
      onComplete();
    } catch {
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const stepsList = [
    { num: 1, label: 'Primary Frameworks', short: 'Frameworks' },
    { num: 2, label: 'Asset Import', short: 'Assets' },
    { num: 3, label: 'Team Invite', short: 'Invites' },
    { num: 4, label: 'Complete Setup', short: 'Complete' },
  ];

  const currentStepObj = stepsList.find((s) => s.num === step);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md p-0 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-3xl overflow-hidden flex flex-col h-[94vh] sm:h-auto max-h-[94vh] sm:max-h-[90vh]">
        
        {/* Header Bar */}
        <div 
          style={{ backgroundColor: '#0F1A2E', color: '#ffffff' }}
          className="px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between border-b border-slate-800 shrink-0 text-white"
        >
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div 
              style={{ backgroundColor: '#0F6E6A', color: '#ffffff' }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            >
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span 
                  style={{ backgroundColor: 'rgba(15, 110, 106, 0.3)', color: '#2DD4BF', borderColor: 'rgba(45, 212, 191, 0.4)' }}
                  className="inline-block px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full border"
                >
                  POC QUICK-START
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight mt-0.5">OMNiGRC Workspace Setup</h2>
            </div>
          </div>
          <button
            onClick={handleSkip}
            style={{ color: '#94A3B8' }}
            className="text-xs font-semibold hover:text-white hover:underline transition px-2 py-1"
          >
            <span>Skip</span>
          </button>
        </div>

        {/* Step Indicator Header (Mobile & Desktop Responsive) */}
        <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-200/80 shrink-0">
          {/* Mobile Current Step Sub-Header */}
          <div className="flex items-center justify-between sm:hidden mb-2">
            <span className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
              <span 
                style={{ backgroundColor: '#0F6E6A', color: '#ffffff' }}
                className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
              >
                {step}
              </span>
              <span>{currentStepObj?.label}</span>
            </span>
            <span className="text-[11px] font-medium text-slate-500">Step {step} of 4</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center text-xs">
            {stepsList.map((s) => {
              const isActive = step === s.num;
              const isCompleted = step > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => s.num < step && setStep(s.num)}
                  disabled={s.num > step}
                  style={
                    isActive
                      ? { backgroundColor: '#0F6E6A', color: '#ffffff', fontWeight: 'bold' }
                      : isCompleted
                      ? { backgroundColor: '#E6F4F1', color: '#0C5A56', fontWeight: '600' }
                      : { backgroundColor: '#F1F5F9', color: '#64748B' }
                  }
                  className="flex items-center justify-center space-x-1 py-2 px-1 sm:px-2 rounded-lg font-medium transition cursor-pointer"
                >
                  <span
                    style={
                      isActive
                        ? { backgroundColor: '#ffffff', color: '#0F6E6A' }
                        : isCompleted
                        ? { backgroundColor: '#0F6E6A', color: '#ffffff' }
                        : { backgroundColor: '#CBD5E1', color: '#475569' }
                    }
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  >
                    {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : s.num}
                  </span>
                  <span className="truncate hidden sm:inline">{s.label}</span>
                  <span className="truncate inline sm:hidden text-[11px]">{s.short}</span>
                </button>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2.5 sm:mt-3 overflow-hidden">
            <div
              style={{ width: `${(step / 4) * 100}%`, backgroundColor: '#0F6E6A' }}
              className="h-full transition-all duration-300 ease-out"
            />
          </div>
        </div>

        {/* Modal Body (Scrollable container) */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 flex-1 overflow-y-auto bg-white">
          {/* STEP 1: Select Frameworks (Max 2) */}
          {step === 1 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center space-x-2">
                    <span>Select Primary Compliance Frameworks</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Choose <strong>maximum 2 frameworks</strong> for initial dashboard control mapping. Full support for all frameworks is included.
                  </p>
                </div>
                <div className="flex items-center space-x-2 self-start sm:self-auto mt-1 sm:mt-0">
                  <span 
                    style={{ backgroundColor: '#F1F5F9', color: '#0F6E6A', borderColor: '#CBD5E1' }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-full border"
                  >
                    Selected: <strong style={{ color: '#0F6E6A' }} className="font-bold">{selectedFrameworks.length} / 2</strong>
                  </span>
                </div>
              </div>

              {limitWarning && (
                <div 
                  style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}
                  className="border px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-2"
                >
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    You can select <strong>up to 2 frameworks</strong> in quick start. Uncheck one to pick another, or access all frameworks anytime in dashboard settings.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
                {frameworks.map((fw) => {
                  const isSelected = selectedFrameworks.includes(fw.code);
                  const isMaxReached = selectedFrameworks.length >= 2 && !isSelected;

                  return (
                    <div
                      key={fw.code}
                      onClick={() => toggleFramework(fw.code)}
                      style={
                        isSelected
                          ? { backgroundColor: '#F0FDF4', borderColor: '#0F6E6A', boxShadow: '0 2px 8px rgba(15, 110, 106, 0.15)' }
                          : isMaxReached
                          ? { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', opacity: 0.6 }
                          : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }
                      }
                      className="relative cursor-pointer p-3.5 sm:p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between space-x-3">
                        <div className="space-y-1">
                          <span 
                            style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
                            className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded"
                          >
                            {fw.tag}
                          </span>
                          <div className="font-bold text-sm text-slate-900 leading-snug">{fw.name}</div>
                        </div>

                        {/* Checkbox Icon */}
                        <div
                          style={
                            isSelected
                              ? { backgroundColor: '#0F6E6A', borderColor: '#0F6E6A', color: '#ffffff' }
                              : { backgroundColor: '#ffffff', borderColor: '#CBD5E1' }
                          }
                          className="w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition"
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{fw.desc}</p>
                    </div>
                  );
                })}
              </div>

              <div 
                style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', color: '#334155' }}
                className="border rounded-xl p-3 text-xs flex items-start space-x-2"
              >
                <Sparkles style={{ color: '#0F6E6A' }} className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>All frameworks remain active in your workspace.</strong> Selecting your 1–2 key frameworks helps us populate your initial audit checklist and dashboard widgets.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Import Assets */}
          {step === 2 && (
            <div className="space-y-4 sm:space-y-5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Import Critical Assets</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assets are mapped against Controls, Risks, and Evidence requests across your chosen frameworks.
                </p>
              </div>

              {/* Quick Add Asset Form */}
              <div 
                style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }}
                className="p-3.5 sm:p-4 rounded-xl border space-y-3"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Server style={{ color: '#0F6E6A' }} className="w-3.5 h-3.5" />
                  <span>Quick Add Single Asset</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Asset Name (e.g. User Auth API)"
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    className="text-sm sm:text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <select
                    value={newAssetType}
                    onChange={(e) => setNewAssetType(e.target.value as AssetType)}
                    className="text-sm sm:text-xs border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    {Object.values(AssetType).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Owner (e.g. DevOps)"
                    value={newAssetOwner}
                    onChange={(e) => setNewAssetOwner(e.target.value)}
                    className="text-sm sm:text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <button
                    onClick={handleAddAsset}
                    type="button"
                    style={{ backgroundColor: '#0F1A2E', color: '#ffffff' }}
                    className="text-xs rounded-lg font-bold py-2.5 sm:py-2 px-3 hover:opacity-90 transition flex items-center justify-center space-x-1 shadow-sm w-full sm:w-auto text-white cursor-pointer"
                  >
                    <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white" />
                    <span className="text-white">Add Asset</span>
                  </button>
                </div>
              </div>

              {/* CSV Bulk Import Option Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCsvBox(!showCsvBox)}
                  style={{ color: '#0F6E6A' }}
                  className="text-xs font-bold hover:underline flex items-center space-x-1.5 transition py-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{showCsvBox ? 'Hide CSV Importer' : '+ Bulk Import via CSV / Text'}</span>
                </button>

                {showCsvBox && (
                  <div 
                    style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}
                    className="mt-2.5 p-3.5 rounded-xl border space-y-2"
                  >
                    <div className="text-xs font-semibold text-slate-700">
                      Paste CSV lines (Format: Name, Type, Owner, Criticality)
                    </div>
                    <textarea
                      rows={3}
                      placeholder={`Payment Service, SOFTWARE, Dev-Team, HIGH\nCustomer Database, DATA_STORE, DBA-Team, CRITICAL`}
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                      className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleParseCsv}
                        type="button"
                        style={{ backgroundColor: '#0F6E6A', color: '#ffffff' }}
                        className="text-xs rounded-lg px-4 py-2 font-bold hover:opacity-90 transition shadow-sm w-full sm:w-auto text-white cursor-pointer"
                      >
                        Parse & Add CSV
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Assets Preview List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div 
                  style={{ backgroundColor: '#F1F5F9', color: '#334155' }}
                  className="px-3.5 py-2.5 text-xs font-bold flex justify-between items-center border-b border-slate-200"
                >
                  <span>Queued Assets ({assets.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Ready for initial mapping</span>
                </div>
                {assets.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-400">No assets added yet. You can add them later in the dashboard.</div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto bg-white">
                    {assets.map((ast, idx) => (
                      <div key={idx} className="px-3.5 py-2.5 text-xs flex justify-between items-center hover:bg-slate-50 transition">
                        <div className="pr-2 truncate">
                          <span className="font-semibold text-slate-900 block sm:inline">{ast.name}</span>
                          <span className="text-slate-400 sm:ml-2 font-mono text-[11px]">[{ast.type}]</span>
                        </div>
                        <div className="flex items-center space-x-2.5 shrink-0">
                          <span className="text-slate-500 text-[11px]">
                            {ast.owner} &bull; <strong className="text-slate-700">{ast.criticality}</strong>
                          </span>
                          <button
                            onClick={() => handleRemoveAsset(idx)}
                            className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Invite Team Members */}
          {step === 3 && (
            <div className="space-y-4 sm:space-y-5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Invite Team Members</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Collaborate with compliance analysts, CISOs, auditors, and IT asset owners.
                </p>
              </div>

              <div 
                style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }}
                className="p-3.5 sm:p-4 rounded-xl border space-y-3"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Users style={{ color: '#0F6E6A' }} className="w-3.5 h-3.5" />
                  <span>Send Invitation</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="text-sm sm:text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="text-sm sm:text-xs border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    <option value={Role.ANALYST}>ANALYST (Compliance & Tasks)</option>
                    <option value={Role.ADMIN}>ADMIN (Full Control)</option>
                  </select>
                  <button
                    onClick={handleAddInvite}
                    type="button"
                    style={{ backgroundColor: '#0F1A2E', color: '#ffffff' }}
                    className="text-xs rounded-lg font-bold py-2.5 sm:py-2 px-3 hover:opacity-90 transition flex items-center justify-center space-x-1 shadow-sm w-full sm:w-auto text-white cursor-pointer"
                  >
                    <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white" />
                    <span className="text-white">Add Invite</span>
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div 
                  style={{ backgroundColor: '#F1F5F9', color: '#334155' }}
                  className="px-3.5 py-2.5 text-xs font-bold border-b border-slate-200"
                >
                  Pending Invitations ({invites.length})
                </div>
                {invites.length === 0 ? (
                  <div className="p-5 text-xs text-slate-400 text-center">
                    No team members queued yet. You can invite colleagues anytime from Workspace Settings.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto bg-white">
                    {invites.map((inv, idx) => (
                      <div key={idx} className="px-3.5 py-2.5 text-xs flex justify-between items-center hover:bg-slate-50 transition">
                        <span className="font-semibold text-slate-900 truncate pr-2">{inv.email}</span>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-mono border border-slate-200">
                            {inv.role}
                          </span>
                          <button
                            onClick={() => handleRemoveInvite(idx)}
                            className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Review & Finish */}
          {step === 4 && (
            <div className="space-y-4 sm:space-y-5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Your Workspace Config Summary</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm your choices to seed control mappings and launch your OMNiGRC platform.
                </p>
              </div>

              <div 
                style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }}
                className="p-4 sm:p-5 rounded-xl border space-y-4 shadow-sm"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                    Primary Frameworks ({selectedFrameworks.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedFrameworks.map((code) => {
                      const fwObj = frameworks.find((f) => f.code === code);
                      return (
                        <div
                          key={code}
                          style={{ backgroundColor: '#E6F4F1', borderColor: '#B8DFDB', color: '#0C5A56' }}
                          className="px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center space-x-1.5 shadow-sm"
                        >
                          <CheckCircle2 style={{ color: '#0F6E6A' }} className="w-3.5 h-3.5 shrink-0" />
                          <span>{fwObj?.name || code}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-1">Initial Assets Queued</span>
                    <span className="font-bold text-slate-900 text-sm">{assets.length} items</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Team Invitations</span>
                    <span className="font-bold text-slate-900 text-sm">{invites.length} members</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions (High-Contrast Guaranteed Visible Action Buttons) */}
        <div 
          style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }}
          className="px-4 py-3.5 sm:px-6 sm:py-4 border-t flex items-center justify-between shrink-0 shadow-md"
        >
          <div>
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
                style={{ backgroundColor: '#FFFFFF', color: '#1E293B', borderColor: '#CBD5E1' }}
                className="text-xs font-bold px-4 py-2 border rounded-lg shadow-sm hover:bg-slate-50 transition flex items-center space-x-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <button
                onClick={handleSkip}
                disabled={loading}
                style={{ color: '#64748B' }}
                className="text-xs font-bold hover:text-slate-900 transition px-2 py-1 cursor-pointer"
              >
                Skip Setup
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={selectedFrameworks.length === 0}
                style={{
                  backgroundColor: '#0F6E6A',
                  color: '#FFFFFF',
                  borderColor: '#0C5A56',
                  opacity: selectedFrameworks.length === 0 ? 0.5 : 1,
                }}
                className="text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition flex items-center space-x-2 border text-white cursor-pointer shrink-0"
              >
                <span className="text-white font-bold">
                  {step === 1
                    ? 'Continue to Asset Import'
                    : step === 2
                    ? 'Continue to Team Invite'
                    : 'Proceed to Final Review'}
                </span>
                <ArrowRight className="w-4 h-4 text-white shrink-0" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={loading}
                style={{
                  backgroundColor: '#0F6E6A',
                  color: '#FFFFFF',
                  borderColor: '#0C5A56',
                  opacity: loading ? 0.6 : 1,
                }}
                className="text-xs sm:text-sm font-bold px-6 py-2.5 rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition flex items-center space-x-2 border text-white cursor-pointer shrink-0"
              >
                {loading ? (
                  <span className="text-white font-bold">Finalizing Setup...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white shrink-0" />
                    <span className="text-white font-bold">Complete & Launch Platform</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
