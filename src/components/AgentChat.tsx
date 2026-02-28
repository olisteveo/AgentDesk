/**
 * AgentChat — 1-on-1 chat panel for a single AI agent.
 *
 * Opens as a floating panel when a user clicks an agent in the Team sidebar.
 * Conversation history is persisted to the backend (capped at 50 messages)
 * and loaded when the panel opens. Messages are sent via the existing
 * sendChat() API which injects rules and proxies to the correct provider.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Trash2, Download, Sparkles, Check } from 'lucide-react';
import { sendChat, getChatHistory, saveChatMessages, clearChatHistory } from '../api/chat';
import type { PersistedMessage } from '../api/chat';
import { signalChatSessionEnd } from '../api/memory';
import { createDesk, updateDesk } from '../api/desks';
import { parseCodeBlocks } from '../utils/parseCodeBlocks';
import { downloadCodeBlock } from '../utils/download';
import { openCode } from '../api/tasks';
import type { DeskAssignment } from '../types';
import './AgentChat.css';

// ── Types ────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  color: string;
  avatar: string;
  isWorking: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  timestamp: number;
}

interface AgentChatProps {
  agent: Agent;
  deskAssignments: DeskAssignment[];
  setDeskAssignments: React.Dispatch<React.SetStateAction<DeskAssignment[]>>;
  getModelForAgent: (agentId: string) => string;
  updateTodayCost: (cost: number) => void;
  addLogEntry: (message: string) => void;
  onClose: () => void;
  modelPricing: Record<string, { name: string; input: number; output: number }>;
}

// ── Component ────────────────────────────────────────────────

const AgentChat: React.FC<AgentChatProps> = ({
  agent,
  deskAssignments,
  setDeskAssignments,
  getModelForAgent,
  updateTodayCost,
  addLogEntry,
  onClose,
  modelPricing,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionMsgCount = useRef(0); // track messages sent this session

  // Personality editor
  const [showPersonality, setShowPersonality] = useState(false);
  const [personalityText, setPersonalityText] = useState('');
  const [savingPersonality, setSavingPersonality] = useState(false);
  const [personalitySaved, setPersonalitySaved] = useState(false);

  const modelId = getModelForAgent(agent.id);
  const modelName = modelPricing[modelId]?.name || modelId;

  // ── Resolve backend desk ID ─────────────────────────────────

  const resolveBackendDeskId = useCallback(async (): Promise<string | null> => {
    const localDeskId = agent.id.replace('agent-', '');
    const assignment = deskAssignments.find(a => a.deskId === localDeskId);
    if (assignment?.backendDeskId) return assignment.backendDeskId;

    // Auto-create backend desk if missing
    try {
      const backendDesk = await createDesk({
        name: assignment?.customName || agent.name || 'Desk',
        agentName: assignment?.agentName || agent.name || 'Agent',
        agentColor: agent.color || '#feca57',
        avatarId: agent.avatar || 'avatar1',
        deskType: 'mini',
        models: [modelId],
      });
      setDeskAssignments(prev =>
        prev.map(a =>
          a.deskId === localDeskId ? { ...a, backendDeskId: backendDesk.id } : a,
        ),
      );
      return backendDesk.id;
    } catch {
      return null;
    }
  }, [agent, deskAssignments, setDeskAssignments, modelId]);

  // ── Load persisted history on open ──────────────────────────

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      const deskId = await resolveBackendDeskId();
      if (!deskId || cancelled) return;

      try {
        const persisted = await getChatHistory(deskId);
        if (cancelled) return;
        const loaded: ChatMessage[] = persisted.map((m: PersistedMessage) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          timestamp: new Date(m.created_at).getTime(),
        }));
        setMessages(loaded);
      } catch {
        // First conversation — no history yet
      }
      setHistoryLoaded(true);
    };

    loadHistory();
    return () => { cancelled = true; };
  }, [resolveBackendDeskId]);

  // ── Auto-scroll ─────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ── Send message ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const deskId = await resolveBackendDeskId();
    if (!deskId) {
      addLogEntry(`Could not resolve desk for ${agent.name}`);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      // Build chat history for the API (full conversation context)
      const chatHistory = [...messages, userMsg].map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await sendChat(deskId, chatHistory);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response.content,
        model: response.model,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Track cost
      if (response.costUsd) {
        updateTodayCost(response.costUsd);
      }

      // Persist to backend (fire-and-forget)
      saveChatMessages(deskId, text, response.content, response.model, response.costUsd).catch(() => {});
      sessionMsgCount.current += 2; // user + assistant

    } catch (err) {
      const errMsg = err instanceof Error ? err.message
        : err && typeof err === 'object' && 'message' in err ? String((err as Record<string, unknown>).message)
        : 'Failed to get response';

      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, agent, resolveBackendDeskId, addLogEntry, updateTodayCost]);

  // ── Clear history ───────────────────────────────────────────

  const handleClear = useCallback(async () => {
    const deskId = await resolveBackendDeskId();
    if (deskId) {
      clearChatHistory(deskId).catch(() => {});
    }
    setMessages([]);
  }, [resolveBackendDeskId]);

  // ── Render helpers ──────────────────────────────────────────

  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.role === 'assistant' && msg.content.includes('```')) {
      return parseCodeBlocks(msg.content).map((seg, si) =>
        seg.type === 'text' ? (
          <span key={si} style={{ whiteSpace: 'pre-wrap' }}>{seg.content}</span>
        ) : (
          <div key={si} className="ac-code-block">
            <div className="ac-code-header">
              <span className="ac-code-lang">{seg.language}</span>
              <div className="ac-code-actions">
                <button
                  className="ac-code-btn"
                  onClick={async (e) => {
                    const btn = e.currentTarget;
                    try {
                      await navigator.clipboard.writeText(seg.content);
                      btn.textContent = 'Copied';
                      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                    } catch {
                      const ta = document.createElement('textarea');
                      ta.value = seg.content;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                      btn.textContent = 'Copied';
                      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                    }
                  }}
                >
                  Copy
                </button>
                <button
                  className="ac-code-btn"
                  onClick={() => downloadCodeBlock(seg.content, seg.language)}
                  title="Download file"
                >
                  <Download size={10} />
                </button>
                <button
                  className="ac-code-btn vs"
                  onClick={async (e) => {
                    const btn = e.currentTarget;
                    try {
                      const { filePath } = await openCode(seg.content, seg.language);
                      window.location.href = `vscode://file${filePath}`;
                      btn.textContent = 'Sent';
                      setTimeout(() => { btn.textContent = 'VS Code'; }, 2000);
                    } catch { /* ignore */ }
                  }}
                >
                  VS Code
                </button>
              </div>
            </div>
            <pre><code>{seg.content}</code></pre>
          </div>
        ),
      );
    }
    return msg.content;
  };

  // ── Load personality when editor opens ───────────────────────
  useEffect(() => {
    if (!showPersonality) return;
    const loadPrompt = async () => {
      const localDeskId = agent.id.replace('agent-', '');
      const assignment = deskAssignments.find(a => a.deskId === localDeskId);
      if (!assignment?.backendDeskId) return;
      try {
        const { listDesks } = await import('../api/desks');
        const allDesks = await listDesks();
        const desk = allDesks.find(d => d.id === assignment.backendDeskId);
        if (desk?.system_prompt) {
          setPersonalityText(desk.system_prompt);
        }
      } catch {
        // Silently fail
      }
    };
    loadPrompt();
  }, [showPersonality, agent.id, deskAssignments]);

  // ── Personality save ─────────────────────────────────────────
  const handleSavePersonality = async () => {
    const localDeskId = agent.id.replace('agent-', '');
    const assignment = deskAssignments.find(a => a.deskId === localDeskId);
    const backendId = assignment?.backendDeskId;
    if (!backendId) return;

    setSavingPersonality(true);
    try {
      await updateDesk(backendId, { systemPrompt: personalityText });
      setPersonalitySaved(true);
      setTimeout(() => setPersonalitySaved(false), 2000);
      addLogEntry(`Updated ${agent.name}'s personality`);
    } catch {
      addLogEntry(`Failed to update personality for ${agent.name}`);
    } finally {
      setSavingPersonality(false);
    }
  };

  // ── Close handler (signals session end for memory generation) ──

  const handleClose = useCallback(async () => {
    if (sessionMsgCount.current >= 4) {
      resolveBackendDeskId().then(deskId => {
        if (deskId) signalChatSessionEnd(deskId).catch(() => {});
      }).catch(() => {});
    }
    onClose();
  }, [onClose, resolveBackendDeskId]);

  // ── Main render ─────────────────────────────────────────────

  return (
    <div className="ac-overlay" onClick={handleClose}>
      <div className="ac-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ac-header">
          <div className="ac-header-info">
            <div className="ac-avatar">{agent.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="ac-agent-name">{agent.name}</div>
              <div className="ac-model-tag">{modelName}</div>
            </div>
          </div>
          <div className="ac-header-actions">
            <button
              className={`ac-icon-btn${showPersonality ? ' active' : ''}`}
              onClick={() => setShowPersonality(!showPersonality)}
              title="Edit personality">
              <Sparkles size={14} />
            </button>
            {messages.length > 0 && (
              <button className="ac-icon-btn" onClick={handleClear} title="Clear history">
                <Trash2 size={14} />
              </button>
            )}
            <button className="ac-icon-btn close" onClick={handleClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Inline personality editor */}
        {showPersonality && (
          <div className="ac-personality-editor">
            <textarea
              className="ac-personality-input"
              value={personalityText}
              onChange={e => setPersonalityText(e.target.value)}
              placeholder="Describe this agent's personality and approach..."
              maxLength={2000}
              rows={3}
            />
            <div className="ac-personality-actions">
              <button
                className="ac-personality-save"
                onClick={handleSavePersonality}
                disabled={savingPersonality}>
                {personalitySaved ? <><Check size={12} /> Saved</> : savingPersonality ? 'Saving...' : 'Save Personality'}
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="ac-messages">
          {!historyLoaded && (
            <div className="ac-loading">
              <div className="ac-spinner" />
            </div>
          )}

          {historyLoaded && messages.length === 0 && (
            <div className="ac-empty">
              <div className="ac-empty-avatar">{agent.name.charAt(0).toUpperCase()}</div>
              <h3>Chat with {agent.name}</h3>
              <p>Start a conversation — your messages are saved and will be here when you come back.</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`ac-msg ${msg.role === 'user' ? 'me' : 'agent'}`}>
              {msg.role === 'assistant' && (
                <div className="ac-msg-avatar">{agent.name.charAt(0).toUpperCase()}</div>
              )}
              <div className="ac-msg-content">
                {msg.role === 'assistant' && (
                  <div className="ac-msg-sender">
                    {agent.name}
                    {msg.model && <span className="ac-msg-model">{modelPricing[msg.model]?.name || msg.model}</span>}
                  </div>
                )}
                <div className="ac-msg-text">{renderMessageContent(msg)}</div>
                <div className="ac-msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="ac-thinking">
              <div className="ac-msg-avatar">{agent.name.charAt(0).toUpperCase()}</div>
              <div className="ac-thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="ac-input-area">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={isThinking ? `${agent.name} is thinking...` : `Message ${agent.name}...`}
            className="ac-input"
            disabled={isThinking}
            autoFocus
          />
          <button
            className="ac-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentChat;
