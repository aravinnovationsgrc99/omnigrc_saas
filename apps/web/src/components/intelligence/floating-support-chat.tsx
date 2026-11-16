'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Bot,
  X,
  Minimize2,
  Send,
  RotateCcw,
  AlertTriangle,
  BookOpen,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Activity,
  ArrowRight,
  Database,
  BarChart3,
  Table as TableIcon,
  Copy,
  Check,
  Compass,
  Lightbulb,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  GrcSuggestedQuestion,
  GrcSourceCitation,
  GrcStructuredAnalysis,
  GrcInferenceMode,
  GrcGenerationMode,
  GrcVisualizationPayload,
  GrcDataSummary,
  GrcChatResponseDto,
  EXACT_TEN_PREDEFINED_QUESTIONS,
  EXTENDED_GRC_PREDEFINED_QUESTIONS,
} from '@omnigrc/shared';
import { ChatMarkdown } from './chat-markdown';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredAnalysis?: GrcStructuredAnalysis;
  citations?: GrcSourceCitation[];
  sourcesUsed?: string[];
  suggestedFollowUps?: string[];
  inferenceMode?: GrcInferenceMode;
  generationMode?: GrcGenerationMode;
  visualizations?: GrcVisualizationPayload[];
  data?: GrcDataSummary;
  warnings?: string[];
  providerName?: string;
  isLiveAi?: boolean;
  isError?: boolean;
  timestamp: string;
}

export interface QuestionPill {
  key: string;
  category: string;
  label: string;
  prompt: string;
  domain?: string;
}

export interface FloatingSupportChatProps {
  currentView?: string;
  viewParams?: Record<string, any>;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function FloatingSupportChat({
  currentView,
  viewParams,
  onNavigateToView,
}: FloatingSupportChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pills, setPills] = useState<QuestionPill[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentProviderMode, setCurrentProviderMode] = useState<GrcInferenceMode>('LIVE_AI');
  const [showQuestions, setShowQuestions] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Predefined Questions on Mount via apiRequest and merge with extended question suite
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await apiRequest<{ questions: QuestionPill[] }>('/intelligence/questions');
        const fetched = data && data.questions && Array.isArray(data.questions) ? data.questions : [];
        const mergedMap = new Map<string, QuestionPill>();

        // 1. Add questions from API
        fetched.forEach((q) => mergedMap.set(q.key, q));

        // 2. Merge with EXTENDED_GRC_PREDEFINED_QUESTIONS
        EXTENDED_GRC_PREDEFINED_QUESTIONS.forEach((q) => {
          if (!mergedMap.has(q.key)) {
            mergedMap.set(q.key, {
              key: q.key,
              category: q.category,
              label: q.label,
              prompt: q.prompt,
              domain: q.domain,
            });
          }
        });

