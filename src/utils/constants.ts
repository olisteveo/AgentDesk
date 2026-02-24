import type { Zone, Agent, Subscription, ModelInfo } from '../types';

export const MODEL_PRICING: Record<string, { input: number; output: number; name: string }> = {
  // OpenAI
  'gpt-4.1':       { input: 0.00002,   output: 0.00006,  name: 'GPT-4.1' },
  'gpt-4.1-mini':  { input: 0.000004,  output: 0.000016, name: 'GPT-4.1 Mini' },
  'gpt-4.1-nano':  { input: 0.000001,  output: 0.000004, name: 'GPT-4.1 Nano' },
  'gpt-4o':        { input: 0.0000025, output: 0.00001,  name: 'GPT-4o' },
  'gpt-4o-mini':   { input: 0.00000015,output: 0.0000006,name: 'GPT-4o Mini' },
  'o3':            { input: 0.00002,   output: 0.00008,  name: 'O3' },
  'o3-mini':       { input: 0.0000011, output: 0.0000044,name: 'O3 Mini' },
  'o4-mini':       { input: 0.0000011, output: 0.0000044,name: 'O4 Mini' },
  'codex-mini':    { input: 0.0000015, output: 0.000006, name: 'Codex Mini' },
  // Anthropic
  'claude-opus-4':     { input: 0.00015,  output: 0.00075,  name: 'Claude Opus 4' },
  'claude-sonnet-4':   { input: 0.00003,  output: 0.00015,  name: 'Claude Sonnet 4' },
  'claude-sonnet-4-5': { input: 0.00003,  output: 0.00015,  name: 'Claude Sonnet 4.5' },
  'claude-haiku-3-5':  { input: 0.0000008,output: 0.000004, name: 'Claude Haiku 3.5' },
  // Moonshot (platform keys from platform.moonshot.cn)
  // Note: kimi-for-coding is excluded — it only works via coding agent clients
  'kimi-k2.5':          { input: 0.00002,  output: 0.00006,  name: 'Kimi K2.5' },
  'kimi-k1.5':          { input: 0.00001,  output: 0.00003,  name: 'Kimi K1.5' },
  // Google
  'gemini-2.5-pro':       { input: 0.00000125, output: 0.00001,   name: 'Gemini 2.5 Pro' },
  'gemini-2.5-flash':     { input: 0.00000015, output: 0.0000006, name: 'Gemini 2.5 Flash' },
  'gemini-2.5-flash-lite':{ input: 0.0000000375,output:0.00000015,name: 'Gemini 2.5 Flash Lite' },
};

export const AVAILABLE_MODELS: ModelInfo[] = [
  // OpenAI
  { id: 'gpt-4.1',       name: 'GPT-4.1',        provider: 'openai', color: '#a5d4b4' },
  { id: 'gpt-4.1-mini',  name: 'GPT-4.1 Mini',   provider: 'openai', color: '#d4d4a5' },
  { id: 'gpt-4.1-nano',  name: 'GPT-4.1 Nano',   provider: 'openai', color: '#c8e6c9' },
  { id: 'gpt-4o',        name: 'GPT-4o',          provider: 'openai', color: '#a5d4b4' },
  { id: 'gpt-4o-mini',   name: 'GPT-4o Mini',     provider: 'openai', color: '#c8e6c9' },
  { id: 'o3',            name: 'O3',              provider: 'openai', color: '#b4d4a5' },
  { id: 'o3-mini',       name: 'O3 Mini',         provider: 'openai', color: '#cce5cc' },
  { id: 'o4-mini',       name: 'O4 Mini',         provider: 'openai', color: '#cce5cc' },
  { id: 'codex-mini',    name: 'Codex Mini',      provider: 'openai', color: '#d4a5d4' },
  // Anthropic
  { id: 'claude-opus-4',     name: 'Claude Opus 4',     provider: 'anthropic', color: '#d4a5a5' },
  { id: 'claude-sonnet-4',   name: 'Claude Sonnet 4',   provider: 'anthropic', color: '#a5b4d4' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', color: '#a5c4d4' },
  { id: 'claude-haiku-3-5',  name: 'Claude Haiku 3.5',  provider: 'anthropic', color: '#d4b4a5' },
  // Moonshot
  { id: 'kimi-k2.5',        name: 'Kimi K2.5',        provider: 'moonshot', color: '#b4a5d4' },
  { id: 'kimi-k1.5',        name: 'Kimi K1.5',        provider: 'moonshot', color: '#c4b5e4' },
  // Google
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        provider: 'google', color: '#a5d4d4' },
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      provider: 'google', color: '#b5e4e4' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google', color: '#d5e4c4' },
];

export const PROVIDERS_LIST = [
  { id: 'openai',    name: 'OpenAI',    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o4-mini', 'codex-mini'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-opus-4', 'claude-sonnet-4', 'claude-sonnet-4-5', 'claude-haiku-3-5'] },
  { id: 'moonshot',  name: 'Moonshot',  models: ['kimi-k2.5', 'kimi-k1.5'] },
  { id: 'google',    name: 'Google',    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
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
