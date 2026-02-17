import React, { useRef, useEffect, useState, useCallback } from 'react';
import './OfficeCanvas.css';
import { callAI } from '../api/ai';

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

const ZONES: Record<string, Zone> = {
  ceo: { x: 0.28, y: 0.10, w: 200, h: 120, color: '#ffd700', label: '👑 CEO Office' },
  ops: { x: 0.72, y: 0.10, w: 200, h: 120, color: '#ff6b6b', label: '🦅 Operations' },
  creative: { x: 0.15, y: 0.55, w: 260, h: 160, color: '#feca57', label: '🍌 Nano Banana Studio' },
  research: { x: 0.85, y: 0.55, w: 240, h: 160, color: '#48dbfb', label: '🔬 Research Lab' },
  engineering: { x: 0.5, y: 0.82, w: 600, h: 200, color: '#1dd1a1', label: '💻 Engineering Floor' },
  meeting: { x: 0.5, y: 0.55, w: 180, h: 120, color: '#a29bfe', label: '📅 Meeting Room' }
};

const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '👑', avatar: '👔', deskOffset: { x: 0, y: 10 }, isWorking: false },
  { id: 'ops', name: 'OpenClaw', role: 'Operations Manager', zone: 'ops', x: 0, y: 0, color: '#ff6b6b', emoji: '🦅', avatar: '📊', deskOffset: { x: 0, y: 10 }, isWorking: false },
  { id: 'creative', name: 'Nano Banana', role: 'Creative Manager', zone: 'creative', x: 0, y: 0, color: '#feca57', emoji: '🍌', avatar: '🎨', deskOffset: { x: -60, y: 20 }, isWorking: false },
  { id: 'research1', name: 'Claude Sonnet', role: 'Researcher', zone: 'research', x: 0, y: 0, color: '#48dbfb', emoji: '🔬', avatar: '🔍', deskOffset: { x: -50, y: 20 }, isWorking: false },
  { id: 'research2', name: 'Kimi K2.5', role: 'Researcher/Dev', zone: 'research', x: 0, y: 0, color: '#48dbfb', emoji: '🧠', avatar: '📚', deskOffset: { x: 50, y: 20 }, isWorking: false },
  { id: 'dev1', name: 'Claude Opus', role: 'Senior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '💻', avatar: '⚡', deskOffset: { x: -200, y: 30 }, isWorking: false },
  { id: 'dev2', name: 'Codex', role: 'Senior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '⚡', avatar: '🔧', deskOffset: { x: -70, y: 30 }, isWorking: false },
  { id: 'dev3', name: 'Kimi K2.5', role: 'Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '🎯', avatar: '🚀', deskOffset: { x: 70, y: 30 }, isWorking: false },
  { id: 'dev4', name: 'GPT 4.1', role: 'Junior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '🌱', avatar: '📖', deskOffset: { x: 200, y: 30 }, isWorking: false }
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

  // Meeting room state
  const [showMeetingRoom, setShowMeetingRoom] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const calculateZones = useCallback((width: number, height: number): Record<string, Zone> => {
    return Object.entries(ZONES).reduce((acc, [key, zone]) => ({
      ...acc,
      [key]: {
        ...zone,
        x: width * zone.x,
        y: height * zone.y
      }
    }), {});
  }, []);

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
    addLogEntry(`📋 Task "${taskTitle}" assigned to ${agentName} (${MODEL_PRICING[modelId]?.name}) — Est. $${estimatedCost.toFixed(4)}`);

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
      addLogEntry(`${agentName} completed "${taskTitle}" — $${estimatedCost.toFixed(4)}`);
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

    // Get AI responses from all participants
    for (const participantId of selectedParticipants) {
      const agent = agents.find(a => a.id === participantId);
      if (!agent) continue;

      try {
        // Build message history for context
        const messageHistory: { role: 'user' | 'assistant'; content: string }[] = activeMeeting.messages.map(m => ({
          role: m.isUser ? 'user' : 'assistant',
          content: `${m.senderName}: ${m.content}`
        }));

        // Call the AI API directly
        const response = await callAI(participantId, [
          ...messageHistory,
          { role: 'user' as 'user', content: chatInput.trim() }
        ]);

        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar,
          content: response.content,
          timestamp: Date.now(),
          isUser: false
        };

        setActiveMeeting(prev => {
          if (!prev) return null;
          return { ...prev, messages: [...prev.messages, agentMessage] };
        });
        scrollToBottom();

        // Small delay between responses
        await new Promise(r => setTimeout(r, 500));

      } catch (error) {
        console.error(`Failed to get response from ${agent.name}:`, error);
        
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-${participantId}`,
          senderId: participantId,
          senderName: agent.name,
          senderAvatar: agent.avatar,
          content: `Sorry, I couldn't respond right now. ${error instanceof Error ? error.message : 'API error'}`,
          timestamp: Date.now(),
          isUser: false
        };

        setActiveMeeting(prev => {
          if (!prev) return null;
          return { ...prev, messages: [...prev.messages, errorMessage] };
        });
      }
    }
  }, [chatInput, activeMeeting, agents, selectedParticipants, scrollToBottom]);

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
      // Desk glow
      ctx.shadowBlur = 30;
      ctx.shadowColor = zone.color;
      
      // Desk body with gradient
      const gradient = ctx.createLinearGradient(zone.x - zone.w/2, zone.y - zone.h/2, zone.x + zone.w/2, zone.y + zone.h/2);
      gradient.addColorStop(0, zone.color + '30');
      gradient.addColorStop(1, zone.color + '10');
      ctx.fillStyle = gradient;
      ctx.fillRect(zone.x - zone.w/2, zone.y - zone.h/2, zone.w, zone.h);
      
      // Desk border
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(zone.x - zone.w/2, zone.y - zone.h/2, zone.w, zone.h);
      
      // Desk label background
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#00000080';
      ctx.fillRect(zone.x - zone.w/2 + 10, zone.y - zone.h/2 - 35, zone.w - 20, 28);
      
      // Desk label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, zone.x, zone.y - zone.h/2 - 15);
    };

    const drawWorker = (agent: Agent, time: number) => {
      const bobOffset = agent.isWorking ? Math.sin(time / 300) * 2 : Math.sin(time / 500) * 3;
      
      // Glow when moving or working
      if (agent.targetX !== undefined || agent.isWorking) {
        ctx.shadowBlur = 40;
        ctx.shadowColor = agent.color;
      }

      // Worker body (rounded rect)
      ctx.fillStyle = agent.color + '40';
      ctx.beginPath();
      ctx.roundRect(agent.x - 30, agent.y + bobOffset - 35, 60, 70, 15);
      ctx.fill();
      
      // Worker border
      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Avatar circle
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(agent.x, agent.y + bobOffset - 15, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Avatar emoji
      ctx.shadowBlur = 0;
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.avatar, agent.x, agent.y + bobOffset - 8);

      // Name badge
      ctx.fillStyle = '#00000090';
      ctx.fillRect(agent.x - 45, agent.y + bobOffset + 15, 90, 22);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(agent.name, agent.x, agent.y + bobOffset + 30);

      // Role
      ctx.fillStyle = '#aaa';
      ctx.font = '9px sans-serif';
      ctx.fillText(agent.role, agent.x, agent.y + bobOffset + 42);

      // Status indicator
      const statusColor = agent.targetX !== undefined ? '#feca57' : agent.isWorking ? '#ff6b6b' : '#1dd1a1';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(agent.x + 25, agent.y + bobOffset - 30, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Status icon
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      const statusIcon = agent.targetX !== undefined ? '🚶' : agent.isWorking ? '⚙️' : '✓';
      ctx.fillText(statusIcon, agent.x + 25, agent.y + bobOffset - 26);

      // Task indicator
      if (agent.currentTask) {
        ctx.fillStyle = '#feca57';
        ctx.beginPath();
        ctx.arc(agent.x - 25, agent.y + bobOffset - 30, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '10px sans-serif';
        ctx.fillText('📝', agent.x - 25, agent.y + bobOffset - 26);
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
      Object.values(zones).forEach(drawDesk);
      drawConnections();

      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      agents.forEach(agent => drawWorker(agent, time));

      // Title
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍌 Kreative HQ', width / 2, 50);
      
      // Subtitle
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.fillText('AI Agency Command Center', width / 2, 75);
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
    addLogEntry(isPaused ? '▶️ Simulation resumed' : '⏸️ Simulation paused');
  };

  const resetOffice = () => {
    const { width, height } = dimensionsRef.current;
    setAgents(resetAgents(width, height));
    setParticles([]);
    setTasks([]);
    addLogEntry('🔄 Office reset');
  };

  return (
    <div className="office-canvas-container">
      <canvas ref={canvasRef} className="office-canvas" />
      
      <div className="ui-panel">
        <h1>🍌 Kreative</h1>
        <p>AI Agency Dashboard</p>
        <div className="task-log">
          {taskLog.map((entry, i) => (
            <div key={i} className="task-entry">{entry}</div>
          ))}
        </div>
      </div>

      <div className="controls">
        <button onClick={() => setShowTaskForm(true)}>📋 New Task</button>
        <button onClick={() => setShowMeetingRoom(true)}>📅 Meeting Room</button>
        <button onClick={togglePause}>{isPaused ? '▶️ Resume' : '⏸️ Pause'}</button>
        <button onClick={resetOffice}>🔄 Reset</button>
      </div>

      <div className="stats-panel">
        <h3>🟡 Active Tasks: {tasks.filter(t => t.status === 'in-progress').length}</h3>
        <h3>✅ Completed: {tasks.filter(t => t.status === 'completed').length}</h3>
        <h3>👥 Total Agents: {agents.length}</h3>
        <div className="cost-summary" onClick={() => setShowCostPanel(true)}>
          <h3>💰 Today's Cost</h3>
          <div className="cost-amount">${(todayApiCost + getDailySubscriptionShare()).toFixed(4)}</div>
          <div className="cost-breakdown">
            <span>API: ${todayApiCost.toFixed(4)}</span>
            <span>Subs: ${getDailySubscriptionShare().toFixed(2)}/day</span>
          </div>
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
                      {agent.avatar} {agent.name} — {pricing?.name} (~${(pricing ? (pricing.input * 1000 + pricing.output * 500) : 0).toFixed(4)}/task)
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
    </div>
  );
};

export default OfficeCanvas;
