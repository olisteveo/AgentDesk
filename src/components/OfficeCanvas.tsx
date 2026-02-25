import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './OfficeCanvas.css';
import HireWizard from './modals/HireWizard';
import { AccountSettingsModal } from './modals/AccountSettingsModal';
import { listDesks, createDesk, deleteDesk } from '../api/desks';
import { createTask, runTask as runTaskApi, openCode } from '../api/tasks';
import type { Desk as BackendDesk } from '../api/desks';
import type { Task, DeskAssignment, Agent, Zone, Particle, SpriteDirection } from '../types';
import { useActivityLog } from '../hooks/useActivityLog';
import { useCostTracker } from '../hooks/useCostTracker';
import { useTaskManager } from '../hooks/useTaskManager';
import { isCodeRelatedTask } from '../utils/codeDetection';
import { parseCodeBlocks } from '../utils/parseCodeBlocks';
import {
  SPRITE_ASSETS,
  DIRECTION_GRID,
  AVATAR_SHEET_MAP,
  ZONE_DESK_SPRITE,
  DESK_TYPE_SPRITE,
  AGENT_AVATAR_SPRITE,
  getDirectionFromDelta,
} from '../utils/sprites';
import MeetingRoom from './MeetingRoom';
import CostDashboard from './CostDashboard';
import { ClipboardList, DollarSign, X, Trash2, Rss } from 'lucide-react';

// Meeting types moved to MeetingRoom.tsx

// Use shared constants — single source of truth
import { MODEL_PRICING, AVAILABLE_MODELS } from '../utils/constants';


// Two-column layout: CEO top-left, agent desks alternate right then left
const LEFT_COL  = 0.32;   // left column x (CEO + even-index desks)
const RIGHT_COL = 0.68;   // right column x (odd-index desks)
const START_Y   = 0.18;   // first row y
const ROW_GAP   = 0.22;   // vertical gap between rows

const calculateDeskLayout = (desks: Zone[]): Zone[] => {
  const ceo     = desks.find(d => d.id === 'ceo');
  const meeting = desks.find(d => d.id === 'meeting');
  const agentDesks = desks.filter(d => d.id?.startsWith('desk'));

  const layout: Zone[] = [];

  // CEO anchored top-left column
  if (ceo) layout.push({ ...ceo, x: LEFT_COL, y: START_Y });

  // Agent desks alternate: 1st → right, 2nd → left, 3rd → right …
  agentDesks.forEach((desk, i) => {
    const isRight = i % 2 === 0;          // first desk goes right
    const row     = Math.floor(i / 2);    // two desks per row
    const x       = isRight ? RIGHT_COL : LEFT_COL;
    // Right-column desks start on the same row as CEO (row 0),
    // left-column desks start one row below CEO (row 0 + 1)
    const y       = isRight
      ? START_Y + row * ROW_GAP
      : START_Y + (row + 1) * ROW_GAP;
    layout.push({ ...desk, x, y });
  });

  // Meeting room always below everything, centred
  if (meeting) {
    const totalRows = Math.ceil(agentDesks.length / 2);
    // Account for left-column offset (+1 row) when finding the lowest desk
    const lowestY = agentDesks.length > 0
      ? START_Y + totalRows * ROW_GAP
      : START_Y;
    const meetingY = Math.min(lowestY + 0.14, 0.88);
    layout.push({ ...meeting, x: 0.50, y: meetingY });
  }

  return layout;
};

// Default: just CEO + Meeting Room (no ops/OpenClaw)
const DEFAULT_DESKS: Zone[] = [
  { id: 'ceo',     x: 0.22, y: 0.20, w: 200, h: 100, color: '#ffd700', label: 'CEO Office' },
  { id: 'meeting', x: 0.50, y: 0.55, w: 400, h: 120, color: '#74b9ff', label: 'Meeting Room' }
];


// No default assignments — loaded from backend on mount
const DEFAULT_ASSIGNMENTS: DeskAssignment[] = [];

const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '', avatar: 'avatar1', deskOffset: { x: 0, y: 10 }, isWorking: false }
];

// Sprite assets + directional sprite system imported from utils/sprites

