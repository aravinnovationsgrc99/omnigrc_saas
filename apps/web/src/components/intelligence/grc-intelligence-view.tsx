'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Bot,
  AlertTriangle,
  Send,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Info,
  Layers,
  Activity,
  FileText,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  GrcSuggestedQuestion,
  EXACT_TEN_PREDEFINED_QUESTIONS,
  GrcSourceCitation,
  GrcStructuredAnalysis,
  GrcInferenceMode,
  GrcDomain,
} from '@omnigrc/shared';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredAnalysis?: GrcStructuredAnalysis;
  citations?: GrcSourceCitation[];
  sourcesUsed?: string[];
  suggestedFollowUps?: string[];
  intent?: string;
  inferenceMode?: GrcInferenceMode;
  providerName?: string;
  isLiveAi?: boolean;
  disclaimer?: string;
  isError?: boolean;
}

interface GrcIntelligenceViewProps {
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function GrcIntelligenceView({ onNavigateToView }: GrcIntelligenceViewProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<GrcSuggestedQuestion[]>(EXACT_TEN_PREDEFINED_QUESTIONS);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentProviderMode, setCurrentProviderMode] = useState<GrcInferenceMode>('LIVE_AI');
  const [currentProviderName, setCurrentProviderName] = useState<string>('Google Gemini 2.5 Flash');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await apiRequest<{ questions: GrcSuggestedQuestion[] }>('/intelligence/questions');
        if (data && data.questions && Array.isArray(data.questions) && data.questions.length >= 10) {
          setQuestions(data.questions);
        }
      } catch {
        // Fallback to EXACT_TEN_PREDEFINED_QUESTIONS
        setQuestions(EXACT_TEN_PREDEFINED_QUESTIONS);
      }
    };
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const executeQuery = async (queryText: string, questionKey?: string) => {
    if (!queryText.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: queryText.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      const data = await apiRequest<{
        answer: string;
        structuredAnalysis?: GrcStructuredAnalysis;
        citations?: GrcSourceCitation[];
        sourcesUsed?: string[];
        suggestedFollowUps?: string[];
        intent?: string;
        inferenceMode?: GrcInferenceMode;
        providerName?: string;
        isLiveAi?: boolean;
        disclaimer?: string;
      }>('/intelligence/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: queryText.trim(),
          questionKey,
          questionPillKey: questionKey,
          pageContext: {
            module: 'intelligence',
          },
        }),
      });

      if (data.inferenceMode) {
        setCurrentProviderMode(data.inferenceMode);
      }
      if (data.providerName) {
        setCurrentProviderName(data.providerName);
      }

      const assistantMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'Response generated.',
        structuredAnalysis: data.structuredAnalysis,
        citations: data.citations || [],
        sourcesUsed: data.sourcesUsed || [],
        suggestedFollowUps: data.suggestedFollowUps || [],
        intent: data.intent,
        inferenceMode: data.inferenceMode,
        providerName: data.providerName,
        isLiveAi: data.isLiveAi,
        disclaimer: data.disclaimer,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: err.message || 'Error executing GRC Intelligence query. Please try again shortly.',
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(prompt);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleCitationClick = (citation: GrcSourceCitation) => {
    if (onNavigateToView && citation.viewTarget) {
      onNavigateToView(citation.viewTarget, { id: citation.targetId });
    }
  };

  const filteredQuestions = selectedDomain === 'all'
    ? questions
    : questions.filter((q) => q.domain === selectedDomain);

  const domainTabs: { id: string; label: string }[] = [
    { id: 'all', label: 'All Domains (10)' },
    { id: 'compliance', label: 'Compliance & Controls' },
    { id: 'risk', label: 'Risk Register' },
    { id: 'audit', label: 'Audits & Findings' },
    { id: 'vendor', label: 'Vendor Risk (TPRM)' },
    { id: 'regulatory', label: 'Regulatory Intel' },
    { id: 'governance', label: 'Policies' },
    { id: 'remediation', label: 'Remediation & CAPAs' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-5" data-testid="grc-intelligence-workspace">
      {/* Header with Transparent AI Provider Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">GRC Intelligence System</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Context-aware regulatory and risk advisory grounded in your organization&apos;s live data.
              </p>
            </div>
          </div>
        </div>

        {/* AI Provider Transparency Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {currentProviderMode === 'LIVE_AI' ? (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold shadow-2xs"
              data-testid="provider-badge-live"
              title="Live LLM inference powered by Google Gemini 2.5 Flash connected to verified organization context."
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Google Gemini 2.5 Flash (Live AI)</span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold shadow-2xs"
              data-testid="provider-badge-fallback"
              title="Deterministic Rule-based Fallback. Live Gemini AI is currently unavailable or in grounded simulation mode."
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Deterministic Rule-based Fallback</span>
            </div>
          )}

          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Mandatory Disclaimer Banner */}
      <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
        <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-amber-900">Advisory Disclaimer:</span> GRC Intelligence outputs provide context-grounded advisory insights for compliance officers and auditors. They do not constitute formal legal counsel or binding regulatory certifications.
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Messages Thread Area */}
        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto max-h-[640px] omni-scroll bg-slate-50/40">
          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center mx-auto shadow-xs">
                <Bot className="w-7 h-7 text-teal-700" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-900">How can GRC Intelligence assist your organization?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ask any question across our 8 compliance domains, or choose from the 10 standardized discovery questions below.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="text-[11px] font-semibold text-slate-400 px-1">
                  {msg.role === 'user' ? (
                    'You'
                  ) : (
                    <span className="flex items-center gap-1.5 text-teal-900 font-bold">
                      <Bot className="w-3.5 h-3.5 text-teal-700" />
                      <span>OMNiGRC Intelligence</span>
                      {msg.isLiveAi ? (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                          Live AI
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full">
                          Rule-based Fallback
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div
                  className={`max-w-[94%] sm:max-w-[85%] p-4 rounded-2xl text-xs space-y-3.5 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-teal-800 text-white rounded-br-none'
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-900 rounded-bl-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  {/* Assistant Text Answer */}
                  <div className="whitespace-pre-wrap leading-relaxed font-normal break-words overflow-hidden text-xs text-slate-800">
                    {msg.content}
                  </div>

                  {/* Structured Analysis Metrics Cards */}
                  {msg.structuredAnalysis && msg.structuredAnalysis.metrics && msg.structuredAnalysis.metrics.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-teal-600" /> Key Operational Metrics
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {msg.structuredAnalysis.metrics.map((m, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border text-center ${
                              m.trend === 'critical'
                                ? 'bg-red-50 border-red-200 text-red-900'
                                : m.trend === 'warning'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          >
                            <div className="text-base font-bold">{m.value}</div>
                            <div className="text-[10px] text-slate-600 font-medium truncate">{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clickable Source Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2.5 border-t border-slate-100 space-y-2" data-testid="citations-container">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                          <span>Grounded Source Citations ({msg.citations.length})</span>
                        </span>
                        <span className="text-[9px] text-slate-400 font-normal">Click citation to inspect record</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.citations.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleCitationClick(c)}
                            className="text-left p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/70 border border-slate-200 hover:border-teal-300 transition group flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-100 text-teal-900">
                                  {c.domain}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-teal-700 transition" />
                              </div>
                              <div className="text-xs font-semibold text-slate-900 group-hover:text-teal-900 line-clamp-1">
                                {c.title}
                              </div>
                              {c.snippet && (
                                <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                                  {c.snippet}
                                </div>
                              )}
                            </div>
                            {c.statusOrDate && (
                              <div className="text-[9px] font-medium text-slate-400 mt-2">
                                {c.statusOrDate}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contextual Follow-Up Suggestions */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Suggested Follow-ups:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedFollowUps.map((fu, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => executeQuery(fu)}
                            disabled={loading}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 transition flex items-center gap-1 disabled:opacity-50"
                          >
                            <span>{fu}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2.5 p-3.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-600 max-w-[80%] shadow-xs omni-fade-in">
              <Bot className="w-4 h-4 text-teal-700 animate-spin flex-shrink-0" />
              <span>Analyzing organization data across 8 GRC domains...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Standardized Predefined Question Pills (Exact 10 Domain Questions) */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2.5" data-testid="suggested-questions-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-700" /> Standardized Discovery Questions ({questions.length})
            </div>
            {/* Domain Filter Pills (scrollable on mobile) */}
            <div className="flex items-center gap-1 overflow-x-auto omni-scroll py-0.5 -mx-1 px-1">
              {domainTabs.slice(0, 6).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedDomain(tab.id)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition whitespace-nowrap ${
                    selectedDomain === tab.id
                      ? 'bg-teal-800 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredQuestions.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => executeQuery(q.prompt, q.key)}
                disabled={loading}
                className="text-left p-2.5 rounded-xl bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-300 transition shadow-2xs group flex items-start justify-between gap-2 disabled:opacity-50"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                      {q.domain}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 group-hover:text-teal-900">
                      {q.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{q.prompt}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-700 transition-transform group-hover:translate-x-0.5 flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        </div>

        {/* Input Composer */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask any question about risks, controls, evidence, audits, vendors, or regulations..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0 px-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition font-medium disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center justify-center px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-teal-800 hover:bg-teal-900 text-white shadow-xs disabled:opacity-50 transition shrink-0 gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send Query</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
