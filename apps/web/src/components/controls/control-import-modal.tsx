'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import {
  AnalyzeControlsImportResponseDto,
  ExtractedControlSuggestionDto,
  PersistImportedControlItemDto,
  PersistImportedControlsResponseDto,
  MappingStatus,
} from '@omnigrc/shared';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

interface FrameworkOption {
  id: string;
  code: string;
  name: string;
}

interface ControlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFrameworkId?: string;
}

type ItemAction = 'MAP' | 'STANDALONE' | 'SKIP';

interface ReviewItemState {
  suggestion: ExtractedControlSuggestionDto;
  action: ItemAction;
  editedTitle: string;
  editedDescription: string;
  editedCategory: string;
  isExpanded: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf'];

export function ControlImportModal({
  isOpen,
  onClose,
  onSuccess,
  initialFrameworkId,
}: ControlImportModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Frameworks
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>(initialFrameworkId || '');
  const [loadingFrameworks, setLoadingFrameworks] = useState(false);

  // File selection
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeControlsImportResponseDto | null>(null);

  // Review & Edit state
  const [reviewItems, setReviewItems] = useState<ReviewItemState[]>([]);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Load entitled frameworks when opening
  useEffect(() => {
    if (isOpen) {
      setLoadingFrameworks(true);
      apiRequest<FrameworkOption[]>('/frameworks')
        .then((res) => {
          setFrameworks(res);
          if (!selectedFrameworkId && res.length > 0) {
            setSelectedFrameworkId(initialFrameworkId || res[0].id);
          }
        })
        .catch(() => setFrameworks([]))
        .finally(() => setLoadingFrameworks(false));
    } else {
      // Reset state on close
      resetState();
    }
  }, [isOpen, initialFrameworkId]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isAnalyzing && !isPersisting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAnalyzing, isPersisting, onClose]);

  const resetState = () => {
    setFile(null);
    setFileError(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setAnalysisResult(null);
    setReviewItems([]);
    setIsPersisting(false);
    setPersistError(null);
  };

  const validateAndSetFile = (f: File) => {
    setFileError(null);
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`Invalid file format "${ext}". Please upload a spreadsheet (.xlsx, .xls, .csv) or PDF document.`);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(`File size (${(f.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 10MB.`);
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Trigger AI Analysis
  const handleStartAnalysis = async () => {
    if (!file) {
      setFileError('Please select a file to import.');
      return;
    }
    if (!selectedFrameworkId) {
      setFileError('Please select a target compliance framework.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await apiRequest<AnalyzeControlsImportResponseDto>(
        `/controls/import/analyze?frameworkId=${encodeURIComponent(selectedFrameworkId)}`,
        {
          method: 'POST',
          body: formData,
        },
      );

      setAnalysisResult(result);

      // Build review items
      const initialItems: ReviewItemState[] = (result.suggestions || []).map((s) => ({
        suggestion: s,
        // Default to MAP if matched with reference, STANDALONE if unmatched, or SKIP if low quality
        action: s.suggestedFrameworkReferenceId ? 'MAP' : 'STANDALONE',
        editedTitle: s.originalTitle,
        editedDescription: s.originalDescription,
        editedCategory: s.suggestedCategory || 'Security Controls',
        isExpanded: false,
      }));

      setReviewItems(initialItems);
    } catch (err: any) {
      setAnalysisError(
        err.message || 'Failed to analyze document. Verify document format and AI provider availability.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Bulk actions for review items
  const handleSetAllActions = (action: ItemAction) => {
    setReviewItems((prev) => prev.map((item) => ({ ...item, action })));
  };

  const handleItemActionChange = (tempId: string, action: ItemAction) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.suggestion.tempId === tempId ? { ...item, action } : item)),
    );
  };

