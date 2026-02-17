import React, { useRef, useEffect, useState, useCallback } from 'react';
import './OfficeCanvas.css';

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

// Calculate desk positions dynamically based on how many desks exist
const calculateDeskLayout = (desks: Zone[]): Zone[] => {
  const baseDesks = desks.filter(d => d.id === 'ceo' || d.id === 'ops' || d.id === 'meeting');
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));
  
  // Start positions - CEO and Ops close together at top
  const layout: Zone[] = [
    { ...baseDesks.find(d => d.id === 'ceo')!, x: 0.30, y: 0.15, w: 200, h: 100 },
    { ...baseDesks.find(d => d.id === 'ops')!, x: 0.70, y: 0.15, w: 200, h: 100 }
  ];
  
  // Add user desks in pairs
  userDesks.forEach((desk, index) => {
    const row = Math.floor(index / 2);
    const isLeft = index % 2 === 0;
    layout.push({
      ...desk,
      x: isLeft ? 0.30 : 0.70,
      y: 0.32 + row * 0.17,
      w: 200,
      h: 100
    });
  });
  
  // Meeting room at bottom, moves down as desks added
  const meetingY = userDesks.length > 0 
    ? 0.32 + Math.ceil(userDesks.length / 2) * 0.17 + 0.05
    : 0.32;
  
  layout.push({
    ...baseDesks.find(d => d.id === 'meeting')!,
    x: 0.5,
    y: Math.min(meetingY, 0.90),
    w: 400,
    h: 120
  });
  
  return layout;
};

// Default starts with just CEO, Ops, Meeting Room close together
const DEFAULT_DESKS: Zone[] = [
  { id: 'ceo', x: 0.30, y: 0.15, w: 200, h: 100, color: '#ffd700', label: 'CEO Office' },
  { id: 'ops', x: 0.70, y: 0.15, w: 200, h: 100, color: '#ff6b6b', label: 'Operations' },
  { id: 'meeting', x: 0.5, y: 0.32, w: 400, h: 120, color: '#74b9ff', label: 'Meeting Room' }
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
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '', avatar: '', deskOffset: { x: 0, y: 10 }, isWorking: false },
  { id: 'ops', name: 'OpenClaw', role: 'Operations Manager', zone: 'ops', x: 0, y: 0, color: '#ff6b6b', emoji: '', avatar: '', deskOffset: { x: 0, y: 10 }, isWorking: false }
];

const OfficeCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLog, setTaskLog] = useState<string[]>(['Welcome to Kreative HQ...']);
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

  // Desk configuration state
  const [desks, setDesks] = useState<Zone[]>(DEFAULT_DESKS);
  const [deskAssignments, setDeskAssignments] = useState<DeskAssignment[]>(DEFAULT_ASSIGNMENTS);
  const [showDeskConfig, setShowDeskConfig] = useState(false);

  // Settings / Connections state
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'providers' | 'desks'>('providers');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [newApiKey, setNewApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');

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
    return INITIAL_AGENTS.map(agent => ({
      ...agent,
      x: zones[agent.zone].x + agent.deskOffset.x,
      y: zones[agent.zone].y + agent.deskOffset.y
    }));
  }, [calculateZones]);

  const addLogEntry = useCallback((message: string) => {
    setTaskLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20));
  }, []);

  const calculateTaskCost = useCallback((modelId: string, inputTokens: number = 1000, outputTokens: number = 500): number => {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) return 0;
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }, []);

  const getModelForAgent = useCallback((agentId: string): string => {
    const modelMap: Record<string, string> = {
      'dev1': 'claude-opus-4.6',
      'dev2': 'codex',
      'dev3': 'kimi-k2.5',
      'dev4': 'gpt-4.1-mini',
      'research1': 'claude-sonnet-4',
      'research2': 'kimi-k2.5',
      'creative': 'nano-banana',
      'ops': 'claude-sonnet-4'
    };
    return modelMap[agentId] || 'gpt-4.1';
  }, []);

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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dimensionsRef.current = { width: canvas.width, height: canvas.height };
      setAgents(resetAgents(canvas.width, canvas.height));
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [resetAgents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = 0;

    const drawDesk = (zone: Zone) => {
      if (zone.id === 'watercooler') return;
      
      const deskW = zone.w;
      const deskH = zone.h;
      const x = zone.x - deskW/2;
      const y = zone.y - deskH/2;

      // Desk shadow
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowOffsetY = 10;

      // Desk surface (wood/dark material)
      const deskGradient = ctx.createLinearGradient(x, y, x, y + deskH);
      deskGradient.addColorStop(0, '#2a2a3e');
      deskGradient.addColorStop(0.5, '#1f1f2e');
      deskGradient.addColorStop(1, '#1a1a2e');

      ctx.fillStyle = deskGradient;
      ctx.fillRect(x, y, deskW, deskH);

      // Desk border/frame
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = zone.color + '60';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, deskW, deskH);

      // Desk top highlight
      ctx.fillStyle = zone.color + '20';
      ctx.fillRect(x, y, deskW, 4);

      // Partition walls for zones (except meeting room)
      if (zone.id !== 'meeting') {
        ctx.fillStyle = '#151520';
        // Left partition
        ctx.fillRect(x - 10, y, 10, deskH);
        ctx.strokeStyle = '#252535';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 10, y, 10, deskH);

        // Right partition
        ctx.fillRect(x + deskW, y, 10, deskH);
        ctx.strokeRect(x + deskW, y, 10, deskH);
      }

      // Zone label removed from here - drawn on top later
    };

    const drawZoneLabel = (zone: Zone) => {
      // Label positioned ABOVE the desk
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(zone.x - 80, zone.y - zone.h/2 - 45, 160, 32);

      // Label text
      ctx.fillStyle = zone.color;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, zone.x, zone.y - zone.h/2 - 23);
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
      const bobOffset = agent.isWorking ? Math.sin(time / 300) * 2 : Math.sin(time / 500) * 3;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(agent.x, agent.y + 35, 25, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body (office chair style)
      ctx.fillStyle = agent.color + '30';
      ctx.beginPath();
      ctx.roundRect(agent.x - 20, agent.y + bobOffset - 10, 40, 35, 8);
      ctx.fill();

      // Head
      ctx.fillStyle = '#f0d5b8'; // Skin tone
      ctx.beginPath();
      ctx.arc(agent.x, agent.y + bobOffset - 25, 18, 0, Math.PI * 2);
      ctx.fill();

      // Hair/outline
      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Initials instead of emoji
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      const initials = agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      ctx.fillText(initials, agent.x, agent.y + bobOffset - 20);

      // Name tag (subtle)
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(agent.x - 35, agent.y + bobOffset + 20, 70, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(agent.name, agent.x, agent.y + bobOffset + 32);

      // Status dot (clean, no emoji)
      const statusColor = agent.targetX !== undefined ? '#feca57' : agent.isWorking ? '#ff6b6b' : '#1dd1a1';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(agent.x + 22, agent.y + bobOffset - 35, 5, 0, Math.PI * 2);
      ctx.fill();

      // Task indicator (dot only)
      if (agent.currentTask) {
        ctx.fillStyle = '#feca57';
        ctx.beginPath();
        ctx.arc(agent.x - 22, agent.y + bobOffset - 35, 5, 0, Math.PI * 2);
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

      // Grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const zones = calculateZones(width, height);

      // Draw carpet background - office style
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, width, height);

      // Draw carpet tile pattern
      const tileSize = 40;
      for (let x = 0; x < width; x += tileSize) {
        for (let y = 0; y < height; y += tileSize) {
          // Checkerboard subtle pattern
          const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
          ctx.fillStyle = isEven ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
          ctx.fillRect(x, y, tileSize, tileSize);
        }
      }

      // Draw carpet grid lines
      ctx.strokeStyle = 'rgba(100, 100, 120, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw main office carpet area (lighter)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.fillRect(width * 0.12, height * 0.20, width * 0.76, height * 0.70);

      // Draw zones with furniture
      Object.values(zones).forEach(zone => {
        drawDesk(zone);

        // Add monitors to desks
        if (zone.id !== 'meeting' && zone.id !== 'watercooler') {
          drawMonitor(zone.x, zone.y - 10);
        }
      });

      // Draw office plants in corners
      drawOfficePlant(width * 0.05, height * 0.15, 50);
      drawOfficePlant(width * 0.95, height * 0.15, 45);
      drawOfficePlant(width * 0.08, height * 0.85, 55);
      drawOfficePlant(width * 0.92, height * 0.85, 48);

      // Plants near meeting room
      if (zones.meeting) {
        drawOfficePlant(zones.meeting.x - 120, zones.meeting.y, 40);
        drawOfficePlant(zones.meeting.x + 120, zones.meeting.y, 42);
      }

      // Water cooler
      if (zones.watercooler) {
        drawWaterCooler(zones.watercooler.x, zones.watercooler.y);
      }

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

      // Title (clean, no emoji)
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Kreative HQ', width / 2, 45);

      // Subtitle
      ctx.fillStyle = '#666';
      ctx.font = '13px sans-serif';
      ctx.fillText('AI Agency Operations Center', width / 2, 68);
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
  }, [agents, particles, isPaused, calculateZones]);

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

  return (
    <div className="office-canvas-container">
      <canvas ref={canvasRef} className="office-canvas" />

      {/* Top Navigation Bar */}
      <div className="top-nav">
        <button onClick={() => setShowTaskForm(true)}>New Task</button>
        <button onClick={() => setShowMeetingRoom(true)}>Meeting Room</button>
        <button onClick={() => setShowSettings(true)}>Settings</button>
        <button onClick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
        <button onClick={resetOffice}>Reset</button>
      </div>

      <div className="left-sidebar">
        <div className="ui-panel" onClick={() => setShowWhiteboard(true)} style={{ cursor: 'pointer' }}>
          <h1>Kreative</h1>
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
      {/* Desk Configuration Modal */}
      {showDeskConfig && (
        <div className="task-form-overlay" onClick={() => setShowDeskConfig(false)}>
          <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2>Configure Desks</h2>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
              Assign AI models to desks. Each desk can have one model.
            </p>

            <div className="form-group">
              {desks.filter(d => d.id?.startsWith('desk')).map(desk => {
                const assignment = deskAssignments.find(a => a.deskId === desk.id);
                const model = AVAILABLE_MODELS.find(m => m.id === assignment?.modelId);
                return (
                  <div key={desk.id} style={{ 
                    background: 'rgba(0,0,0,0.3)', 
                    padding: '15px', 
                    borderRadius: '8px',
                    marginBottom: '12px',
                    border: '1px solid #333'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <strong style={{ color: desk.color }}>{desk.label}</strong>
                      <span style={{ fontSize: '12px', color: '#888' }}>ID: {desk.id}</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <select 
                        value={assignment?.modelId || ''}
                        onChange={(e) => {
                          const newAssignments = deskAssignments.filter(a => a.deskId !== desk.id);
                          if (e.target.value) {
                            newAssignments.push({
                              deskId: desk.id!,
                              modelId: e.target.value,
                              customName: desk.label
                            });
                          }
                          setDeskAssignments(newAssignments);
                        }}
                        style={{ flex: 1 }}
                      >
                        <option value="">Select Model...</option>
                        {AVAILABLE_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                        ))}
                      </select>
                    </div>
                    
                    {model && (
                      <div style={{ 
                        marginTop: '10px', 
                        padding: '8px', 
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        <span style={{ color: model.color }}>●</span> {model.name} — {model.provider}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="form-buttons">
              <button onClick={() => setShowDeskConfig(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      {showSettings && (
        <div className="task-form-overlay" onClick={() => setShowSettings(false)}>
          <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Settings</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            {/* Settings Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
              <button
                onClick={() => setActiveSettingsTab('providers')}
                style={{
                  padding: '10px 20px',
                  background: activeSettingsTab === 'providers' ? '#667eea' : 'transparent',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  color: activeSettingsTab === 'providers' ? '#fff' : '#888',
                  cursor: 'pointer'
                }}
              >
                AI Providers
              </button>
              <button
                onClick={() => setActiveSettingsTab('desks')}
                style={{
                  padding: '10px 20px',
                  background: activeSettingsTab === 'desks' ? '#667eea' : 'transparent',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  color: activeSettingsTab === 'desks' ? '#fff' : '#888',
                  cursor: 'pointer'
                }}
              >
                Desk Management
              </button>
            </div>

            {/* Providers Tab */}
            {activeSettingsTab === 'providers' && (
              <div>
                <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
                  Connect your AI provider accounts. API keys are encrypted and never shared.
                </p>

                {/* Available Providers List */}
                {[
                  { id: 'openai', name: 'OpenAI', models: ['GPT-4', 'GPT-4o', 'GPT-3.5'] },
                  { id: 'anthropic', name: 'Anthropic', models: ['Claude Opus', 'Claude Sonnet', 'Claude Haiku'] },
                  { id: 'moonshot', name: 'Moonshot', models: ['Kimi K2.5'] },
                  { id: 'google', name: 'Google', models: ['Gemini Pro', 'Gemini Ultra'] }
                ].map(provider => {
                  const connection = connections.find(c => c.provider === provider.id);
                  return (
                    <div key={provider.id} style={{
                      background: 'rgba(0,0,0,0.3)',
                      padding: '20px',
                      borderRadius: '10px',
                      marginBottom: '15px',
                      border: connection?.isConnected ? '1px solid #1dd1a1' : '1px solid #333'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <strong style={{ color: '#fff', fontSize: '16px' }}>{provider.name}</strong>
                          {connection?.isConnected && (
                            <span style={{ color: '#1dd1a1', fontSize: '12px', marginLeft: '10px' }}>● Connected</span>
                          )}
                        </div>
                        {!connection?.isConnected ? (
                          <button
                            onClick={() => setSelectedProvider(provider.id)}
                            style={{
                              padding: '8px 16px',
                              background: '#667eea',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            Add API Key
                          </button>
                        ) : (
                          <button
                            onClick={() => setConnections(connections.filter(c => c.provider !== provider.id))}
                            style={{
                              padding: '8px 16px',
                              background: 'transparent',
                              border: '1px solid #ff6b6b',
                              borderRadius: '6px',
                              color: '#ff6b6b',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>

                      {connection?.isConnected ? (
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          <div>Key: {connection.apiKeyMasked}</div>
                          <div style={{ marginTop: '5px' }}>Available models: {connection.models.join(', ')}</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          Available models: {provider.models.join(', ')}
                        </div>
                      )}

                      {/* Add API Key Form */}
                      {selectedProvider === provider.id && !connection?.isConnected && (
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333' }}>
                          <input
                            type="password"
                            placeholder={`Enter ${provider.name} API Key`}
                            value={newApiKey}
                            onChange={(e) => setNewApiKey(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              background: 'rgba(0,0,0,0.5)',
                              border: '1px solid #444',
                              borderRadius: '6px',
                              color: '#fff',
                              marginBottom: '10px'
                            }}
                          />
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              onClick={() => {
                                if (newApiKey) {
                                  setConnections([...connections, {
                                    id: Date.now().toString(),
                                    provider: provider.id as any,
                                    name: provider.name,
                                    isConnected: true,
                                    apiKeyMasked: newApiKey.slice(0, 8) + '...' + newApiKey.slice(-4),
                                    models: provider.models,
                                    addedAt: new Date()
                                  }]);
                                  setNewApiKey('');
                                  setSelectedProvider('');
                                }
                              }}
                              style={{
                                padding: '10px 20px',
                                background: '#1dd1a1',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                cursor: 'pointer'
                              }}
                            >
                              Connect
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProvider('');
                                setNewApiKey('');
                              }}
                              style={{
                                padding: '10px 20px',
                                background: 'transparent',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#888',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desk Management Tab */}
            {activeSettingsTab === 'desks' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <p style={{ color: '#888', fontSize: '13px' }}>
                    Configure desks with connected AI models. {desks.filter(d => d.id?.startsWith('desk')).length}/6 desks used.
                  </p>
                  {desks.filter(d => d.id?.startsWith('desk')).length < 6 && connections.some(c => c.isConnected) && (
                    <button
                      onClick={() => {
                        const deskNum = desks.filter(d => d.id?.startsWith('desk')).length + 1;
                        const newDesk: Zone = {
                          id: `desk${deskNum}`,
                          x: deskNum % 2 === 1 ? 0.30 : 0.70,
                          y: 0.28 + Math.floor((deskNum - 1) / 2) * 0.18,
                          w: 200,
                          h: 100,
                          color: '#667eea',
                          label: `Desk ${deskNum}`
                        };
                        setDesks([...desks, newDesk]);
                      }}
                      style={{
                        padding: '10px 20px',
                        background: '#667eea',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      + Add Desk
                    </button>
                  )}
                </div>

                {!connections.some(c => c.isConnected) && (
                  <div style={{
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    color: '#ffc107',
                    fontSize: '13px'
                  }}>
                    Connect at least one AI provider to create desks.
                  </div>
                )}

                {desks.filter(d => d.id?.startsWith('desk')).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    No desks configured. Click "Add Desk" to create your first workspace.
                  </div>
                ) : (
                  <div>
                    {desks.filter(d => d.id?.startsWith('desk')).map(desk => {
                      const assignment = deskAssignments.find(a => a.deskId === desk.id);
                      const availableModels = connections
                        .filter(c => c.isConnected)
                        .flatMap(c => c.models.map(m => ({ name: m, provider: c.provider })));

                      return (
                        <div key={desk.id} style={{
                          background: 'rgba(0,0,0,0.3)',
                          padding: '15px',
                          borderRadius: '8px',
                          marginBottom: '12px',
                          border: '1px solid #333'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <strong style={{ color: desk.color }}>{desk.label}</strong>
                            <button
                              onClick={() => {
                                setDesks(desks.filter(d => d.id !== desk.id));
                                setDeskAssignments(deskAssignments.filter(a => a.deskId !== desk.id));
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ff6b6b',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Remove
                            </button>
                          </div>

                          <select
                            value={assignment?.modelId || ''}
                            onChange={(e) => {
                              const newAssignments = deskAssignments.filter(a => a.deskId !== desk.id);
                              if (e.target.value) {
                                newAssignments.push({
                                  deskId: desk.id!,
                                  modelId: e.target.value,
                                  customName: desk.label
                                });
                              }
                              setDeskAssignments(newAssignments);
                            }}
                            style={{ width: '100%', padding: '10px' }}
                          >
                            <option value="">Select AI Model...</option>
                            {availableModels.map((model, idx) => (
                              <option key={idx} value={`${model.provider}-${model.name}`}>
                                {model.name} ({model.provider})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="form-buttons" style={{ marginTop: '20px' }}>
              <button onClick={() => setShowSettings(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficeCanvas;
