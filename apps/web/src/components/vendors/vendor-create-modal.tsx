'use client';

import React, { useState } from 'react';
import {
  Building2,
  X,
  Shield,
  FileText,
  Save,
  Send,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';
import { VendorCriticality } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';

interface VendorCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function VendorCreateModal({ isOpen, onClose, onCreated }: VendorCreateModalProps) {
  const { addToast } = useToast();
  const [tab, setTab] = useState<'general' | 'security' | 'contracts'>('general');
  const [submitting, setSubmitting] = useState(false);

  // Tab 1: General Info
  const [name, setName] = useState('');
  const [category, setCategory] = useState('SaaS Provider');
  const [criticality, setCriticality] = useState<VendorCriticality>(VendorCriticality.HIGH);
  const [owner, setOwner] = useState('Security Team');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [reviewCadenceDays, setReviewCadenceDays] = useState(365);
  const [description, setDescription] = useState('');

  // Tab 2: Security & Data Scope
  const [dataClassification, setDataClassification] = useState('CONFIDENTIAL');
  const [systemAccessLevel, setSystemAccessLevel] = useState('READ_ONLY');
  const [countriesOfOperation, setCountriesOfOperation] = useState('United States, India');
  const [businessPurpose, setBusinessPurpose] = useState('');

  // Tab 3: Contracts & Subcontractors
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [subcontractorReliance, setSubcontractorReliance] = useState<'NONE' | 'LOW' | 'MODERATE' | 'EXTENSIVE'>('LOW');
  const [subcontractorDetails, setSubcontractorDetails] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(isDraft: boolean) {
    if (!name.trim()) {
      addToast('Vendor name is required.', 'error');
      setTab('general');
      return;
    }

    setSubmitting(true);
    try {
      const countriesList = countriesOfOperation
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      await apiRequest('/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || 'General',
          criticality,
          owner: owner.trim() || 'Security Team',
          websiteUrl: websiteUrl.trim() || undefined,
          reviewCadenceDays: Number(reviewCadenceDays) || 365,
          description: description.trim() || undefined,
          isDraft,
          dataClassification,
          systemAccessLevel,
          countriesOfOperation: countriesList,
          businessPurpose: businessPurpose.trim() || undefined,
          contractStartDate: contractStartDate ? new Date(contractStartDate).toISOString() : undefined,
          contractEndDate: contractEndDate ? new Date(contractEndDate).toISOString() : undefined,
          subcontractorReliance,
          subcontractorDetails: subcontractorDetails.trim() || undefined,
        }),
      });

      addToast(
        isDraft
          ? `Draft vendor "${name}" saved.`
          : `Vendor "${name}" registered successfully.`,
        'success'
      );
      onCreated();
      onClose();
    } catch (err: any) {
      addToast(`Failed to register vendor: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[92dvh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Register Third-Party Vendor (TPRM Intake)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Progressive intake with enterprise security profiling and contractual scoping.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              tab === 'general'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 size={13} /> 1. General Profile
          </button>
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              tab === 'security'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield size={13} /> 2. Security & Data Access
          </button>
          <button
            type="button"
            onClick={() => setTab('contracts')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              tab === 'contracts'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={13} /> 3. Contract & 4th-Party Scope
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto omni-scroll flex-1 space-y-4">
          {tab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Snowflake / Datadog / GitHub Enterprise"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Cloud Infrastructure / SaaS / IT Services"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Criticality Rating *
                  </label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value as VendorCriticality)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white cursor-pointer"
                  >
                    <option value="CRITICAL">Critical (Semi-Annual Review - 180d)</option>
                    <option value="HIGH">High (Annual Review - 365d)</option>
                    <option value="MEDIUM">Medium (Annual Review - 365d)</option>
                    <option value="LOW">Low (Bi-Annual Review - 730d)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Business Owner *
                  </label>
                  <input
                    type="text"
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="e.g. SecOps / IT Director / Legal"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Review Cadence (Days) *
                  </label>
                  <input
                    type="number"
                    required
                    value={reviewCadenceDays}
                    onChange={(e) => setReviewCadenceDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vendor Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://vendor.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Service Description & Business Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the services provided and why this vendor is required..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
                Security profiling informs the automated Inherent Risk evaluation. Provide the highest data classification and privileged access tier granted to this vendor.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Highest Data Classification Handled *
                  </label>
                  <select
                    value={dataClassification}
                    onChange={(e) => setDataClassification(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white cursor-pointer"
                  >
                    <option value="RESTRICTED">Restricted (PII, Financial, PHI, Cardholder)</option>
                    <option value="CONFIDENTIAL">Confidential (Proprietary, Customer Business Data)</option>
                    <option value="INTERNAL">Internal (Operational documentation, Internal logs)</option>
                    <option value="PUBLIC">Public (Marketing assets, Public disclosures)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    System Access Level *
                  </label>
                  <select
                    value={systemAccessLevel}
                    onChange={(e) => setSystemAccessLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white cursor-pointer"
                  >
                    <option value="FULL_ADMIN">Full Administrative Access (Production Infrastructure)</option>
                    <option value="DATABASE_ACCESS">Direct Database Access (Read/Write)</option>
                    <option value="API_ACCESS">Automated API Integration / Webhook</option>
                    <option value="READ_ONLY">Read-Only Analytics / Reporting</option>
                    <option value="NONE">No Direct Network / System Access</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Countries of Operation / Data Hosting
                </label>
                <input
                  type="text"
                  placeholder="e.g. United States, India, European Union, Singapore"
                  value={countriesOfOperation}
                  onChange={(e) => setCountriesOfOperation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Comma-separated list of regions where data will be stored or processed.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specific Business Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Cloud log ingestion and automated alerting pipeline..."
                  value={businessPurpose}
                  onChange={(e) => setBusinessPurpose(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>
            </div>
          )}

          {tab === 'contracts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contract Start Date
                  </label>
                  <input
                    type="date"
                    value={contractStartDate}
                    onChange={(e) => setContractStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contract Expiration Date
                  </label>
                  <input
                    type="date"
                    value={contractEndDate}
                    onChange={(e) => setContractEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subcontractor / 4th-Party Reliance *
                </label>
                <select
                  value={subcontractorReliance}
                  onChange={(e) =>
                    setSubcontractorReliance(
                      e.target.value as 'NONE' | 'LOW' | 'MODERATE' | 'EXTENSIVE'
                    )
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white cursor-pointer"
                >
                  <option value="NONE">None — Vendor delivers direct services without subcontractors</option>
                  <option value="LOW">Low — Standard sub-processors (e.g., AWS/GCP hosting only)</option>
                  <option value="MODERATE">Moderate — Multiple critical sub-processors for delivery</option>
                  <option value="EXTENSIVE">Extensive — Heavy reliance on external outsourced contractors</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subcontractor Details & Disclosures
                </label>
                <textarea
                  rows={2}
                  placeholder="Detail named 4th-party suppliers (e.g. AWS us-east-1, Stripe for payment processing)..."
                  value={subcontractorDetails}
                  onChange={(e) => setSubcontractorDetails(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {tab !== 'general' && (
              <button
                type="button"
                onClick={() => setTab(tab === 'contracts' ? 'security' : 'general')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={13} /> Back
              </button>
            )}
            {tab !== 'contracts' && (
              <button
                type="button"
                onClick={() => setTab(tab === 'general' ? 'security' : 'contracts')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1"
              >
                Next <ChevronRight size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Save size={13} /> Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting || !name.trim()}
              onClick={() => handleSubmit(false)}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Send size={13} />
              <span>{submitting ? 'Registering...' : 'Register Vendor'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