  const handleToggleExpand = (tempId: string) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.suggestion.tempId === tempId ? { ...item, isExpanded: !item.isExpanded } : item,
      ),
    );
  };

  const handleFieldChange = (
    tempId: string,
    field: 'editedTitle' | 'editedDescription' | 'editedCategory',
    value: string,
  ) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.suggestion.tempId === tempId ? { ...item, [field]: value } : item)),
    );
  };

  // Save / Persist accepted items
  const handlePersist = async () => {
    const itemsToPersist = reviewItems.filter((i) => i.action !== 'SKIP');

    if (itemsToPersist.length === 0) {
      setPersistError('No controls are selected for import. Please set at least one control to "Map" or "Standalone".');
      return;
    }

    setIsPersisting(true);
    setPersistError(null);

    const payload: { controls: PersistImportedControlItemDto[] } = {
      controls: itemsToPersist.map((i) => ({
        name: i.editedTitle.trim(),
        description: i.editedDescription.trim(),
        category: i.editedCategory.trim() || undefined,
        frameworkReferenceId:
          i.action === 'MAP' ? i.suggestion.suggestedFrameworkReferenceId : undefined,
        status: i.action === 'MAP' ? MappingStatus.APPROVED : undefined,
      })),
    };

    try {
      const res = await apiRequest<PersistImportedControlsResponseDto>('/controls/import/persist', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast(
        `Imported ${res.createdCount} custom controls (${res.mappedCount} mapped to ${
          frameworks.find((f) => f.id === selectedFrameworkId)?.code || 'framework'
        }).`,
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setPersistError(err.message || 'Failed to persist imported controls. Please try again.');
    } finally {
      setIsPersisting(false);
    }
  };

  if (!isOpen) return null;

  // Selected counts
  const mapCount = reviewItems.filter((i) => i.action === 'MAP').length;
  const standaloneCount = reviewItems.filter((i) => i.action === 'STANDALONE').length;
  const skipCount = reviewItems.filter((i) => i.action === 'SKIP').length;
  const totalToSave = mapCount + standaloneCount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 26, 46, 0.55)',
        backdropFilter: 'blur(3px)',
        padding: '16px',
      }}
    >
      <div
        className="omni-fade-in bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 id="import-modal-title" className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Import & Map Custom Controls
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold uppercase tracking-wider">
                  AI-Assisted
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Upload your security policies or control register (PDF/Spreadsheet) to automatically map against compliance standards.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isAnalyzing || isPersisting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 omni-scroll">
          {/* STEP 1: Upload & Framework Selection */}
          {!analysisResult ? (
            <div className="space-y-6">
              {/* Target Framework Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Target Compliance Framework *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {loadingFrameworks ? (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                      Loading entitled frameworks...
                    </div>
                  ) : frameworks.length === 0 ? (
                    <div className="col-span-full p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      No active compliance frameworks found in your tenant license.
                    </div>
                  ) : (
                    frameworks.map((fw) => {
                      const isSelected = selectedFrameworkId === fw.id;
                      return (
                        <button
                          key={fw.id}
                          type="button"
                          onClick={() => setSelectedFrameworkId(fw.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-teal-600 bg-teal-50/50 shadow-sm ring-1 ring-teal-600'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900">{fw.code}</span>
                            {isSelected && <CheckCircle2 size={15} className="text-teal-600" />}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1">{fw.name}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Document Upload Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Upload Control Document (Spreadsheet or PDF) *
                </label>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-teal-500 bg-teal-50/40'
                      : file
                      ? 'border-teal-300 bg-teal-50/20'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        validateAndSetFile(e.target.files[0]);
                      }
                    }}
                  />

                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                        {file.name.endsWith('.pdf') ? <FileText size={24} /> : <FileSpreadsheet size={24} />}
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{file.name}</div>
                      <div className="text-xs text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB · Click or drag to replace
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-1">
                        <UploadCloud size={24} />
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        Click to upload or drag & drop document
                      </div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Supports Excel (.xlsx, .xls), CSV (.csv), or text-readable PDF files up to 10MB.
                      </p>
                    </div>
                  )}
                </div>

                {fileError && (
                  <div className="mt-2 text-xs text-rose-600 font-medium flex items-center gap-1.5">
                    <AlertTriangle size={13} /> {fileError}
                  </div>
                )}
              </div>

              {/* Security & Parsing Notices */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Tenant-Isolated & Safe Ingestion: </span>
                  Files are evaluated in-memory without formula or macro execution. Control data is never shared across organizations or used for external model training.
                </div>
              </div>

              {analysisError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-900 mb-1">Analysis Failed</div>
                    <div>{analysisError}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* STEP 2: Reviewable Suggestions & Coverage Report */
            <div className="space-y-5">
              {/* Coverage & Report Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Controls Extracted</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {analysisResult.coverage.totalExtracted}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs text-emerald-700 font-medium">High Match (&gt;80%)</div>
                  <div className="text-lg font-bold text-emerald-900 mt-0.5">
                    {analysisResult.coverage.highConfidenceCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <div className="text-xs text-teal-700 font-medium">Total Mapped</div>
                  <div className="text-lg font-bold text-teal-900 mt-0.5">
                    {analysisResult.coverage.matchedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs text-amber-700 font-medium">Unmatched / Custom</div>
                  <div className="text-lg font-bold text-amber-900 mt-0.5">
                    {analysisResult.coverage.unmatchedCount}
                  </div>
                </div>
              </div>

              {/* OCR Warning Banner if Scanned PDF */}
              {analysisResult.requiresOcr && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Scanned Document Detected: </span>
                    {analysisResult.extractionMessage ||
                      'This document contains scanned image pages with minimal selectable text. For complete coverage, upload an OCR-processed PDF or spreadsheet export.'}
                  </div>
                </div>
              )}

              {/* Review List Header with Bulk Actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Review Extracted Controls ({reviewItems.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verify AI-suggested mappings, edit titles/descriptions, or change actions before saving.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-xs text-slate-500 font-medium">Set all:</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllActions('MAP')}
                    className="text-xs px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 font-medium border border-teal-200 transition-colors"
                  >
                    Map All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllActions('STANDALONE')}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium border border-slate-200 transition-colors"
                  >
                    Standalone
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllActions('SKIP')}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-700 font-medium border border-slate-200 transition-colors"
                  >
                    Skip All
                  </button>
                </div>
              </div>

              {/* Suggestions List */}
              <div className="space-y-3">
                {reviewItems.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                    No control statements could be extracted from this document.
                  </div>
                ) : (
                  reviewItems.map((item, idx) => {
                    const { suggestion, action, editedTitle, editedDescription, editedCategory, isExpanded } = item;
                    const confidencePercent = Math.round((suggestion.confidenceScore || 0) * 100);

                    return (
                      <div
                        key={suggestion.tempId || idx}
                        className={`rounded-xl border transition-all ${
                          action === 'MAP'
                            ? 'border-teal-200 bg-teal-50/20'
                            : action === 'STANDALONE'
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-200 bg-slate-50/60 opacity-60'
                        }`}
                      >
                        {/* Top row */}
                        <div className="p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {suggestion.sourceLocation}
                              </span>

                              {suggestion.suggestedReferenceIdentifier ? (
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1">
                                  <Layers size={11} />
                                  {suggestion.suggestedReferenceIdentifier}
                                </span>
                              ) : (
                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  No Framework Match
                                </span>
                              )}

                              {suggestion.confidenceScore > 0 && (
                                <span
                                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    confidencePercent >= 80
                                      ? 'text-emerald-700 bg-emerald-100'
                                      : confidencePercent >= 50
                                      ? 'text-amber-700 bg-amber-100'
                                      : 'text-rose-700 bg-rose-100'
                                  }`}
                                >
                                  {confidencePercent}% match
                                </span>
                              )}
                            </div>

                            <div className="font-semibold text-sm text-slate-900 truncate">
                              {editedTitle || 'Untitled Control'}
                            </div>

                            {suggestion.suggestedReferenceTitle && (
                              <div className="text-xs text-teal-700 mt-0.5 line-clamp-1">
                                Maps to: {suggestion.suggestedReferenceTitle}
                              </div>
                            )}
                          </div>

                          {/* Action Chooser */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs">
                              {suggestion.suggestedFrameworkReferenceId && (
                                <button
                                  type="button"
                                  onClick={() => handleItemActionChange(suggestion.tempId, 'MAP')}
                                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                    action === 'MAP'
                                      ? 'bg-teal-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Map
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleItemActionChange(suggestion.tempId, 'STANDALONE')}
                                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                  action === 'STANDALONE'
                                    ? 'bg-slate-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Standalone
                              </button>
                              <button
                                type="button"
                                onClick={() => handleItemActionChange(suggestion.tempId, 'SKIP')}
                                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                  action === 'SKIP'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Skip
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleExpand(suggestion.tempId)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                              title={isExpanded ? 'Collapse' : 'Edit details'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Details & Edit Fields */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200/60 bg-white/50 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Control Title
                                </label>
                                <input
                                  className="omni-input text-xs w-full"
                                  value={editedTitle}
                                  onChange={(e) =>
                                    handleFieldChange(suggestion.tempId, 'editedTitle', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Category
                                </label>
                                <input
                                  className="omni-input text-xs w-full"
                                  value={editedCategory}
                                  onChange={(e) =>
                                    handleFieldChange(suggestion.tempId, 'editedCategory', e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Description
                              </label>
                              <textarea
                                className="omni-input text-xs w-full h-16 resize-none"
                                value={editedDescription}
                                onChange={(e) =>
                                  handleFieldChange(suggestion.tempId, 'editedDescription', e.target.value)
                                }
                              />
                            </div>

                            {/* AI Rationale & Gaps Note */}
                            {suggestion.rationale && (
                              <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-100 text-xs text-teal-900">
                                <span className="font-semibold">AI Rationale: </span>
                                {suggestion.rationale}
                              </div>
                            )}

                            {suggestion.gapsOrNotes && (
                              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-100 text-xs text-amber-900">
                                <span className="font-semibold">Gap Analysis: </span>
                                {suggestion.gapsOrNotes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {persistError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  {persistError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/60 shrink-0">
          {!analysisResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                disabled={isAnalyzing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={!file || !selectedFrameworkId || isAnalyzing}
                className="omni-btn-primary w-full sm:w-auto flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Analyzing Document with AI...
                  </>
                ) : (
                  <>
                    Analyze Controls <ArrowRight size={14} />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-600 w-full sm:w-auto">
                <span className="font-bold text-slate-900">{totalToSave}</span> controls to import (
                <span className="text-teal-700 font-semibold">{mapCount} mapped</span>,{' '}
                <span className="text-slate-700 font-semibold">{standaloneCount} standalone</span>,{' '}
                <span className="text-slate-400">{skipCount} skipped</span>)
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setAnalysisResult(null)}
                  disabled={isPersisting}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors border border-slate-200 rounded-lg bg-white"
                >
                  Back to Upload
                </button>
                <button
                  type="button"
                  onClick={handlePersist}
                  disabled={totalToSave === 0 || isPersisting}
                  className="omni-btn-primary w-full sm:w-auto flex items-center justify-center gap-2 text-xs disabled:opacity-50"
                >
                  {isPersisting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Saving Controls...
                    </>
                  ) : (
                    <>
                      Persist Accepted Controls ({totalToSave})
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