const OfficeCanvas: React.FC = () => {
  const { user, markOnboardingDone } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carpetPatternRef = useRef<CanvasPattern | null>(null);
  const mountedRef = useRef(false);
  const desksLoadedRef = useRef(false);
  const [sprites, setSprites] = useState<Record<string, HTMLImageElement>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [viewingTaskResult, setViewingTaskResult] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [showFeedPanel, setShowFeedPanel] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  // Onboarding state — restore from auth context if already completed
  const [onboardingDone, setOnboardingDone] = useState(user?.onboardingDone ?? false);
  const [ceoName, setCeoName] = useState(user?.displayName ?? 'You');
  const [ceoSprite, setCeoSprite] = useState<'avatar1' | 'avatar2' | 'avatar3'>(
    (user?.avatarId as 'avatar1' | 'avatar2' | 'avatar3') ?? 'avatar1'
  );

  // Desk configuration state
  const [desks, setDesks] = useState<Zone[]>(DEFAULT_DESKS);
  const [deskAssignments, setDeskAssignments] = useState<DeskAssignment[]>(DEFAULT_ASSIGNMENTS);

  // --- Extracted hooks: activity log, cost tracker, task manager ---
  // Each hook owns its state + backend hydration (loads data on mount)
  const { taskLog, addLogEntry } = useActivityLog(onboardingDone);
  const costTracker = useCostTracker(onboardingDone);
  const { todayApiCost, updateTodayCost } = costTracker;
  const { tasks, setTasks, taskResults, setTaskResults, removeTask, clearTasks } = useTaskManager({
    deskAssignments,
    onboardingDone,
  });

  // Settings state
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  // Hire Agent wizard state
  const [showHireWizard, setShowHireWizard] = useState(false);

  // Tooltip state for canvas hover
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  // Meeting room state (component handles its own internal state)
  const [showMeetingRoom, setShowMeetingRoom] = useState(false);

  // Whiteboard state
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [activeTab, setActiveTab] = useState('vision');
  const [whiteboardNotes, setWhiteboardNotes] = useState<Record<string, string[]>>({
    vision: [],
    goals: [],
    plans: [],
    ideas: [],
    memos: [],
    rules: []
  });
  const [newNote, setNewNote] = useState('');

  // Load sprite images once on mount
  useEffect(() => {
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img); // resolve even on error; img.complete=false
        img.src = src;
      });

    Promise.all(
      Object.entries(SPRITE_ASSETS).map(([key, src]) =>
        loadImage(src).then(img => [key, img] as [string, HTMLImageElement])
      )
    ).then(results => {
      const map: Record<string, HTMLImageElement> = {};
      results.forEach(([k, img]) => { map[k] = img; });
      setSprites(map);

      // Pre-bake carpet pattern into an offscreen canvas at tile size
      const carpetImg = map['carpet'];
      if (carpetImg && carpetImg.complete && carpetImg.naturalWidth > 0) {
        const TILE = 300; // display tile size in px
        const tileH = Math.round(TILE * carpetImg.naturalHeight / carpetImg.naturalWidth);
        const offscreen = document.createElement('canvas');
        offscreen.width = TILE;
        offscreen.height = tileH;
        const octx = offscreen.getContext('2d')!;
        octx.drawImage(carpetImg, 0, 0, TILE, tileH);
        // We store the offscreen canvas; pattern gets created per-canvas-context in render
        // Store on ref so render can use it without recreating every frame
        const mainCanvas = document.querySelector('canvas.office-canvas') as HTMLCanvasElement;
        if (mainCanvas) {
          const mctx = mainCanvas.getContext('2d');
          if (mctx) {
            carpetPatternRef.current = mctx.createPattern(offscreen, 'repeat');
          }
        }
      }
    });
  }, []);

  // Load desks from backend on mount — restores agents across page refreshes
  // Uses desksLoadedRef guard to prevent double-firing in React StrictMode
  useEffect(() => {
    if (!onboardingDone || desksLoadedRef.current) return;
    desksLoadedRef.current = true;

    const loadDesks = async () => {
      try {
        const backendDesks = await listDesks();
        if (backendDesks.length === 0) return; // No desks yet — fresh workspace

        const colors = ['#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#1dd1a1', '#a29bfe'];
        const newDesks: Zone[] = [...DEFAULT_DESKS];
        const newAssignments: DeskAssignment[] = [];
        const newAgents: Agent[] = [];

        backendDesks.forEach((bd: BackendDesk, index: number) => {
          const deskId = `desk${index + 1}`;
          const deskColor = colors[index % colors.length];
          const primaryModel = bd.models.find(m => m.is_primary);
          const modelId = primaryModel?.model_id || bd.models[0]?.model_id || 'gpt-4.1';

          newDesks.push({
            id: deskId,
            x: 0, y: 0,
            w: 200, h: 100,
            color: deskColor,
            label: bd.name
          });

          newAssignments.push({
            deskId,
            backendDeskId: bd.id,
            modelId,
            agentName: bd.agent_name,
            customName: bd.name,
            deskType: (bd.desk_type as 'mini' | 'standard' | 'power') || 'mini',
          });

          newAgents.push({
            id: `agent-${deskId}`,
            name: bd.agent_name,
            role: 'AI Assistant',
            zone: deskId,
            x: 0, y: 0,
            color: deskColor,
            emoji: '',
            avatar: (bd.avatar_id || 'avatar1') as string,
            deskOffset: { x: 0, y: 10 },
            isWorking: false
          });
        });

        setDesks(newDesks);
        setDeskAssignments(newAssignments);

        // Position agents once dimensions are available
        // Merge with existing agents (CEO), replacing any duplicates by id
        const { width, height } = dimensionsRef.current;
        const agentsToAdd = (width > 0 && height > 0)
          ? newAgents.map(agent => {
              const layout = calculateDeskLayout(newDesks);
              const zone = layout.find(z => z.id === agent.zone);
              return zone
                ? { ...agent, x: width * zone.x + agent.deskOffset.x, y: height * zone.y + agent.deskOffset.y }
                : agent;
            })
          : newAgents;

        const newIds = new Set(agentsToAdd.map(a => a.id));
        setAgents(prev => [...prev.filter(a => !newIds.has(a.id)), ...agentsToAdd]);
      } catch (err) {
        console.error('Failed to load desks from backend:', err);
      }
    };

    loadDesks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingDone]);

  const calculateZones = useCallback((width: number, height: number): Record<string, Zone> => {
    const layout = calculateDeskLayout(desks);
    return layout.reduce((acc, desk) => ({
      ...acc,
      [desk.id!]: {
        ...desk,
        x: width * desk.x,
        y: height * desk.y
      }
    }), {});
  }, [desks]);

  const resetAgents = useCallback((width: number, height: number) => {
    const zones = calculateZones(width, height);
    return INITIAL_AGENTS.map(agent => {
      // If onboarding is done, restore CEO name + avatar from auth
      const isCeo = agent.id === 'ceo';
      return {
        ...agent,
        ...(isCeo && onboardingDone ? { name: ceoName, avatar: ceoSprite } : {}),
        x: zones[agent.zone].x + agent.deskOffset.x,
        y: zones[agent.zone].y + agent.deskOffset.y,
      };
    });
  }, [calculateZones, onboardingDone, ceoName, ceoSprite]);

  // addLogEntry is now provided by useActivityLog hook

  const calculateTaskCost = useCallback((modelId: string, inputTokens: number = 1000, outputTokens: number = 500): number => {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) return 0;
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }, []);

  const getModelForAgent = useCallback((agentId: string): string => {
    // Look up via deskAssignments for dynamically created agents
    const deskId = agentId.replace('agent-', '');
    const assignment = deskAssignments.find(a => a.deskId === deskId);
    if (assignment) return assignment.modelId;
    // Fallback for legacy agents
    return 'gpt-4.1';
  }, [deskAssignments]);

  const openHireWizard = useCallback(() => {
    setShowHireWizard(true);
  }, []);

  const closeHireWizard = useCallback(() => {
    setShowHireWizard(false);
  }, []);

  const completeHireWizard = useCallback(async (data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
    deskType: 'mini' | 'standard' | 'power';
  }) => {
    const { width, height } = dimensionsRef.current;

    // Determine next desk ID
    const userDesks = desks.filter(d => d.id?.startsWith('desk'));
    const deskNum = userDesks.length + 1;
    const deskId = `desk${deskNum}`;

    // Desk color from cycling palette
    const colors = ['#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#1dd1a1', '#a29bfe'];
    const deskColor = colors[(deskNum - 1) % colors.length];

    // Save desk to backend first
    let backendDeskId: string | undefined;
    try {
      const backendDesk = await createDesk({
        name: data.deskName || `Desk ${deskNum}`,
        agentName: data.agentName || 'Agent',
        agentColor: deskColor,
        avatarId: data.avatar,
        deskType: data.deskType || 'mini',
        models: [data.model],
      });
      backendDeskId = backendDesk.id;
    } catch (err) {
      console.error('Failed to save desk to backend:', err);
      addLogEntry(`Failed to create desk — check your connection`);
      return; // Don't add locally if backend fails
    }

    // Create Zone
    const newDesk: Zone = {
      id: deskId,
      x: 0, y: 0,
      w: 200, h: 100,
      color: deskColor,
      label: data.deskName || `Desk ${deskNum}`
    };

    // Create DeskAssignment with backend ID
    const newAssignment: DeskAssignment = {
      deskId,
      backendDeskId,
      modelId: data.model,
      agentName: data.agentName,
      customName: data.deskName || `Desk ${deskNum}`,
      deskType: data.deskType || 'mini',
    };

    // Create Agent
    const newAgent: Agent = {
      id: `agent-${deskId}`,
      name: data.agentName || 'Agent',
      role: 'AI Assistant',
      zone: deskId,
      x: 0, y: 0,
      color: deskColor,
      emoji: '',
      avatar: data.avatar,
      deskOffset: { x: 0, y: 10 },
      isWorking: false
    };

    // Update desks and position agent via layout
    const updatedDesks = [...desks, newDesk];
    setDesks(updatedDesks);
    setDeskAssignments(prev => [...prev, newAssignment]);

    const layout = calculateDeskLayout(updatedDesks);
    const deskZone = layout.find(z => z.id === deskId);
    if (deskZone) {
      newAgent.x = width * deskZone.x + newAgent.deskOffset.x;
      newAgent.y = height * deskZone.y + newAgent.deskOffset.y;
    }

    setAgents(prev => [...prev, newAgent]);

    const modelInfo = AVAILABLE_MODELS.find(m => m.id === data.model);
    addLogEntry(`Hired "${data.agentName}" (${modelInfo?.name || data.model}) at "${data.deskName || `Desk ${deskNum}`}"`);
    closeHireWizard();
  }, [desks, addLogEntry, closeHireWizard]);

  // updateTodayCost is now provided by useCostTracker hook

  const assignTask = useCallback(async () => {
    if (!selectedAgent || !taskTitle) return;

    const modelId = getModelForAgent(selectedAgent);
    const agent = agents.find(a => a.id === selectedAgent);
    const agentName = agent?.name || 'Agent';
    const capturedTitle = taskTitle;
    const capturedDesc = taskDescription;
    const capturedAgent = selectedAgent;

    // Resolve the backend desk ID for this agent
    const localDeskId = selectedAgent.replace('agent-', '');
    let assignment = deskAssignments.find(a => a.deskId === localDeskId);
    let backendDeskId = assignment?.backendDeskId;

    // Auto-sync: if desk exists locally but not in backend, create it now
    if (!backendDeskId) {
      try {
        const backendDesk = await createDesk({
          name: assignment?.customName || agent?.name || `Desk`,
          agentName: assignment?.agentName || agent?.name || 'Agent',
          agentColor: agent?.color || '#feca57',
          avatarId: agent?.avatar || 'avatar1',
          deskType: 'mini',
          models: [modelId],
        });
        backendDeskId = backendDesk.id;
        // Update the assignment in state with the new backend ID
        setDeskAssignments(prev => prev.map(a =>
          a.deskId === localDeskId ? { ...a, backendDeskId: backendDesk.id } : a
        ));
        addLogEntry(`Synced desk "${assignment?.customName || localDeskId}" to backend`);
      } catch (syncErr) {
        const msg = syncErr instanceof Error ? syncErr.message : 'Unknown error';
        addLogEntry(`Cannot sync desk to backend: ${msg}`);
        return;
      }
    }

    // Detect if this is a code-related task (for VS Code integration)
    const codeTask = isCodeRelatedTask(capturedTitle, capturedDesc);

    // Create local task immediately for UI feedback
    const localTask: Task = {
      id: `task-${Date.now()}`,
      name: capturedTitle,
      description: capturedDesc,
      assignee: capturedAgent,
      status: 'in-progress',
      createdAt: Date.now(),
      modelUsed: MODEL_PRICING[modelId]?.name || modelId,
      isCodeTask: codeTask,
    };

    setTasks(prev => [...prev, localTask]);
    addLogEntry(`Task "${capturedTitle}" assigned to ${agentName} (${MODEL_PRICING[modelId]?.name})`);

    // Move agent to their desk and start working animation
    const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
    const agentZone = zones[localDeskId];
    setAgents(prev => prev.map(a => {
      if (a.id === capturedAgent) {
        return {
          ...a,
          currentTask: localTask,
          isWorking: true,
          targetX: agentZone ? agentZone.x + a.deskOffset.x : a.x,
          targetY: agentZone ? agentZone.y + a.deskOffset.y : a.y,
        };
      }
      return a;
    }));

    setShowTaskForm(false);
    setTaskTitle('');
    setTaskDescription('');
    setSelectedAgent('');

    // Create task in backend and run it
    try {
      const backendTask = await createTask({
        title: capturedTitle,
        description: capturedDesc || undefined,
        deskId: backendDeskId,
        assignedModelId: modelId,
        isCodeTask: codeTask,
      });

      const result = await runTaskApi(backendTask.id);

      // Update local task with real cost, result, and backend ID
      setTasks(prev => prev.map(t =>
        t.id === localTask.id
          ? { ...t, status: 'completed', cost: result.costUsd, modelUsed: MODEL_PRICING[result.model]?.name || result.model, backendId: backendTask.id }
          : t
      ));

      updateTodayCost(result.costUsd);
      addLogEntry(`${agentName} completed "${capturedTitle}" — $${result.costUsd.toFixed(4)} (${result.latencyMs}ms)`);

      // Store the AI result for display
      setTaskResults(prev => ({ ...prev, [localTask.id]: result.result }));

      // Walk agent to CEO desk to report back
      const ceoZone = zones.ceo;
      if (ceoZone) {
        setAgents(prev => prev.map(a => {
          if (a.id === capturedAgent) {
            return {
              ...a,
              currentTask: undefined,
              isWorking: false,
              targetX: ceoZone.x + 60,  // stand next to CEO
              targetY: ceoZone.y + 10,
            };
          }
          return a;
        }));

        // After a pause at CEO desk, return agent to their own desk
        setTimeout(() => {
          const freshZones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
          const homeZone = freshZones[localDeskId];
          setAgents(prev => prev.map(a => {
            if (a.id === capturedAgent) {
              return {
                ...a,
                targetX: homeZone ? homeZone.x + a.deskOffset.x : a.x,
                targetY: homeZone ? homeZone.y + a.deskOffset.y : a.y,
              };
            }
            return a;
          }));
        }, 3000);
      } else {
        // No CEO zone — just stop working
        setAgents(prev => prev.map(a => {
          if (a.id === capturedAgent) {
            return { ...a, currentTask: undefined, isWorking: false };
          }
          return a;
        }));
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: string }).message) : 'Unknown error';
      // Make common backend errors user-friendly
      let errMsg = raw;
      if (raw.includes('No active') && raw.includes('credential')) {
        errMsg = `No API key found for this model's provider. Open Hire Agent → Manage tab to add one.`;
      } else if (raw.includes('exceeded') || raw.includes('quota') || raw.includes('insufficient')) {
        errMsg = `API key has no credits/quota. Add billing at your provider's dashboard.`;
      } else if (raw.includes('Kimi Code key') || raw.includes('sk-kimi-')) {
        errMsg = `Kimi Code keys only work in coding agents. Add a Moonshot platform key instead.`;
      } else if (raw.includes('Invalid API key') || raw.includes('Incorrect API key') || raw.includes('invalid_api_key')) {
        errMsg = `Invalid API key. Check your key in Hire Agent → Manage tab.`;
      } else if (raw.includes('AI provider call failed')) {
        // Extract the useful part after "AI provider call failed:"
        const detailMatch = raw.match(/details?:\s*(.+)/i) || raw.match(/failed:\s*(.+)/i);
        errMsg = detailMatch ? detailMatch[1] : raw;
      }
      setTasks(prev => prev.map(t =>
        t.id === localTask.id ? { ...t, status: 'failed' as const, errorMessage: errMsg } : t
      ));
      addLogEntry(`Task "${capturedTitle}" failed: ${errMsg}`);

      // On failure, stop working and stay at desk
      setAgents(prev => prev.map(a => {
        if (a.id === capturedAgent) {
          return { ...a, currentTask: undefined, isWorking: false };
        }
        return a;
      }));
    }
  }, [selectedAgent, taskTitle, taskDescription, agents, deskAssignments, addLogEntry, getModelForAgent, calculateZones, updateTodayCost]);

  // Meeting room logic extracted to MeetingRoom.tsx


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const WALL = 200; // side border wall thickness (px)
      const NAV_H = 64; // nav height + border
      const FOOTER_H = 80; // footer height
      canvas.width = window.innerWidth - WALL * 2;
      canvas.height = window.innerHeight - NAV_H - FOOTER_H;
      dimensionsRef.current = { width: canvas.width, height: canvas.height };
      carpetPatternRef.current = null;

      if (!mountedRef.current) {
        // Initial mount: set CEO from INITIAL_AGENTS
        mountedRef.current = true;
        setAgents(resetAgents(canvas.width, canvas.height));
      } else {
        // Subsequent resizes: reposition ALL agents (including dynamic ones)
        const zones = calculateZones(canvas.width, canvas.height);
        setAgents(prev => prev.map(agent => {
          const zone = zones[agent.zone];
          return zone
            ? { ...agent, x: zone.x + agent.deskOffset.x, y: zone.y + agent.deskOffset.y }
            : agent;
        }));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [resetAgents, calculateZones]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = 0;

    // All desks render at the same HEIGHT so they look uniform.
    // boss: 141×156 natural → at DESK_H=80, width = 80*(141/156) = 72px  ✓ matches screenshot
    // mini: 246×155 natural → at DESK_H=80, width = 80*(246/155) = 127px
    // std:  347×155 natural → at DESK_H=80, width = 80*(347/155) = 179px
    const DESK_H    =  80;  // all desks share this display height
    const AVATAR_PX =  72;  // avatar size (sprites are 142×142 square)

    // Helper: get rendered desk dimensions for a sprite
    const getDeskDims = (img: HTMLImageElement) => {
      const dH = DESK_H;
      const dW = Math.round(DESK_H * (img.naturalWidth / img.naturalHeight));
      return { dW, dH };
    };

    const drawDesk = (zone: Zone) => {
      if (zone.id === 'watercooler') return;

      // Meeting room: render at a larger size than desks
      if (zone.id === 'meeting') {
        const meetImg = sprites['meetingRoom'];
        if (meetImg && meetImg.complete && meetImg.naturalWidth > 0) {
          const MEETING_H = 140;
          const mW = Math.round(MEETING_H * (meetImg.naturalWidth / meetImg.naturalHeight));
          const mH = MEETING_H;
          const mx = Math.round(zone.x - mW / 2);
          const my = Math.round(zone.y - mH / 2);

          ctx.shadowBlur = 12;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowOffsetY = 6;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(meetImg, mx, my, mW, mH);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.imageSmoothingEnabled = true;
        }
        return;
      }

      // Resolve sprite: check assignment deskType first, fall back to zone-id mapping
      const assignment = zone.id ? deskAssignments.find(a => a.deskId === zone.id) : undefined;
      const spriteKey = (assignment?.deskType ? DESK_TYPE_SPRITE[assignment.deskType] : undefined)
        || (zone.id ? ZONE_DESK_SPRITE[zone.id] : undefined);
      const spriteImg = spriteKey ? sprites[spriteKey] : undefined;

      if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        // All desks same height, width scales from natural ratio
        const { dW, dH } = getDeskDims(spriteImg);
        const x = Math.round(zone.x - dW / 2);
        const y = Math.round(zone.y - dH / 2);

        // Shadow
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowOffsetY = 5;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spriteImg, x, y, dW, dH);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.imageSmoothingEnabled = true;

        // Coloured zone indicator dot above sprite
        ctx.fillStyle = zone.color;
        ctx.beginPath();
        ctx.arc(zone.x, y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fallback: geometric desk at zone dimensions
        const deskW = zone.w;
        const deskH = zone.h;
        const x = zone.x - deskW / 2;
        const y = zone.y - deskH / 2;

        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowOffsetY = 10;

        const deskGradient = ctx.createLinearGradient(x, y, x, y + deskH);
        deskGradient.addColorStop(0, '#2a2a3e');
        deskGradient.addColorStop(0.5, '#1f1f2e');
        deskGradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = deskGradient;
        ctx.fillRect(x, y, deskW, deskH);

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = zone.color + '60';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, deskW, deskH);
        ctx.fillStyle = zone.color + '20';
        ctx.fillRect(x, y, deskW, 4);
      }
    };

    const drawZoneLabel = (zone: Zone) => {
      // Resolve sprite: check assignment deskType first, fall back to zone-id mapping
      const labelAssignment = zone.id ? deskAssignments.find(a => a.deskId === zone.id) : undefined;
      const spriteKey = (labelAssignment?.deskType ? DESK_TYPE_SPRITE[labelAssignment.deskType] : undefined)
        || (zone.id ? ZONE_DESK_SPRITE[zone.id] : undefined);
      const spriteImg = spriteKey ? sprites[spriteKey] : undefined;
      let topOfDesk: number;
      if (zone.id === 'meeting' && spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        const MEETING_H = 140;
        topOfDesk = zone.y - MEETING_H / 2;
      } else if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        const { dH } = getDeskDims(spriteImg);
        topOfDesk = zone.y - dH / 2;
      } else {
        topOfDesk = zone.y - zone.h / 2;
      }

      // Measure text to fit the label background to the word
      ctx.font = 'bold 12px sans-serif';
      const textW = ctx.measureText(zone.label).width;
      const pad = 16;            // horizontal padding each side
      const labelW = textW + pad * 2;
      const labelH = 24;
      const labelY = topOfDesk - 38;
      const radius = 6;

      // Rounded-rect background
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(zone.x - labelW / 2, labelY, labelW, labelH, radius);
      ctx.fill();

      // Text
      ctx.fillStyle = zone.color;
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, zone.x, labelY + labelH / 2 + 4);
    };

    const drawWorker = (agent: Agent, time: number) => {
      const bob = agent.isWorking ? Math.sin(time / 300) * 2 : Math.sin(time / 500) * 1.5;

      // Resolve avatar base key: agent.avatar field wins, then fallback map, then cycle
      const agentIndex = parseInt(agent.id.replace(/\D/g, '') || '0') % 3;
      const baseKey: string =
        (agent.avatar && (agent.avatar in sprites || (agent.avatar + 'Sheet') in AVATAR_SHEET_MAP || agent.avatar in AVATAR_SHEET_MAP))
          ? agent.avatar
          : (AGENT_AVATAR_SPRITE[agent.id]
              ?? ['avatar1', 'avatar2', 'avatar3'][agentIndex]);

      // Try to use the directional sprite sheet
      const sheetKey = AVATAR_SHEET_MAP[baseKey];
      const sheetImg = sheetKey ? sprites[sheetKey] : null;
      const fallbackImg = sprites[baseKey];
      const direction: SpriteDirection = agent.direction || 'front';

      // Avatar size -- rendered at AVATAR_PX
      const avW = AVATAR_PX;
      const avH = AVATAR_PX;

      // Position avatar to the RIGHT of the desk sprite
      const AVATAR_OFFSET_X = 44;
      const avX = Math.round(agent.x + AVATAR_OFFSET_X);
      const avY = Math.round(agent.y - avH / 2 + bob);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(avX + avW / 2, avY + avH + 2, avW * 0.4, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      let drawn = false;

      // Directional sprite sheet: slice the correct cell from the 3x3 grid
      if (sheetImg && sheetImg.complete && sheetImg.naturalWidth > 0) {
        const grid = DIRECTION_GRID[direction];
        const cellW = sheetImg.naturalWidth / 3;
        const cellH = sheetImg.naturalHeight / 3;
        const sx = grid.col * cellW;
        const sy = grid.row * cellH;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheetImg, sx, sy, cellW, cellH, avX, avY, avW, avH);
        ctx.imageSmoothingEnabled = true;
        drawn = true;
      }

      // Fallback to single static sprite
      if (!drawn && fallbackImg && fallbackImg.complete && fallbackImg.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fallbackImg, avX, avY, avW, avH);
        ctx.imageSmoothingEnabled = true;
        drawn = true;
      }

      // Ultimate fallback: colored shape
      if (!drawn) {
        ctx.fillStyle = agent.color + '60';
        ctx.beginPath();
        ctx.arc(avX + avW / 2, avY + avH * 0.3, avW * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(avX + avW * 0.2, avY + avH * 0.55, avW * 0.6, avH * 0.4);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(avW * 0.3)}px sans-serif`;
        ctx.textAlign = 'center';
        const initials = agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        ctx.fillText(initials, avX + avW / 2, avY + avH * 0.35);
      }

      // Name tag below avatar
      const tagY = avY + avH + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(avX, tagY, avW, 15);
      ctx.fillStyle = '#fff';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.name, avX + avW / 2, tagY + 10);

      // Status dot -- top-right corner of avatar
      const statusColor = agent.targetX !== undefined ? '#feca57'
        : agent.isWorking ? '#ff6b6b' : '#1dd1a1';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(avX + avW, avY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Task dot -- top-left
      if (agent.currentTask) {
        ctx.fillStyle = '#feca57';
        ctx.beginPath();
        ctx.arc(avX, avY + 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawConnections = () => {
      const ceo = agents.find(a => a.id === 'ceo');
      const ops = agents.find(a => a.id === 'ops');

      if (ceo && ops) {
        ctx.strokeStyle = '#ffd70060';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(ceo.x, ceo.y + 50);
        ctx.lineTo(ops.x, ops.y - 60);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    const updateAgents = () => {
      setAgents(prev => prev.map(agent => {
        if (agent.targetX !== undefined && agent.targetY !== undefined) {
          const dx = agent.targetX - agent.x;
          const dy = agent.targetY - agent.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 5) {
            const newX = agent.x + (dx / dist) * 4;
            const newY = agent.y + (dy / dist) * 4;
            const direction = getDirectionFromDelta(dx, dy);

            if (Math.random() > 0.6) {
              setParticles(p => [...p, {
                x: newX, y: newY,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                life: 1,
                color: agent.color
              }]);
            }

            return { ...agent, x: newX, y: newY, direction };
          } else {
            // Arrived -- face front (default idle direction)
            return { ...agent, targetX: undefined, targetY: undefined, direction: 'front' as SpriteDirection };
          }
        }
        return agent;
      }));
    };

    const updateParticles = () => {
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.025 }))
        .filter(p => p.life > 0)
      );
    };

    const render = (time: number) => {
      const { width, height } = dimensionsRef.current;
      ctx.clearRect(0, 0, width, height);

      const zones = calculateZones(width, height);

      // ── Carpet background ────────────────────────────────────────
      const carpetImg = sprites['carpet'];
      if (carpetImg && carpetImg.complete && carpetImg.naturalWidth > 0) {
        // Build pattern lazily (once per context) if not already cached
        if (!carpetPatternRef.current) {
          const TILE = 300;
          const tileH = Math.round(TILE * carpetImg.naturalHeight / carpetImg.naturalWidth);
          const offscreen = document.createElement('canvas');
          offscreen.width = TILE;
          offscreen.height = tileH;
          const octx = offscreen.getContext('2d')!;
          octx.drawImage(carpetImg, 0, 0, TILE, tileH);
          carpetPatternRef.current = ctx.createPattern(offscreen, 'repeat');
        }
        if (carpetPatternRef.current) {
          ctx.fillStyle = carpetPatternRef.current;
          ctx.fillRect(0, 0, width, height);
          // Subtle dark overlay — keep it light so carpet shows through
          ctx.fillStyle = 'rgba(10, 8, 20, 0.25)';
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, width, height);
      }

      // ── Office wall (top border) ──────────────────────────────
      const wallImg = sprites['officeWall'];
      if (wallImg && wallImg.complete && wallImg.naturalWidth > 0) {
        const WALL_H = 110; // display height in px
        const aspectRatio = wallImg.naturalWidth / wallImg.naturalHeight;
        const tileW = Math.round(WALL_H * aspectRatio);
        // Tile the wall horizontally across the full canvas width
        for (let wx = 0; wx < width; wx += tileW) {
          ctx.drawImage(wallImg, wx, 0, tileW, WALL_H);
        }
      }

      // Draw zones with furniture
      // Note: desk sprites already include monitors; only draw monitors on fallback (handled in drawDesk)
      Object.values(zones).forEach(zone => {
        drawDesk(zone);
      });

      drawConnections();

      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      agents.forEach(agent => drawWorker(agent, time));

      // Draw zone labels ON TOP of everything
      Object.values(zones).forEach(zone => {
        if (zone.id !== 'watercooler') {
          drawZoneLabel(zone);
        }
      });

      // (Brand moved to top nav bar)
    };

    const loop = (time: number) => {
      if (!isPaused) {
        if (time - lastTime > 16) {
          updateAgents();
          updateParticles();
          lastTime = time;
        }
      }
      render(time);
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [agents, particles, isPaused, calculateZones, sprites]);

  const togglePause = () => {
    setIsPaused(!isPaused);
    addLogEntry(isPaused ? 'Simulation resumed' : 'Simulation paused');
  };

  const resetOffice = () => {
    const { width, height } = dimensionsRef.current;
    setAgents(resetAgents(width, height));
    setParticles([]);
    setTasks([]);
    addLogEntry('Office reset');
  };

  const handleOnboardingComplete = async () => {
    const name = ceoName || 'You';
    setAgents(prev => prev.map(a =>
      a.id === 'ceo' ? { ...a, name, avatar: ceoSprite } : a
    ));
    setOnboardingDone(true);

    // Persist to backend + auth context
    try {
      const { completeOnboarding } = await import('../api/auth');
      await completeOnboarding(name, ceoSprite);
      markOnboardingDone(name, ceoSprite);
    } catch (err) {
      console.error('Failed to save onboarding:', err);
      // Non-blocking — user can still use the office
    }
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { width, height } = dimensionsRef.current;

    const layout = calculateDeskLayout(desks);
    for (const zone of layout) {
      if (!zone.id) continue;
      const zx = width * zone.x;
      const zy = height * zone.y;
      const hitR = 60; // hover radius around zone centre
      if (Math.abs(mx - zx) < hitR && Math.abs(my - zy) < hitR) {
        const agent = agents.find(a => a.zone === zone.id);
        const assignment = deskAssignments.find(a => a.deskId === zone.id);
        const modelInfo = assignment ? AVAILABLE_MODELS.find(m => m.id === assignment.modelId) : null;
        if (agent || modelInfo) {
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            text: agent ? agent.name : zone.label,
            sub: modelInfo ? modelInfo.name : (zone.id === 'ceo' ? 'CEO' : ''),
          });
          return;
        }
      }
    }
    setTooltip(null);
  }, [desks, agents, deskAssignments]);

  return (
    <div className="office-canvas-container">
      <div className="office-frame-wrapper">
        <div className="office-frame-watermark" />
        <div className="office-frame">
          <canvas ref={canvasRef} className="office-canvas"
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />
        </div>
      </div>

      {/* Canvas hover tooltip */}
      {tooltip && (
        <div className="canvas-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          <div className="canvas-tooltip-name">{tooltip.text}</div>
          {tooltip.sub && <div className="canvas-tooltip-model">{tooltip.sub}</div>}
        </div>
      )}

      {/* Onboarding Modal */}
      {!onboardingDone && (
        <div className="onboarding-overlay">
          <div className="onboarding-modal">
            <img
              className="onboarding-logo"
              src="/assets/office-logo.png"
              alt="Agent Desk"
              width={140}
              height={130}
            />
            <h1>Welcome to Agent Desk</h1>
            <p className="onboarding-subtitle">Your AI-powered virtual office</p>

            <div className="onboarding-section">
              <label>What should we call you?</label>
              <input
                type="text"
                className="onboarding-input"
                value={ceoName}
                onChange={e => setCeoName(e.target.value)}
                placeholder="Your name"
                maxLength={24}
                autoFocus
              />
            </div>

            <div className="onboarding-section">
              <label>Pick your character</label>
              <div className="sprite-picker">
                {(['avatar1', 'avatar2', 'avatar3'] as const).map((key, i) => (
                  <button
                    key={key}
                    className={`sprite-option${ceoSprite === key ? ' selected' : ''}`}
                    onClick={() => setCeoSprite(key)}
                    title={`Character ${i + 1}`}
                  >
                    <img
                      src={`/assets/avatar-0${i + 1}.png`}
                      alt={`Character ${i + 1}`}
                      width={72}
                      height={72}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <button
              className="onboarding-enter-btn"
              onClick={handleOnboardingComplete}
              disabled={!ceoName.trim()}
            >
              Enter the Office →
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div className={`top-nav${!onboardingDone ? ' nav-disabled' : ''}`}>
        <div className="top-nav-brand">
          <img src="/assets/office-logo.png" alt="Agent Desk" className="top-nav-logo" />
          <span className="top-nav-title">Agent Desk</span>
        </div>
        <button disabled={!onboardingDone} onClick={() => setShowTaskForm(true)}>New Task</button>
        <button disabled={!onboardingDone} onClick={() => setShowMeetingRoom(true)}>Meeting Room</button>
        <button disabled={!onboardingDone} onClick={openHireWizard}>Hire Agent</button>
        <button disabled={!onboardingDone} onClick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
        <button disabled={!onboardingDone} onClick={resetOffice}>Reset</button>
        <div className={`user-icon${!onboardingDone ? ' disabled' : ''}`} onClick={() => onboardingDone && setShowAccountSettings(true)} title="Account Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>

      <div className="left-sidebar">
        {/* Live Task Feed */}
        <div className="ui-panel task-feed-panel">
          <div className="task-feed-header" onClick={() => setShowFeedPanel(true)} style={{ cursor: 'pointer' }}>
            <h3>Live Feed</h3>
            <span className="task-feed-count">
              {tasks.filter(t => t.status === 'in-progress').length > 0 && (
                <span className="pulse-dot" />
              )}
              {tasks.filter(t => t.status === 'in-progress').length} active
              {tasks.length > 0 && (
                <button className="feed-clear-btn" onClick={(e) => { e.stopPropagation(); clearTasks(); }}>Clear</button>
              )}
            </span>
          </div>

          <div className="feed-tasks-scroll">
            {/* Active tasks with controls */}
            {tasks.filter(t => t.status === 'in-progress').length > 0 && (
              <div className="active-tasks-feed">
                {tasks.filter(t => t.status === 'in-progress').map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  return (
                    <div key={task.id} className="feed-task active">
                      <div className="feed-task-header">
                        <span className="feed-task-status running">Running</span>
                        <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-model">{task.modelUsed}</div>
                      <div className="feed-task-elapsed">
                        {Math.round((Date.now() - task.createdAt) / 1000)}s elapsed
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Failed tasks */}
            {tasks.filter(t => t.status === 'failed').length > 0 && (
              <div className="failed-tasks-feed">
                {tasks.filter(t => t.status === 'failed').slice(-3).reverse().map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  return (
                    <div key={task.id} className="feed-task failed">
                      <div className="feed-task-header">
                        <span className="feed-task-status error">Failed</span>
                        <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                        <button className="feed-task-delete" onClick={() => removeTask(task.id)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-error">{task.errorMessage || 'Unknown error'}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed tasks */}
            {tasks.filter(t => t.status === 'completed').length > 0 && (
              <div className="completed-tasks-feed">
                {tasks.filter(t => t.status === 'completed').slice(-5).reverse().map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  const hasResult = !!taskResults[task.id];
                  return (
                    <div key={task.id} className={`feed-task completed${hasResult ? ' has-result' : ''}`}
                         onClick={() => hasResult && setViewingTaskResult(task.id)}>
                      <div className="feed-task-header">
                        <span className="feed-task-status done">Done</span>
                        <span className="feed-task-cost">${task.cost?.toFixed(4) || '---'}</span>
                        <button className="feed-task-delete" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-meta">
                        <span>{agent?.name}</span>
                        <span>{task.modelUsed}</span>
                      </div>
                      {hasResult && (
                        <div className="feed-task-view">Click to view result</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tasks.length === 0 && (
              <div className="feed-empty">No tasks yet — assign one to get started</div>
            )}
          </div>

          {tasks.length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '10px', color: '#888', textAlign: 'center', cursor: 'pointer' }} onClick={() => setShowFeedPanel(true)}>
              Click to expand
            </div>
          )}

          {/* Activity log */}
          <div className="activity-log">
            <div className="activity-log-header" onClick={() => setShowWhiteboard(true)} style={{ cursor: 'pointer' }}>
              Activity Log
            </div>
            <div className="task-log">
              {taskLog.slice(0, 8).map((entry, i) => (
                <div key={i} className="task-entry">{entry}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="stats-panel" onClick={() => setShowCostPanel(true)} style={{ cursor: 'pointer' }}>
          <h3>Active: {tasks.filter(t => t.status === 'in-progress').length} | Done: {tasks.filter(t => t.status === 'completed').length}</h3>
          <h3>Agents: {agents.filter(a => a.id !== 'ceo').length}</h3>
          <div className="cost-summary">
            <h3>Today's Cost</h3>
            <div className="cost-amount">${todayApiCost.toFixed(4)}</div>
            <div className="cost-breakdown">
              <span>API costs today</span>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
            Click for cost dashboard
          </div>
        </div>

      </div>

      <div className="right-sidebar">
        <div className="agents-panel">
          <h3>Team</h3>
          <div className="agents-grid">
            {agents.filter(a => a.id !== 'ceo').map(agent => (
              <div key={agent.id} className={`agent-mini-desk ${agent.isWorking ? 'working' : ''}`}>
                <div className="mini-desk">
                  <div className="mini-monitor"></div>
                  <div className="mini-status" style={{ background: agent.isWorking ? '#1dd1a1' : '#666' }}></div>
                </div>
                <div className="agent-info">
                  <span className="agent-initials">{agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</span>
                  <span className="agent-name-short">{agent.name.split(' ')[0]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rules-panel" onClick={() => { setActiveTab('rules'); setShowWhiteboard(true); }}>
          <h3>Rules</h3>
          <div className="rules-count">{whiteboardNotes.rules?.length || 0} active</div>
          <div className="rules-preview">
            {whiteboardNotes.rules?.slice(0, 3).map((rule, i) => (
              <div key={i} className="rule-item">• {rule.substring(0, 40)}{rule.length > 40 ? '...' : ''}</div>
            ))}
            {(!whiteboardNotes.rules || whiteboardNotes.rules.length === 0) && (
              <div className="rule-item empty">No rules set</div>
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
            Click to edit
          </div>
        </div>
      </div>

      {showTaskForm && (
        <div className="task-form-overlay">
          <div className="task-form">
            <h2><ClipboardList size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Create New Task</h2>

            <div className="form-group">
              <label>Select Agent:</label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                <option value="">Choose an agent...</option>
                {agents.filter(a => a.id !== 'ceo').map(agent => {
                  const modelId = getModelForAgent(agent.id);
                  const pricing = MODEL_PRICING[modelId];
                  return (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} - {pricing?.name} (~${(pricing ? (pricing.input * 1000 + pricing.output * 500) : 0).toFixed(4)}/task)
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedAgent && (
              <div className="cost-estimate">
                <span><DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Estimated cost: </span>
                <strong>${calculateTaskCost(getModelForAgent(selectedAgent)).toFixed(4)}</strong>
                <span className="cost-model"> ({MODEL_PRICING[getModelForAgent(selectedAgent)]?.name})</span>
              </div>
            )}

            <div className="form-group">
              <label>Task Title:</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Build login API"
              />
            </div>

            <div className="form-group">
              <label>Instructions:</label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe what you want the agent to do..."
                rows={4}
              />
            </div>

            <div className="form-buttons">
              <button onClick={assignTask} disabled={!selectedAgent || !taskTitle}>
                Assign Task
              </button>
              <button onClick={() => setShowTaskForm(false)} className="secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <CostDashboard
        show={showCostPanel}
        onClose={() => setShowCostPanel(false)}
        todayApiCost={costTracker.todayApiCost}
        monthCost={costTracker.monthCost}
        dailyHistory={costTracker.dailyHistory}
        byModel={costTracker.byModel}
        byDesk={costTracker.byDesk}
        alerts={costTracker.alerts}
        connectedProviders={costTracker.connectedProviders}
        isLoading={costTracker.isLoading}
        onRefresh={costTracker.refreshUsage}
        onAcknowledgeAlert={costTracker.acknowledgeAlert}
      />

      {/* Expanded Live Feed */}
      {showFeedPanel && (
        <div className="feed-panel-overlay" onClick={() => setShowFeedPanel(false)}>
          <div className="feed-panel-expanded" onClick={e => e.stopPropagation()}>
            <div className="feed-panel-header">
              <h2><Rss size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Live Feed</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {tasks.length > 0 && (
                  <button className="feed-clear-btn" onClick={clearTasks}>Clear All</button>
                )}
                <button className="close-btn" onClick={() => setShowFeedPanel(false)}><X size={16} /></button>
              </div>
            </div>

            {tasks.filter(t => t.status === 'in-progress').length > 0 && (
              <div className="feed-section">
                <h3>Active ({tasks.filter(t => t.status === 'in-progress').length})</h3>
                {tasks.filter(t => t.status === 'in-progress').map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  return (
                    <div key={task.id} className="feed-task active">
                      <div className="feed-task-header">
                        <span className="feed-task-status running">Running</span>
                        <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-model">{task.modelUsed}</div>
                      <div className="feed-task-elapsed">
                        {Math.round((Date.now() - task.createdAt) / 1000)}s elapsed
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tasks.filter(t => t.status === 'failed').length > 0 && (
              <div className="feed-section">
                <h3>Failed ({tasks.filter(t => t.status === 'failed').length})</h3>
                {tasks.filter(t => t.status === 'failed').map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  return (
                    <div key={task.id} className="feed-task failed">
                      <div className="feed-task-header">
                        <span className="feed-task-status error">Failed</span>
                        <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                        <button className="feed-task-delete" onClick={() => removeTask(task.id)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-error">{task.errorMessage || 'Unknown error'}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {tasks.filter(t => t.status === 'completed').length > 0 && (
              <div className="feed-section">
                <h3>Completed ({tasks.filter(t => t.status === 'completed').length})</h3>
                {tasks.filter(t => t.status === 'completed').map(task => {
                  const agent = agents.find(a => a.id === task.assignee);
                  const hasResult = !!taskResults[task.id];
                  return (
                    <div key={task.id} className={`feed-task completed${hasResult ? ' has-result' : ''}`}
                         onClick={() => { if (hasResult) { setShowFeedPanel(false); setViewingTaskResult(task.id); } }}>
                      <div className="feed-task-header">
                        <span className="feed-task-status done">Done</span>
                        <span className="feed-task-cost">${task.cost?.toFixed(4) || '---'}</span>
                        <button className="feed-task-delete" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="feed-task-title">{task.name}</div>
                      <div className="feed-task-meta">
                        <span>{agent?.name}</span>
                        <span>{task.modelUsed}</span>
                      </div>
                      {hasResult && (
                        <div className="feed-task-view">Click to view result</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tasks.length === 0 && (
              <div className="feed-empty" style={{ padding: '30px', textAlign: 'center' }}>No tasks yet</div>
            )}

            {/* Activity Log */}
            {taskLog.length > 0 && (
              <div className="feed-section feed-activity-log">
                <h3>Activity Log ({taskLog.length})</h3>
                <div className="feed-activity-entries">
                  {taskLog.map((entry, i) => (
                    <div key={i} className="feed-activity-entry">{entry}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Result Viewer */}
      {viewingTaskResult && taskResults[viewingTaskResult] && (
        <div className="task-result-overlay" onClick={() => setViewingTaskResult(null)}>
          <div className="task-result-modal" onClick={e => e.stopPropagation()}>
            <div className="task-result-header">
              <h2>Task Result</h2>
              <button className="close-btn" onClick={() => setViewingTaskResult(null)}><X size={16} /></button>
            </div>
            <div className="task-result-info">
              {(() => {
                const task = tasks.find(t => t.id === viewingTaskResult);
                const agent = task ? agents.find(a => a.id === task.assignee) : null;
                return task ? (
                  <>
                    <div className="result-meta">
                      <span className="result-task-title">{task.name}</span>
                      <span className="result-agent">{agent?.name}</span>
                      <span className="result-model">{task.modelUsed}</span>
                      {task.cost !== undefined && <span className="result-cost">${task.cost.toFixed(4)}</span>}
                    </div>
                    {task.description && <div className="result-description">{task.description}</div>}
                  </>
                ) : null;
              })()}
            </div>
            <div className="task-result-content">
              {parseCodeBlocks(taskResults[viewingTaskResult]).map((seg, i) =>
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Meeting Room — extracted to separate component */}
      <MeetingRoom
        show={showMeetingRoom}
        onClose={() => setShowMeetingRoom(false)}
        agents={agents}
        deskAssignments={deskAssignments}
        setAgents={setAgents}
        setDeskAssignments={setDeskAssignments}
        addLogEntry={addLogEntry}
        updateTodayCost={updateTodayCost}
        getModelForAgent={getModelForAgent}
        calculateZones={calculateZones}
        dimensionsRef={dimensionsRef}
        modelPricing={MODEL_PRICING}
      />

      {/* Whiteboard Modal */}
      {showWhiteboard && (
        <div className="whiteboard-overlay" onClick={() => setShowWhiteboard(false)}>
          <div className="whiteboard" onClick={e => e.stopPropagation()}>
            <div className="whiteboard-header">
              <h2>Strategy Whiteboard</h2>
              <button className="close-x" onClick={() => setShowWhiteboard(false)}>×</button>
            </div>
            
            {/* Tabs */}
            <div className="whiteboard-tabs">
              {['vision', 'goals', 'plans', 'ideas', 'memos', 'rules', 'history'].map(tab => (
                <button
                  key={tab}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab !== 'history' && (
                    <span className="tab-count">{whiteboardNotes[tab]?.length || 0}</span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="whiteboard-canvas">
              {activeTab === 'history' ? (
                <div className="session-history-panel">
                  <div className="history-list">
                    {taskLog.map((entry, i) => (
                      <div key={i} className="history-entry">{entry}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Add new note */}
                  <div className="add-note-area">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder={`Add a new ${activeTab} note...`}
                      className="note-input"
                    />
                    <button 
                      className="post-btn"
                      onClick={() => {
                        if (newNote.trim()) {
                          setWhiteboardNotes(prev => ({
                            ...prev,
                            [activeTab]: [...(prev[activeTab] || []), newNote.trim()]
                          }));
                          setNewNote('');
                        }
                      }}
                      disabled={!newNote.trim()}
                    >
                      Post Note
                    </button>
                  </div>
                  
                  {/* Sticky notes grid */}
                  <div className="sticky-notes-grid">
                    {whiteboardNotes[activeTab]?.map((note, index) => (
                      <div key={index} className="sticky-note">
                        <button 
                          className="delete-btn"
                          onClick={() => {
                            setWhiteboardNotes(prev => ({
                              ...prev,
                              [activeTab]: prev[activeTab].filter((_, i) => i !== index)
                            }));
                          }}
                        >
                          ×
                        </button>
                        <p>{note}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Hire Agent Wizard */}
      {showHireWizard && (
        <HireWizard
          desks={desks}
          deskAssignments={deskAssignments}
          onComplete={completeHireWizard}
          onClose={closeHireWizard}
          onDeskRemoved={async (deskId) => {
            // Delete from backend first
            const assignment = deskAssignments.find(a => a.deskId === deskId);
            if (assignment?.backendDeskId) {
              try {
                await deleteDesk(assignment.backendDeskId);
              } catch (err) {
                console.error('Failed to delete desk from backend:', err);
              }
            }
            setDesks(prev => prev.filter(d => d.id !== deskId));
            setDeskAssignments(prev => prev.filter(a => a.deskId !== deskId));
            setAgents(prev => prev.filter(a => a.zone !== deskId));
          }}
        />
      )}

      {/* Account Settings Modal (with logout + delete account) */}
      <AccountSettingsModal
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
      />

      {/* Office Footer */}
      <div className="office-footer">
        <a href="#">Documentation</a>
        <div className="footer-divider" />
        <a href="#">Contact</a>
        <div className="footer-divider" />
        <a href="#">Licence</a>
        <div className="footer-divider" />
        <a href="#">Privacy Policy</a>
        <div className="footer-divider" />
        <a href="#">Terms of Service</a>
        <span className="footer-brand">Agent Desk v1.0</span>
      </div>
    </div>
  );
};

export default OfficeCanvas;
