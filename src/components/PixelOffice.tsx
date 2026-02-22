import React, { useRef, useEffect, useState, useCallback } from 'react';
import './PixelOffice.css';

const ASSETS = {
  carpet: '/assets/carpet.png',
  deskMini: '/assets/desk-mini.png',
  deskStandard: '/assets/desk-standard.png',
  deskPower: '/assets/desk-boss.png',
  avatar1: '/assets/avatar-01.png',
  avatar2: '/assets/avatar-02.png',
  avatar3: '/assets/avatar-03.png'
};

interface PixelOfficeProps {
  isPro: boolean;
}

// Desk sprite natural sizes (approximate from assets)
// desk-mini: has desk + monitor + filing cabinet
// desk-standard: has desk + monitor + plant + water cooler (wide)
// desk-boss: has desk + monitor (boss chair)
const DESK_CONFIGS = [
  {
    key: 'deskMini',
    label: 'Mini Desk',
    sublabel: 'GPT-4o-mini',
    modelColor: '#a5d4b4',
    tier: 'free',
    drawW: 140,
    drawH: 90,
  },
  {
    key: 'deskStandard',
    label: 'Standard Desk',
    sublabel: 'Claude Sonnet',
    modelColor: '#a5b4d4',
    tier: 'free',
    drawW: 200,
    drawH: 90,
  },
  {
    key: 'deskPower',
    label: 'Power Desk',
    sublabel: 'Claude Opus',
    modelColor: '#d4a5a5',
    tier: 'pro',
    drawW: 140,
    drawH: 90,
  },
];

const AVATAR_CONFIGS = [
  { key: 'avatar1', name: 'Max', role: 'Analyst', tier: 'free' },
  { key: 'avatar2', name: 'Sam', role: 'Writer', tier: 'free' },
  { key: 'avatar3', name: 'Alex', role: 'Coder', tier: 'pro' },
];

