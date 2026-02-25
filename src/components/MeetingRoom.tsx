import React, { useState, useRef, useCallback, useEffect } from 'react';
import { listMeetings, startMeetingApi, askInMeeting, endMeetingApi, reactivateMeeting, getMeeting, deleteMeeting, clearAllMeetings } from '../api/meetings';
import type { MeetingRow } from '../api/meetings';
import { sendChat } from '../api/chat';
import { createDesk } from '../api/desks';
import type { DeskAssignment } from '../types';
import { Calendar, Rocket, X, Send, CircleStop, History, RotateCcw, MessageSquare, Trash2, Download } from 'lucide-react';
import { parseCodeBlocks } from '../utils/parseCodeBlocks';
import { openCode } from '../api/tasks';
import { downloadCodeBlock } from '../utils/download';
import './MeetingRoom.css';

// ── Types ────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: number;
  isUser: boolean;
}

export interface Meeting {
  id: string;
  topic: string;
  participants: string[];
  messages: ChatMessage[];
  startedAt: number;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  zone: string;
  x: number;
  y: number;
  color: string;
  emoji: string;
  avatar: string;
  deskOffset: { x: number; y: number };
  targetX?: number;
  targetY?: number;
  isWorking: boolean;
}

interface Zone {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string;
}

// ── Props ────────────────────────────────────────────────────

interface MeetingRoomProps {
  show: boolean;
  onClose: () => void;
  agents: Agent[];
  deskAssignments: DeskAssignment[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  setDeskAssignments: React.Dispatch<React.SetStateAction<DeskAssignment[]>>;
  addLogEntry: (message: string) => void;
  updateTodayCost: (cost: number) => void;
  getModelForAgent: (agentId: string) => string;
  calculateZones: (width: number, height: number) => Record<string, Zone>;
  dimensionsRef: React.MutableRefObject<{ width: number; height: number }>;
  modelPricing: Record<string, { name: string; input: number; output: number }>;
}

// ── Component ────────────────────────────────────────────────

const MeetingRoom: React.FC<MeetingRoomProps> = ({
  show,
  onClose,
  agents,
  deskAssignments,
  setAgents,
  setDeskAssignments,
  addLogEntry,
  updateTodayCost,
  getModelForAgent,
  calculateZones,
  dimensionsRef,
  modelPricing,
}) => {
  // Meeting state (self-contained)
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [backendMeetingId, setBackendMeetingId] = useState<string | null>(null);
  const [meetingHistory, setMeetingHistory] = useState<MeetingRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingTranscript, setViewingTranscript] = useState<MeetingRow | null>(null);
  const [discussionPhase, setDiscussionPhase] = useState<'idle' | 'round1' | 'awaiting-r2' | 'round2'>('idle');
  const [showHistory, setShowHistory] = useState(false);
  const [pendingRound2, setPendingRound2] = useState<{
    userContent: string;
    aiParticipants: string[];
    round1Responses: { participantId: string; agentName: string; content: string }[];
  } | null>(null);

