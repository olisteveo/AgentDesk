/**
 * Sprite system -- assets, directional sprite sheets, and direction helpers.
 *
 * All sprite-related constants and logic live here so OfficeCanvas
 * stays focused on rendering and game-loop orchestration.
 */

import type { SpriteDirection } from '../types';

// ── Sprite asset paths ──────────────────────────────────────────

export const SPRITE_ASSETS = {
  carpet: '/assets/carpet.png',
  officeWall: '/assets/office-wall.png',
  deskMini: '/assets/desk-mini.png',
  deskStandard: '/assets/desk-standard.png',
  deskPower: '/assets/desk-boss.png',
  meetingRoom: '/assets/meeting-room.png',
  avatar1: '/assets/avatar-01.png',
  avatar2: '/assets/avatar-02.png',
  avatar3: '/assets/avatar-03.png',
  avatar1Sheet: '/assets/avatar-01-sheet.png',
  avatar2Sheet: '/assets/avatar-02-sheet.png',
  avatar3Sheet: '/assets/avatar-03-sheet.png',
};

// ── Directional sprite sheet layout ─────────────────────────────
// Each sheet is a 3x3 grid:
//   Row 0: back-left,  back,  back-right
//   Row 1: left,       (---), right
//   Row 2: front-left, front, front-right

export const DIRECTION_GRID: Record<SpriteDirection, { row: number; col: number }> = {
  'back-left':   { row: 0, col: 0 },
  'back':        { row: 0, col: 1 },
  'back-right':  { row: 0, col: 2 },
  'left':        { row: 1, col: 0 },
  'right':       { row: 1, col: 2 },
  'front-left':  { row: 2, col: 0 },
  'front':       { row: 2, col: 1 },
  'front-right': { row: 2, col: 2 },
};

// Map single-avatar key -> its sprite sheet key in SPRITE_ASSETS
export const AVATAR_SHEET_MAP: Record<string, keyof typeof SPRITE_ASSETS> = {
  avatar1: 'avatar1Sheet',
  avatar2: 'avatar2Sheet',
  avatar3: 'avatar3Sheet',
};

// ── Desk sprite mapping ─────────────────────────────────────────
// Which desk sprite to use for each zone id.
// Agent desks cycle: desk1/2 -> mini, desk3/4 -> standard, desk5/6 -> power.

export const ZONE_DESK_SPRITE: Record<string, keyof typeof SPRITE_ASSETS> = {
  ceo:     'deskPower',
  desk1:   'deskMini',
  desk2:   'deskMini',
  desk3:   'deskStandard',
  desk4:   'deskStandard',
  desk5:   'deskPower',
  desk6:   'deskPower',
  meeting: 'meetingRoom',
};

// ── Desk-type -> sprite key mapping ────────────────────────────
// Used when the user picks a desk type during hiring.

export const DESK_TYPE_SPRITE: Record<string, keyof typeof SPRITE_ASSETS> = {
  mini: 'deskMini',
  standard: 'deskStandard',
  power: 'deskPower',
};

// Fallback avatar sprite per agent id (overridden by agent.avatar field)
export const AGENT_AVATAR_SPRITE: Record<string, keyof typeof SPRITE_ASSETS> = {
  ceo: 'avatar1',
};

// ── Direction calculation ───────────────────────────────────────

/**
 * Convert a movement delta (dx, dy) into one of 8 compass directions.
 * Uses `atan2` mapped to 45-degree sectors.
 */
export function getDirectionFromDelta(dx: number, dy: number): SpriteDirection {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
  if (angle >= -22.5 && angle < 22.5) return 'right';
  if (angle >= 22.5 && angle < 67.5) return 'front-right';
  if (angle >= 67.5 && angle < 112.5) return 'front';
  if (angle >= 112.5 && angle < 157.5) return 'front-left';
  if (angle >= 157.5 || angle < -157.5) return 'left';
  if (angle >= -157.5 && angle < -112.5) return 'back-left';
  if (angle >= -112.5 && angle < -67.5) return 'back';
  return 'back-right'; // -67.5 to -22.5
}
