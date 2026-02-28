import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './OfficeCanvas.css';
import HireWizard from './modals/HireWizard';
import { AccountSettingsModal } from './modals/AccountSettingsModal';
import { listDesks, createDesk, deleteDesk, updateDesk, addModelToDesk, removeModelFromDesk, setPrimaryModel } from '../api/desks';
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
import { ClipboardList, DollarSign, X, Trash2, Rss, Download, Rocket, Briefcase, Palette, Settings, MessageCircle, Sparkles, ChevronDown, LayoutDashboard, Sun, Moon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { downloadCodeBlock, downloadAsMarkdown } from '../utils/download';
import { friendlyError } from '../utils/friendlyErrors';
import UpgradePrompt from './modals/UpgradePrompt';
import { classifyTask, recordRoutingDecision } from '../api/routing';
import type { RoutingDeskScore } from '../api/routing';
import { createCheckoutSession } from '../api/stripe';
import { validateName } from '../utils/profanityFilter';
import RulesDashboard from './modals/RulesDashboard';
import RoutingInsightsModal from './modals/RoutingInsightsModal';
import AgentChat from './AgentChat';
import { getAgentMemories } from '../api/memory';
import DashboardView from './DashboardView';
import { listRules } from '../api/rules';
import { CORE_RULES_PRESETS } from '../utils/coreRulesPresets';
import type { PlanTier } from '../utils/tierConfig';
import ApiKeyDetectInput from './ui/ApiKeyDetectInput';
import type { DetectedProvider } from './ui/ApiKeyDetectInput';

// Meeting types moved to MeetingRoom.tsx

// Icon map for core rules presets (Lucide icon name → component)
const PRESET_ICONS: Record<string, LucideIcon> = {
  Rocket, Briefcase, Palette, Settings, MessageCircle,
};

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
  const { user, markOnboardingDone, refreshUser } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carpetPatternRef = useRef<CanvasPattern | null>(null);
  const mountedRef = useRef(false);
  const desksLoadedRef = useRef(false);
  const [sprites, setSprites] = useState<Record<string, HTMLImageElement>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [viewingTaskResult, setViewingTaskResult] = useState<string | null>(null);
  const [viewingFailedTask, setViewingFailedTask] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [routingSuggestions, setRoutingSuggestions] = useState<RoutingDeskScore[] | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingDismissed, setRoutingDismissed] = useState(false);
  const routingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [showFeedPanel, setShowFeedPanel] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  // Onboarding state — restore from auth context if already completed
  const [onboardingDone, setOnboardingDone] = useState(user?.onboardingDone ?? false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [onboardingProvider, setOnboardingProvider] = useState<DetectedProvider | null>(null);
  const [showHireNudge, setShowHireNudge] = useState(false);
  const [ceoName, setCeoName] = useState(user?.displayName ?? 'You');
  const [ceoSprite, setCeoSprite] = useState<'avatar1' | 'avatar2' | 'avatar3'>(
    (user?.avatarId as 'avatar1' | 'avatar2' | 'avatar3') ?? 'avatar1'
  );
  const [selectedCorePreset, setSelectedCorePreset] = useState<string>('professional');
  const [onboardingNameError, setOnboardingNameError] = useState('');

  // Sync CEO name/avatar when user profile changes (e.g. settings update)
  useEffect(() => {
    if (onboardingDone && user?.displayName) {
      setCeoName(user.displayName);
      // Also update the CEO agent in the agents array so the canvas redraws
      setAgents(prev => prev.map(a =>
        a.id === 'ceo' ? { ...a, name: user.displayName } : a
      ));
    }
  }, [user?.displayName, onboardingDone]);

  useEffect(() => {
    if (onboardingDone && user?.avatarId) {
      setCeoSprite(user.avatarId as 'avatar1' | 'avatar2' | 'avatar3');
      setAgents(prev => prev.map(a =>
        a.id === 'ceo' ? { ...a, avatar: user.avatarId } : a
      ));
    }
  }, [user?.avatarId, onboardingDone]);

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
  const [settingsTab, setSettingsTab] = useState<'account' | 'billing'>('account');

  // Hire Agent wizard state
  const [showHireWizard, setShowHireWizard] = useState(false);
  // Provider to pre-load into HireWizard (set after onboarding Step 3)
  const [wizardPreloadedProvider, setWizardPreloadedProvider] = useState<DetectedProvider | null>(null);

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
  });
  const [newNote, setNewNote] = useState('');

  // Rules dashboard state
  const [showRulesDashboard, setShowRulesDashboard] = useState(false);
  const [, setRulesCount] = useState(0);
  const [, setRulesPreview] = useState<string[]>([]);
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState(0);
  const [, setCorePresetName] = useState<string | null>(null);

  // Routing insights modal state
  const [showRoutingInsights, setShowRoutingInsights] = useState(false);

  // Advanced dropdown (consolidates Rules, Routing, Whiteboard)
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);

  // View mode toggle: 'office' (pixel canvas) or 'dashboard' (power mode)
  const [viewMode, setViewMode] = useState<'office' | 'dashboard'>(() => {
    try { return (localStorage.getItem('agentdesk-view-mode') as 'office' | 'dashboard') || 'office'; } catch { return 'office'; }
  });

  // Global theme — persisted, applied to document root so all components inherit
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('agentdesk-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    // Office view stays dark always; theme only applies on Dashboard
    const effective = viewMode === 'office' ? 'dark' : theme;
    document.documentElement.setAttribute('data-theme', effective);
    localStorage.setItem('agentdesk-theme', theme);
  }, [theme, viewMode]);

  // Agent chat state (1-on-1 chat panel)
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);

  // Memory indicator state (for office view dots + generation animation)
  const [memoryCountMap, setMemoryCountMap] = useState<Record<string, number>>({});
  const [generatingMemory, setGeneratingMemory] = useState<Record<string, number>>({});

  // ── Memory count fetch (lightweight: limit=1, just need total) ────────
  useEffect(() => {
    if (!onboardingDone || deskAssignments.length === 0) return;
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.allSettled(
        deskAssignments
          .filter(a => a.backendDeskId)
          .map(async (a) => {
            try {
              const result = await getAgentMemories(a.backendDeskId!, 1, 0);
              counts[a.backendDeskId!] = result.total;
            } catch { /* ignore */ }
          })
      );
      setMemoryCountMap(counts);
    };
    fetchCounts();
  }, [onboardingDone, deskAssignments]);

  // Trigger memory animation on an agent avatar (expanding ring + sparkles for 3s)
  const triggerMemoryAnimation = useCallback((localDeskId: string) => {
    setGeneratingMemory(prev => ({ ...prev, [localDeskId]: Date.now() }));
    setTimeout(() => {
      setGeneratingMemory(prev => {
        const next = { ...prev };
        delete next[localDeskId];
        return next;
      });
    }, 3000);
    // Also bump the memory count optimistically
    const assignment = deskAssignments.find(a => a.deskId === localDeskId);
    if (assignment?.backendDeskId) {
      setMemoryCountMap(prev => ({
        ...prev,
        [assignment.backendDeskId!]: (prev[assignment.backendDeskId!] ?? 0) + 1,
      }));
    }
  }, [deskAssignments]);

  // Upgrade prompt state (shown when user hits a tier limit)
  const [upgradePrompt, setUpgradePrompt] = useState<{
    limitType: string;
    plan: PlanTier;
    current: number;
    max: number;
  } | null>(null);

  // Checkout return toast state
  const [checkoutToast, setCheckoutToast] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);

  // Handle Stripe checkout return (?checkout=success or ?checkout=canceled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    if (!checkoutStatus) return;

    // Clean URL params immediately
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    window.history.replaceState({}, '', url.pathname + url.search);

    if (checkoutStatus === 'success') {
      setCheckoutToast({ type: 'success', message: 'Welcome to Pro! Your subscription is active.' });

      // Webhook may not have fired yet — poll refreshUser for up to 10s
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          await refreshUser();
        } catch { /* ignore */ }
        if (attempts >= 5) clearInterval(poll);
      }, 2000);

      // Cleanup
      return () => clearInterval(poll);
    } else if (checkoutStatus === 'canceled') {
      setCheckoutToast({ type: 'canceled', message: 'Checkout canceled — you can upgrade anytime.' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss checkout toast
  useEffect(() => {
    if (!checkoutToast) return;
    const timer = setTimeout(() => setCheckoutToast(null), 8000);
    return () => clearTimeout(timer);
  }, [checkoutToast]);

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
            avatarId: bd.avatar_id || 'avatar1',
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

  // ── Rules summary (for sidebar panel) ──────────────────────

  const loadRulesSummary = useCallback(async () => {
    try {
      const result = await listRules();
      const activeTeam = result.team.filter(r => r.status === 'active');
      const activeDesk = Object.values(result.desk).flat().filter(r => r.status === 'active');
      setRulesCount(activeTeam.length + activeDesk.length);
      setRulesPreview(activeTeam.slice(0, 3).map(r => r.title));
      setPendingSuggestionsCount(result.pending.length);
      setCorePresetName(result.corePreset?.name ?? null);
    } catch { /* ignore on initial load */ }
  }, []);

  useEffect(() => {
    if (onboardingDone) loadRulesSummary();
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
    setWizardPreloadedProvider(null);
  }, []);

  const completeHireWizard = useCallback(async (data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
    deskType: 'mini' | 'standard' | 'power';
    deskCategory?: string;
    deskCapabilities?: string[];
    deskDescription?: string;
    systemPrompt?: string;
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
        category: data.deskCategory,
        capabilities: data.deskCapabilities,
        description: data.deskDescription,
        systemPrompt: data.systemPrompt,
      });
      backendDeskId = backendDesk.id;
    } catch (err: unknown) {
      // Check for tier limit 403 — show upgrade prompt instead of generic error
      const obj = err && typeof err === 'object' ? err as Record<string, unknown> : null;
      if (obj && obj.status === 403 && typeof obj.message === 'string' && obj.message.includes('limit')) {
        const body = typeof obj.body === 'object' && obj.body ? obj.body as Record<string, unknown> : obj;
        setUpgradePrompt({
          limitType: (body.limitType as string) || 'desks',
          plan: (body.plan as PlanTier) || 'free',
          current: (body.current as number) || 0,
          max: (body.max as number) || 0,
        });
        return;
      }
      console.error('Failed to save desk to backend:', err);
      addLogEntry(`Failed to create desk — check your connection`);
      return;
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
      avatarId: data.avatar,
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

  // ── Debounced routing suggestion trigger ──────────────────
  const triggerRouting = useCallback((title: string, desc: string) => {
    if (routingTimerRef.current) clearTimeout(routingTimerRef.current);
    setRoutingSuggestions(null);
    setRoutingDismissed(false);

    if (title.trim().length < 5) return;

    routingTimerRef.current = setTimeout(async () => {
      setRoutingLoading(true);
      try {
        const result = await classifyTask({
          title,
          description: desc || undefined,
          isCodeTask: isCodeRelatedTask(title, desc),
        });
        if (result.suggestions.length > 0) {
          setRoutingSuggestions(result.suggestions);
        }
      } catch {
        // Silently fail — routing suggestions are optional
      } finally {
        setRoutingLoading(false);
      }
    }, 800);
  }, []);

  // Cleanup routing timer on unmount
  useEffect(() => {
    return () => {
      if (routingTimerRef.current) clearTimeout(routingTimerRef.current);
    };
  }, []);

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

    // Fire-and-forget: record routing decision
    const topSuggestion = routingSuggestions?.[0];
    if (topSuggestion) {
      const routingDecision = topSuggestion.deskId === assignment?.backendDeskId ? 'accepted' : 'modified';
      recordRoutingDecision({
        taskTitle: capturedTitle,
        taskDescription: capturedDesc,
        suggestedDeskId: topSuggestion.deskId,
        suggestedModelId: topSuggestion.modelId,
        confidence: topSuggestion.confidence,
        reasoning: topSuggestion.reasoning,
        decision: routingDecision,
        finalDeskId: backendDeskId || undefined,
        finalModelId: modelId,
        matchedRules: topSuggestion.matchedRuleIds,
      }).catch(() => {}); // fire-and-forget
    }

    setShowTaskForm(false);
    setTaskTitle('');
    setTaskDescription('');
    setSelectedAgent('');
    setRoutingSuggestions(null);
    setRoutingDismissed(false);

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
          ? { ...t, status: 'completed', completedAt: Date.now(), cost: result.costUsd, modelUsed: MODEL_PRICING[result.model]?.name || result.model, backendId: backendTask.id }
          : t
      ));

      updateTodayCost(result.costUsd);
      addLogEntry(`${agentName} completed "${capturedTitle}" — $${result.costUsd.toFixed(4)} (${result.latencyMs}ms)`);

      // Store the AI result for display
      setTaskResults(prev => ({ ...prev, [localTask.id]: result.result }));

      // Trigger memory animation on the agent avatar (task memory being generated)
      const taskDeskId = capturedAgent.replace('agent-', '');
      triggerMemoryAnimation(taskDeskId);

      // Refresh rules summary after a delay (AI may suggest new rules after task completion)
      setTimeout(() => loadRulesSummary(), 6000);

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
    } catch (err: unknown) {
      // Check for tier limit 403 — show upgrade prompt
      const errObj = err && typeof err === 'object' ? err as Record<string, unknown> : null;
      if (errObj && errObj.status === 403 && typeof errObj.message === 'string' && errObj.message.includes('limit')) {
        setUpgradePrompt({
          limitType: (errObj.limitType as string) || 'concurrentTasks',
          plan: (errObj.plan as PlanTier) || 'free',
          current: (errObj.current as number) || 0,
          max: (errObj.max as number) || 0,
        });
        // Revert the local task to pending so user can retry
        setTasks(prev => prev.map(t =>
          t.id === localTask.id ? { ...t, status: 'pending' as const } : t
        ));
        setAgents(prev => prev.map(a =>
          a.id === capturedAgent ? { ...a, currentTask: undefined, isWorking: false } : a
        ));
        return;
      }

      // Extract message from Error instances, ApiError plain objects, or strings
      let raw = '';
      if (err instanceof Error) {
        raw = err.message;
      } else if (typeof err === 'string') {
        raw = err;
      } else if (err && typeof err === 'object') {
        const obj = err as Record<string, unknown>;
        if (typeof obj.message === 'string') raw = obj.message;
        else if (typeof obj.error === 'string') raw = obj.error;
        else if (typeof obj.details === 'string') raw = obj.details;
        else raw = JSON.stringify(err);
      }
      if (!raw) raw = 'Something went wrong. Please try again.';
      console.error('Task error:', err);
      const errMsg = friendlyError(raw);
      setTasks(prev => prev.map(t =>
        t.id === localTask.id ? { ...t, status: 'failed' as const, completedAt: Date.now(), errorMessage: errMsg } : t
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
  }, [selectedAgent, taskTitle, taskDescription, agents, deskAssignments, addLogEntry, getModelForAgent, calculateZones, updateTodayCost, routingSuggestions]);

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

      // Memory dot -- bottom-right (static purple indicator if agent has memories)
      const localDeskId = agent.id.replace('agent-', '');
      const agentAssignment = deskAssignments.find(a => a.deskId === localDeskId);
      const memCount = agentAssignment?.backendDeskId ? (memoryCountMap[agentAssignment.backendDeskId] ?? 0) : 0;
      if (memCount > 0 && agent.id !== 'ceo') {
        const memDotX = avX + avW - 2;
        const memDotY = avY + avH - 4;
        const pulse = 0.4 + 0.12 * Math.sin(time / 800);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#a29bfe';
        ctx.beginPath();
        ctx.arc(memDotX, memDotY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(memDotX, memDotY, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // "Generating memory" animation -- expanding purple ring + sparkles (3s)
      const memGenStart = generatingMemory[localDeskId];
      if (memGenStart) {
        const elapsed = Date.now() - memGenStart;
        const progress = Math.min(elapsed / 3000, 1);
        const fadeOut = Math.max(0, 1 - progress);

        const cx = avX + avW / 2;
        const cy = avY + avH / 2;
        const ringRadius = (avW / 2) + 4 + progress * 8;

        ctx.save();
        // Expanding ring
        ctx.globalAlpha = fadeOut * 0.6;
        ctx.strokeStyle = '#a29bfe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Sparkle particles rising upward
        for (let i = 0; i < 3; i++) {
          const particleY = cy - (progress * 20) - i * 6;
          const particleX = cx + Math.sin((elapsed / 200) + i * 2) * 8;
          ctx.globalAlpha = fadeOut * (0.8 - i * 0.2);
          ctx.fillStyle = '#a29bfe';
          ctx.beginPath();
          ctx.arc(particleX, particleY, 2 - i * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
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

      // ── Ornate frame border (left, right, bottom only) ────────────
      // No top frame — the office wall tiles handle the top edge.
      const FRAME = 18; // total frame thickness (px)

      ctx.save();

      // Helper: draw a U-shaped path (left, bottom, right — no top)
      const uPath = (inset: number) => {
        ctx.beginPath();
        ctx.moveTo(inset, 0);             // top of left edge
        ctx.lineTo(inset, height - inset); // down left side
        ctx.lineTo(width - inset, height - inset); // across bottom
        ctx.lineTo(width - inset, 0);     // up right side
      };

      // Outer dark edge (thick base)
      uPath(FRAME / 2);
      ctx.strokeStyle = '#0a0a14';
      ctx.lineWidth = FRAME;
      ctx.stroke();

      // Raised outer ridge
      uPath(2);
      ctx.strokeStyle = '#3a3552';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Outer groove shadow
      uPath(4);
      ctx.strokeStyle = '#1a1528';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Main body gradient strips (bottom, left, right — no top)

      // Bottom strip
      const bGrad = ctx.createLinearGradient(0, height - FRAME, 0, height);
      bGrad.addColorStop(0, '#1a1528');
      bGrad.addColorStop(0.3, '#241f38');
      bGrad.addColorStop(0.5, '#2e2848');
      bGrad.addColorStop(0.7, '#3d3560');
      bGrad.addColorStop(1, '#2a2440');
      ctx.fillStyle = bGrad;
      ctx.fillRect(6, height - FRAME + 4, width - 12, FRAME - 10);

      // Left strip (full height — runs from top to bottom frame)
      const lGrad = ctx.createLinearGradient(0, 0, FRAME, 0);
      lGrad.addColorStop(0, '#2a2440');
      lGrad.addColorStop(0.3, '#3d3560');
      lGrad.addColorStop(0.5, '#2e2848');
      lGrad.addColorStop(0.7, '#241f38');
      lGrad.addColorStop(1, '#1a1528');
      ctx.fillStyle = lGrad;
      ctx.fillRect(6, 0, FRAME - 10, height - FRAME);

      // Right strip (full height)
      const rGrad = ctx.createLinearGradient(width - FRAME, 0, width, 0);
      rGrad.addColorStop(0, '#1a1528');
      rGrad.addColorStop(0.3, '#241f38');
      rGrad.addColorStop(0.5, '#2e2848');
      rGrad.addColorStop(0.7, '#3d3560');
      rGrad.addColorStop(1, '#2a2440');
      ctx.fillStyle = rGrad;
      ctx.fillRect(width - FRAME + 4, 0, FRAME - 10, height - FRAME);

      // Inner highlight ridge (U-shaped)
      uPath(FRAME - 2);
      ctx.strokeStyle = '#4a4270';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner shadow line (U-shaped)
      uPath(FRAME);
      ctx.strokeStyle = '#0d0b18';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Subtle inner glow (U-shaped)
      uPath(FRAME + 1);
      ctx.strokeStyle = 'rgba(100, 80, 160, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Corner accents — bottom corners only (no top corners)
      const CA = 6;
      ctx.fillStyle = '#4a4270';
      ctx.fillRect(2, height - CA - 2, CA, CA);               // bottom-left
      ctx.fillRect(width - CA - 2, height - CA - 2, CA, CA);  // bottom-right

      ctx.fillStyle = '#5d5588';
      ctx.fillRect(3, height - CA - 1, CA - 2, CA - 2);
      ctx.fillRect(width - CA - 1, height - CA - 1, CA - 2, CA - 2);

      ctx.restore();

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

    // Persist to backend + auth context (including core rules preset)
    try {
      const { completeOnboarding } = await import('../api/auth');
      await completeOnboarding(name, ceoSprite, selectedCorePreset);
      markOnboardingDone(name, ceoSprite);
    } catch (err) {
      console.error('Failed to save onboarding:', err);
      // Non-blocking — user can still use the office
    }

    // Auto-launch Hire Agent wizard with the onboarding provider pre-loaded
    // so the user picks a model, names an agent, and sets up their first desk
    if (onboardingProvider) {
      setWizardPreloadedProvider(onboardingProvider);
      setShowHireWizard(true);
    } else {
      // User skipped Step 3 — nudge them toward Hire Agent
      setShowHireNudge(true);
      setTimeout(() => setShowHireNudge(false), 8000);
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
      <div className="office-frame-wrapper" data-theme="dark" style={{ display: viewMode === 'office' ? undefined : 'none' }}>
        <div className="office-frame-watermark" />
        <div className="office-frame">
          <canvas ref={canvasRef} className="office-canvas"
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />
        </div>
      </div>

      {/* Canvas hover tooltip */}
      {viewMode === 'office' && tooltip && (
        <div className="canvas-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          <div className="canvas-tooltip-name">{tooltip.text}</div>
          {tooltip.sub && <div className="canvas-tooltip-model">{tooltip.sub}</div>}
        </div>
      )}

      {/* Onboarding Modal — 3-step flow */}
      {!onboardingDone && (
        <div className="onboarding-overlay">
          <div className={`onboarding-modal${onboardingStep === 2 ? ' wide' : ''}${onboardingStep === 3 ? ' medium' : ''}`}>
            {/* Step indicator */}
            <div className="onboarding-steps">
              <div className={`step-dot${onboardingStep >= 1 ? ' active' : ''}`} />
              <div className={`step-line${onboardingStep >= 2 ? ' active' : ''}`} />
              <div className={`step-dot${onboardingStep >= 2 ? ' active' : ''}`} />
              <div className={`step-line${onboardingStep >= 3 ? ' active' : ''}`} />
              <div className={`step-dot${onboardingStep >= 3 ? ' active' : ''}`} />
            </div>

            {onboardingStep === 1 && (
              <>
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
                    onChange={e => { setCeoName(e.target.value); setOnboardingNameError(''); }}
                    placeholder="Your name"
                    maxLength={30}
                    autoFocus
                  />
                  {onboardingNameError && (
                    <p style={{ color: '#ff6b6b', fontSize: 12, margin: '6px 0 0', textAlign: 'center' }}>{onboardingNameError}</p>
                  )}
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
                  onClick={() => {
                    const nameIssue = validateName(ceoName);
                    if (nameIssue) {
                      setOnboardingNameError(nameIssue);
                      return;
                    }
                    setOnboardingStep(2);
                  }}
                  disabled={!ceoName.trim()}
                >
                  Next — Set Core Rules →
                </button>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <h1 style={{ fontSize: 22 }}>Set Your Core Rules</h1>
                <p className="onboarding-subtitle">
                  Choose how your AI agents communicate and work. This shapes every response.
                </p>

                <div className="core-preset-grid">
                  {CORE_RULES_PRESETS.map(preset => {
                    const Icon = PRESET_ICONS[preset.iconName];
                    return (
                      <button
                        key={preset.id}
                        className={`core-preset-card${selectedCorePreset === preset.id ? ' selected' : ''}`}
                        onClick={() => setSelectedCorePreset(preset.id)}
                      >
                        <div className="core-preset-header">
                          <div className="core-preset-icon-wrap">
                            {Icon && <Icon size={18} strokeWidth={1.8} />}
                          </div>
                          <span className="core-preset-name">{preset.name}</span>
                        </div>
                        <p className="core-preset-desc">{preset.description}</p>
                        <ul className="core-preset-rules">
                          {preset.rules.map((rule, i) => (
                            <li key={i}>{rule.title}</li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                  <div className="core-preset-hint-card">
                    <div className="core-preset-hint-icon">
                      <Sparkles size={16} strokeWidth={1.8} />
                    </div>
                    <p>
                      You can change your core rules anytime and create your own global or per-agent rules once inside the office. Core rules set the foundation — custom rules let you fine-tune.
                    </p>
                  </div>
                </div>

                <div className="onboarding-nav">
                  <button
                    className="onboarding-back-btn"
                    onClick={() => setOnboardingStep(1)}
                  >
                    ← Back
                  </button>
                  <button
                    className="onboarding-enter-btn"
                    onClick={() => setOnboardingStep(3)}
                    disabled={!selectedCorePreset}
                  >
                    Next — Connect a Provider →
                  </button>
                </div>
              </>
            )}

            {onboardingStep === 3 && (
              /* ── Step 3: Connect Your First AI Provider ────────── */
              <>
                <h1 style={{ fontSize: 22 }}>Connect Your First AI Provider</h1>
                <p className="onboarding-subtitle">
                  Paste any API key — we'll detect the provider automatically
                </p>

                <ApiKeyDetectInput
                  showHints
                  onDetected={(result) => setOnboardingProvider(result)}
                />

                <div className="onboarding-provider-hint-card">
                  <Sparkles size={14} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  <p>
                    You can add more providers anytime from the Hire Agent wizard. One is enough to get started.
                  </p>
                </div>

                <div className="onboarding-nav">
                  <button
                    className="onboarding-back-btn"
                    onClick={() => setOnboardingStep(2)}
                  >
                    ← Back
                  </button>
                  <button
                    className="onboarding-enter-btn"
                    onClick={handleOnboardingComplete}
                    disabled={!onboardingProvider}
                  >
                    Enter the Office →
                  </button>
                </div>

                <button
                  className="onboarding-skip-btn"
                  onClick={handleOnboardingComplete}
                >
                  Skip for now — I'll add a key later
                </button>
              </>
            )}
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
        <button
          disabled={!onboardingDone}
          className={showHireNudge ? 'hire-nudge-pulse' : ''}
          onClick={() => { setShowHireNudge(false); openHireWizard(); }}
        >
          Hire Agent
        </button>

        {/* View mode + theme toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-toggle-btn${viewMode === 'office' ? ' active' : ''}`}
            disabled={!onboardingDone}
            onClick={() => { setViewMode('office'); localStorage.setItem('agentdesk-view-mode', 'office'); }}>
            Office
          </button>
          <button
            className={`view-toggle-btn${viewMode === 'dashboard' ? ' active' : ''}`}
            disabled={!onboardingDone}
            onClick={() => { setViewMode('dashboard'); localStorage.setItem('agentdesk-view-mode', 'dashboard'); }}>
            <LayoutDashboard size={12} style={{ marginRight: 4 }} />
            Dashboard
          </button>
          {viewMode === 'dashboard' && (
            <button
              className="theme-toggle-btn"
              disabled={!onboardingDone}
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
        </div>

        {/* Advanced dropdown — Rules, Routing, Whiteboard */}
        <div className="advanced-dropdown-wrap" style={{ position: 'relative' }}>
          <button
            disabled={!onboardingDone}
            className={`advanced-toggle-btn${showAdvancedMenu ? ' open' : ''}`}
            onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}>
            Advanced <ChevronDown size={12} style={{ transform: showAdvancedMenu ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
          </button>
          {showAdvancedMenu && (
            <div className="advanced-dropdown" onClick={() => setShowAdvancedMenu(false)}>
              <button onClick={() => setShowRulesDashboard(true)}>
                <ClipboardList size={14} /> Rules Dashboard
                {pendingSuggestionsCount > 0 && (
                  <span className="adv-badge">{pendingSuggestionsCount}</span>
                )}
              </button>
              <button onClick={() => setShowRoutingInsights(true)}>
                <Sparkles size={14} /> Routing Insights
              </button>
              <button onClick={() => setShowWhiteboard(true)}>
                <Palette size={14} /> Whiteboard
              </button>
            </div>
          )}
        </div>

        <button disabled={!onboardingDone} onClick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
        <button disabled={!onboardingDone} onClick={resetOffice}>Reset</button>
        <div className={`user-icon${!onboardingDone ? ' disabled' : ''}`} onClick={() => onboardingDone && setShowAccountSettings(true)} title="Account Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>

      {/* Hire Agent nudge toast — shown when user skips Step 3 */}
      {showHireNudge && (
        <div className="hire-nudge-toast">
          <span>When you're ready, add your first API key here →</span>
          <button onClick={() => setShowHireNudge(false)}>✕</button>
        </div>
      )}

      {/* Checkout return toast */}
      {checkoutToast && (
        <div className={`checkout-toast checkout-toast-${checkoutToast.type}`}>
          <span>{checkoutToast.type === 'success' ? '🎉' : 'ℹ️'} {checkoutToast.message}</span>
          <button onClick={() => setCheckoutToast(null)}>✕</button>
        </div>
      )}

      <div className="left-sidebar" data-theme="dark" style={{ display: viewMode === 'office' ? undefined : 'none' }}>
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

          <div className="feed-tasks-scroll" onClick={() => setShowFeedPanel(true)}>
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

            {/* Completed & failed tasks — most recent first */}
            {tasks.filter(t => t.status === 'completed' || t.status === 'failed').length > 0 && (
              <div className="finished-tasks-feed">
                {[...tasks.filter(t => t.status === 'completed' || t.status === 'failed')]
                  .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))
                  .slice(0, 8)
                  .map(task => {
                    const agent = agents.find(a => a.id === task.assignee);
                    if (task.status === 'failed') {
                      return (
                        <div key={task.id} className="feed-task failed has-result"
                             onClick={() => setViewingFailedTask(task.id)}
                             style={{ cursor: 'pointer' }}>
                          <div className="feed-task-header">
                            <span className="feed-task-status error">Failed</span>
                            <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                            <button className="feed-task-delete" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                          <div className="feed-task-title">{task.name}</div>
                          <div className="feed-task-error">{task.errorMessage || 'Something went wrong. Check your API key and billing.'}</div>
                          <div className="feed-task-view">Click to view details</div>
                        </div>
                      );
                    }
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
          <div className="activity-log" onClick={() => setShowFeedPanel(true)} style={{ cursor: 'pointer' }}>
            <div className="activity-log-header">
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

      <div className="right-sidebar" data-theme="dark" style={{ display: viewMode === 'office' ? undefined : 'none' }}>
        <div className="agents-panel">
          <h3>Team</h3>
          <div className="agents-grid">
            {agents.filter(a => a.id !== 'ceo').map(agent => (
              <div
                key={agent.id}
                className={`agent-mini-desk ${agent.isWorking ? 'working' : ''}`}
                onClick={() => setChatAgent(agent)}
                title={`Chat with ${agent.name}`}
              >
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

        {/* Rules and Routing Insights moved to Advanced dropdown in toolbar */}
      </div>

      {/* Power Mode Dashboard */}
      {viewMode === 'dashboard' && (
        <DashboardView
          agents={agents}
          tasks={tasks}
          deskAssignments={deskAssignments}
          todayApiCost={todayApiCost}
          taskLog={taskLog}
          taskResults={taskResults}
          theme={theme}
          memoryCountMap={memoryCountMap}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          onAgentClick={(agent) => setChatAgent(agent)}
          onCreateTask={() => setShowTaskForm(true)}
          onOpenCostPanel={() => setShowCostPanel(true)}
          onViewTaskResult={(taskId) => setViewingTaskResult(taskId)}
          onViewFailedTask={(taskId) => setViewingFailedTask(taskId)}
          onRemoveTask={(taskId) => removeTask(taskId)}
        />
      )}

      {showTaskForm && (
        <div className="task-form-overlay">
          <div className="task-form">
            <h2><ClipboardList size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Create New Task</h2>

            <div className="form-group">
              <label>Task Title:</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => {
                  setTaskTitle(e.target.value);
                  triggerRouting(e.target.value, taskDescription);
                }}
                placeholder="e.g., Build login API"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Instructions:</label>
              <textarea
                value={taskDescription}
                onChange={(e) => {
                  setTaskDescription(e.target.value);
                  triggerRouting(taskTitle, e.target.value);
                }}
                placeholder="Describe what you want the agent to do..."
                rows={3}
              />
            </div>

            {/* ── Routing Suggestion Banner ── */}
            {routingLoading && taskTitle.trim().length >= 5 && (
              <div className="routing-suggestion loading">
                <Sparkles size={14} className="routing-icon spin" />
                <span>Analyzing best desk for this task...</span>
              </div>
            )}

            {routingSuggestions && routingSuggestions.length > 0 && !routingDismissed && (
              <div className="routing-suggestion">
                <div className="routing-header">
                  <Sparkles size={14} className="routing-icon" />
                  <span className="routing-title">Recommended Desk</span>
                </div>
                <div className="routing-main">
                  <div className="routing-desk-name">
                    {routingSuggestions[0].deskName}
                    <span className="routing-agent-name">({routingSuggestions[0].agentName})</span>
                    <span className="routing-confidence">{Math.round(routingSuggestions[0].confidence * 100)}% match</span>
                  </div>
                  <div className="routing-reasoning">{routingSuggestions[0].reasoning}</div>
                  {routingSuggestions[0].estimatedCost > 0 && (
                    <div className="routing-cost">
                      Est. cost: ~${routingSuggestions[0].estimatedCost.toFixed(4)}
                      {routingSuggestions[1] && routingSuggestions[1].estimatedCost > 0 && (
                        <span className="routing-cost-alt"> vs ~${routingSuggestions[1].estimatedCost.toFixed(4)} ({routingSuggestions[1].deskName})</span>
                      )}
                    </div>
                  )}
                </div>
                {routingSuggestions.length > 1 && (
                  <div className="routing-alt">
                    Also suitable: {routingSuggestions[1].deskName} — {Math.round(routingSuggestions[1].confidence * 100)}% match
                  </div>
                )}
                <div className="routing-actions">
                  <button
                    className="routing-accept"
                    onClick={() => {
                      // Find the agent for this desk
                      const suggestion = routingSuggestions[0];
                      const matchedAssignment = deskAssignments.find(a => a.backendDeskId === suggestion.deskId);
                      if (matchedAssignment) {
                        const agentId = `agent-${matchedAssignment.deskId}`;
                        const matchedAgent = agents.find(a => a.id === agentId);
                        if (matchedAgent) {
                          setSelectedAgent(agentId);
                        }
                      }
                      setRoutingDismissed(true);
                    }}>
                    Use this desk
                  </button>
                  <button
                    className="routing-dismiss"
                    onClick={() => setRoutingDismissed(true)}>
                    Choose manually
                  </button>
                </div>
              </div>
            )}

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

            <div className="form-buttons">
              <button onClick={assignTask} disabled={!selectedAgent || !taskTitle}>
                Assign Task
              </button>
              <button onClick={() => { setShowTaskForm(false); setRoutingSuggestions(null); setRoutingDismissed(false); }} className="secondary">
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
                <button className="feed-whiteboard-btn" onClick={() => { setShowFeedPanel(false); setShowWhiteboard(true); }}>Whiteboard</button>
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

            {tasks.filter(t => t.status === 'completed' || t.status === 'failed').length > 0 && (
              <div className="feed-section">
                <h3>Completed & Failed ({tasks.filter(t => t.status === 'completed' || t.status === 'failed').length})</h3>
                {[...tasks.filter(t => t.status === 'completed' || t.status === 'failed')]
                  .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))
                  .map(task => {
                    const agent = agents.find(a => a.id === task.assignee);
                    if (task.status === 'failed') {
                      return (
                        <div key={task.id} className="feed-task failed has-result"
                             onClick={() => setViewingFailedTask(task.id)}
                             style={{ cursor: 'pointer' }}>
                          <div className="feed-task-header">
                            <span className="feed-task-status error">Failed</span>
                            <span className="feed-task-agent">{agent?.name || 'Agent'}</span>
                            <button className="feed-task-delete" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                          <div className="feed-task-title">{task.name}</div>
                          <div className="feed-task-error">{task.errorMessage || 'Something went wrong. Check your API key and billing.'}</div>
                          <div className="feed-task-view">Click to view details</div>
                        </div>
                      );
                    }
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
              <div className="task-result-header-actions">
                <button
                  className="download-response-btn"
                  onClick={() => {
                    const task = tasks.find(t => t.id === viewingTaskResult);
                    downloadAsMarkdown(taskResults[viewingTaskResult!], task?.name || 'task-result');
                  }}
                  title="Download as .md"
                >
                  <Download size={14} />
                  Download
                </button>
                <button className="close-btn" onClick={() => setViewingTaskResult(null)}><X size={16} /></button>
              </div>
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Failed task detail modal */}
      {viewingFailedTask && (() => {
        const failedTask = tasks.find(t => t.id === viewingFailedTask);
        if (!failedTask) return null;
        const failedAgent = agents.find(a => a.id === failedTask.assignee);
        return (
          <div className="task-result-overlay" onClick={() => setViewingFailedTask(null)}>
            <div className="task-result-modal" onClick={e => e.stopPropagation()}>
              <div className="task-result-header">
                <h2>Task Failed</h2>
                <button className="close-btn" onClick={() => setViewingFailedTask(null)}><X size={16} /></button>
              </div>
              <div className="task-result-info">
                <div className="result-meta">
                  <span className="result-task-title">{failedTask.name}</span>
                  <span className="result-agent">{failedAgent?.name || 'Agent'}</span>
                  {failedTask.modelUsed && <span className="result-model">{failedTask.modelUsed}</span>}
                </div>
                {failedTask.description && <div className="result-description">{failedTask.description}</div>}
              </div>
              <div className="task-failed-content">
                <div className="task-failed-icon">!</div>
                <div className="task-failed-message">{failedTask.errorMessage || 'Something went wrong. Check your API key and billing.'}</div>
                <div className="task-failed-hint">
                  Check your API key and billing status in the Hire Agent &gt; Manage tab.
                  If the issue persists, try a different model or provider.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
              {['vision', 'goals', 'plans', 'ideas', 'memos', 'history'].map(tab => (
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
          preloadedProvider={wizardPreloadedProvider}
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
            // Clean up all frontend state
            setDesks(prev => prev.filter(d => d.id !== deskId));
            setDeskAssignments(prev => prev.filter(a => a.deskId !== deskId));
            setAgents(prev => prev.filter(a => a.zone !== deskId));
            setTasks(prev => prev.filter(t => t.assignee !== `agent-${deskId}`));
            setTaskResults(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(taskId => {
                const task = tasks.find(t => t.id === taskId);
                if (task?.assignee === `agent-${deskId}`) delete next[taskId];
              });
              return next;
            });
            if (chatAgent?.zone === deskId) setChatAgent(null);
          }}
          onProviderDisconnected={async (providerId, affectedDeskIds) => {
            // Cascade: delete all affected desks from backend + clean up state
            const affectedAssignments = deskAssignments.filter(a => affectedDeskIds.includes(a.deskId));
            for (const assignment of affectedAssignments) {
              if (assignment.backendDeskId) {
                try {
                  await deleteDesk(assignment.backendDeskId);
                } catch (err) {
                  console.error('Failed to cascade-delete desk:', err);
                }
              }
            }

            // Bulk clean frontend state
            const affectedAgentIds = new Set(affectedDeskIds.map(id => `agent-${id}`));
            setDesks(prev => prev.filter(d => !affectedDeskIds.includes(d.id!)));
            setDeskAssignments(prev => prev.filter(a => !affectedDeskIds.includes(a.deskId)));
            setAgents(prev => prev.filter(a => !affectedDeskIds.includes(a.zone)));
            setTasks(prev => prev.filter(t => !affectedAgentIds.has(t.assignee)));
            setTaskResults(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(taskId => {
                const task = tasks.find(t => t.id === taskId);
                if (task && affectedAgentIds.has(task.assignee)) delete next[taskId];
              });
              return next;
            });
            if (chatAgent && affectedDeskIds.includes(chatAgent.zone)) setChatAgent(null);
            addLogEntry(`Disconnected ${providerId} — removed ${affectedDeskIds.length} desk(s)`);
          }}
          onDeskEdited={async (deskId, changes) => {
            const assignment = deskAssignments.find(a => a.deskId === deskId);

            // Update backend
            if (assignment?.backendDeskId) {
              try {
                await updateDesk(assignment.backendDeskId, {
                  name: changes.deskName,
                  agentName: changes.agentName,
                  avatarId: changes.avatar,
                  deskType: changes.deskType,
                });

                // Handle model change
                if (changes.modelId && changes.modelId !== assignment.modelId) {
                  try {
                    await addModelToDesk(assignment.backendDeskId, changes.modelId);
                    await setPrimaryModel(assignment.backendDeskId, changes.modelId);
                    await removeModelFromDesk(assignment.backendDeskId, assignment.modelId);
                  } catch {
                    // If model swap fails partially, still update frontend
                  }
                }
              } catch (err) {
                console.error('Failed to update desk:', err);
              }
            }

            // Update frontend state
            if (changes.deskName) {
              setDesks(prev => prev.map(d =>
                d.id === deskId ? { ...d, label: changes.deskName! } : d
              ));
            }
            setDeskAssignments(prev => prev.map(a => {
              if (a.deskId !== deskId) return a;
              return {
                ...a,
                ...(changes.modelId && { modelId: changes.modelId }),
                ...(changes.deskName && { customName: changes.deskName }),
                ...(changes.agentName && { agentName: changes.agentName }),
                ...(changes.avatar && { avatarId: changes.avatar }),
                ...(changes.deskType && { deskType: changes.deskType }),
              };
            }));
            setAgents(prev => prev.map(a => {
              if (a.zone !== deskId) return a;
              return {
                ...a,
                ...(changes.agentName && { name: changes.agentName }),
                ...(changes.avatar && { avatar: changes.avatar }),
              };
            }));
            addLogEntry(`Updated desk "${changes.deskName || deskId}"`);
          }}
        />
      )}

      {/* Upgrade prompt (shown when user hits a tier limit) */}
      {upgradePrompt && (
        <UpgradePrompt
          limitType={upgradePrompt.limitType}
          plan={upgradePrompt.plan}
          current={upgradePrompt.current}
          max={upgradePrompt.max}
          onClose={() => setUpgradePrompt(null)}
          onUpgrade={async () => {
            setUpgradePrompt(null);
            try {
              const { checkoutUrl } = await createCheckoutSession('pro', 'upgrade');
              window.location.href = checkoutUrl;
            } catch {
              // Fallback to settings modal if checkout fails
              setSettingsTab('billing');
              setShowAccountSettings(true);
            }
          }}
        />
      )}

      {/* Account Settings Modal (with logout + delete account) */}
      <AccountSettingsModal
        isOpen={showAccountSettings}
        onClose={() => { setShowAccountSettings(false); setSettingsTab('account'); }}
        initialTab={settingsTab}
      />

      <RulesDashboard
        show={showRulesDashboard}
        onClose={() => { setShowRulesDashboard(false); loadRulesSummary(); }}
        desks={deskAssignments.map(a => {
          const agent = agents.find(ag => ag.zone === a.deskId);
          return {
            id: a.backendDeskId || a.deskId,
            name: a.customName || a.deskId,
            agentName: agent?.name || 'Agent',
          };
        })}
      />

      <RoutingInsightsModal
        show={showRoutingInsights}
        onClose={() => setShowRoutingInsights(false)}
      />

      {chatAgent && (
        <AgentChat
          agent={chatAgent}
          deskAssignments={deskAssignments}
          setDeskAssignments={setDeskAssignments}
          getModelForAgent={getModelForAgent}
          updateTodayCost={updateTodayCost}
          addLogEntry={addLogEntry}
          onClose={() => setChatAgent(null)}
          onMemoryGenerated={triggerMemoryAnimation}
          modelPricing={MODEL_PRICING}
        />
      )}

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
