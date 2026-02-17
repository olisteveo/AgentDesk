// Simple AI API client - calls services directly using API keys from .env

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatResponse {
  content: string;
  model: string;
}

// OpenAI (GPT-4, etc.)
export async function callOpenAI(messages: Message[], apiKey: string): Promise<ChatResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 500
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: 'GPT-4'
  };
}

// Anthropic (Claude)
export async function callClaude(messages: Message[], apiKey: string): Promise<ChatResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 500,
      messages: messages.filter(m => m.role !== 'system'),
      system: messages.find(m => m.role === 'system')?.content
    })
  });
  
  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    content: data.content[0].text,
    model: 'Claude 3 Opus'
  };
}

// Moonshot AI (Kimi)
export async function callKimi(messages: Message[], apiKey: string): Promise<ChatResponse> {
  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'kimi-k2.5',
      messages,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    throw new Error(`Kimi API error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: 'Kimi K2.5'
  };
}

// Route to correct model based on agent ID
export async function callAI(agentId: string, messages: Message[]): Promise<ChatResponse> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const moonshotKey = import.meta.env.VITE_MOONSHOT_API_KEY;
  
  switch (agentId) {
    case 'ops': // OpenClaw - uses Kimi for now (or could use a custom endpoint)
      if (moonshotKey) {
        return callKimi([...messages, { role: 'system', content: 'You are OpenClaw, the Operations Manager AI. You help coordinate tasks and manage the team.' }], moonshotKey);
      }
      throw new Error('No API key configured for OpenClaw');
      
    case 'dev1': // Claude Opus
      if (anthropicKey) {
        return callClaude([...messages, { role: 'system', content: 'You are Claude Opus, a senior developer AI. You write high-quality code and solve complex technical problems.' }], anthropicKey);
      }
      throw new Error('No Anthropic API key configured');
      
    case 'dev3': // Kimi
      if (moonshotKey) {
        return callKimi([...messages, { role: 'system', content: 'You are Kimi K2.5, a developer AI. You help with coding tasks and research.' }], moonshotKey);
      }
      throw new Error('No Moonshot API key configured');
      
    case 'dev4': // GPT-4
      if (openaiKey) {
        return callOpenAI([...messages, { role: 'system', content: 'You are GPT-4, a junior developer AI. You help with coding and learning.' }], openaiKey);
      }
      throw new Error('No OpenAI API key configured');
      
    default:
      // Fallback to any available model
      if (openaiKey) return callOpenAI(messages, openaiKey);
      if (anthropicKey) return callClaude(messages, anthropicKey);
      if (moonshotKey) return callKimi(messages, moonshotKey);
      throw new Error('No API keys configured. Add them to .env file');
  }
}
