import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './OfficeCanvas.css';
import HireWizard from './modals/HireWizard';
import { AccountSettingsModal } from './modals/AccountSettingsModal';

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
  currentTask?: Task;
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  assignee: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: number;
  cost?: number;
  modelUsed?: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: number;
  isUser: boolean;
}

interface Meeting {
  id: string;
  topic: string;
  participants: string[];
  messages: ChatMessage[];
  startedAt: number;
}

interface Subscription {
  id: string;
  service: string;
  tier: string;
  monthlyCost: number;
  annualCost: number;
  billingCycle: 'monthly' | 'annual';
  nextBillingDate: string;
  features: string[];
  active: boolean;
}

interface DailyCost {
  date: string;
  apiCosts: Record<string, number>;
  totalApi: number;
  subscriptionShare: number;
  total: number;
}

const MODEL_PRICING: Record<string, { input: number; output: number; name: string }> = {
  'gpt-4.1-mini': { input: 0.000005, output: 0.000015, name: 'GPT-4.1 Mini' },
  'gpt-4.1': { input: 0.00002, output: 0.00006, name: 'GPT-4.1' },
  'claude-sonnet-4': { input: 0.00003, output: 0.00015, name: 'Claude Sonnet 4' },
  'claude-opus-4.6': { input: 0.00015, output: 0.00075, name: 'Claude Opus 4.6' },
  'kimi-k2.5': { input: 0.00002, output: 0.00006, name: 'Kimi K2.5' },
  'codex': { input: 0.00003, output: 0.00012, name: 'Codex' },
  'nano-banana': { input: 0.00001, output: 0.00003, name: 'Nano Banana' }
};

const DEFAULT_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'openai',
    service: 'OpenAI',
    tier: 'Plus',
    monthlyCost: 20,
    annualCost: 200,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-15',
    features: ['GPT-4.1', 'GPT-4.1-mini', 'DALL-E'],
    active: true
  },
  {
    id: 'anthropic',
    service: 'Anthropic',
    tier: 'Pro',
    monthlyCost: 20,
    annualCost: 200,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-10',
    features: ['Claude Sonnet 4', 'Claude Opus 4.6'],
    active: true
  },
  {
    id: 'moonshot',
    service: 'Moonshot AI',
    tier: 'Developer',
    monthlyCost: 0,
    annualCost: 0,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-01',
    features: ['Kimi K2.5', 'Kimi K1.5'],
    active: true
  },
  {
    id: 'openclaw',
    service: 'OpenClaw',
    tier: 'Self-Hosted',
    monthlyCost: 0,
    annualCost: 0,
    billingCycle: 'monthly',
    nextBillingDate: 'N/A',
    features: ['Gateway', 'Sub-agents', 'Cron'],
    active: true
  }
];

// Available AI models for desk assignment
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4.6', name: 'Claude Opus', provider: 'anthropic', color: '#d4a5a5' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet', provider: 'anthropic', color: '#a5b4d4' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', color: '#a5d4b4' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', color: '#d4d4a5' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'moonshot', color: '#b4a5d4' },
  { id: 'codex', name: 'Codex', provider: 'openai', color: '#d4a5d4' },
  { id: 'nano-banana', name: 'Nano Banana', provider: 'custom', color: '#feca57' }
];


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

// Desk to model assignments - users configure this
interface DeskAssignment {
  deskId: string;
  modelId: string;
  customName?: string;
}

// AI Provider Connection
interface Connection {
  id: string;
  provider: 'openai' | 'anthropic' | 'moonshot' | 'google' | 'cohere';
  name: string;
  isConnected: boolean;
  apiKeyMasked: string;
  models: string[];
  addedAt: Date;
}

