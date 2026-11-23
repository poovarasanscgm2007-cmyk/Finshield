import React, { useState } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  FileText,
  CheckCircle2,
  ChevronRight,
  Loader2,
  X
} from 'lucide-react';
import { CopilotEvidence, CopilotRecommendedAction } from '../types/auth';

interface CopilotMessage {
  id: string;
  sender: 'user' | 'copilot';
  text: string;
  evidence?: CopilotEvidence[];
  recommendedActions?: CopilotRecommendedAction[];
  timestamp: string;
}

interface CopilotChatPanelProps {
  invoiceId?: string;
  invoiceNumber?: string;
  onOpenInvoice?: (invoiceNumber: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export const CopilotChatPanel: React.FC<CopilotChatPanelProps> = ({
  invoiceId,
  invoiceNumber,
  onOpenInvoice: _onOpenInvoice,
  isOpen = true,
  onClose,
  embedded = false
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<CopilotEvidence | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      sender: 'copilot',
      text: `Hello! I am **FINSHIELD Copilot**. I analyze accounts payable risks, 3-way matching discrepancies, GSTR-2B compliance, and audit logs. How can I assist you with ${
        invoiceNumber ? `Invoice **${invoiceNumber}**` : 'your current risk portfolio'
      }?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const suggestedQuestions = invoiceNumber
    ? [
        `Why did ${invoiceNumber} fail?`,
        `What should Warehouse verify on ${invoiceNumber}?`,
        `Who is assigned to ${invoiceNumber} issues?`,
        'What is the total ITC at risk?'
      ]
    : [
        "Why is Supplier A's invoice flagged?",
        'Which invoices are high risk?',
        'What is the total ITC at risk?',
        'What should Warehouse verify?'
      ];

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q || loading) return;

    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/copilot/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          question: q,
          invoiceId
        })
      });

      if (!res.ok) {
        throw new Error(`Copilot query failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const botMsg: CopilotMessage = {
        id: `bot-${Date.now()}`,
        sender: 'copilot',
        text: data.answer || 'No response generated.',
        evidence: data.evidence || [],
        recommendedActions: data.recommendedActions || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'copilot',
          text: `⚠️ **Error communicating with Copilot:** ${err.message}. Please verify the backend connection.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`${
        embedded
          ? 'bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[520px]'
          : 'fixed bottom-5 right-5 w-96 md:w-[460px] bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl z-50 flex flex-col h-[600px] overflow-hidden'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-white text-sm">FINSHIELD AI Copilot</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Live Data
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Strictly grounded in database audit records</p>
          </div>
        </div>
        {!embedded && onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggested Questions */}
      <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80">
        <div className="flex items-center space-x-1 mb-1.5 text-[11px] font-medium text-slate-400">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Suggested Inquiries</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestedQuestions.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => handleAsk(sq)}
              disabled={loading}
              className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-900/60 text-slate-300 hover:text-white border border-slate-700/60 hover:border-indigo-500/50 transition duration-150 disabled:opacity-50"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3.5 bg-slate-950/40">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                  : 'bg-slate-800/95 text-slate-200 border border-slate-700/80 rounded-bl-none shadow-sm'
              }`}
            >
              <div className="whitespace-pre-line prose prose-invert prose-xs max-w-none">
                {m.text}
              </div>

              {/* Evidence Reference Chips */}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-700/60">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <FileText className="w-3 h-3 text-indigo-400" />
                    <span>Verified Evidence References ({m.evidence.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.evidence.map((ev, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedEvidence(ev)}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] bg-indigo-950/70 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/80 transition"
                      >
                        <span className="font-mono font-bold text-[9px] px-1 py-0.2 bg-indigo-900 rounded">
                          {ev.type}
                        </span>
                        <span className="truncate max-w-[140px]">{ev.label}</span>
                        <ChevronRight className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Departmental Recommended Actions */}
              {m.recommendedActions && m.recommendedActions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-700/60">
                  <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Recommended Departmental Actions</span>
                  </div>
                  <div className="space-y-1.5">
                    {m.recommendedActions.map((act, i) => (
                      <div
                        key={i}
                        className="p-1.5 rounded-md bg-slate-900/80 border border-slate-700/60 text-[11px] flex items-start space-x-1.5"
                      >
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                            act.priority === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {act.department}
                        </span>
                        <span className="text-slate-300 text-[10.5px] leading-snug">{act.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className={`text-[9px] mt-1.5 text-right ${
                  m.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                }`}
              >
                {m.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 px-3 bg-slate-800/60 rounded-xl w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Analyzing database records & cross-referencing audit log...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center space-x-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Copilot (e.g. Why did INV-101 fail?)..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 shadow-md transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Evidence Detail Modal / Drawer */}
      {selectedEvidence && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-50 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-900 text-indigo-300">
                  {selectedEvidence.type}
                </span>
                <span className="font-semibold text-white text-xs truncate max-w-[220px]">
                  {selectedEvidence.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h4 className="text-sm font-semibold text-white mb-2">{selectedEvidence.label}</h4>

            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-[320px] overflow-y-auto">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(selectedEvidence.details, null, 2)}
              </pre>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              onClick={() => setSelectedEvidence(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
