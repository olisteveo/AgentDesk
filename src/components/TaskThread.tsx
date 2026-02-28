/**
 * TaskThread — Conversational task review overlay.
 *
 * Shows the full message history for a task (agent responses + user feedback),
 * with actions to approve, request changes, or reopen.
 *
 * Replaces the old single-result viewer from OfficeCanvas.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Download, Paperclip } from 'lucide-react';
import { parseCodeBlocks } from '../utils/parseCodeBlocks';
import { downloadCodeBlock, downloadAsMarkdown } from '../utils/download';
import { openCode } from '../api/tasks';
import type { Task, TaskMessage, Agent } from '../types';
import './TaskThread.css';

interface TaskThreadProps {
  task: Task;
  messages: TaskMessage[];
  agents: Agent[];
  onClose: () => void;
  onApprove: (taskId: string) => void;
  onRequestChanges: (taskId: string, feedback: string) => void;
  onReopen: (taskId: string) => void;
}

/** Format a timestamp as relative time (e.g. "2m ago") */
function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TaskThread({
  task,
  messages,
  agents,
  onClose,
  onApprove,
  onRequestChanges,
  onReopen,
}: TaskThreadProps) {
  const [feedback, setFeedback] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agent = agents.find(a => a.id === task.assignee);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleRequestChanges = async () => {
    const text = feedback.trim();
    if (!text && attachments.length === 0) return;

    // Read file contents and append to feedback
    let fullFeedback = text;
    if (attachments.length > 0) {
      const fileContents: string[] = [];
      for (const file of attachments) {
        try {
          const content = await file.text();
          fileContents.push(`\n\n--- Attached: ${file.name} ---\n${content}`);
        } catch {
          fileContents.push(`\n\n--- Attached: ${file.name} (could not read) ---`);
        }
      }
      fullFeedback = (text || '') + fileContents.join('');
    }

    onRequestChanges(task.id, fullFeedback);
    setFeedback('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRequestChanges();
    }
  };

  // Total cost across all agent messages
  const totalCost = messages
    .filter(m => m.role === 'agent' && m.cost != null)
    .reduce((sum, m) => sum + (m.cost || 0), 0);

  const runCount = messages.filter(m => m.role === 'agent').length;

  const statusLabel =
    task.status === 'review' ? 'Review' :
    task.status === 'in-progress' ? 'Working' :
    task.status === 'completed' ? 'Completed' :
    task.status === 'failed' ? 'Failed' : task.status;

  // Get the last agent message content for the download button
  const lastAgentMsg = [...messages].reverse().find(m => m.role === 'agent');

  return (
    <div className="task-thread-overlay" onClick={onClose}>
      <div className="task-thread-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tt-header">
          <div className="tt-header-left">
            <h2 className="tt-title">{task.name}</h2>
            <div className="tt-meta">
              {agent && <span className="tt-agent">{agent.name}</span>}
              {task.modelUsed && <span className="tt-model">{task.modelUsed}</span>}
              {totalCost > 0 && <span className="tt-cost">${totalCost.toFixed(4)}</span>}
              {runCount > 1 && <span className="tt-runs">{runCount} runs</span>}
              <span className={`tt-status-badge ${task.status}`}>{statusLabel}</span>
            </div>
          </div>
          <div className="tt-header-actions">
            {lastAgentMsg && (
              <button
                className="tt-download-btn"
                onClick={() => downloadAsMarkdown(lastAgentMsg.content, task.name)}
                title="Download as .md"
              >
                <Download size={14} />
                Download
              </button>
            )}
            <button className="close-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div className="tt-description">{task.description}</div>
        )}

        {/* Message thread */}
        <div className="tt-messages">
          {messages.map((msg, idx) => (
            <div key={msg.id} className={`tt-msg ${msg.role}`}>
              <div className="tt-msg-bubble">
                {msg.role === 'agent' ? (
                  <div className="tt-msg-content">
                    {renderAgentContent(msg.content)}
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
              <div className="tt-msg-footer">
                {msg.role === 'agent' && runCount > 1 && (
                  <span>Run {messages.filter((m, i) => m.role === 'agent' && i <= idx).length}</span>
                )}
                {msg.cost != null && msg.cost > 0 && (
                  <span className="tt-msg-cost">${msg.cost.toFixed(4)}</span>
                )}
                <span>{timeAgo(msg.timestamp)}</span>
              </div>
            </div>
          ))}

          {/* Thinking indicator when re-executing */}
          {task.status === 'in-progress' && (
            <div className="tt-thinking">
              <div className="tt-thinking-dots">
                <span /><span /><span />
              </div>
              <span className="tt-thinking-label">{agent?.name || 'Agent'} is working...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Action bar */}
        <div className="tt-action-bar">
          {task.status === 'review' && (
            <>
              <div className="tt-feedback-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.sh,.log,.pdf"
                  onChange={(e) => {
                    if (e.target.files) {
                      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  className="tt-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file for context"
                >
                  <Paperclip size={14} />
                </button>
                <input
                  className="tt-feedback-input"
                  type="text"
                  placeholder="Request changes..."
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              {attachments.length > 0 && (
                <div className="tt-attach-list">
                  {attachments.map((file, i) => (
                    <span key={i} className="tt-attach-chip">
                      {file.name}
                      <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}><X size={8} /></button>
                    </span>
                  ))}
                </div>
              )}
              <button
                className="tt-btn tt-btn-changes"
                onClick={handleRequestChanges}
                disabled={!feedback.trim() && attachments.length === 0}
              >
                Changes
              </button>
              <button
                className="tt-btn tt-btn-approve"
                onClick={() => onApprove(task.id)}
              >
                Approve
              </button>
            </>
          )}

          {task.status === 'completed' && (
            <button
              className="tt-btn tt-btn-reopen"
              onClick={() => onReopen(task.id)}
            >
              Reopen
            </button>
          )}

          {task.status === 'in-progress' && (
            <span style={{ fontSize: 12, color: '#667eea', padding: '8px 0' }}>
              Waiting for response...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Render agent message content with code blocks */
function renderAgentContent(content: string) {
  const segments = parseCodeBlocks(content);

  return segments.map((seg, i) =>
    seg.type === 'text' ? (
      <pre key={i}>{seg.content}</pre>
    ) : (
      <div key={i} className="code-block">
        <div className="code-block-header">
          <span className="code-block-lang">{seg.language}</span>
          <div className="code-block-actions">
            <button
              className="code-block-copy"
              onClick={async (e) => {
                const btn = e.currentTarget;
                try {
                  await navigator.clipboard.writeText(seg.content);
                  btn.textContent = 'Copied';
                  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                } catch { /* clipboard unavailable */ }
              }}
            >
              Copy
            </button>
            <button
              className="code-block-download"
              onClick={() => downloadCodeBlock(seg.content, seg.language)}
              title="Download file"
            >
              <Download size={10} />
            </button>
            <button
              className="code-block-open"
              onClick={async (e) => {
                const btn = e.currentTarget;
                try {
                  const { filePath } = await openCode(seg.content, seg.language);
                  window.location.href = `vscode://file${filePath}`;
                  btn.textContent = 'Sent to VS Code';
                  setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.583 2.286l-4.574 4.596L7.722 2.67 2 5.39v13.202l5.704 2.737 5.307-4.212 4.572 4.597L24 18.58V5.402l-6.417-3.116zM7.7 15.094L4.709 12l2.99-3.094v6.188zm9.88 2.318l-4.496-3.624 4.496-3.624v7.248z"/></svg> VS Code'; }, 2000);
                } catch (err) {
                  console.error('Failed to open in VS Code:', err);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.583 2.286l-4.574 4.596L7.722 2.67 2 5.39v13.202l5.704 2.737 5.307-4.212 4.572 4.597L24 18.58V5.402l-6.417-3.116zM7.7 15.094L4.709 12l2.99-3.094v6.188zm9.88 2.318l-4.496-3.624 4.496-3.624v7.248z"/>
              </svg>
              VS Code
            </button>
          </div>
        </div>
        <pre><code>{seg.content}</code></pre>
      </div>
    )
  );
}