const DEFAULT_ASSIGNMENTS: DeskAssignment[] = [
  { deskId: 'desk1', modelId: 'claude-opus-4.6', customName: 'Research Desk' },
  { deskId: 'desk2', modelId: 'claude-sonnet-4', customName: 'Writing Desk' },
  { deskId: 'desk3', modelId: 'kimi-k2.5', customName: 'Dev Desk' },
  { deskId: 'desk4', modelId: 'gpt-4.1', customName: 'Analysis Desk' },
  { deskId: 'desk5', modelId: 'codex', customName: 'Code Desk' },
  { deskId: 'desk6', modelId: 'nano-banana', customName: 'Creative Desk' }
];

const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '', avatar: 'avatar1', deskOffset: { x: 0, y: 10 }, isWorking: false }
];

// Sprite assets for the office
const SPRITE_ASSETS = {
  carpet: '/assets/carpet.png',
  officeWall: '/assets/office-wall.png',
  deskMini: '/assets/desk-mini.png',
  deskStandard: '/assets/desk-standard.png',
  deskPower: '/assets/desk-boss.png',
  meetingRoom: '/assets/meeting-room.png',
  avatar1: '/assets/avatar-01.png',
  avatar2: '/assets/avatar-02.png',
  avatar3: '/assets/avatar-03.png',
};

// Which desk sprite to use for each zone id
// agent desks cycle: desk1/2→mini, desk3/4→standard, desk5/6→power
const ZONE_DESK_SPRITE: Record<string, keyof typeof SPRITE_ASSETS> = {
  ceo:   'deskPower',
  desk1: 'deskMini',
  desk2: 'deskMini',
  desk3: 'deskStandard',
  desk4: 'deskStandard',
  desk5: 'deskPower',
  desk6: 'deskPower',
  meeting: 'meetingRoom',
};

// Fallback avatar sprite per agent id (overridden by agent.avatar field)
const AGENT_AVATAR_SPRITE: Record<string, keyof typeof SPRITE_ASSETS> = {
  ceo: 'avatar1',
};

