'use client';

import React, { useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Download,
  Info,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  VendorImportPreviewResponseDto,
  VendorImportResultDto,
  DuplicateResolutionStrategy,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';

interface VendorImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ALLOWED_EXTENSIONS = ['xlsx', 'csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const TARGET_FIELD_OPTIONS = [
  { value: '', label: '-- Skip Column --' },
  { value: 'name', label: 'Vendor Name (Required)' },
  { value: 'category', label: 'Category' },
  { value: 'criticality', label: 'Criticality / Risk Tier' },
  { value: 'owner', label: 'Internal Owner / POC' },
  { value: 'department', label: 'Department / Business Unit' },
  { value: 'websiteUrl', label: 'Website URL' },
  { value: 'description', label: 'Description / Scope' },
  { value: 'reviewCadenceDays', label: 'Review Cadence (Days)' },
  { value: 'dueDiligenceStatus', label: 'Due Diligence Status' },
  { value: 'contactEmail', label: 'Contact Email' },
  { value: 'contactPhone', label: 'Contact Phone' },
  { value: 'taxId', label: 'Tax ID / Registration Number' },
];

export function VendorImportWizardModal({
  isOpen,
  onClose,
  onSuccess,
}: VendorImportWizardModalProps) {
  const { addToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<{
    fileName: string;
    fileType: 'XLSX' | 'CSV';
    headers: string[];
    rows: Record<string, any>[];
    suggestedMapping: Record<string, string>;
    confidenceScores: Record<string, number>;
  } | null>(null);

  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<VendorImportPreviewResponseDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [duplicateResolution, setDuplicateResolution] =
    useState<DuplicateResolutionStrategy>('SKIP');

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<VendorImportResultDto | null>(null);

  if (!isOpen) return null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        addToast(`Invalid file type (.${ext}). Only Excel (.xlsx) and CSV (.csv) files are supported.`, 'error');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        addToast(`File size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`, 'error');
        return;
      }

      setSelectedFile(file);
    }
  }

  async function handleParseFile() {
    if (!selectedFile) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiRequest<any>('/vendors/import/parse', {
        method: 'POST',
        body: formData,
      });

      setParsedData({
        fileName: res.fileName,
        fileType: res.fileType,
        headers: res.headers,
        rows: res.rows,
        suggestedMapping: res.suggestedMapping || {},
        confidenceScores: res.confidenceScores || {},
      });

      setColumnMapping(res.suggestedMapping || {});
      setPreview(res.preview);
      setStep(2);
      addToast(`Parsed ${res.totalRows} rows with AI column recommendations.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to parse file.', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleRefreshPreview(newMapping?: Record<string, string>) {
    if (!parsedData) return;
    const mapping = newMapping || columnMapping;
    setLoadingPreview(true);
    try {
      const res = await apiRequest<VendorImportPreviewResponseDto>('/vendors/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsedData.rows,
          columnMapping: mapping,
        }),
      });
      setPreview(res);
      setStep(3);
    } catch (err: any) {
      addToast(err.message || 'Failed to generate preview.', 'error');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleExecuteImport() {
    if (!parsedData) return;
    setImporting(true);
    try {
      const res = await apiRequest<VendorImportResultDto>('/vendors/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: parsedData.fileName,
          fileType: parsedData.fileType,
          rows: parsedData.rows,
          columnMapping,
          duplicateResolution,
        }),
      });

      setImportResult(res);
      setStep(4);
      onSuccess();
      addToast(`Import finished: ${res.importedCount} created, ${res.updatedCount} updated.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Import execution failed.', 'error');
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedFile(null);
    setParsedData(null);
    setColumnMapping({});
    setPreview(null);
    setImportResult(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vendor Import & Onboarding Wizard</h2>
              <p className="text-xs text-slate-500">
                Bulk ingest third-party vendors with formula safety, AI column mapping & duplicate resolution.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Navigation */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <span
              className={`flex items-center gap-2 font-semibold ${
                step === 1 ? 'text-teal-700' : step > 1 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  step === 1 ? 'bg-teal-700 text-white' : step > 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                1
              </span>
              Upload File
            </span>

            <span
              className={`flex items-center gap-2 font-semibold ${
                step === 2 ? 'text-teal-700' : step > 2 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  step === 2 ? 'bg-teal-700 text-white' : step > 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                2
              </span>
              AI Column Mapping
            </span>

            <span
              className={`flex items-center gap-2 font-semibold ${
                step === 3 ? 'text-teal-700' : step > 3 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  step === 3 ? 'bg-teal-700 text-white' : step > 3 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                3
              </span>
              Preview & Duplicates
            </span>

            <span
              className={`flex items-center gap-2 font-semibold ${
                step === 4 ? 'text-teal-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  step === 4 ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                4
              </span>
              Summary
            </span>
          </div>

          <span className="text-slate-400 font-mono text-[11px]">Step {step} of 4</span>
        </div>

        {/* Wizard Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: UPLOAD FILE */}
          {step === 1 && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              <div className="border-2 border-dashed border-slate-300 hover:border-teal-600 rounded-xl p-8 text-center bg-slate-50 hover:bg-teal-50/30 transition flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {selectedFile ? selectedFile.name : 'Choose an Excel (.xlsx) or CSV (.csv) file'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Maximum file size 10 MB. Ingests up to 5,000 vendor records per batch.
                  </p>
                </div>

                <label className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition">
                  Browse File
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>

                {selectedFile && (
                  <p className="text-xs text-emerald-700 font-medium mt-1">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Security info callout */}
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Formula Injection Shield Active:</span> Cell values starting with executable spreadsheet formulas (<code className="bg-blue-100 px-1 py-0.5 rounded text-[11px]">= + - @</code>) are automatically escaped to prevent CWE-1236 CSV injection attacks.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: AI COLUMN MAPPING */}
          {step === 2 && parsedData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" /> AI-Assisted Column Mapping
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review automated mapping recommendations below. You can adjust any column mapping manually.
                  </p>
                </div>
                <button
                  onClick={() => handleRefreshPreview()}
                  disabled={loadingPreview}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg border border-teal-200 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
                  Re-evaluate Preview
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-4">Source Header (in File)</th>
                      <th className="py-2.5 px-4">AI Recommendation</th>
                      <th className="py-2.5 px-4">Target Schema Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {parsedData.headers.map((header) => {
                      const confidence = parsedData.confidenceScores[header] || 0;
                      const target = columnMapping[header] || '';

                      return (
                        <tr key={header} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-800">
                            {header}
                          </td>
                          <td className="py-2.5 px-4">
                            {confidence > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                {Math.round(confidence * 100)}% Match
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs italic">Manual mapping</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <select
                              value={target}
                              onChange={(e) => {
                                const newMapping = { ...columnMapping, [header]: e.target.value };
                                setColumnMapping(newMapping);
                              }}
                              className="w-full max-w-xs text-xs px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                            >
                              {TARGET_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & DUPLICATE RESOLUTION */}
          {step === 3 && preview && (
            <div className="space-y-5">
              {/* Stat Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[11px] font-medium text-slate-500 block">Total Ingested</span>
                  <span className="text-lg font-bold text-slate-900">{preview.totalRows}</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-[11px] font-medium text-emerald-700 block">Valid Rows</span>
                  <span className="text-lg font-bold text-emerald-800">{preview.validRows}</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <span className="text-[11px] font-medium text-rose-700 block">Invalid Rows</span>
                  <span className="text-lg font-bold text-rose-800">{preview.invalidRows}</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-[11px] font-medium text-amber-700 block">Duplicate Vendors</span>
                  <span className="text-lg font-bold text-amber-800">{preview.duplicateRows}</span>
                </div>
              </div>

              {/* Duplicate Strategy Selector */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">
                  Duplicate Resolution Strategy:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      duplicateResolution === 'SKIP'
                        ? 'bg-white border-teal-600 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupStrategy"
                      checked={duplicateResolution === 'SKIP'}
                      onChange={() => setDuplicateResolution('SKIP')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">Skip Duplicates</span>
                      <span className="text-slate-500 text-[11px]">Keep existing vendor records unchanged.</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      duplicateResolution === 'UPDATE'
                        ? 'bg-white border-teal-600 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupStrategy"
                      checked={duplicateResolution === 'UPDATE'}
                      onChange={() => setDuplicateResolution('UPDATE')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">Update Existing</span>
                      <span className="text-slate-500 text-[11px]">Overwrite vendor fields with imported file data.</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      duplicateResolution === 'FLAG'
                        ? 'bg-white border-teal-600 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupStrategy"
                      checked={duplicateResolution === 'FLAG'}
                      onChange={() => setDuplicateResolution('FLAG')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">Flag as Errors</span>
                      <span className="text-slate-500 text-[11px]">Reject duplicate rows and report row errors.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Rows Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Vendor Name</th>
                      <th className="py-2 px-3">Tier</th>
                      <th className="py-2 px-3">Owner</th>
                      <th className="py-2 px-3">Duplicate</th>
                      <th className="py-2 px-3">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {preview.previewRows.map((r) => (
                      <tr key={r.rowNumber} className={!r.isValid ? 'bg-rose-50/40' : r.isDuplicate ? 'bg-amber-50/30' : ''}>
                        <td className="py-2 px-3 font-mono text-slate-500">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{r.mappedData.name || '—'}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {r.mappedData.criticality || 'MEDIUM'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">{r.mappedData.owner || '—'}</td>
                        <td className="py-2 px-3">
                          {r.isDuplicate ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> Duplicate
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">New</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                            </span>
                          ) : (
                            <span className="text-rose-700 text-[11px] font-medium" title={r.errors.join('; ')}>
                              {r.errors[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORT SUMMARY */}
          {step === 4 && importResult && (
            <div className="space-y-6 max-w-xl mx-auto py-2">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Vendor Import Processed Successfully</h3>
                <p className="text-xs text-slate-500">
                  Batch record <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-teal-800">{importResult.batchId}</code> has been committed to the organization tenant.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <span className="text-xs text-emerald-700 font-semibold block">Imported</span>
                  <span className="text-xl font-bold text-emerald-900">{importResult.importedCount}</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <span className="text-xs text-blue-700 font-semibold block">Updated</span>
                  <span className="text-xl font-bold text-blue-900">{importResult.updatedCount}</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <span className="text-xs text-amber-700 font-semibold block">Skipped</span>
                  <span className="text-xl font-bold text-amber-900">{importResult.skippedCount}</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center">
                  <span className="text-xs text-rose-700 font-semibold block">Errors</span>
                  <span className="text-xl font-bold text-rose-900">{importResult.errorCount}</span>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-rose-900 block">Row Error Details:</span>
                  <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-rose-800">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="font-mono text-rose-600">Row {err.rowNumber}:</span>
                        <span>{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <div>
            {step > 1 && step < 4 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 4 ? (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Import Another File
              </button>
            )}

            {step === 1 && (
              <button
                type="button"
                disabled={!selectedFile || parsing}
                onClick={handleParseFile}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {parsing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Parsing & Analyzing...
                  </>
                ) : (
                  <>
                    Continue to Mapping <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                disabled={loadingPreview}
                onClick={() => handleRefreshPreview()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {loadingPreview ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating Preview...
                  </>
                ) : (
                  <>
                    Review Preview <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                disabled={importing || (preview ? preview.validRows === 0 && preview.duplicateRows === 0 : false)}
                onClick={handleExecuteImport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Ingesting Vendors...
                  </>
                ) : (
                  <>
                    Execute Bulk Import <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs transition"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