const PixelOffice: React.FC<PixelOfficeProps> = ({ isPro }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [loaded, setLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 480 });

  // Load all assets
  useEffect(() => {
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          // Colored placeholder so missing assets are visible
          const placeholder = document.createElement('canvas');
          placeholder.width = 64;
          placeholder.height = 64;
          const ctx = placeholder.getContext('2d')!;
          ctx.fillStyle = '#444';
          ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = '#888';
          ctx.font = '10px sans-serif';
          ctx.fillText('?', 28, 36);
          const placeholderImg = new Image();
          placeholderImg.src = placeholder.toDataURL();
          resolve(placeholderImg);
        };
        img.src = src;
      });
    };

    const assetEntries = Object.entries(ASSETS);
    Promise.all(
      assetEntries.map(([key, src]) => loadImage(src).then(img => [key, img] as [string, HTMLImageElement]))
    ).then(results => {
      const assetMap: Record<string, HTMLImageElement> = {};
      results.forEach(([key, img]) => { assetMap[key] = img; });
      setImages(assetMap);
      setLoaded(true);
    });
  }, []);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const w = Math.max(600, Math.floor(width));
        const h = Math.floor(w * 0.54); // ~16:8.7 aspect
        setCanvasSize({ width: w, height: h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    if (!loaded || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.imageSmoothingEnabled = false;

    // ── Background carpet ──────────────────────────────────────────
    const carpet = images.carpet;
    if (carpet) {
      // Tile the carpet at ~256px so it looks like a proper carpet repeat
      const tileSize = 256;
      const pattern = ctx.createPattern(carpet, 'repeat');
      if (pattern) {
        // Scale the pattern to tileSize x tileSize
        const scale = tileSize / carpet.naturalWidth;
        const mat = new DOMMatrix();
        mat.scaleSelf(scale, scale);
        pattern.setTransform(mat);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#4a3a6e';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      ctx.fillStyle = '#4a3a6e';
      ctx.fillRect(0, 0, W, H);
    }

    // Dark overlay to not oversaturate
    ctx.fillStyle = 'rgba(10, 10, 30, 0.45)';
    ctx.fillRect(0, 0, W, H);

    // ── Title bar ─────────────────────────────────────────────────
    const titleH = Math.round(H * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, titleH);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(H * 0.06)}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('Agent Desk', W / 2, titleH * 0.66);

    ctx.fillStyle = '#888';
    ctx.font = `${Math.round(H * 0.035)}px 'Courier New', monospace`;
    ctx.fillText('AI Agency Operations', W / 2, titleH * 0.92);

    // ── Tier badge ────────────────────────────────────────────────
    const badgeText = isPro ? 'PRO' : 'FREE';
    const badgeColor = isPro ? '#feca57' : '#667eea';
    ctx.fillStyle = badgeColor;
    ctx.font = `bold ${Math.round(H * 0.035)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(badgeText, W - 16, titleH * 0.66);

    // ── Desk layout ───────────────────────────────────────────────
    // Always use 3 slots; in free tier slot 3 is locked
    const totalSlots = 3;
    const visibleDesks = isPro
      ? DESK_CONFIGS
      : DESK_CONFIGS.filter(d => d.tier === 'free');

    const deskAreaTop = titleH + Math.round(H * 0.08);
    const deskAreaH = H - deskAreaTop - Math.round(H * 0.05);

    // Evenly space across 3 slots always
    const deskSpacing = W / (totalSlots + 1);

    visibleDesks.forEach((desk, i) => {
      const cx = Math.round(deskSpacing * (i + 1));
      const deskImg = images[desk.key];

      // Scale desk to fit area
      const maxDeskW = Math.min(desk.drawW, deskSpacing * 0.85);
      const scale = maxDeskW / desk.drawW;
      const dW = Math.round(desk.drawW * scale);
      const dH = Math.round(desk.drawH * scale);

      const deskX = cx - dW / 2;
      const deskY = deskAreaTop + Math.round(deskAreaH * 0.1);

      // Desk shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(deskX + 4, deskY + 6, dW, dH);

      if (deskImg) {
        ctx.drawImage(deskImg, deskX, deskY, dW, dH);
      } else {
        ctx.fillStyle = '#444';
        ctx.fillRect(deskX, deskY, dW, dH);
      }

      // Label above desk
      const labelY = deskY - 6;
      const labelW = Math.max(dW, 100);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(cx - labelW / 2, labelY - 26, labelW, 26);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(H * 0.033)}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(desk.label, cx, labelY - 12);

      // Model sub-label
      ctx.fillStyle = desk.modelColor;
      ctx.font = `${Math.round(H * 0.026)}px 'Courier New', monospace`;
      ctx.fillText(desk.sublabel, cx, labelY - 1);

      // Pro lock badge for desks that need pro
      if (desk.tier === 'pro' && !isPro) return; // shouldn't render but safety

      // Status indicator — green dot
      ctx.fillStyle = '#1dd1a1';
      ctx.beginPath();
      ctx.arc(cx + dW / 2 - 4, deskY + 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── Avatar below desk ──────────────────────────────────────
      const avatarCfg = AVATAR_CONFIGS[i];
      const avatarImg = images[avatarCfg?.key];
      const avH = Math.round(deskAreaH * 0.42);
      const avW = Math.round(avH * 0.55);
      const avX = cx - avW / 2;
      const avY = deskY + dH + Math.round(H * 0.015);

      if (avatarImg) {
        ctx.drawImage(avatarImg, avX, avY, avW, avH);
      } else {
        // Fallback person shape
        ctx.fillStyle = '#667eea';
        ctx.beginPath();
        ctx.arc(cx, avY + avH * 0.25, avH * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - avH * 0.15, avY + avH * 0.4, avH * 0.3, avH * 0.4);
      }

      // Name tag under avatar
      const nameTagY = avY + avH + 4;
      const nameTagW = Math.max(avW, 80);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(cx - nameTagW / 2, nameTagY, nameTagW, 28);

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(H * 0.028)}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(avatarCfg?.name ?? '?', cx, nameTagY + 12);

      ctx.fillStyle = '#888';
      ctx.font = `${Math.round(H * 0.022)}px 'Courier New', monospace`;
      ctx.fillText(avatarCfg?.role ?? '', cx, nameTagY + 24);
    });

    // ── Pro upgrade prompt (free tier) ────────────────────────────
    if (!isPro) {
      const lockX = Math.round(deskSpacing * 3);
      const lockY = deskAreaTop + Math.round(deskAreaH * 0.3);
      const boxW = Math.round(deskSpacing * 0.85);
      const boxH = Math.round(deskAreaH * 0.55);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeStyle = '#feca57';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(lockX - boxW / 2, lockY, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      // Lock icon
      ctx.fillStyle = '#feca57';
      ctx.font = `${Math.round(H * 0.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🔒', lockX, lockY + boxH * 0.45);

      ctx.fillStyle = '#feca57';
      ctx.font = `bold ${Math.round(H * 0.036)}px 'Courier New', monospace`;
      ctx.fillText('Power Desk', lockX, lockY + boxH * 0.65);

      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.round(H * 0.027)}px 'Courier New', monospace`;
      ctx.fillText('Go Pro to unlock', lockX, lockY + boxH * 0.8);
    }

    // ── Footer bar ────────────────────────────────────────────────
    const footerY = H - Math.round(H * 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, footerY, W, H - footerY);

    const agentCount = isPro ? 3 : 2;
    ctx.fillStyle = '#888';
    ctx.font = `${Math.round(H * 0.032)}px 'Courier New', monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${agentCount} agents active`, 16, footerY + Math.round((H - footerY) * 0.65));

    ctx.textAlign = 'right';
    ctx.fillText('agentdesk.work', W - 16, footerY + Math.round((H - footerY) * 0.65));

  }, [loaded, images, isPro, canvasSize]);

  // Redraw whenever deps change
  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="pixel-office-wrapper">
      {!loaded ? (
        <div className="pixel-office-loading">Loading assets...</div>
      ) : (
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="pixel-office-canvas"
        />
      )}
    </div>
  );
};

export default PixelOffice;
