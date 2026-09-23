'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Bot, AlertTriangle, Send, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

export interface PredefinedQuestion {
  key: string;
  category: string;
  label: string;
  prompt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourcesUsed?: string[];
  disclaimer?: string;
  isError?: boolean;
}

export const PREDEFINED_GRC_QUESTIONS: PredefinedQuestion[] = [
  {
    key: 'q1-highest-risks',
    category: 'Risks',
    label: 'Highest Risk Areas',
    prompt: 'What are the highest-risk areas and top risk scores across our organization?',
  },
  {
    key: 'q2-risks-attention',
    category: 'Risks',
    label: 'Risks Requiring Attention',
    prompt: 'Which open risks require immediate management attention or mitigation?',
  },
  {
    key: 'q3-open-vulnerabilities',
    category: 'Vulnerabilities',
    label: 'Open Vulnerabilities',
    prompt: 'What open vulnerabilities and CVE findings are currently tracked?',
  },
  {
    key: 'q4-controls-missing-evidence',
    category: 'Controls',
    label: 'Controls Missing Evidence',
    prompt: 'Which security controls are missing linked evidence in the Evidence Vault?',
  },
  {
    key: 'q5-overdue-audits',
    category: 'Audits',
    label: 'Overdue Audits',
    prompt: 'Are there any overdue audit plans or upcoming business audits scheduled?',
  },
  {
    key: 'q6-unresolved-findings',
    category: 'Audits',
    label: 'Unresolved Audit Findings',
    prompt: 'What unresolved audit findings or document extraction findings need sign-off?',
  },
  {
    key: 'q7-overdue-remediation',
    category: 'Remediation',
    label: 'Overdue CAPAs & Remediation',
    prompt: 'What overdue CAPAs and remediation tasks link to open findings?',
  },
  {
    key: 'q8-compliance-tasks',
    category: 'Tasks',
    label: 'Compliance Tasks Status',
    prompt: 'What upcoming or overdue compliance tasks require action?',
  },
  {
    key: 'q9-vendor-status',
    category: 'Vendors',
    label: 'Vendor Assessment Status',
    prompt: 'What is the vendor assessment status and third-party risk posture?',
  },
  {
    key: 'q10-pending-evidence',
    category: 'Evidence',
    label: 'Pending Evidence Status',
    prompt: 'What evidence documents are currently pending upload or security verification?',
  },
  {
    key: 'q11-open-incidents',
    category: 'Incidents',
    label: 'Open Security Incidents',
    prompt: 'What open security incidents and remediation workflows are currently active?',
  },
  {
    key: 'q12-compliance-posture',
    category: 'Compliance',
    label: 'Current Compliance Posture',
    prompt: 'What is our overall compliance posture across active frameworks?',
  },
  {
    key: 'q13-framework-mapping',
    category: 'Controls',
    label: 'Framework Control Mapping',
    prompt: 'How do security controls map to framework reference clauses?',
  },
  {
    key: 'q14-management-attention',
    category: 'Approvals',
    label: 'Management Attention Items',
    prompt: 'What pending approvals, sign-offs, and critical attention items exist?',
  },
  {
    key: 'q15-executive-summary',
    category: 'Executive Summary',
    label: 'Organization GRC Summary',
    prompt: 'Can you provide a high-level executive GRC summary for our organization?',
  },
];

const SHORT_LABELS: Record<string, string> = {
  'q1-highest-risks': 'Highest risks',
  'q2-risks-attention': 'Risks requiring attention',
  'q3-open-vulnerabilities': 'Open vulnerabilities',
  'q4-controls-missing-evidence': 'Controls missing evidence',
  'q5-overdue-audits': 'Overdue audits',
  'q6-unresolved-findings': 'Unresolved findings',
  'q7-overdue-remediation': 'Overdue remediation',
  'q8-compliance-tasks': 'Compliance tasks',
  'q9-vendor-status': 'Vendor risk',
  'q10-pending-evidence': 'Pending evidence',
  'q11-open-incidents': 'Open incidents',
  'q12-compliance-posture': 'Compliance posture',
  'q13-framework-mapping': 'Framework mapping',
  'q14-management-attention': 'Management attention',
  'q15-executive-summary': 'GRC summary',
};

function getShortLabel(q: PredefinedQuestion): string {
  return SHORT_LABELS[q.key] || q.label || q.prompt;
}

export function GrcIntelligenceView() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<PredefinedQuestion[]>(PREDEFINED_GRC_QUESTIONS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await apiRequest<{ questions: PredefinedQuestion[] }>('/intelligence/questions');
        if (data && data.questions && Array.isArray(data.questions) && data.questions.length >= 10) {
          setQuestions(data.questions.slice(0, 15));
        }
      } catch {
        // Fallback to PREDEFINED_GRC_QUESTIONS static constant
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
      const data = await apiRequest<{ answer: string; sourcesUsed?: string[]; disclaimer?: string }>('/intelligence/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: queryText.trim(),
          questionPillKey: questionKey,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'Response generated.',
        sourcesUsed: data.sourcesUsed || [],
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

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">GRC Intelligence Assistant</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            LLM-powered compliance advisory, bounded live context analysis, and control mapping recommendations.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear Conversation
          </button>
        )}
      </div>

      {/* Mandatory Disclaimer Banner */}
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
        <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-900">AI Assistance Disclaimer:</span> Outputs generated by GRC Intelligence provide contextual advisory suggestions to assist human auditors. They do not constitute authoritative compliance or legal determinations.
        </div>
      </div>

      {/* Chatbot Interface Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[460px]">
        {/* Messages Thread Area */}
        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto max-h-[600px] omni-scroll bg-slate-50/40">
          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto shadow-xs">
                <Sparkles className="w-6 h-6 text-teal-700" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">How can GRC Intelligence assist you today?</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Select a suggested question pill below or type any query about risks, vulnerabilities, controls, audits, vendors, or compliance posture across your organization.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}>
                <div className="text-[11px] font-semibold text-slate-400 px-1">
                  {msg.role === 'user' ? (
                    'You'
                  ) : (
                    <span className="flex items-center gap-1 text-teal-800 font-bold">
                      <Bot className="w-3.5 h-3.5 text-teal-700" /> GRC Intelligence Assistant
                    </span>
                  )}
                </div>
                <div
                  className={`max-w-[92%] sm:max-w-[82%] p-4 rounded-2xl text-xs space-y-3 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-teal-800 text-white rounded-br-none'
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-900 rounded-bl-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed font-normal break-words overflow-hidden text-xs">
                    {msg.content}
                  </div>

                  {msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-teal-600 flex-shrink-0" /> Context Sources ({msg.sourcesUsed.length}):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {msg.sourcesUsed.map((src, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200/80 break-words max-w-full"
                          >
                            {src}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 p-3.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-600 max-w-[80%] shadow-xs omni-fade-in">
              <Bot className="w-4 h-4 text-teal-700 animate-spin flex-shrink-0" />
              <span>Analyzing GRC knowledge &amp; live organization context...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Chips Section */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-700" /> Suggested Capability Questions ({questions.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q) => (
              <button
                key={q.key}
                onClick={() => executeQuery(q.prompt, q.key)}
                disabled={loading}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 transition shadow-2xs disabled:opacity-50 flex items-center gap-1 group"
              >
                <span>{getShortLabel(q)}</span>
                <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-teal-700 transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Chatbot Composer / Input Form */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask any question about risks, controls, evidence, audits, or compliance..."
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
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
