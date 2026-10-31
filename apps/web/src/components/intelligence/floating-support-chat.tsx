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
  ExternalLink,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  GrcSuggestedQuestion,
  GrcSourceCitation,
  GrcStructuredAnalysis,
  GrcInferenceMode,
  EXACT_TEN_PREDEFINED_QUESTIONS,
} from '@omnigrc/shared';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredAnalysis?: GrcStructuredAnalysis;
  citations?: GrcSourceCitation[];
  sourcesUsed?: string[];
  suggestedFollowUps?: string[];
  inferenceMode?: GrcInferenceMode;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Predefined 10 Question Pills on Mount via apiRequest
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await apiRequest<{ questions: QuestionPill[] }>('/intelligence/questions');
        if (data && data.questions && Array.isArray(data.questions)) {
          setPills(data.questions);
        }
      } catch {
        // Fallback pills if endpoint unreachable
        setPills(
          EXACT_TEN_PREDEFINED_QUESTIONS.map((q) => ({
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

      const data = await apiRequest<{
        answer: string;
        structuredAnalysis?: GrcStructuredAnalysis;
        citations?: GrcSourceCitation[];
        sourcesUsed?: string[];
        suggestedFollowUps?: string[];
        inferenceMode?: GrcInferenceMode;
        providerName?: string;
        isLiveAi?: boolean;
        disclaimer?: string;
      }>('/intelligence/chat', {
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
          className="group relative flex items-center justify-center gap-2 p-2.5 sm:px-4 sm:py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[44px] min-h-[44px]"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="w-5 h-5 text-teal-200 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse border-2 border-teal-800" />
          </div>
          <span className="hidden sm:inline">GRC Support AI</span>
          <Sparkles className="hidden sm:inline w-4 h-4 text-amber-300" />
        </button>
      )}

      {/* Floating Chat Drawer/Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-floating-support="true"
          aria-label="GRC Intelligence Support Panel"
          className="fixed bottom-16 sm:bottom-20 right-3 sm:right-6 left-3 sm:left-auto w-auto sm:w-[460px] max-w-[calc(100vw-1.5rem)] h-[580px] max-h-[calc(100vh-5rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden omni-fade-in z-[70]"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-teal-800/80 text-teal-200 flex-shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                  OMNiGRC Intelligence
                  {currentProviderMode === 'LIVE_AI' ? (
                    <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700 flex-shrink-0">
                      Live AI
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700 flex-shrink-0">
                      Fallback
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  {currentView ? `Page Context: ${currentView}` : 'Organization Grounded Intelligence'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  title="Clear Conversation"
                  aria-label="Clear Conversation"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Minimize Chat Panel"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close Chat Panel"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 bg-slate-50/50 omni-scroll">
            {/* Welcome Banner */}
            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
                <Sparkles className="w-4 h-4 text-teal-700 flex-shrink-0" /> Welcome to GRC Intelligence Support
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ask any question about risks, controls, evidence, audits, vendors, or compliance posture.
              </p>
              <div className="flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                <span>AI answers are advisory. Authoritative compliance determinations require human review.</span>
              </div>
            </div>

            {/* Discovery Question Pills */}
            {pills.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-teal-700 flex-shrink-0" /> Discovery Questions ({pills.length})
                  </span>
                </div>

                {/* Category Selector Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 omni-scroll">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition ${
                        selectedCategory === cat
                          ? 'bg-teal-800 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Scrollable Pills */}
                <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto pr-1 omni-scroll">
                  {filteredPills.map((pill) => (
                    <button
                      key={pill.key}
                      onClick={() => handlePillClick(pill)}
                      disabled={loading}
                      className="text-left text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-800 font-medium transition flex items-center justify-between group disabled:opacity-50"
                    >
                      <span className="break-words line-clamp-1">{pill.prompt}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-700 flex-shrink-0 ml-1.5" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages Thread */}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[92%] sm:max-w-[88%] p-3.5 rounded-2xl text-xs space-y-2.5 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-teal-800 text-white rounded-br-none'
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-900 rounded-bl-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  {/* Primary Assistant Answer or User Query */}
                  <div className="whitespace-pre-wrap leading-relaxed font-normal break-words overflow-hidden text-xs">
                    {msg.content}
                  </div>

                  {/* Compact Metrics */}
                  {msg.structuredAnalysis && msg.structuredAnalysis.metrics && msg.structuredAnalysis.metrics.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-teal-600" /> Metrics
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {msg.structuredAnalysis.metrics.slice(0, 4).map((m, idx) => (
                          <div
                            key={idx}
                            className={`p-1.5 rounded-lg border text-center ${
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
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-teal-600 flex-shrink-0" /> Citations ({msg.citations.length}):
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {msg.citations.slice(0, 4).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleCitationClick(c)}
                            className="text-left p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 transition flex items-center justify-between group"
                          >
                            <div className="min-w-0 pr-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-teal-100 text-teal-900 mr-1.5">
                                {c.domain}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-900 group-hover:text-teal-900 truncate">
                                {c.title}
                              </span>
                            </div>
                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-teal-700 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Pills */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-100 space-y-1">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Follow-up:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {msg.suggestedFollowUps.slice(0, 2).map((fu, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendPrompt(fu)}
                            disabled={loading}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 transition flex items-center gap-1 disabled:opacity-50"
                          >
                            <span className="truncate max-w-[180px]">{fu}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary Text Sources Tags if citations empty */}
                  {(!msg.citations || msg.citations.length === 0) && msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-teal-600 flex-shrink-0" /> Sources:
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
              <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl text-xs text-slate-600 max-w-[85%] omni-fade-in shadow-xs">
                <Bot className="w-4 h-4 text-teal-700 animate-spin flex-shrink-0" />
                <span>Analyzing GRC knowledge &amp; live context...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Form / Mobile Composer */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0 pb-safe">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about controls, risks, evidence, or entitlements..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                className="flex-1 min-w-0 px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition font-medium disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                aria-label="Send Question"
                className="p-2 flex-shrink-0 bg-teal-800 hover:bg-teal-900 text-white rounded-xl shadow-xs disabled:opacity-50 transition"
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
