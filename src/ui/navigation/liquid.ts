export interface LiquidGeometry {
  readonly width: number;
  readonly height: number;
  readonly halfWidth: number;
  readonly fillet: number;
  readonly depth: number;
  readonly bottom: number;
  readonly reach: number;
  readonly rim: number;
  readonly glow: number;
}

export interface LiquidPaths {
  readonly body: string;
  readonly edge: string;
  readonly glow: string;
  readonly rim: string;
}

export const LIQUID_HALF_WIDTH = 22;
export const LIQUID_MIN_HALF_WIDTH = 16;
export const LIQUID_SLOT_MARGIN = 8;
export const LIQUID_FILLET = 12;
export const LIQUID_DEPTH = 32;
export const LIQUID_BOTTOM = 20;
export const LIQUID_CENTER_Y = 18;
export const LIQUID_ICON_SIZE = 24;
export const LIQUID_REACH = 32;
export const LIQUID_RIM = 1.5;
export const LIQUID_GLOW = 12;
export const LIQUID_GLOW_DROP = 2;
export const LIQUID_LEAD_THIN = 0.08;
export const LIQUID_TRAIL_THIN = 0.4;
export const LIQUID_TRAIL_NARROW = 0.3;
export const LIQUID_NECK = 0.45;
export const LIQUID_STRETCH_SPAN = 4;

export const LIQUID_PARKED_PATH = 'M-4 -4H-2V-2H-4Z';

const KAPPA = 0.5523;

const EMPTY: LiquidPaths = { body: LIQUID_PARKED_PATH, edge: LIQUID_PARKED_PATH, glow: LIQUID_PARKED_PATH, rim: LIQUID_PARKED_PATH };

function fixed(value: number): number {
  'worklet';
  return Math.round(value * 100) / 100;
}

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

export function liquidHalfWidth(slotWidth: number): number {
  'worklet';
  if (!(slotWidth > 0)) {
    return LIQUID_HALF_WIDTH;
  }
  return clamp(slotWidth / 2 - LIQUID_SLOT_MARGIN, LIQUID_MIN_HALF_WIDTH, LIQUID_HALF_WIDTH);
}

export function liquidGeometry(width: number, height: number, halfWidth?: number): LiquidGeometry {
  'worklet';
  return {
    width,
    height,
    halfWidth: halfWidth ?? LIQUID_HALF_WIDTH,
    fillet: LIQUID_FILLET,
    depth: LIQUID_DEPTH,
    bottom: LIQUID_BOTTOM,
    reach: LIQUID_REACH,
    rim: LIQUID_RIM,
    glow: LIQUID_GLOW,
  };
}

export function liquidStretch(head: number, tail: number, halfWidth: number): number {
  'worklet';
  if (!(halfWidth > 0)) {
    return 0;
  }
  return clamp(Math.abs(head - tail) / (LIQUID_STRETCH_SPAN * halfWidth), 0, 1);
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  'worklet';
  if (!(rx > 0.01) || !(ry > 0.01)) {
    return '';
  }
  const left = fixed(cx - rx);
  const right = fixed(cx + rx);
  const y = fixed(cy);
  const a = fixed(rx);
  const b = fixed(ry);
  return `M${left} ${y}A${a} ${b} 0 1 1 ${right} ${y}A${a} ${b} 0 1 1 ${left} ${y}Z`;
}

export interface DropletShape {
  readonly from: number;
  readonly to: number;
  readonly leftHalf: number;
  readonly rightHalf: number;
  readonly leftDepth: number;
  readonly rightDepth: number;
  readonly neckDepth: number;
  readonly fillet: number;
  readonly bottom: number;
}

