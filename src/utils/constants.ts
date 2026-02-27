import type { Zone, Agent, ModelInfo } from '../types';

// ── Role Archetypes ──────────────────────────────────────────
// Pre-configured agent roles for the humanized hire flow.

export type ModelTier = 'budget' | 'balanced' | 'premium';

export interface RoleArchetype {
  id: string;
  icon: string;
  title: string;
  tagline: string;
  category: string;
  defaultCapabilities: string[];
  defaultSystemPrompt: string;
  suggestedNames: string[];
  modelTier: ModelTier;
}

export const ROLE_ARCHETYPES: RoleArchetype[] = [
  {
    id: 'coding',
    icon: '\u{1F4BB}',
    title: 'Coding Assistant',
    tagline: 'Writes clean code, debugs issues, reviews PRs',
    category: 'engineering',
    defaultCapabilities: ['code-generation', 'debugging', 'code-review', 'refactoring'],
    defaultSystemPrompt:
      'You are a senior software engineer. You write clean, well-documented code. When given a task, you think through edge cases, write tests when appropriate, and explain your reasoning. You prefer simple solutions over clever ones.',
    suggestedNames: ['Dev', 'Coda', 'Byte', 'Syntax', 'Rune'],
    modelTier: 'balanced',
  },
  {
    id: 'writing',
    icon: '\u{270D}\uFE0F',
    title: 'Writing Editor',
    tagline: 'Drafts content, edits copy, writes emails',
    category: 'content',
    defaultCapabilities: ['copywriting', 'editing', 'email-drafting', 'proofreading'],
    defaultSystemPrompt:
      'You are a professional writer and editor. You craft clear, engaging copy tailored to the audience. You can switch between formal and casual tones. You catch grammar issues, improve flow, and make every word count.',
    suggestedNames: ['Quill', 'Ink', 'Prose', 'Aria', 'Echo'],
    modelTier: 'balanced',
  },
  {
    id: 'research',
    icon: '\u{1F50D}',
    title: 'Research Analyst',
    tagline: 'Investigates topics, summarizes findings, compares options',
    category: 'research',
    defaultCapabilities: ['research', 'summarization', 'comparison', 'fact-checking'],
    defaultSystemPrompt:
      'You are a thorough research analyst. You investigate topics systematically, cite your reasoning, and present findings in a structured format. You compare options objectively, flag uncertainties, and distinguish between facts and opinions.',
    suggestedNames: ['Scout', 'Atlas', 'Lens', 'Nova', 'Sage'],
    modelTier: 'budget',
  },
  {
    id: 'creative',
    icon: '\u{1F3A8}',
    title: 'Creative Designer',
    tagline: 'UI/UX thinking, branding ideas, visual concepts',
    category: 'design',
    defaultCapabilities: ['ui-design', 'branding', 'visual-concepts', 'ux-writing'],
    defaultSystemPrompt:
      'You are a creative designer and visual thinker. You generate UI/UX ideas, suggest color palettes, write microcopy, and think about user experience holistically. You describe visual concepts clearly and consider accessibility.',
    suggestedNames: ['Pixel', 'Hue', 'Canvas', 'Bloom', 'Sketch'],
    modelTier: 'balanced',
  },
  {
    id: 'data',
    icon: '\u{1F4CA}',
    title: 'Data Analyst',
    tagline: 'SQL queries, data viz, statistical analysis',
    category: 'data',
    defaultCapabilities: ['sql', 'data-analysis', 'visualization', 'statistics'],
    defaultSystemPrompt:
      'You are a data analyst. You write efficient SQL queries, explain statistical concepts clearly, and suggest the right visualization for the data. You think about data quality, edge cases in aggregations, and present insights in plain language.',
    suggestedNames: ['Query', 'Datum', 'Graph', 'Sigma', 'Pivot'],
    modelTier: 'budget',
  },
  {
    id: 'general',
    icon: '\u{1F31F}',
    title: 'General Assistant',
    tagline: 'Versatile helper for any task',
    category: 'general',
    defaultCapabilities: ['general', 'brainstorming', 'planning', 'problem-solving'],
    defaultSystemPrompt:
      'You are a versatile AI assistant. You adapt to whatever task is needed \u2014 writing, analysis, planning, brainstorming, or problem-solving. You ask clarifying questions when a task is ambiguous and always aim to be helpful and thorough.',
    suggestedNames: ['Spark', 'Dash', 'Bolt', 'Flux', 'Chip'],
    modelTier: 'budget',
  },
];

// ── Friendly Model Labels ────────────────────────────────────
// Human-readable descriptions shown during model selection.

export const MODEL_FRIENDLY_LABELS: Record<string, { tagline: string; tier: ModelTier }> = {
  // OpenAI
  'gpt-4.1':          { tagline: 'Powerful & precise',     tier: 'premium' },
  'gpt-4.1-mini':     { tagline: 'Great value',            tier: 'balanced' },
  'gpt-4.1-nano':     { tagline: 'Ultra cheap',            tier: 'budget' },
  'gpt-4o':           { tagline: 'Fast & capable',         tier: 'balanced' },
  'gpt-4o-mini':      { tagline: 'Fast & cheap',           tier: 'budget' },
  'o3':               { tagline: 'Deep reasoning',         tier: 'premium' },
  'o3-mini':          { tagline: 'Reasoning on a budget',  tier: 'budget' },
  'o4-mini':          { tagline: 'Reasoning on a budget',  tier: 'budget' },
  'codex-mini':       { tagline: 'Code specialist',        tier: 'balanced' },
  // Anthropic
  'claude-opus-4':      { tagline: 'Maximum quality',      tier: 'premium' },
  'claude-sonnet-4':    { tagline: 'Smart all-rounder',    tier: 'balanced' },
  'claude-sonnet-4-5':  { tagline: 'Smart all-rounder',    tier: 'balanced' },
  'claude-haiku-3-5':   { tagline: 'Lightning fast',       tier: 'budget' },
  // Moonshot
  'kimi-k2.5':          { tagline: 'Long context expert',  tier: 'premium' },
  'kimi-k1.5':          { tagline: 'Value multi-lingual',  tier: 'balanced' },
  // Google
  'gemini-2.5-pro':       { tagline: 'Google\'s best',     tier: 'premium' },
  'gemini-2.5-flash':     { tagline: 'Lightning fast',     tier: 'budget' },
  'gemini-2.5-flash-lite':{ tagline: 'Almost free',        tier: 'budget' },
  // DeepSeek
  'deepseek-chat':        { tagline: 'Incredible value',   tier: 'budget' },
  'deepseek-reasoner':    { tagline: 'Reasoning champ',    tier: 'balanced' },
};

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
  // DeepSeek
  'deepseek-chat':        { input: 0.00000027, output: 0.0000011, name: 'DeepSeek V3' },
  'deepseek-reasoner':    { input: 0.00000055, output: 0.0000022, name: 'DeepSeek R1' },
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
  // DeepSeek
  { id: 'deepseek-chat',     name: 'DeepSeek V3', provider: 'deepseek', color: '#4d8bf5' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', color: '#6c5ce7' },
];

export const PROVIDERS_LIST = [
  { id: 'openai',    name: 'OpenAI',    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o4-mini', 'codex-mini'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-opus-4', 'claude-sonnet-4', 'claude-sonnet-4-5', 'claude-haiku-3-5'] },
  { id: 'moonshot',  name: 'Moonshot',  models: ['kimi-k2.5', 'kimi-k1.5'] },
  { id: 'google',    name: 'Google',    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  { id: 'deepseek',  name: 'DeepSeek',  models: ['deepseek-chat', 'deepseek-reasoner'] },
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
