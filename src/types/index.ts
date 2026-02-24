export interface Agent {
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

export interface Zone {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  assignee: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: number;
  cost?: number;
  modelUsed?: string;
  errorMessage?: string;
  backendId?: string;
  isCodeTask?: boolean;
}

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

export interface Subscription {
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

export interface DailyCost {
  date: string;
  apiCosts: Record<string, number>;
  totalApi: number;
  subscriptionShare: number;
  total: number;
}

export interface DeskAssignment {
  deskId: string;
  backendDeskId?: string;
  modelId: string;
  agentName?: string;
  customName?: string;
}

export interface Connection {
  id: string;
  provider: 'openai' | 'anthropic' | 'moonshot' | 'google' | 'cohere';
  name: string;
  isConnected: boolean;
  apiKeyMasked: string;
  models: string[];
  addedAt: Date;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  color: string;
}