const OfficeCanvas: React.FC = () => {
  const { user, markOnboardingDone } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carpetPatternRef = useRef<CanvasPattern | null>(null);
  const mountedRef = useRef(false);
  const [sprites, setSprites] = useState<Record<string, HTMLImageElement>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLog, setTaskLog] = useState<string[]>(['Welcome to Agent Desk...']);
  const [isPaused, setIsPaused] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [subscriptions] = useState<Subscription[]>(DEFAULT_SUBSCRIPTIONS);
  const [,] = useState<DailyCost[]>([]);
  const [todayApiCost, setTodayApiCost] = useState<number>(0);
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

  // Settings / Connections state
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Hire Agent wizard state
  const [showHireWizard, setShowHireWizard] = useState(false);

  // Tooltip state for canvas hover
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  // Meeting room state
  const [showMeetingRoom, setShowMeetingRoom] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const addLogEntry = useCallback((message: string) => {
    setTaskLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20));
  }, []);

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

  const completeHireWizard = useCallback((data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
  }) => {
    const { width, height } = dimensionsRef.current;

    // Determine next desk ID
    const userDesks = desks.filter(d => d.id?.startsWith('desk'));
    const deskNum = userDesks.length + 1;
    const deskId = `desk${deskNum}`;

    // Desk color from cycling palette
    const colors = ['#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#1dd1a1', '#a29bfe'];
    const deskColor = colors[(deskNum - 1) % colors.length];

    // Create Zone
    const newDesk: Zone = {
      id: deskId,
      x: 0, y: 0,
      w: 200, h: 100,
      color: deskColor,
      label: data.deskName || `Desk ${deskNum}`
    };

    // Create DeskAssignment
    const newAssignment: DeskAssignment = {
      deskId,
      modelId: data.model,
      customName: data.deskName || `Desk ${deskNum}`
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

  const updateTodayCost = useCallback((additionalCost: number) => {
    setTodayApiCost(prev => prev + additionalCost);
  }, []);

  const getMonthlySubscriptionTotal = useCallback(() => {
    return subscriptions
      .filter(sub => sub.active)
      .reduce((total, sub) => total + sub.monthlyCost, 0);
  }, [subscriptions]);

  const getDailySubscriptionShare = useCallback(() => {
    return getMonthlySubscriptionTotal() / 30;
  }, [getMonthlySubscriptionTotal]);

  const assignTask = useCallback(() => {
    if (!selectedAgent || !taskTitle) return;

    const modelId = getModelForAgent(selectedAgent);
    const estimatedCost = calculateTaskCost(modelId);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: taskTitle,
      description: taskDescription,
      assignee: selectedAgent,
      status: 'in-progress',
      createdAt: Date.now(),
      cost: estimatedCost,
      modelUsed: MODEL_PRICING[modelId]?.name || modelId
    };

    setTasks(prev => [...prev, newTask]);
    updateTodayCost(estimatedCost);

    const agentName = agents.find(a => a.id === selectedAgent)?.name;
    addLogEntry(`📋 Task "${taskTitle}" assigned to ${agentName} (${MODEL_PRICING[modelId]?.name}) - Est. $${estimatedCost.toFixed(4)}`);

    setAgents(prev => prev.map(agent => {
      if (agent.id === selectedAgent) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        return {
          ...agent,
          targetX: zones.ops.x,
          targetY: zones.ops.y + 20,
          currentTask: newTask,
          isWorking: true
        };
      }
      return agent;
    }));

    setTimeout(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.id === selectedAgent) {
          const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
          return {
            ...agent,
            targetX: zones[agent.zone].x + agent.deskOffset.x,
            targetY: zones[agent.zone].y + agent.deskOffset.y
          };
        }
        return agent;
      }));
      addLogEntry(`${agentName} completed "${taskTitle}" - $${estimatedCost.toFixed(4)}`);
    }, 2000);

    setShowTaskForm(false);
    setTaskTitle('');
    setTaskDescription('');
    setSelectedAgent('');
  }, [selectedAgent, taskTitle, taskDescription, agents, addLogEntry, calculateZones, getModelForAgent, calculateTaskCost, updateTodayCost]);

  // Meeting room functions
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const startMeeting = useCallback(() => {
    if (!meetingTopic || selectedParticipants.length === 0) return;

    const newMeeting: Meeting = {
      id: `meeting-${Date.now()}`,
      topic: meetingTopic,
      participants: selectedParticipants,
      messages: [],
      startedAt: Date.now()
    };

    setActiveMeeting(newMeeting);
    addLogEntry(`📅 Meeting started: "${meetingTopic}" with ${selectedParticipants.length} participants`);

    // Move selected agents to meeting room
    setAgents(prev => prev.map(agent => {
      if (selectedParticipants.includes(agent.id)) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        const participantIndex = selectedParticipants.indexOf(agent.id);
        const angle = (participantIndex / selectedParticipants.length) * Math.PI * 2;
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

    // Add welcome message
    setTimeout(() => {
      setActiveMeeting(prev => {
        if (!prev) return null;
        const welcomeMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '🤖',
          content: `Meeting "${meetingTopic}" has started. Discuss away!`,
          timestamp: Date.now(),
          isUser: false
        };
        return { ...prev, messages: [...prev.messages, welcomeMessage] };
      });
    }, 500);
  }, [meetingTopic, selectedParticipants, addLogEntry, calculateZones]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !activeMeeting) return;

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: 'user',
      senderName: 'You',
      senderAvatar: '👔',
      content: chatInput.trim(),
      timestamp: Date.now(),
      isUser: true
    };

    setActiveMeeting(prev => {
      if (!prev) return null;
      return { ...prev, messages: [...prev.messages, newMessage] };
    });
    setChatInput('');
    scrollToBottom();

    // TODO: Connect to local OpenClaw when available
    // For now, show a placeholder that OpenClaw integration is coming

    if (selectedParticipants.includes('ops')) {
      setTimeout(() => {
        const placeholderMessage: ChatMessage = {
          id: `msg-${Date.now()}-ops`,
          senderId: 'ops',
          senderName: 'OpenClaw',
          senderAvatar: '🦅',
          content: "👋 I'm OpenClaw! I'll be able to help you when running locally on your Mac Mini. For now, this is a preview of the meeting room.",
          timestamp: Date.now(),
          isUser: false
        };
        setActiveMeeting(prev => {
          if (!prev) return null;
          return { ...prev, messages: [...prev.messages, placeholderMessage] };
        });
        scrollToBottom();
      }, 500);
    }
  }, [chatInput, activeMeeting, selectedParticipants, scrollToBottom]);

  const endMeeting = useCallback(() => {
    if (!activeMeeting) return;

    addLogEntry(`📅 Meeting ended: "${activeMeeting.topic}"`);

    // Return agents to their desks
    setAgents(prev => prev.map(agent => {
      if (activeMeeting.participants.includes(agent.id)) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        return {
          ...agent,
          targetX: zones[agent.zone].x + agent.deskOffset.x,
          targetY: zones[agent.zone].y + agent.deskOffset.y,
          isWorking: false
        };
      }
      return agent;
    }));

    setActiveMeeting(null);
    setMeetingTopic('');
    setSelectedParticipants([]);
    setShowMeetingRoom(false);
  }, [activeMeeting, addLogEntry, calculateZones]);

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

      const spriteKey = zone.id ? ZONE_DESK_SPRITE[zone.id] : undefined;
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
      const spriteKey = zone.id ? ZONE_DESK_SPRITE[zone.id] : undefined;
      const spriteImg = spriteKey ? sprites[spriteKey] : undefined;
      let topOfDesk: number;
      let labelW = 160;
      if (zone.id === 'meeting' && spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        // Meeting room uses larger MEETING_H=140 instead of DESK_H
        const MEETING_H = 140;
        const mW = Math.round(MEETING_H * (spriteImg.naturalWidth / spriteImg.naturalHeight));
        topOfDesk = zone.y - MEETING_H / 2;
        labelW = Math.max(mW, 120);
      } else if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        const { dW, dH } = getDeskDims(spriteImg);
        topOfDesk = zone.y - dH / 2;
        labelW = Math.max(dW, 120);
      } else {
        topOfDesk = zone.y - zone.h / 2;
      }

      // Label positioned ABOVE the desk
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(zone.x - labelW / 2, topOfDesk - 44, labelW, 30);
      ctx.fillStyle = zone.color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, zone.x, topOfDesk - 23);
    };

    const drawWaterCooler = (x: number, y: number) => {
      const size = 50;
      
      // Water bottle (blue)
      ctx.fillStyle = '#74b9ff';
      ctx.beginPath();
      ctx.arc(x, y - size/3, size/3, 0, Math.PI * 2);
      ctx.fill();
      
      // Bottle highlight
      ctx.fillStyle = '#a8d8ff';
      ctx.beginPath();
      ctx.arc(x - 8, y - size/3 - 5, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Stand/base
      ctx.fillStyle = '#636e72';
      ctx.fillRect(x - size/2, y, size, size/2);
      
      // Stand detail
      ctx.fillStyle = '#74b9ff';
      ctx.fillRect(x - 5, y + 5, 10, size/2 - 10);
      
      // Spigot
      ctx.fillStyle = '#b2bec3';
      ctx.beginPath();
      ctx.arc(x, y + 8, 6, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawOfficePlant = (x: number, y: number, size: number = 40) => {
      // Pot
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.moveTo(x - size/3, y);
      ctx.lineTo(x + size/3, y);
      ctx.lineTo(x + size/4, y + size/2);
      ctx.lineTo(x - size/4, y + size/2);
      ctx.closePath();
      ctx.fill();

      // Plant leaves
      ctx.fillStyle = '#228B22';
      const leaves = [
        { x: 0, y: -size/2, r: size/3 },
        { x: -size/4, y: -size/3, r: size/4 },
        { x: size/4, y: -size/3, r: size/4 },
        { x: 0, y: -size/4, r: size/5 }
      ];

      leaves.forEach(leaf => {
        ctx.beginPath();
        ctx.arc(x + leaf.x, y + leaf.y, leaf.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const drawMonitor = (x: number, y: number, width: number = 60, height: number = 40) => {
      // Monitor stand
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 5, y + height/2, 10, 15);
      ctx.fillRect(x - 15, y + height/2 + 15, 30, 5);

      // Monitor frame
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x - width/2, y - height/2, width, height);

      // Screen glow
      const screenGradient = ctx.createLinearGradient(x - width/2, y - height/2, x - width/2, y + height/2);
      screenGradient.addColorStop(0, '#2a3a4a');
      screenGradient.addColorStop(1, '#1a2a3a');
      ctx.fillStyle = screenGradient;
      ctx.fillRect(x - width/2 + 3, y - height/2 + 3, width - 6, height - 6);

      // Code lines on screen
      ctx.fillStyle = '#4a9a4a';
      for (let i = 0; i < 4; i++) {
        const lineWidth = Math.random() * 30 + 10;
        ctx.fillRect(x - width/2 + 8, y - height/2 + 8 + i * 7, lineWidth, 2);
      }
    };

    const drawWorker = (agent: Agent, time: number) => {
      const bob = agent.isWorking ? Math.sin(time / 300) * 2 : Math.sin(time / 500) * 1.5;

      // Resolve avatar sprite: agent.avatar field wins, then fallback map, then cycle
      const agentIndex = parseInt(agent.id.replace(/\D/g, '') || '0') % 3;
      const spriteKey: keyof typeof SPRITE_ASSETS =
        (agent.avatar && agent.avatar in sprites)
          ? (agent.avatar as keyof typeof SPRITE_ASSETS)
          : (AGENT_AVATAR_SPRITE[agent.id]
              ?? (['avatar1', 'avatar2', 'avatar3'][agentIndex] as keyof typeof SPRITE_ASSETS));
      const avatarImg = sprites[spriteKey];

      // Avatar size — square sprites so avW === avH === AVATAR_PX
      const avW = AVATAR_PX;
      const avH = AVATAR_PX;

      // Position avatar to the RIGHT of the desk sprite.
      // Use a fixed offset from zone centre so all avatars sit the same
      // distance from their desk regardless of desk sprite width.
      const AVATAR_OFFSET_X = 44; // consistent gap from zone centre

      // Avatar stands to the right of the desk, vertically centred on desk
      const avX = Math.round(agent.x + AVATAR_OFFSET_X);
      const avY = Math.round(agent.y - avH / 2 + bob);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(avX + avW / 2, avY + avH + 2, avW * 0.4, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(avatarImg, avX, avY, avW, avH);
        ctx.imageSmoothingEnabled = true;
      } else {
        // Fallback
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

      // Status dot — top-right corner of avatar
      const statusColor = agent.targetX !== undefined ? '#feca57'
        : agent.isWorking ? '#ff6b6b' : '#1dd1a1';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(avX + avW, avY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Task dot — top-left
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

            if (Math.random() > 0.6) {
              setParticles(p => [...p, {
                x: newX, y: newY,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                life: 1,
                color: agent.color
              }]);
            }

            return { ...agent, x: newX, y: newY };
          } else {
            return { ...agent, targetX: undefined, targetY: undefined };
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

      // Title (rendered on the wall)
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Agent Desk', width / 2, 50);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px sans-serif';
      ctx.fillText('AI Agency Operations Center', width / 2, 70);
      ctx.restore();
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
      <div className="office-frame">
        <canvas ref={canvasRef} className="office-canvas"
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setTooltip(null)}
        />
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
        <div className="ui-panel" onClick={() => setShowWhiteboard(true)} style={{ cursor: 'pointer' }}>
          <h1>Agent Desk</h1>
          <p>AI Agency Dashboard</p>
          <div className="task-log">
            {taskLog.map((entry, i) => (
              <div key={i} className="task-entry">{entry}</div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', textAlign: 'center' }}>
            Click to open whiteboard
          </div>
        </div>

        <div className="stats-panel" onClick={() => setShowCostPanel(true)} style={{ cursor: 'pointer' }}>
          <h3>Active Tasks: {tasks.filter(t => t.status === 'in-progress').length}</h3>
          <h3>Completed: {tasks.filter(t => t.status === 'completed').length}</h3>
          <h3>Total Agents: {agents.length}</h3>
          <div className="cost-summary">
            <h3>Today's Cost</h3>
            <div className="cost-amount">${(todayApiCost + getDailySubscriptionShare()).toFixed(4)}</div>
            <div className="cost-breakdown">
              <span>API: ${todayApiCost.toFixed(4)}</span>
              <span>Subs: ${getDailySubscriptionShare().toFixed(2)}/day</span>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
            Click for cost dashboard
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

      {showTaskForm && (
        <div className="task-form-overlay">
          <div className="task-form">
            <h2>📋 Create New Task</h2>

            <div className="form-group">
              <label>Select Agent:</label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                <option value="">Choose an agent...</option>
                {agents.filter(a => a.id !== 'ceo').map(agent => {
                  const modelId = getModelForAgent(agent.id);
                  const pricing = MODEL_PRICING[modelId];
                  return (
                    <option key={agent.id} value={agent.id}>
                      {agent.avatar} {agent.name} - {pricing?.name} (~${(pricing ? (pricing.input * 1000 + pricing.output * 500) : 0).toFixed(4)}/task)
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedAgent && (
              <div className="cost-estimate">
                <span>💰 Estimated cost: </span>
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
                ✅ Assign Task
              </button>
              <button onClick={() => setShowTaskForm(false)} className="secondary">
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCostPanel && (
        <div className="cost-panel-overlay" onClick={() => setShowCostPanel(false)}>
          <div className="cost-panel" onClick={e => e.stopPropagation()}>
            <div className="cost-panel-header">
              <h2>💰 Cost Dashboard</h2>
              <button className="close-btn" onClick={() => setShowCostPanel(false)}>✕</button>
            </div>

            <div className="cost-section">
              <h3>📊 Today's Spending</h3>
              <div className="cost-cards">
                <div className="cost-card api">
                  <div className="cost-label">API Calls</div>
                  <div className="cost-value">${todayApiCost.toFixed(4)}</div>
                </div>
                <div className="cost-card subscription">
                  <div className="cost-label">Daily Subs</div>
                  <div className="cost-value">${getDailySubscriptionShare().toFixed(2)}</div>
                </div>
                <div className="cost-card total">
                  <div className="cost-label">Total Today</div>
                  <div className="cost-value">${(todayApiCost + getDailySubscriptionShare()).toFixed(4)}</div>
                </div>
              </div>
            </div>

            <div className="cost-section">
              <h3>📋 Active Subscriptions</h3>
              <div className="subscriptions-list">
                {subscriptions.filter(s => s.active).map(sub => (
                  <div key={sub.id} className="subscription-item">
                    <div className="sub-info">
                      <div className="sub-name">{sub.service}</div>
                      <div className="sub-tier">{sub.tier}</div>
                    </div>
                    <div className="sub-cost">
                      <div className="sub-monthly">${sub.monthlyCost}/mo</div>
                      <div className="sub-next">Next: {sub.nextBillingDate}</div>
                    </div>
                    <div className="sub-features">
                      {sub.features.map((f, i) => (
                        <span key={i} className="feature-tag">{f}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="monthly-total">
                Monthly Total: <strong>${getMonthlySubscriptionTotal()}/month</strong>
              </div>
            </div>

            <div className="cost-section">
              <h3>🤖 Model Pricing (per 1K tokens)</h3>
              <div className="pricing-table">
                {Object.entries(MODEL_PRICING).map(([id, pricing]) => (
                  <div key={id} className="pricing-row">
                    <span className="pricing-name">{pricing.name}</span>
                    <span className="pricing-input">In: ${(pricing.input * 1000).toFixed(2)}</span>
                    <span className="pricing-output">Out: ${(pricing.output * 1000).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cost-section">
              <h3>📈 Recent Tasks with Costs</h3>
              <div className="task-costs">
                {tasks.filter(t => t.cost).slice(-10).reverse().map(task => (
                  <div key={task.id} className="task-cost-item">
                    <span className="task-name">{task.name}</span>
                    <span className="task-model">{task.modelUsed}</span>
                    <span className="task-cost">${task.cost?.toFixed(4)}</span>
                  </div>
                ))}
                {tasks.filter(t => t.cost).length === 0 && (
                  <div className="no-tasks">No tasks with cost tracking yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Room Setup Modal */}
      {showMeetingRoom && !activeMeeting && (
        <div className="meeting-overlay" onClick={() => setShowMeetingRoom(false)}>
          <div className="meeting-setup" onClick={e => e.stopPropagation()}>
            <div className="meeting-header">
              <h2>📅 Start a Meeting</h2>
              <button className="close-btn" onClick={() => setShowMeetingRoom(false)}>✕</button>
            </div>

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
                  {agents.filter(a => a.id !== 'ceo').map(agent => (
                    <label key={agent.id} className="participant-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(agent.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedParticipants([...selectedParticipants, agent.id]);
                          } else {
                            setSelectedParticipants(selectedParticipants.filter(id => id !== agent.id));
                          }
                        }}
                      />
                      <span className="participant-avatar">{agent.avatar}</span>
                      <span className="participant-name">{agent.name}</span>
                      <span className="participant-role">{agent.role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-buttons">
                <button onClick={startMeeting} disabled={!meetingTopic || selectedParticipants.length === 0}>
                  🚀 Start Meeting
                </button>
                <button onClick={() => setShowMeetingRoom(false)} className="secondary">
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Meeting Chat */}
      {showMeetingRoom && activeMeeting && (
        <div className="meeting-overlay">
          <div className="meeting-room">
            <div className="meeting-room-header">
              <div className="meeting-info">
                <h2>📅 {activeMeeting.topic}</h2>
                <span className="meeting-participants-count">
                  {activeMeeting.participants.length} participants
                </span>
              </div>
              <button className="end-meeting-btn" onClick={endMeeting}>
                🔴 End Meeting
              </button>
            </div>

            <div className="meeting-content">
              <div className="chat-container">
                <div className="chat-messages">
                  {activeMeeting.messages.map((msg) => (
                    <div key={msg.id} className={`chat-message ${msg.isUser ? 'me' : msg.senderId === 'system' ? 'system' : 'agent'}`}>
                      {msg.senderId !== 'system' && (
                        <div className="message-avatar">{msg.senderAvatar}</div>
                      )}

                      <div className="message-content">
                        {msg.senderId !== 'system' && (
                          <div className="message-sender">{msg.senderName}</div>
                        )}
                        <div className="message-text">{msg.content}</div>
                        <div className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-input-area">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder="Type your message..."
                    className="chat-input"
                  />
                  <button onClick={sendChatMessage} className="send-btn" disabled={!chatInput.trim()}>
                    ➤
                  </button>
                </div>
              </div>

              <div className="meeting-sidebar">
                <h4>Participants</h4>
                <div className="meeting-participants-list">
                  <div className="participant-item me">
                    <span>👑</span>
                    <span>You (CEO)</span>
                  </div>
                  {activeMeeting.participants.filter(id => id !== 'ceo').map(participantId => {
                    const agent = agents.find(a => a.id === participantId);
                    return agent ? (
                      <div key={participantId} className="participant-item">
                        <span>{agent.avatar}</span>
                        <span>{agent.name}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          connections={connections}
          desks={desks}
          deskAssignments={deskAssignments}
          onComplete={completeHireWizard}
          onClose={closeHireWizard}
          onConnectionCreated={(conn) => setConnections(prev => [...prev, conn])}
          onConnectionRemoved={(providerId) => setConnections(prev => prev.filter(c => c.provider !== providerId))}
          onDeskRemoved={(deskId) => {
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
