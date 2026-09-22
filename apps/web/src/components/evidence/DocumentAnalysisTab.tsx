'use client';

import React, { useState, useEffect } from 'react';
import {
  DocumentAnalysisDto,
  ExtractedFindingDto,
  FindingType,
  FindingReviewStatus,
  AnalysisStatus,
  ExtractionStatus,
} from '@omnigrc/shared';
import {
  Brain,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Filter,
  RefreshCw,
  Eye,
  Check,
  X,
  Edit3,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';

interface DocumentAnalysisTabProps {
  evidenceId: string;
  evidenceTitle: string;
  fileName: string;
}

export function DocumentAnalysisTab({ evidenceId, evidenceTitle, fileName }: DocumentAnalysisTabProps) {
  const { addToast } = useToast();
  const [analyses, setAnalyses] = useState<DocumentAnalysisDto[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DocumentAnalysisDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Review Modal State
  const [reviewFinding, setReviewFinding] = useState<ExtractedFindingDto | null>(null);
  const [reviewAction, setReviewAction] = useState<FindingReviewStatus>(FindingReviewStatus.ACCEPTED);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [humanComment, setHumanComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Framework Trigger Modal
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [analysisContext, setAnalysisContext] = useState<'GENERAL' | 'FRAMEWORK'>('GENERAL');

  const fetchAnalyses = async () => {
    setLoading(true);
    try {
      const list = await apiRequest<DocumentAnalysisDto[]>(`/evidence/${evidenceId}/analyses`);
      setAnalyses(list);
      if (list.length > 0) {
        setSelectedAnalysis(list[0]);
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to load document analyses.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyses();
  }, [evidenceId]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const payload = {
        analysisContext: analysisContext,
      };
      await apiRequest(`/evidence/${evidenceId}/analyze`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      addToast('AI Document Intelligence Analysis job queued successfully', 'success');
      setShowTriggerModal(false);
      setTimeout(() => fetchAnalyses(), 1500);
    } catch (err: any) {
      addToast(err.message || 'Failed to trigger document analysis.', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOpenReviewModal = (finding: ExtractedFindingDto, action: FindingReviewStatus) => {
    setReviewFinding(finding);
    setReviewAction(action);
    setEditedTitle(finding.editedTitle || finding.aiTitle);
    setEditedDescription(finding.editedDescription || finding.aiDescription);
    setHumanComment(finding.humanComment || '');
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewFinding || !selectedAnalysis) return;

    setSubmittingReview(true);
    try {
      const body = {
        reviewStatus: reviewAction,
        editedTitle: editedTitle !== reviewFinding.aiTitle ? editedTitle : undefined,
        editedDescription: editedDescription !== reviewFinding.aiDescription ? editedDescription : undefined,
        humanComment: humanComment.trim() || undefined,
      };

      const updatedFinding = await apiRequest<ExtractedFindingDto>(
        `/analyses/${selectedAnalysis.id}/findings/${reviewFinding.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );

      addToast(`Finding marked as ${reviewAction}`, 'success');
      setReviewFinding(null);

      // Local state update
      setSelectedAnalysis((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          findings: (prev.findings || []).map((f) => (f.id === updatedFinding.id ? updatedFinding : f)),
        };
      });
    } catch (err: any) {
      addToast(err.message || 'Failed to submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const filteredFindings = (selectedAnalysis?.findings || []).filter((f) => {
    const matchesCategory =
      activeCategory === 'ALL' ||
      (activeCategory === 'OBLIGATION' && f.findingType === FindingType.OBLIGATION) ||
      (activeCategory === 'DEADLINE' && f.findingType === FindingType.DEADLINE) ||
      (activeCategory === 'KEY_POINT' && f.findingType === FindingType.KEY_POINT) ||
      (activeCategory === 'RISK_CONTROL' && (f.findingType === FindingType.RISK || f.findingType === FindingType.CONTROL_IMPLICATION));

    const matchesSearch =
      !searchQuery ||
      f.aiTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.aiDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.aiSourceSnippet && f.aiSourceSnippet.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const getStatusBadge = (status: AnalysisStatus) => {
    switch (status) {
      case AnalysisStatus.COMPLETED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded flex items-center gap-1"><CheckCircle2 size={12} /> Completed</span>;
      case AnalysisStatus.PROCESSING:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded flex items-center gap-1 animate-pulse"><RefreshCw size={12} className="animate-spin" /> Processing</span>;
      case AnalysisStatus.QUEUED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded flex items-center gap-1"><Clock size={12} /> Queued</span>;
      case AnalysisStatus.PARTIAL:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 rounded flex items-center gap-1"><AlertTriangle size={12} /> Partial (Truncated)</span>;
      case AnalysisStatus.FAILED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-800 border border-red-200 rounded flex items-center gap-1"><XCircle size={12} /> Failed</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded">{status}</span>;
    }
  };

  const getReviewBadge = (status: FindingReviewStatus) => {
    switch (status) {
      case FindingReviewStatus.ACCEPTED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded">Accepted</span>;
      case FindingReviewStatus.REJECTED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 rounded">Rejected</span>;
      case FindingReviewStatus.EDITED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded">Edited</span>;
      case FindingReviewStatus.DISMISSED:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-700 rounded">Dismissed</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 rounded">Unreviewed</span>;
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <Brain size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">AI Document Intelligence & Compliance Extraction</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded uppercase tracking-wider">
                Advisory AI
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Structured extraction of obligations, deadlines, key points, risks, and framework relevance grounded in source document text.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTriggerModal(true)}
            disabled={analyzing}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles size={14} /> {analyzing ? 'Queuing Analysis...' : 'Run AI Analysis'}
          </button>
          <button
            onClick={fetchAnalyses}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh Analyses"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* OCR Unavailable Warning Banner if relevant */}
      {selectedAnalysis?.extractionStatus === ExtractionStatus.OCR_UNAVAILABLE && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-950">OCR Engine Unavailable:</span> Scanned images or non-searchable PDF format detected, but no production OCR provider key is currently configured. Document uploaded safely.
          </div>
        </div>
      )}

      {/* Main Analysis View */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-medium">Loading document intelligence...</div>
      ) : analyses.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-slate-50 border border-slate-200 shadow-sm text-slate-600 space-y-3">
          <Sparkles className="w-10 h-10 mx-auto text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">No AI Document Analysis Generated Yet</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Submit "{fileName}" for AI extraction to uncover mandatory obligations, explicit deadlines, compliance risks, and control implications.
          </p>
          <button
            onClick={() => setShowTriggerModal(true)}
            className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition shadow"
          >
            Analyze Document Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Analysis Version Switcher */}
          {analyses.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Clock size={12} /> Analysis Runs:
              </span>
              {analyses.map((a, idx) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAnalysis(a)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                    selectedAnalysis?.id === a.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Run #{analyses.length - idx} ({a.analysisContext}) - {new Date(a.createdAt).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}

          {/* Analysis Metadata Banner */}
          {selectedAnalysis && (
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Document Analysis Context: {selectedAnalysis.analysisContext}</span>
                  {getStatusBadge(selectedAnalysis.status)}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>Extractor: <strong className="text-slate-700">{selectedAnalysis.extractionMethod}</strong></span>
                  <span>Version: <strong className="text-slate-700">v{selectedAnalysis.analysisVersionNumber}</strong></span>
                  {selectedAnalysis.isTruncated && <span className="text-purple-700 font-semibold">Max Bounds Truncated</span>}
                </div>
              </div>

              {/* Stat Counters */}
              <div className="flex items-center gap-4 text-center">
                <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-base font-bold text-slate-900">{selectedAnalysis.findings?.length || 0}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Total Findings</div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-base font-bold text-emerald-900">
                    {selectedAnalysis.findings?.filter((f) => f.findingType === FindingType.OBLIGATION).length || 0}
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-800 uppercase">Obligations</div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-base font-bold text-blue-900">
                    {selectedAnalysis.findings?.filter((f) => f.findingType === FindingType.DEADLINE).length || 0}
                  </div>
                  <div className="text-[10px] font-semibold text-blue-800 uppercase">Deadlines</div>
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {['ALL', 'OBLIGATION', 'DEADLINE', 'KEY_POINT', 'RISK_CONTROL'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                    activeCategory === cat
                      ? 'bg-teal-700 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat === 'ALL' && 'All Findings'}
                  {cat === 'OBLIGATION' && 'Obligations'}
                  {cat === 'DEADLINE' && 'Deadlines'}
                  {cat === 'KEY_POINT' && 'Key Points'}
                  {cat === 'RISK_CONTROL' && 'Risks & Controls'}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search extracted findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          {/* Findings Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold text-[11px] border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Finding Type & Title</th>
                  <th className="py-3 px-4">Extracted Intelligence & Grounding</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Review Status</th>
                  <th className="py-3 px-4 text-right">Human Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      No findings match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map((finding) => (
                    <tr key={finding.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 align-top w-64">
                        <div className="space-y-1">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-800 border border-slate-200 inline-block">
                            {finding.findingType}
                          </span>
                          <div className="font-bold text-slate-900 leading-snug">
                            {finding.editedTitle || finding.aiTitle}
                          </div>
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 rounded inline-flex items-center gap-1">
                            <Sparkles size={10} /> AI SUGGESTION
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-2">
                          <p className="text-slate-700 leading-relaxed">
                            {finding.editedDescription || finding.aiDescription}
                          </p>

                          {finding.aiDueDate && (
                            <div className="text-[11px] font-semibold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded inline-flex items-center gap-1.5">
                              <Clock size={12} /> Due Date: {new Date(finding.aiDueDate).toLocaleDateString()}
                              {finding.aiRelativeExpression && <span className="text-blue-700">({finding.aiRelativeExpression})</span>}
                            </div>
                          )}

                          {finding.aiSourceSnippet && (
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                              <div className="font-bold text-slate-700 flex items-center gap-1">
                                <FileText size={12} className="text-teal-700" /> Source Citation:
                              </div>
                              <blockquote className="italic text-slate-800 border-l-2 border-teal-600 pl-2">
                                "{finding.aiSourceSnippet}"
                              </blockquote>
                              {(finding.aiSourcePage || finding.aiSourceSheet) && (
                                <div className="text-[10px] text-slate-500 omni-mono">
                                  {finding.aiSourcePage && `Page ${finding.aiSourcePage}`}
                                  {finding.aiSourceSheet && `Sheet "${finding.aiSourceSheet}" Cell ${finding.aiSourceCell || ''}`}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-xs">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          finding.aiConfidence === 'HIGH' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          {finding.aiConfidence} CONFIDENCE
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top text-xs">
                        {getReviewBadge(finding.reviewStatus)}
                      </td>

                      <td className="py-3.5 px-4 align-top text-right space-y-1">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenReviewModal(finding, FindingReviewStatus.ACCEPTED)}
                            className="p-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                            title="Accept Finding"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(finding, FindingReviewStatus.EDITED)}
                            className="p-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                            title="Edit Finding"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(finding, FindingReviewStatus.REJECTED)}
                            className="p-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition"
                            title="Reject Finding"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HUMAN REVIEW MODAL */}
      {reviewFinding && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-teal-700" /> Submit Human Review Decision
            </h3>

            <form onSubmit={handleReviewSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Review Decision</label>
                <select
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value as FindingReviewStatus)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-white font-medium"
                >
                  <option value={FindingReviewStatus.ACCEPTED}>ACCEPTED (Confirm as valid intelligence)</option>
                  <option value={FindingReviewStatus.EDITED}>EDITED (Modify title or description)</option>
                  <option value={FindingReviewStatus.REJECTED}>REJECTED (Incorrect or inaccurate model output)</option>
                  <option value={FindingReviewStatus.DISMISSED}>DISMISSED (Not relevant to current context)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Finding Title</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Finding Description</label>
                <textarea
                  rows={3}
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Reviewer Notes / Justification</label>
                <textarea
                  rows={2}
                  value={humanComment}
                  onChange={(e) => setHumanComment(e.target.value)}
                  placeholder="Optional notes regarding compliance review decision"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewFinding(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {submittingReview ? 'Submitting Review...' : 'Save Review Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRIGGER ANALYSIS MODAL */}
      {showTriggerModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <Sparkles size={18} className="text-teal-700" /> Trigger AI Document Intelligence
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Analysis Context</label>
                <select
                  value={analysisContext}
                  onChange={(e) => setAnalysisContext(e.target.value as any)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-white font-medium"
                >
                  <option value="GENERAL">General Document Intelligence (No framework mapping)</option>
                  <option value="FRAMEWORK">Entitled Framework Mapping Context</option>
                </select>
              </div>

              <p className="text-xs text-slate-500">
                Processing runs asynchronously via BullMQ persistent queue. All findings are strictly advisory suggestions and require human review.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRunAnalysis}
                  disabled={analyzing}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {analyzing ? 'Queuing...' : 'Queue Document Analysis'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
