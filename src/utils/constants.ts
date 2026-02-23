import type { Zone, Agent, Subscription, ModelInfo } from '../types';

export const MODEL_PRICING: Record<string, { input: number; output: number; name: string }> = {
  'gpt-4.1-mini': { input: 0.000005, output: 0.000015, name: 'GPT-4.1 Mini' },
  'gpt-4.1': { input: 0.00002, output: 0.00006, name: 'GPT-4.1' },
  'claude-sonnet-4': { input: 0.00003, output: 0.00015, name: 'Claude Sonnet 4' },
  'claude-opus-4.6': { input: 0.00015, output: 0.00075, name: 'Claude Opus 4.6' },
  'kimi-k2.5': { input: 0.00002, output: 0.00006, name: 'Kimi K2.5' },
  'codex': { input: 0.00003, output: 0.00012, name: 'Codex' },
  'nano-banana': { input: 0.00001, output: 0.00003, name: 'Nano Banana' }
};

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4.6', name: 'Claude Opus', provider: 'anthropic', color: '#d4a5a5' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet', provider: 'anthropic', color: '#a5b4d4' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', color: '#a5d4b4' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', color: '#d4d4a5' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'moonshot', color: '#b4a5d4' },
  { id: 'codex', name: 'Codex', provider: 'openai', color: '#d4a5d4' },
  { id: 'nano-banana', name: 'Nano Banana', provider: 'custom', color: '#feca57' }
];

export const PROVIDERS_LIST = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4.1', 'gpt-4.1-mini', 'codex'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-opus-4.6', 'claude-sonnet-4'] },
  { id: 'moonshot', name: 'Moonshot', models: ['kimi-k2.5'] },
  { id: 'google', name: 'Google', models: ['gemini-pro', 'gemini-ultra'] }
];

export const DEFAULT_SUBSCRIPTIONS: Subscription[] = [
  {
    id: '1',
    service: 'OpenAI',
    tier: 'Pro',
    monthlyCost: 20,
    annualCost: 200,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-01',
    features: ['GPT-4', 'Code Interpreter'],
    active: true
  },
  {
    id: '2',
    service: 'Anthropic',
    tier: 'Pro',
    monthlyCost: 20,
    annualCost: 200,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-05',
    features: ['Claude Opus', 'Claude Sonnet'],
    active: true
  },
  {
    id: '3',
    service: 'Moonshot',
    tier: 'Standard',
    monthlyCost: 10,
    annualCost: 100,
    billingCycle: 'monthly',
    nextBillingDate: '2026-03-10',
    features: ['Kimi K2.5'],
    active: true
  }
];

// Calculate desk positions dynamically based on how many desks exist
export const calculateDeskLayout = (desks: Zone[]): Zone[] => {
  const baseDesks = desks.filter(d => d.id === 'ceo' || d.id === 'ops' || d.id === 'meeting');
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));
  
  const layout: Zone[] = [
    { ...baseDesks.find(d => d.id === 'ceo')!, x: 0.30, y: 0.15, w: 200, h: 100 },
    { ...baseDesks.find(d => d.id === 'ops')!, x: 0.70, y: 0.15, w: 200, h: 100 }
  ];
  
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

export const DEFAULT_DESKS: Zone[] = [
  { id: 'ceo', x: 0.30, y: 0.15, w: 200, h: 100, color: '#ffd700', label: 'CEO Office' },
  { id: 'ops', x: 0.70, y: 0.15, w: 200, h: 100, color: '#ff6b6b', label: 'Operations' },
  { id: 'meeting', x: 0.5, y: 0.32, w: 400, h: 120, color: '#74b9ff', label: 'Meeting Room' }
];

export const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '', avatar: '', deskOffset: { x: 0, y: 10 }, isWorking: false },
  { id: 'ops', name: 'OpenClaw', role: 'Operations Manager', zone: 'ops', x: 0, y: 0, color: '#ff6b6b', emoji: '', avatar: '', deskOffset: { x: 0, y: 10 }, isWorking: false }
];
