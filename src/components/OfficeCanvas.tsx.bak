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
  deskOffset: { x: number; y: number };
  targetX?: number;
  targetY?: number;
  currentTask?: string;
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
  assignee: string;
  status: 'pending' | 'in-progress' | 'completed';
}

const ZONES: Record<string, Zone> = {
  ceo: { x: 0.5, y: 0.12, w: 200, h: 120, color: '#ffd700', label: 'CEO' },
  ops: { x: 0.5, y: 0.28, w: 180, h: 100, color: '#ff6b6b', label: 'Operations' },
  creative: { x: 0.2, y: 0.45, w: 220, h: 140, color: '#feca57', label: 'Nano Banana Studio' },
  research: { x: 0.8, y: 0.45, w: 200, h: 140, color: '#48dbfb', label: 'Research Lab' },
  engineering: { x: 0.5, y: 0.7, w: 500, h: 180, color: '#1dd1a1', label: 'Engineering Floor' }
};

const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', name: 'You', role: 'CEO', zone: 'ceo', x: 0, y: 0, color: '#ffd700', emoji: '👑', deskOffset: { x: 0, y: 0 } },
  { id: 'ops', name: 'OpenClaw', role: 'Operations Manager', zone: 'ops', x: 0, y: 0, color: '#ff6b6b', emoji: '🦅', deskOffset: { x: 0, y: 0 } },
  { id: 'creative', name: 'Nano Banana', role: 'Creative Manager', zone: 'creative', x: 0, y: 0, color: '#feca57', emoji: '🍌', deskOffset: { x: -50, y: 0 } },
  { id: 'research1', name: 'Claude Sonnet', role: 'Researcher', zone: 'research', x: 0, y: 0, color: '#48dbfb', emoji: '🔬', deskOffset: { x: -40, y: 0 } },
  { id: 'research2', name: 'Kimi K2.5', role: 'Researcher/Dev', zone: 'research', x: 0, y: 0, color: '#48dbfb', emoji: '🧠', deskOffset: { x: 40, y: 0 } },
  { id: 'dev1', name: 'Claude Opus', role: 'Senior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '💻', deskOffset: { x: -150, y: 0 } },
  { id: 'dev2', name: 'Codex', role: 'Senior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '⚡', deskOffset: { x: -50, y: 0 } },
  { id: 'dev3', name: 'Kimi K2.5', role: 'Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '🎯', deskOffset: { x: 50, y: 0 } },
  { id: 'dev4', name: 'GPT 4.1', role: 'Junior Developer', zone: 'engineering', x: 0, y: 0, color: '#1dd1a1', emoji: '🌱', deskOffset: { x: 150, y: 0 } }
];

const TASK_TEMPLATES: Task[] = [
  { id: '1', name: 'Research market trends', assignee: 'research1', status: 'pending' },
  { id: '2', name: 'Generate campaign visuals', assignee: 'creative', status: 'pending' },
  { id: '3', name: 'Build API endpoint', assignee: 'dev1', status: 'pending' },
  { id: '4', name: 'Code review', assignee: 'dev2', status: 'pending' },
  { id: '5', name: 'Write documentation', assignee: 'dev4', status: 'pending' },
  { id: '6', name: 'Analyze competitor', assignee: 'research2', status: 'pending' },
  { id: '7', name: 'Fix critical bug', assignee: 'dev1', status: 'pending' },
  { id: '8', name: 'Design new feature', assignee: 'creative', status: 'pending' }
];

const OfficeCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLog, setTaskLog] = useState<string[]>(['Welcome to Kreative HQ...']);
  const [isPaused, setIsPaused] = useState(false);
  const animationRef = useRef<number>();
  const dimensionsRef = useRef({ width: 0, height: 0 });

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

  const assignTask = useCallback(() => {
    const availableTasks = TASK_TEMPLATES.filter(t => !tasks.find(ct => ct.id === t.id && ct.status !== 'completed'));
    if (availableTasks.length === 0) {
      addLogEntry('All tasks completed! Reset to start over.');
      return;
    }

    const task = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    const newTask: Task = { ...task, id: `${task.id}-${Date.now()}`, status: 'in-progress' };
    
    setTasks(prev => [...prev, newTask]);
    addLogEntry(`📋 New task: "${task.name}" assigned`);

    setAgents(prev => prev.map(agent => {
      if (agent.id === task.assignee) {
        const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
        return {
          ...agent,
          targetX: zones.ops.x + agent.deskOffset.x,
          targetY: zones.ops.y + 60,
          currentTask: task.name
        };
      }
      return agent;
    }));

    // Return agent to desk after getting task
    setTimeout(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.id === task.assignee) {
          const zones = calculateZones(dimensionsRef.current.width, dimensionsRef.current.height);
          return {
            ...agent,
            targetX: zones[agent.zone].x + agent.deskOffset.x,
            targetY: zones[agent.zone].y + agent.deskOffset.y
          };
        }
        return agent;
      }));
      addLogEntry(`${task.assignee} started working on "${task.name}"`);
    }, 2000);
  }, [tasks, addLogEntry, calculateZones]);

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
      ctx.shadowBlur = 20;
      ctx.shadowColor = zone.color;
      ctx.fillStyle = zone.color + '40';
      ctx.fillRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h);
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, zone.x, zone.y - zone.h / 2 - 10);
    };

    const drawAgent = (agent: Agent, time: number) => {
      const bobOffset = Math.sin(time / 500 + agent.id.length) * 3;
      
      if (agent.targetX !== undefined) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = agent.color;
      }

      ctx.fillStyle = agent.color + '60';
      ctx.beginPath();
      ctx.arc(agent.x, agent.y + bobOffset, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.emoji, agent.x, agent.y + bobOffset + 8);

      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.fillText(agent.name, agent.x, agent.y + bobOffset + 40);

      const statusColor = agent.targetX !== undefined ? '#feca57' : '#1dd1a1';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(agent.x + 20, agent.y + bobOffset - 15, 6, 0, Math.PI * 2);
      ctx.fill();

      // Task indicator
      if (agent.currentTask) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText('📝', agent.x - 20, agent.y + bobOffset - 15);
      }
    };

    const drawConnections = (zones: Record<string, Zone>) => {
      const ceo = agents.find(a => a.id === 'ceo');
      const ops = agents.find(a => a.id === 'ops');
      
      if (ceo && ops) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(ceo.x, ceo.y + 40);
        ctx.lineTo(ops.x, ops.y - 40);
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
            const newX = agent.x + (dx / dist) * 3;
            const newY = agent.y + (dy / dist) * 3;
            
            if (Math.random() > 0.7) {
              setParticles(p => [...p, {
                x: newX, y: newY,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
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
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.02 }))
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
      drawConnections(zones);

      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      agents.forEach(agent => drawAgent(agent, time));

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍌 Kreative HQ', width / 2, 40);
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
        <button onClick={assignTask}>📋 New Task</button>
        <button onClick={togglePause}>{isPaused ? '▶️ Resume' : '⏸️ Pause'}</button>
        <button onClick={resetOffice}>🔄 Reset</button>
      </div>

      <div className="stats-panel">
        <h3>Active Tasks: {tasks.filter(t => t.status === 'in-progress').length}</h3>
        <h3>Completed: {tasks.filter(t => t.status === 'completed').length}</h3>
      </div>
    </div>
  );
};

export default OfficeCanvas;