export function dropletOutline(shape: DropletShape): string {
  'worklet';
  const { from, to, leftHalf, rightHalf, leftDepth, rightDepth, neckDepth } = shape;
  const fillet = clamp(shape.fillet, 0, Math.min(leftDepth, rightDepth) / 2);
  const leftRound = clamp(shape.bottom, 0, Math.min(leftHalf, leftDepth - fillet));
  const rightRound = clamp(shape.bottom, 0, Math.min(rightHalf, rightDepth - fillet));
  const leftWall = from - leftHalf;
  const rightWall = to + rightHalf;
  const middle = (from + to) / 2;
  const quarter = (to - from) / 4;
  const k = KAPPA;
  return (
    `M${fixed(leftWall - fillet)} 0` +
    `C${fixed(leftWall - fillet + k * fillet)} 0 ${fixed(leftWall)} ${fixed(fillet - k * fillet)} ${fixed(leftWall)} ${fixed(fillet)}` +
    `L${fixed(leftWall)} ${fixed(leftDepth - leftRound)}` +
    `C${fixed(leftWall)} ${fixed(leftDepth - leftRound + k * leftRound)} ${fixed(from - k * leftHalf)} ${fixed(leftDepth)} ${fixed(from)} ${fixed(leftDepth)}` +
    `C${fixed(from + quarter)} ${fixed(leftDepth)} ${fixed(middle - quarter)} ${fixed(neckDepth)} ${fixed(middle)} ${fixed(neckDepth)}` +
    `C${fixed(middle + quarter)} ${fixed(neckDepth)} ${fixed(to - quarter)} ${fixed(rightDepth)} ${fixed(to)} ${fixed(rightDepth)}` +
    `C${fixed(to + k * rightHalf)} ${fixed(rightDepth)} ${fixed(rightWall)} ${fixed(rightDepth - rightRound + k * rightRound)} ${fixed(rightWall)} ${fixed(rightDepth - rightRound)}` +
    `L${fixed(rightWall)} ${fixed(fillet)}` +
    `C${fixed(rightWall)} ${fixed(fillet - k * fillet)} ${fixed(rightWall + fillet - k * fillet)} 0 ${fixed(rightWall + fillet)} 0`
  );
}

export function liquidPaths(head: number, tail: number, geometry: LiquidGeometry): LiquidPaths {
  'worklet';
  if (!(geometry.width > 0) || !Number.isFinite(head) || !Number.isFinite(tail)) {
    return EMPTY;
  }
  const from = Math.min(head, tail);
  const to = Math.max(head, tail);
  const stretch = liquidStretch(head, tail, geometry.halfWidth);
  const leadDepth = geometry.depth * (1 - LIQUID_LEAD_THIN * stretch);
  const trailDepth = geometry.depth * (1 - LIQUID_TRAIL_THIN * stretch);
  const trailHalf = geometry.halfWidth * (1 - LIQUID_TRAIL_NARROW * stretch);
  const forward = head >= tail;
  const leftDepth = forward ? trailDepth : leadDepth;
  const rightDepth = forward ? leadDepth : trailDepth;
  const leftHalf = forward ? trailHalf : geometry.halfWidth;
  const rightHalf = forward ? geometry.halfWidth : trailHalf;
  const neckDepth = Math.max(geometry.fillet, Math.min(leftDepth, rightDepth) * (1 - LIQUID_NECK * stretch));
  const edge = dropletOutline({ from, to, leftHalf, rightHalf, leftDepth, rightDepth, neckDepth, fillet: geometry.fillet, bottom: geometry.bottom });
  const outer = geometry.fillet + geometry.reach;
  const rimLeft = fixed(from - leftHalf - outer);
  const rimRight = fixed(to + rightHalf + outer);
  const deepest = Math.max(leftDepth, rightDepth);
  const middle = (from - leftHalf + to + rightHalf) / 2;
  const spread = (to + rightHalf - (from - leftHalf)) / 2;
  const glow = ellipsePath(middle, deepest / 2, spread + geometry.glow, deepest / 2 + LIQUID_GLOW_DROP);
  return {
    body: `${edge}Z`,
    edge,
    glow: glow === '' ? EMPTY.glow : glow,
    rim: `M${rimLeft} 0H${rimRight}V${fixed(geometry.rim)}H${rimLeft}Z`,
  };
}

export function inkCoverage(head: number, tail: number, center: number, halfWidth: number, iconSize?: number): number {
  'worklet';
  if (!Number.isFinite(head) || !Number.isFinite(tail)) {
    return 0;
  }
  const half = (iconSize ?? LIQUID_ICON_SIZE) / 2;
  const outside = Math.max(0, Math.min(head, tail) - center, center - Math.max(head, tail));
  return clamp((halfWidth + half - outside) / (2 * half), 0, 1);
}