        setPills(Array.from(mergedMap.values()));
      } catch {
        // Fallback pills if endpoint unreachable
        setPills(
          EXTENDED_GRC_PREDEFINED_QUESTIONS.map((q) => ({
            key: q.key,
            category: q.category,
            label: q.label,
            prompt: q.prompt,
            domain: q.domain,
          }))
        );
      }
    };
    fetchQuestions();
  }, []);

  // Keyboard accessibility: ESC key closes panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Collision Avoidance: Detect when any modal or drawer is active on screen
  const [hasActiveModal, setHasActiveModal] = useState(false);

  useEffect(() => {
    const checkActiveModal = () => {
      if (typeof document === 'undefined') return;
      const modals = document.querySelectorAll(
        '[role="dialog"]:not([data-floating-support]), [aria-modal="true"]:not([data-floating-support]), .fixed.inset-0:not([data-floating-support])'
      );
      setHasActiveModal(modals.length > 0);
    };

    checkActiveModal();
    const observer = new MutationObserver(checkActiveModal);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-modal', 'role'],
    });

    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  const handleSendPrompt = async (textToSend?: string, questionKey?: string) => {
    const messageContent = (textToSend || prompt).trim();
    if (!messageContent || loading) return;

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!textToSend) setPrompt('');
    setLoading(true);

    try {
      // Send last 6 conversation history items
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data = await apiRequest<GrcChatResponseDto>('/intelligence/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: messageContent,
          history: historyPayload,
          questionKey,
          questionPillKey: questionKey,
          pageContext: {
            module: currentView || 'dashboard',
            ...viewParams,
          },
        }),
      });

      if (data.inferenceMode) {
        setCurrentProviderMode(data.inferenceMode);
      }

      const assistantMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'Response generated.',
        structuredAnalysis: data.structuredAnalysis,
        citations: data.citations || [],
        sourcesUsed: data.sourcesUsed || [],
        suggestedFollowUps: data.suggestedFollowUps || [],
        inferenceMode: data.inferenceMode,
        generationMode: data.generationMode,
        visualizations: data.visualizations,
        data: data.data,
        warnings: data.warnings,
        providerName: data.providerName,
        isLiveAi: data.isLiveAi,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: err.message || 'GRC Intelligence AI service is currently unavailable. Please try again shortly.',
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handlePillClick = (pill: QuestionPill) => {
    handleSendPrompt(pill.prompt, pill.key);
  };

  const handleCitationClick = (citation: GrcSourceCitation) => {
    if (onNavigateToView && citation.viewTarget) {
      onNavigateToView(citation.viewTarget, { id: citation.targetId });
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowQuestions(true);
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // Ignore clipboard write errors
    }
  };

  const categories = ['All', ...Array.from(new Set(pills.map((p) => p.category)))];
  const filteredPills = selectedCategory === 'All' ? pills : pills.filter((p) => p.category === selectedCategory);

  const launcherPositionClass = hasActiveModal
    ? 'bottom-4 left-4 sm:bottom-6 sm:right-6'
    : 'bottom-4 right-4 sm:bottom-6 sm:right-6';

  return (
    <div
      data-floating-support="true"
      className={`fixed ${launcherPositionClass} z-45 transition-all duration-300 omni-font-sans`}
    >
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open GRC Intelligence Assistant"
          className="group relative flex items-center justify-center gap-2 p-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-teal-600 via-cyan-600 to-indigo-600 hover:from-teal-700 hover:via-cyan-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-full shadow-[0_4px_20px_rgba(20,184,166,0.35)] hover:shadow-[0_6px_25px_rgba(99,102,241,0.45)] transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[44px] min-h-[44px]"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="w-5 h-5 text-cyan-100 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping opacity-75" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-indigo-900" />
          </div>
          <span className="hidden sm:inline font-semibold tracking-wide">GRC Copilot</span>
          <Sparkles className="hidden sm:inline w-4 h-4 text-amber-300 animate-pulse" />
        </button>
      )}

      {/* Floating Chat Drawer/Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-floating-support="true"
          aria-label="GRC Intelligence Support Panel"
          className="fixed bottom-16 sm:bottom-20 right-3 sm:right-6 left-3 sm:left-auto w-auto sm:w-[480px] max-w-[calc(100vw-1.5rem)] h-[620px] max-h-[calc(100vh-5rem)] bg-white border border-indigo-100/90 rounded-2xl shadow-[0_12px_45px_rgba(15,23,42,0.18)] flex flex-col overflow-hidden omni-fade-in z-[70]"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-indigo-900/40 shrink-0 overflow-hidden">
            {/* Ambient decorative light */}
            <div className="absolute top-0 right-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-0 left-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-sm flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                  <span className="bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                    OMNiGRC Intelligence
                  </span>
                  {currentProviderMode === 'LIVE_AI' ? (
                    <span className="text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40 flex-shrink-0 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live AI
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/40 flex-shrink-0 inline-flex items-center gap-1">
                      <Database className="w-2.5 h-2.5 text-cyan-400" />
                      Verified KB
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-indigo-200/80 truncate">
                  {currentView ? `Context: ${currentView}` : 'Organization Grounded Copilot'}
                </p>
              </div>
            </div>

            <div className="relative flex items-center gap-1 flex-shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  title="Clear Conversation"
                  aria-label="Clear Conversation"
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Minimize Chat Panel"
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close Chat Panel"
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 bg-gradient-to-b from-slate-50/90 via-indigo-50/20 to-slate-50/90 omni-scroll">
            {/* Welcome Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white via-indigo-50/40 to-teal-50/30 border border-indigo-100/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                  <span className="p-1 rounded-lg bg-indigo-100 text-indigo-700">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span>Autonomous GRC Copilot</span>
                </div>
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Grounded &amp; Auditable
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Query controls, risks, evidence, audit findings, third-party vendors, or framework posture with citations.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50/80 p-2 rounded-xl border border-amber-200/80">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="leading-snug">Advisory synthesis only. Compliance determinations require human verification.</span>
              </div>
            </div>

            {/* Discovery Question Section */}
            {pills.length > 0 && (
              <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all">
                {/* Accordion Bar when messages exist */}
                <div
                  onClick={() => setShowQuestions(!showQuestions)}
                  className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer bg-gradient-to-r from-slate-50 to-indigo-50/30 hover:bg-slate-100/80 border-b border-slate-100 transition select-none"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Compass className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span>Suggested Discovery Questions</span>
                    <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full">
                      {pills.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600">
                    <span>{showQuestions ? 'Hide' : 'Browse'}</span>
                    {showQuestions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </div>

                {/* Collapsible Question Cards */}
                {showQuestions && (
                  <div className="p-3 space-y-2.5">
                    {/* Category Selector Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 omni-scroll">
                      {categories.map((cat) => {
                        const count = cat === 'All' ? pills.length : pills.filter((p) => p.category === cat).length;
                        const isSelected = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition flex items-center gap-1 ${
                              isSelected
                                ? 'bg-gradient-to-r from-indigo-600 to-teal-600 text-white shadow-xs'
                                : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600'
                            }`}
                          >
                            <span>{cat}</span>
                            <span
                              className={`text-[9px] px-1 py-0.1 rounded-full ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Full-Visibility Questions Grid (No Ellipses, Full Text) */}
                    <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1 omni-scroll">
                      {filteredPills.map((pill) => (
                        <button
                          key={pill.key}
                          onClick={() => handlePillClick(pill)}
                          disabled={loading}
                          className="group relative p-2.5 rounded-xl bg-slate-50/70 hover:bg-gradient-to-r hover:from-indigo-50/60 hover:to-teal-50/40 border border-slate-200/80 hover:border-indigo-300 text-left transition-all duration-150 flex items-start justify-between gap-2 disabled:opacity-50 shadow-2xs hover:shadow-xs"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-indigo-100/90 text-indigo-800">
                                {pill.category}
                              </span>
                              <span className="text-xs font-semibold text-slate-900 group-hover:text-indigo-950">
                                {pill.label}
                              </span>
                            </div>
                            {/* Complete Question Text without line-clamp truncation */}
                            <p className="text-[11px] text-slate-600 group-hover:text-slate-800 leading-relaxed break-words">
                              {pill.prompt}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0 mt-1" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Messages Thread */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
              >
                {msg.role === 'assistant' && (
                  <div className="text-[10px] font-semibold text-slate-500 px-1 flex items-center justify-between w-full max-w-[94%] sm:max-w-[90%]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center text-white">
                        <Bot className="w-2.5 h-2.5" />
                      </div>
                      <span className="font-bold text-slate-700">GRC Assistant</span>
                      {msg.generationMode === 'DATA_GROUNDED' ? (
                        <span className="text-[9px] font-semibold bg-teal-100 text-teal-900 px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5 border border-teal-200">
                          <Database className="w-2 h-2 text-teal-700" /> Verified DB
                        </span>
                      ) : msg.generationMode === 'HYBRID' ? (
                        <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-900 px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5 border border-indigo-200">
                          <Sparkles className="w-2 h-2 text-indigo-700" /> Hybrid AI
                        </span>
                      ) : msg.isLiveAi ? (
                        <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live AI
                        </span>
                      ) : null}
                    </div>

                    {/* Copy Response Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded transition flex items-center gap-1"
                      title="Copy Answer"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span className="text-[9px]">{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                <div
                  className={`max-w-[94%] sm:max-w-[90%] p-3.5 sm:p-4 rounded-2xl text-xs space-y-3 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-teal-600 text-white rounded-br-xs font-medium'
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-900 rounded-bl-xs'
                      : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                  }`}
                >
                  {/* Rich Markdown Message Content (Interprets **, ***, headers, lists, code) */}
                  <div className="leading-relaxed break-words overflow-hidden">
                    <ChatMarkdown content={msg.content} isUser={msg.role === 'user'} />
                  </div>

                  {/* Advisory Warnings */}
                  {msg.warnings && msg.warnings.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        {msg.warnings.map((w, wIdx) => (
                          <div key={wIdx}>{w}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Visualizations: KPIs, Severity Bar, Table */}
                  {msg.visualizations && msg.visualizations.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      {msg.visualizations.map((viz, vIdx) => (
                        <div key={vIdx} className="space-y-1.5">
                          {/* KPI grid */}
                          {viz.type === 'kpi' && viz.kpis && viz.kpis.length > 0 && (
                            <div className="grid grid-cols-2 gap-1.5">
                              {viz.kpis.slice(0, 4).map((k, kIdx) => (
                                <div
                                  key={kIdx}
                                  className={`p-2 rounded-xl border text-center ${
                                    k.trend === 'critical'
                                      ? 'bg-red-50 border-red-200 text-red-900'
                                      : k.trend === 'warning'
                                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                                      : k.trend === 'good'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                      : 'bg-slate-50 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <div className="text-xs font-bold omni-mono">{k.value}</div>
                                  <div className="text-[9px] text-slate-500 font-medium truncate">{k.label}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Bar chart */}
                          {viz.type === 'bar' && viz.chartData && viz.chartData.length > 0 && (
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                              {viz.title && (
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <BarChart3 className="w-2.5 h-2.5 text-indigo-600" /> {viz.title}
                                </div>
                              )}
                              <div className="space-y-1.5">
                                {viz.chartData.map((item, bIdx) => {
                                  const color =
                                    item.color ||
                                    (item.label.toLowerCase().includes('high') ||
                                    item.label.toLowerCase().includes('critical')
                                      ? '#EF4444'
                                      : item.label.toLowerCase().includes('med')
                                      ? '#F59E0B'
                                      : '#10B981');
                                  return (
                                    <div key={bIdx} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-medium text-slate-700 flex items-center gap-1">
                                          <span
                                            className="w-1.5 h-1.5 rounded-full inline-block"
                                            style={{ backgroundColor: color }}
                                          />
                                          {item.label}
                                        </span>
                                        <span className="font-mono text-slate-900 font-bold text-[10px]">
                                          {item.value} {item.percentage !== undefined ? `(${item.percentage}%)` : ''}
                                        </span>
                                      </div>
                                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className="h-1.5 rounded-full transition-all duration-300"
                                          style={{
                                            width: `${Math.min(
                                              100,
                                              Math.max(0, item.percentage ?? (item.value > 0 ? 100 : 0))
                                            )}%`,
                                            backgroundColor: color,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Table */}
                          {viz.type === 'table' && viz.columns && viz.rows && (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-left text-[10px]">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                    {viz.columns.slice(0, 3).map((col) => (
                                      <th key={col.key} className="py-1.5 px-2 font-semibold uppercase">
                                        {col.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {viz.rows.slice(0, 3).map((row, rIdx) => (
                                    <tr key={rIdx}>
                                      {viz.columns!.slice(0, 3).map((col) => (
                                        <td key={col.key} className="py-1 px-2 text-slate-700 truncate max-w-[130px]">
                                          {typeof row[col.key] === 'number' ? (
                                            <span className="font-mono font-bold">{row[col.key]}</span>
                                          ) : (
                                            row[col.key] ?? '—'
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fallback Compact Metrics (if no viz.kpi rendered) */}
                  {(!msg.visualizations || !msg.visualizations.some((v) => v.type === 'kpi')) &&
                    msg.structuredAnalysis &&
                    msg.structuredAnalysis.metrics &&
                    msg.structuredAnalysis.metrics.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Activity className="w-3 h-3 text-indigo-600" /> Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {msg.structuredAnalysis.metrics.slice(0, 4).map((m, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded-xl border text-center ${
                                m.trend === 'critical'
                                  ? 'bg-red-50 border-red-200 text-red-900'
                                  : m.trend === 'warning'
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <div className="text-xs font-bold">{m.value}</div>
                              <div className="text-[9px] text-slate-500 truncate">{m.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Clickable Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" /> Verified Citations ({msg.citations.length}):
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {msg.citations.slice(0, 4).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleCitationClick(c)}
                            className="text-left p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 transition flex items-center justify-between group shadow-2xs"
                          >
                            <div className="min-w-0 pr-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900 mr-1.5">
                                {c.domain}
                              </span>
                              <span className="text-xs font-semibold text-slate-900 group-hover:text-indigo-950 truncate">
                                {c.title}
                              </span>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Follow-up Questions (Full Text, Clean Typography, No Ellipsis) */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-indigo-900/80 uppercase tracking-wider flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 text-indigo-600" />
                        <span>Suggested Next Questions:</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {msg.suggestedFollowUps.slice(0, 4).map((fu, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendPrompt(fu)}
                            disabled={loading}
                            className="group text-left text-xs font-medium px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50/80 to-teal-50/80 hover:from-indigo-100 hover:to-teal-100 text-indigo-950 border border-indigo-200/80 hover:border-indigo-300 transition-all flex items-center justify-between gap-2 disabled:opacity-50 shadow-2xs hover:shadow-xs"
                          >
                            {/* Complete Question Text without max-width truncation */}
                            <span className="leading-snug break-words flex-1">{fu}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0 ml-1" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary Text Sources Tags if citations empty */}
                  {(!msg.citations || msg.citations.length === 0) &&
                    msg.sourcesUsed &&
                    msg.sourcesUsed.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-indigo-600 flex-shrink-0" /> Sources:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {msg.sourcesUsed.map((src, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/80 break-words max-w-full"
                            >
                              {src}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Retry Action on Error */}
                  {msg.isError && (
                    <button
                      onClick={() => handleSendPrompt(messages.slice(-2)[0]?.content)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-900 underline mt-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry Question
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex items-center gap-2.5 p-3.5 bg-white border border-indigo-150 rounded-2xl text-xs text-indigo-950 max-w-[88%] omni-fade-in shadow-xs">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center text-white animate-spin">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-800">Synthesizing GRC Intelligence...</div>
                  <div className="text-[10px] text-slate-500">Cross-referencing controls, frameworks &amp; live posture</div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Form / Mobile Composer */}
          <div className="p-3 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shrink-0 pb-safe">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about controls, risks, audits, or posture..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                className="flex-1 min-w-0 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-150 focus:border-indigo-500 transition font-medium disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                aria-label="Send Question"
                className="p-2.5 flex-shrink-0 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white rounded-xl shadow-xs disabled:opacity-40 transition-all transform active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
