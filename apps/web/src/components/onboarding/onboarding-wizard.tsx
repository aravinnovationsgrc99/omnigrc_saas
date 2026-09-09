'use client';

import React, { useState } from 'react';
import { FrameworkCode, Role, AssetType, AssetCriticality } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFramework, setSelectedFramework] = useState<string>('ISO27001');

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

  // Step 3: Invites state
  const [invites, setInvites] = useState<Array<{ email: string; role: Role; name: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>(Role.ANALYST);
  const [inviteName, setInviteName] = useState('');

  const frameworks = [
    { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001', desc: 'Information Security Management System' },
    { code: FrameworkCode.SOC2, name: 'SOC 2 Type II', desc: 'Trust Services Criteria (Security, Availability, Confidentiality)' },
    { code: FrameworkCode.GDPR, name: 'EU GDPR', desc: 'General Data Protection Regulation' },
    { code: FrameworkCode.DPDP, name: 'India DPDP 2023', desc: 'Digital Personal Data Protection Act' },
    { code: FrameworkCode.ISO42001, name: 'ISO/IEC 42001', desc: 'Artificial Intelligence Management System' },
    { code: FrameworkCode.HIPAA, name: 'HIPAA Security', desc: 'Health Insurance Portability and Accountability Act' },
  ];

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
    }
  };

  const handleAddInvite = () => {
    if (!inviteEmail.trim()) return;
    setInvites((prev) => [...prev, { email: inviteEmail.trim(), role: inviteRole, name: inviteName.trim() }]);
    setInviteEmail('');
    setInviteName('');
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Complete Onboarding with framework and assets
      await apiRequest('/auth/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          primaryFramework: selectedFramework,
          assets: assets,
        }),
      });

      // 2. Send team invites if any
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <span className="inline-block px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 mb-1">
              POC Quick-Start
            </span>
            <h2 className="text-xl font-bold">Welcome to OMNiGRC Setup</h2>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-slate-400 hover:text-white underline transition"
          >
            Skip Onboarding
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-medium text-slate-500">
          <div className="flex items-center space-x-6">
            <span className={step >= 1 ? 'text-teal-700 font-bold' : ''}>1. Primary Framework</span>
            <span className={step >= 2 ? 'text-teal-700 font-bold' : ''}>2. Asset Import</span>
            <span className={step >= 3 ? 'text-teal-700 font-bold' : ''}>3. Team Invite</span>
            <span className={step >= 4 ? 'text-teal-700 font-bold' : ''}>4. Complete</span>
          </div>
          <span>Step {step} of 4</span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* STEP 1: Select Primary Framework */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Select your Primary Compliance Framework</h3>
                <p className="text-xs text-slate-500">This will customize your dashboard view and initial control mappings.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {frameworks.map((fw) => (
                  <label
                    key={fw.code}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition flex items-start space-x-3 ${
                      selectedFramework === fw.code
                        ? 'border-teal-600 bg-teal-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="primaryFramework"
                      value={fw.code}
                      checked={selectedFramework === fw.code}
                      onChange={(e) => setSelectedFramework(e.target.value)}
                      className="mt-1 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{fw.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{fw.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Import Assets */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Import your Critical Organizational Assets</h3>
                <p className="text-xs text-slate-500">Assets are referenced across Risks, Controls, and Compliance Tasks.</p>
              </div>

              {/* Add Single Asset Form */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-700">Quick Add Asset</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Asset Name (e.g. Auth Service)"
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    value={newAssetType}
                    onChange={(e) => setNewAssetType(e.target.value as AssetType)}
                    className="text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    {Object.values(AssetType).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Owner (e.g. SecOps)"
                    value={newAssetOwner}
                    onChange={(e) => setNewAssetOwner(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    onClick={handleAddAsset}
                    type="button"
                    className="text-xs bg-slate-900 text-white rounded font-medium px-3 py-1.5 hover:bg-slate-800 transition"
                  >
                    + Add Asset
                  </button>
                </div>
              </div>

              {/* CSV Bulk Import Option */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Or Paste CSV Data (Format: Name, Type, Owner, Criticality)</div>
                <div className="flex space-x-2">
                  <textarea
                    rows={2}
                    placeholder="e.g. Payments Microservice, SOFTWARE, Eng-Team, HIGH"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    className="flex-1 text-xs border border-slate-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    onClick={handleParseCsv}
                    type="button"
                    className="text-xs bg-teal-700 text-white rounded px-3 py-1.5 font-medium hover:bg-teal-800 transition self-end"
                  >
                    Parse CSV
                  </button>
                </div>
              </div>

              {/* Assets Preview List */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 flex justify-between">
                  <span>Queued Assets ({assets.length})</span>
                  <span>Ready for Import</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                  {assets.map((ast, idx) => (
                    <div key={idx} className="px-3 py-2 text-xs flex justify-between items-center bg-white">
                      <div>
                        <span className="font-semibold text-slate-800">{ast.name}</span>
                        <span className="text-slate-400 ml-2">({ast.type})</span>
                      </div>
                      <span className="text-slate-500">{ast.owner} &bull; {ast.criticality}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Invite Team Members */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Invite Your GRC & Compliance Team</h3>
                <p className="text-xs text-slate-500">Collaborate with analysts, CISOs, and risk managers.</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value={Role.ANALYST}>ANALYST (Standard User)</option>
                    <option value={Role.ADMIN}>ADMIN (Full Control)</option>
                  </select>
                  <button
                    onClick={handleAddInvite}
                    type="button"
                    className="text-xs bg-slate-900 text-white rounded font-medium px-3 py-1.5 hover:bg-slate-800 transition"
                  >
                    + Add Invitation
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                  Pending Invitations ({invites.length})
                </div>
                {invites.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400 text-center">No additional team members queued yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                    {invites.map((inv, idx) => (
                      <div key={idx} className="px-3 py-2 text-xs flex justify-between items-center bg-white">
                        <span className="font-semibold text-slate-800">{inv.email}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">{inv.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Review & Finish */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Your OMNiGRC Instance is Ready!</h3>
                <p className="text-xs text-slate-500">Review your onboarding configuration before completing setup.</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Primary Framework:</span>
                  <span className="font-bold text-teal-800">{selectedFramework}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Assets to Seed:</span>
                  <span className="font-semibold text-slate-800">{assets.length} items</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Team Invites:</span>
                  <span className="font-semibold text-slate-800">{invites.length} members</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-300 rounded bg-white"
            >
              Back
            </button>
          ) : (
            <button
              onClick={handleSkip}
              disabled={loading}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Skip All
            </button>
          )}

          <div className="flex items-center space-x-2">
            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="text-xs bg-slate-900 text-white rounded font-medium px-4 py-2 hover:bg-slate-800 transition"
              >
                Next Step &rarr;
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={loading}
                className="text-xs bg-teal-700 text-white rounded font-bold px-5 py-2 hover:bg-teal-800 transition shadow-sm"
              >
                {loading ? 'Finalizing Setup...' : 'Complete & Launch Platform'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