  // ── Helpers ──────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const loadMeetingHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const meetings = await listMeetings();
      setMeetingHistory(meetings);
    } catch {
      // Silently fail -- history is non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleDeleteMeeting = useCallback(async (meetingId: string) => {
    try {
      await deleteMeeting(meetingId);
      setMeetingHistory(prev => prev.filter(m => m.id !== meetingId));
    } catch {
      // Silently fail
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await clearAllMeetings();
      setMeetingHistory([]);
    } catch {
      // Silently fail
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (activeMeeting?.messages.length) {
      scrollToBottom();
    }
  }, [activeMeeting?.messages.length, scrollToBottom]);

  // ── Resolve backend desk ID ─────────────────────────────

  const resolveBackendDeskId = useCallback(async (participantId: string): Promise<string | null> => {
    const localDeskId = participantId.replace('agent-', '');
    const assignment = deskAssignments.find(a => a.deskId === localDeskId);
    if (assignment?.backendDeskId) return assignment.backendDeskId;

    const agent = agents.find(a => a.id === participantId);
    if (!agent) return null;
    const modelId = assignment?.modelId || getModelForAgent(participantId);
    try {
      const backendDesk = await createDesk({
        name: assignment?.customName || agent.name || 'Desk',
        agentName: assignment?.agentName || agent.name || 'Agent',
        agentColor: agent.color || '#feca57',
        avatarId: agent.avatar || 'avatar1',
        deskType: 'mini',
        models: [modelId],
      });
      setDeskAssignments(prev => prev.map(a =>
        a.deskId === localDeskId ? { ...a, backendDeskId: backendDesk.id } : a
      ));
      return backendDesk.id;
    } catch {
      return null;
    }
  }, [agents, deskAssignments, getModelForAgent, setDeskAssignments]);

  // ── Format error messages ───────────────────────────────

  const formatError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: string }).message) : 'Failed to get response';
    if (raw.includes('No active') && raw.includes('credential')) return 'No API key found for this provider. Add one via Hire Agent > Manage tab.';
    if (raw.includes('exceeded') || raw.includes('quota') || raw.includes('insufficient')) return 'API key has no credits. Add billing at your provider dashboard.';
    if (raw.includes('Kimi Code key') || raw.includes('sk-kimi-')) return 'Kimi Code keys only work in coding agents. Use a Moonshot platform key.';
    if (raw.includes('Invalid API key') || raw.includes('Incorrect API key') || raw.includes('invalid_api_key')) return 'Invalid API key. Check in Hire Agent > Manage.';
    return raw;
  };

  // ── Move agents to meeting zone ─────────────────────────

  const moveAgentsToMeeting = useCallback((participantIds: string[]) => {
    setAgents(prev => prev.map(agent => {
      if (participantIds.includes(agent.id)) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        const participantIndex = participantIds.indexOf(agent.id);
        const angle = (participantIndex / participantIds.length) * Math.PI * 2;
        const radius = 40;
        return {
          ...agent,
          targetX: zones.meeting.x + Math.cos(angle) * radius,
          targetY: zones.meeting.y + Math.sin(angle) * radius,
          isWorking: true
        };
      }
      return agent;
    }));
  }, [setAgents, calculateZones, dimensionsRef]);

  const returnAgentsToDesks = useCallback((participantIds: string[]) => {
    setAgents(prev => prev.map(agent => {
      if (participantIds.includes(agent.id)) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        return {
          ...agent,
          targetX: zones[agent.zone]?.x + agent.deskOffset.x,
          targetY: zones[agent.zone]?.y + agent.deskOffset.y,
          isWorking: false
        };
      }
      return agent;
    }));
  }, [setAgents, calculateZones, dimensionsRef]);

  // ── Start meeting ───────────────────────────────────────

  const startMeeting = useCallback(async () => {
    if (!meetingTopic || selectedParticipants.length === 0) return;

    // Resolve backend desk IDs for every participant (creates desks if needed)
    const backendDeskIds: string[] = [];
    for (const pid of selectedParticipants) {
      const deskId = await resolveBackendDeskId(pid);
      if (deskId) backendDeskIds.push(deskId);
    }

    let meetingId = `meeting-${Date.now()}`;
    try {
      const backendMeeting = await startMeetingApi({
        topic: meetingTopic,
        participants: backendDeskIds.length > 0 ? backendDeskIds : selectedParticipants,
      });
      meetingId = backendMeeting.id;
      setBackendMeetingId(backendMeeting.id);
    } catch (err) {
      console.error('[MeetingRoom] Failed to persist meeting to backend:', err);
      setBackendMeetingId(null);
    }

    const newMeeting: Meeting = {
      id: meetingId,
      topic: meetingTopic,
      participants: selectedParticipants,
      messages: [],
      startedAt: Date.now()
    };

    setActiveMeeting(newMeeting);
    addLogEntry(`Meeting started: "${meetingTopic}" with ${selectedParticipants.length} participants`);
    moveAgentsToMeeting(selectedParticipants);

    setTimeout(() => {
      setActiveMeeting(prev => {
        if (!prev) return null;
        const welcome: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          content: `Meeting "${meetingTopic}" has started. Discuss away!`,
          timestamp: Date.now(),
          isUser: false
        };
        return { ...prev, messages: [...prev.messages, welcome] };
      });
    }, 500);
  }, [meetingTopic, selectedParticipants, resolveBackendDeskId, addLogEntry, moveAgentsToMeeting]);

  // ── Send chat message (collaborative debate) ────────────

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !activeMeeting) return;

    const userContent = chatInput.trim();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: 'user',
      senderName: 'You',
      senderAvatar: '',
      content: userContent,
      timestamp: Date.now(),
      isUser: true
    };

    setActiveMeeting(prev => prev ? { ...prev, messages: [...prev.messages, userMsg] } : null);
    setChatInput('');

    const aiParticipants = activeMeeting.participants.filter(id => {
      const agent = agents.find(a => a.id === id);
      return agent && agent.id !== 'ceo';
    });

    const useBackend = !!backendMeetingId;

    // ── ROUND 1: Initial responses ──────────────────
    if (aiParticipants.length > 1) {
      setActiveMeeting(prev => {
        if (!prev) return null;
        const divider: ChatMessage = {
          id: `divider-r1-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          content: '--- Round 1: Initial Thoughts ---',
          timestamp: Date.now(),
          isUser: false
        };
        return { ...prev, messages: [...prev.messages, divider] };
      });
    }
    setDiscussionPhase('round1');

    const round1Responses: { participantId: string; agentName: string; content: string }[] = [];

    for (let i = 0; i < aiParticipants.length; i++) {
      const participantId = aiParticipants[i];
      const agent = agents.find(a => a.id === participantId);
      if (!agent) continue;

      // Stagger: brief pause between agents so user can follow
      if (i > 0) await delay(800);

      try {
        let responseContent: string;
        let costUsd = 0;

        if (useBackend) {
          const deskId = await resolveBackendDeskId(participantId);
          if (!deskId) continue;
          const result = await askInMeeting(backendMeetingId!, deskId, userContent, { round: 1 });
          responseContent = result.response;
          costUsd = result.costUsd;
        } else {
          const deskId = await resolveBackendDeskId(participantId);
          if (!deskId) continue;
          const chatHistory = activeMeeting.messages
            .filter(m => m.senderId !== 'system')
            .map(m => ({
              role: (m.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.isUser ? m.content : `[${m.senderName}]: ${m.content}`
            }));
          chatHistory.push({ role: 'user' as const, content: userContent });
          const response = await sendChat(deskId, chatHistory);
          responseContent = response.content;
          costUsd = response.costUsd;
        }

        round1Responses.push({ participantId, agentName: agent.name, content: responseContent });

        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar || '',
          content: responseContent,
          timestamp: Date.now(),
          isUser: false
        };

        setActiveMeeting(prev => prev ? { ...prev, messages: [...prev.messages, agentMessage] } : null);
        updateTodayCost(costUsd);
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}-err`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar || '',
          content: `[${formatError(err)}]`,
          timestamp: Date.now(),
          isUser: false
        };
        setActiveMeeting(prev => prev ? { ...prev, messages: [...prev.messages, errorMsg] } : null);
      }
    }

    // ── Pause before Round 2: ask user if they want discussion ────
    if (round1Responses.length > 1) {
      setPendingRound2({ userContent, aiParticipants, round1Responses });
      setDiscussionPhase('awaiting-r2');
      return; // Stop here — user decides whether to continue
    }

    setDiscussionPhase('idle');
  }, [chatInput, activeMeeting, agents, backendMeetingId, resolveBackendDeskId, updateTodayCost]);

  // ── Execute Round 2 (called when user clicks "Continue to Discussion") ──

  const executeRound2 = useCallback(async () => {
    if (!pendingRound2 || !activeMeeting) return;
    const { userContent, aiParticipants, round1Responses } = pendingRound2;
    const useBackend = !!backendMeetingId;

    setPendingRound2(null);
    setDiscussionPhase('round2');

    setActiveMeeting(prev => {
      if (!prev) return null;
      const divider: ChatMessage = {
        id: `divider-r2-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        senderAvatar: '',
        content: '--- Round 2: Discussion & Debate ---',
        timestamp: Date.now(),
        isUser: false
      };
      return { ...prev, messages: [...prev.messages, divider] };
    });

    for (let i = 0; i < aiParticipants.length; i++) {
      const participantId = aiParticipants[i];
      const agent = agents.find(a => a.id === participantId);
      if (!agent) continue;

      // Stagger between agents
      if (i > 0) await delay(800);

      const otherResponses = round1Responses
        .filter(r => r.participantId !== participantId)
        .map(r => ({ agentName: r.agentName, content: r.content }));

      if (otherResponses.length === 0) continue;

      try {
        let responseContent: string;
        let costUsd = 0;

        if (useBackend) {
          const deskId = await resolveBackendDeskId(participantId);
          if (!deskId) continue;
          const result = await askInMeeting(backendMeetingId!, deskId, userContent, {
            round: 2,
            otherResponses,
          });
          responseContent = result.response;
          costUsd = result.costUsd;
        } else {
          const deskId = await resolveBackendDeskId(participantId);
          if (!deskId) continue;
          const contextMsg = otherResponses.map(r => `[${r.agentName}]: ${r.content}`).join('\n\n');
          const chatHistory = [
            { role: 'user' as const, content: userContent },
            { role: 'assistant' as const, content: contextMsg },
            { role: 'user' as const, content: 'Now discuss, debate, and build on the other participants\' responses. Reference them by name.' },
          ];
          const response = await sendChat(deskId, chatHistory);
          responseContent = response.content;
          costUsd = response.costUsd;
        }

        const debateMsg: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}-r2`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar || '',
          content: responseContent,
          timestamp: Date.now(),
          isUser: false
        };

        setActiveMeeting(prev => prev ? { ...prev, messages: [...prev.messages, debateMsg] } : null);
        updateTodayCost(costUsd);
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}-r2-err`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar || '',
          content: `[${formatError(err)}]`,
          timestamp: Date.now(),
          isUser: false
        };
        setActiveMeeting(prev => prev ? { ...prev, messages: [...prev.messages, errorMsg] } : null);
      }
    }

    setDiscussionPhase('idle');
  }, [pendingRound2, activeMeeting, agents, backendMeetingId, resolveBackendDeskId, updateTodayCost]);

  const skipRound2 = useCallback(() => {
    setPendingRound2(null);
    setDiscussionPhase('idle');
  }, []);

  // ── End meeting ─────────────────────────────────────────

  const endMeeting = useCallback(async () => {
    if (!activeMeeting) return;

    addLogEntry(`Meeting ended: "${activeMeeting.topic}"`);

    if (backendMeetingId) {
      try { await endMeetingApi(backendMeetingId); } catch { /* non-critical */ }
    }

    returnAgentsToDesks(activeMeeting.participants);
    setActiveMeeting(null);
    setBackendMeetingId(null);
    setMeetingTopic('');
    setSelectedParticipants([]);
    setDiscussionPhase('idle');
    onClose();
  }, [activeMeeting, backendMeetingId, addLogEntry, returnAgentsToDesks, onClose]);

  // ── Reactivate meeting ──────────────────────────────────

  const handleReactivateMeeting = useCallback(async (meeting: MeetingRow) => {
    try {
      const reactivated = await reactivateMeeting(meeting.id);
      const full = await getMeeting(reactivated.id);
      setBackendMeetingId(full.id);

      // Map backend desk UUIDs back to local agent IDs
      const backendParticipants: string[] = full.participants || [];
      const localParticipantIds: string[] = [];
      for (const backendId of backendParticipants) {
        const assignment = deskAssignments.find(a => a.backendDeskId === backendId);
        if (assignment) {
          localParticipantIds.push(`agent-${assignment.deskId}`);
        }
      }

      // If we couldn't map any, try matching by agent name from messages
      if (localParticipantIds.length === 0) {
        const agentNames = new Set(
          (full.messages || [])
            .filter((m: MeetingRow['messages'][0]) => !m.isUser && m.senderName && m.senderName !== 'System')
            .map((m: MeetingRow['messages'][0]) => m.senderName)
        );
        for (const agent of agents) {
          if (agentNames.has(agent.name)) {
            localParticipantIds.push(agent.id);
          }
        }
      }

      setSelectedParticipants(localParticipantIds);

      // Rebuild message senderIds to use local agent IDs where possible
      const backendToLocal = new Map<string, { id: string; avatar: string }>();
      for (const assignment of deskAssignments) {
        if (assignment.backendDeskId) {
          const agent = agents.find(a => a.id === `agent-${assignment.deskId}`);
          if (agent) {
            backendToLocal.set(assignment.backendDeskId, { id: agent.id, avatar: agent.avatar || '' });
          }
        }
      }

      const localMessages: ChatMessage[] = (full.messages || []).map((m: MeetingRow['messages'][0]) => {
        // Try to resolve backend senderId to local agent ID
        let senderId = m.senderId || (m.isUser ? 'user' : 'system');
        let senderAvatar = '';
        if (!m.isUser && senderId !== 'system') {
          const mapped = backendToLocal.get(senderId);
          if (mapped) {
            senderId = mapped.id;
            senderAvatar = mapped.avatar;
          } else {
            // Try matching by senderName
            const matchedAgent = agents.find(a => a.name === m.senderName);
            if (matchedAgent) {
              senderId = matchedAgent.id;
              senderAvatar = matchedAgent.avatar || '';
            }
          }
        }

        return {
          id: m.id || `msg-${Date.now()}-${Math.random()}`,
          senderId,
          senderName: m.senderName || (m.isUser ? 'You' : 'Agent'),
          senderAvatar,
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          isUser: m.isUser
        };
      });

      const localMeeting: Meeting = {
        id: full.id,
        topic: full.topic,
        participants: localParticipantIds,
        messages: localMessages,
        startedAt: new Date(full.started_at).getTime()
      };

      setActiveMeeting(localMeeting);
      setMeetingTopic(full.topic);
      setShowHistory(false);
      addLogEntry(`Meeting reactivated: "${full.topic}"`);
      moveAgentsToMeeting(localParticipantIds);
    } catch (err) {
      addLogEntry(`Failed to reactivate meeting: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addLogEntry, moveAgentsToMeeting, deskAssignments, agents]);

  // ── View transcript ─────────────────────────────────────

  const handleViewTranscript = useCallback(async (meeting: MeetingRow) => {
    try {
      const full = await getMeeting(meeting.id);
      setViewingTranscript(full);
    } catch {
      addLogEntry('Failed to load meeting transcript');
    }
  }, [addLogEntry]);

  // ── Don't render if not shown ───────────────────────────

  if (!show && !activeMeeting) return null;

  // ── Render ──────────────────────────────────────────────

  return (
    <>
      {/* Meeting Setup Modal */}
      {show && !activeMeeting && (
        <div className="meeting-overlay" onClick={onClose}>
          <div className="meeting-setup" onClick={e => e.stopPropagation()}>
            <div className="meeting-header">
              <h2><Calendar size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Start a Meeting</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className={`meeting-history-toggle ${showHistory ? 'active' : ''}`}
                  onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadMeetingHistory(); }}
                >
                  <History size={14} style={{ marginRight: 4 }} />History
                </button>
                <button className="close-btn" onClick={onClose}><X size={16} /></button>
              </div>
            </div>

            {showHistory ? (
              <div className="meeting-history-panel">
                <div className="history-panel-header">
                  <h3>Past Meetings</h3>
                  {meetingHistory.length > 0 && (
                    <button className="history-clear-all-btn" onClick={handleClearAll}>
                      <Trash2 size={12} style={{ marginRight: 4 }} />Clear All
                    </button>
                  )}
                </div>
                {historyLoading ? (
                  <div className="history-loading">Loading meetings...</div>
                ) : meetingHistory.length === 0 ? (
                  <div className="history-empty">No past meetings yet</div>
                ) : (
                  <div className="history-list">
                    {meetingHistory.map(meeting => (
                      <div key={meeting.id} className="history-item">
                        <div className="history-item-info">
                          <span className="history-topic">{meeting.topic}</span>
                          <span className="history-meta">
                            {new Date(meeting.started_at).toLocaleDateString()} - {meeting.status === 'active' ? 'Active' : 'Ended'}
                            {meeting.participants?.length > 0 && ` - ${meeting.participants.length} participants`}
                          </span>
                        </div>
                        <div className="history-item-actions">
                          <button className="history-view-btn" onClick={() => handleViewTranscript(meeting)}>
                            <MessageSquare size={12} style={{ marginRight: 4 }} />Transcript
                          </button>
                          {meeting.status === 'ended' && (
                            <button className="history-reactivate-btn" onClick={() => handleReactivateMeeting(meeting)}>
                              <RotateCcw size={12} style={{ marginRight: 4 }} />Resume
                            </button>
                          )}
                          <button className="history-delete-btn" onClick={() => handleDeleteMeeting(meeting.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="meeting-form">
                <div className="form-group">
                  <label>Meeting Topic:</label>
                  <input
                    type="text"
                    value={meetingTopic}
                    onChange={(e) => setMeetingTopic(e.target.value)}
                    placeholder="e.g., Q1 Planning, Bug Triage, Architecture Review"
                  />
                </div>

                <div className="form-group">
                  <label>Select Participants:</label>
                  <div className="participant-list">
                    {agents.filter(a => a.id !== 'ceo').map(agent => {
                      const modelId = getModelForAgent(agent.id);
                      const modelName = modelPricing[modelId]?.name || modelId;
                      return (
                        <label key={agent.id} className="participant-checkbox">
                          <span className="participant-avatar">{agent.name.charAt(0).toUpperCase()}</span>
                          <div className="participant-details">
                            <span className="participant-name">{agent.name}</span>
                            <span className="participant-model-label">{modelName}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedParticipants.includes(agent.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedParticipants(prev => [...prev, agent.id]);
                              } else {
                                setSelectedParticipants(prev => prev.filter(id => id !== agent.id));
                              }
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="form-buttons">
                  <button onClick={startMeeting} disabled={!meetingTopic || selectedParticipants.length === 0}>
                    <Rocket size={14} style={{ marginRight: 6 }} />Start Meeting
                  </button>
                  <button onClick={onClose} className="secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript Viewer */}
      {viewingTranscript && (
        <div className="meeting-overlay" onClick={() => setViewingTranscript(null)}>
          <div className="transcript-viewer" onClick={e => e.stopPropagation()}>
            <div className="transcript-header">
              <div>
                <h2><MessageSquare size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />{viewingTranscript.topic}</h2>
                <span className="transcript-meta">
                  {new Date(viewingTranscript.started_at).toLocaleDateString()} at {new Date(viewingTranscript.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {viewingTranscript.ended_at && ` - ${new Date(viewingTranscript.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
              <button className="close-btn" onClick={() => setViewingTranscript(null)}><X size={16} /></button>
            </div>
            <div className="transcript-messages">
              {(viewingTranscript.messages || []).length === 0 ? (
                <div className="transcript-empty">No messages in this meeting</div>
              ) : (
                (viewingTranscript.messages || []).map((msg, i) => (
                  <div key={msg.id || i} className={`transcript-message ${msg.isUser ? 'user' : 'agent'}`}>
                    <div className="transcript-sender">
                      <span className="transcript-sender-name">{msg.senderName || (msg.isUser ? 'You' : 'Agent')}</span>
                      {msg.senderModel && <span className="transcript-model-tag">{msg.senderModel}</span>}
                      <span className="transcript-time">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="transcript-text">
                      {(!msg.isUser && msg.content.includes('```'))
                        ? parseCodeBlocks(msg.content).map((seg, si) =>
                            seg.type === 'text' ? (
                              <span key={si} style={{ whiteSpace: 'pre-wrap' }}>{seg.content}</span>
                            ) : (
                              <div key={si} className="code-block">
                                <div className="code-block-header">
                                  <span className="code-block-lang">{seg.language}</span>
                                  <div className="code-block-actions">
                                    <button className="code-block-copy" onClick={async (e) => {
                                      e.stopPropagation();
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
                                    }}>Copy</button>
                                    <button className="code-block-download" onClick={() => downloadCodeBlock(seg.content, seg.language)} title="Download file">
                                      <Download size={10} />
                                    </button>
                                    <button className="code-block-open" onClick={async (e) => {
                                      const btn = e.currentTarget;
                                      try {
                                        const { filePath } = await openCode(seg.content, seg.language);
                                        window.location.href = `vscode://file${filePath}`;
                                        btn.textContent = 'Sent to VS Code';
                                        setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.583 2.286l-4.574 4.596L7.722 2.67 2 5.39v13.202l5.704 2.737 5.307-4.212 4.572 4.597L24 18.58V5.402l-6.417-3.116zM7.7 15.094L4.709 12l2.99-3.094v6.188zm9.88 2.318l-4.496-3.624 4.496-3.624v7.248z"/></svg> VS Code'; }, 2000);
                                      } catch { /* ignore */ }
                                    }}>
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
                          )
                        : msg.content
                      }
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Meeting Chat */}
      {activeMeeting && (
        <div className="meeting-overlay">
          <div className="meeting-room">
            <div className="meeting-room-header">
              <div className="meeting-info">
                <h2><Calendar size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />{activeMeeting.topic}</h2>
                <span className="meeting-participants-count">
                  {activeMeeting.participants.length} participants
                  {discussionPhase !== 'idle' && discussionPhase !== 'awaiting-r2' && (
                    <span className="discussion-phase-badge">
                      {discussionPhase === 'round1' ? 'Round 1: Initial Thoughts' : 'Round 2: Discussion'}
                    </span>
                  )}
                </span>
              </div>
              <button className="end-meeting-btn" onClick={endMeeting}>
                <CircleStop size={14} style={{ marginRight: 6 }} />End Meeting
              </button>
            </div>

            <div className="meeting-content">
              <div className="chat-container">
                <div className="chat-messages">
                  {activeMeeting.messages.map((msg) => {
                    // Round dividers
                    const isRoundDivider = msg.senderId === 'system' && msg.content.startsWith('--- Round');
                    if (isRoundDivider) {
                      return (
                        <div key={msg.id} className="round-divider">
                          <span className="round-divider-line" />
                          <span className="round-divider-label">
                            {msg.content.includes('Round 1') ? 'Round 1: Initial Thoughts' : 'Round 2: Discussion & Debate'}
                          </span>
                          <span className="round-divider-line" />
                        </div>
                      );
                    }

                    const agentModelId = !msg.isUser && msg.senderId !== 'system'
                      ? getModelForAgent(msg.senderId)
                      : null;
                    const agentModelName = agentModelId ? (modelPricing[agentModelId]?.name || agentModelId) : null;

                    return (
                      <div key={msg.id} className={`chat-message ${msg.isUser ? 'me' : msg.senderId === 'system' ? 'system' : 'agent'}`}>
                        {msg.senderId !== 'system' && (
                          <div className="message-avatar">{msg.senderName.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="message-content">
                          {msg.senderId !== 'system' && (
                            <div className="message-sender">
                              {msg.senderName}
                              {agentModelName && <span className="message-model-tag">{agentModelName}</span>}
                            </div>
                          )}
                          <div className="message-text">
                            {(!msg.isUser && msg.senderId !== 'system' && msg.content.includes('```'))
                              ? parseCodeBlocks(msg.content).map((seg, si) =>
                                  seg.type === 'text' ? (
                                    <span key={si} style={{ whiteSpace: 'pre-wrap' }}>{seg.content}</span>
                                  ) : (
                                    <div key={si} className="code-block">
                                      <div className="code-block-header">
                                        <span className="code-block-lang">{seg.language}</span>
                                        <div className="code-block-actions">
                                          <button className="code-block-copy" onClick={async (e) => {
                                            e.stopPropagation();
                                            const btn = e.currentTarget;
                                            try {
                                              await navigator.clipboard.writeText(seg.content);
                                              btn.textContent = 'Copied';
                                              setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                                            } catch {
                                              // Fallback for non-secure contexts
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
                                          }}>Copy</button>
                                          <button className="code-block-download" onClick={() => downloadCodeBlock(seg.content, seg.language)} title="Download file">
                                            <Download size={10} />
                                          </button>
                                          <button className="code-block-open" onClick={async (e) => {
                                            const btn = e.currentTarget;
                                            try {
                                              const { filePath } = await openCode(seg.content, seg.language);
                                              window.location.href = `vscode://file${filePath}`;
                                              btn.textContent = 'Sent to VS Code';
                                              setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.583 2.286l-4.574 4.596L7.722 2.67 2 5.39v13.202l5.704 2.737 5.307-4.212 4.572 4.597L24 18.58V5.402l-6.417-3.116zM7.7 15.094L4.709 12l2.99-3.094v6.188zm9.88 2.318l-4.496-3.624 4.496-3.624v7.248z"/></svg> VS Code'; }, 2000);
                                            } catch { /* ignore */ }
                                          }}>
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
                                )
                              : msg.content
                            }
                          </div>
                          <div className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(discussionPhase === 'round1' || discussionPhase === 'round2') && (
                    <div className="discussion-thinking">
                      <div className="thinking-dots">
                        <span /><span /><span />
                      </div>
                      <span className="thinking-label">
                        {discussionPhase === 'round1' ? 'Agents are thinking...' : 'Agents are discussing...'}
                      </span>
                    </div>
                  )}
                  {discussionPhase === 'awaiting-r2' && (
                    <div className="round2-prompt">
                      <span className="round2-prompt-text">All agents have shared their initial thoughts. Would you like them to discuss and debate each other's responses?</span>
                      <div className="round2-prompt-actions">
                        <button className="round2-continue-btn" onClick={executeRound2}>
                          Continue to Discussion
                        </button>
                        <button className="round2-skip-btn" onClick={skipRound2}>
                          Skip
                        </button>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-input-area">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder={discussionPhase !== 'idle' ? 'Waiting for agents to finish...' : 'Type your message...'}
                    className="chat-input"
                    disabled={discussionPhase !== 'idle'}
                  />
                  <button onClick={sendChatMessage} className="send-btn" disabled={!chatInput.trim() || discussionPhase !== 'idle'}>
                    <Send size={16} />
                  </button>
                </div>
              </div>

              <div className="meeting-sidebar">
                <h4>Participants</h4>
                <div className="meeting-participants-list">
                  <div className="participant-item me">
                    <span className="participant-initial">Y</span>
                    <span>You (CEO)</span>
                  </div>
                  {activeMeeting.participants.filter(id => id !== 'ceo').map(participantId => {
                    const agent = agents.find(a => a.id === participantId);
                    const modelId = getModelForAgent(participantId);
                    const modelName = modelPricing[modelId]?.name || modelId;
                    return agent ? (
                      <div key={participantId} className="participant-item">
                        <span className="participant-initial">{agent.name.charAt(0).toUpperCase()}</span>
                        <div className="participant-info">
                          <span>{agent.name}</span>
                          <span className="participant-model">{modelName}</span>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MeetingRoom;
