import * as liquid from '../liquid';
import {
  LIQUID_BOTTOM,
  LIQUID_CENTER_Y,
  LIQUID_DEPTH,
  LIQUID_FILLET,
  LIQUID_HALF_WIDTH,
  LIQUID_ICON_SIZE,
  LIQUID_MIN_HALF_WIDTH,
  LIQUID_PARKED_PATH,
  dropletOutline,
  ellipsePath,
  inkCoverage,
  liquidGeometry,
  liquidHalfWidth,
  liquidPaths,
  liquidStretch,
} from '../liquid';

type WorkletShape = {
  __workletHash?: number;
  __closure?: Record<string, unknown>;
  __initData?: { code: string };
};

function parameterList(code: string): string {
  const open = code.indexOf('(');
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    if (code[i] === ')') depth -= 1;
    if (depth === 0) return code.slice(open + 1, i);
  }
  return code.slice(open + 1);
}

function numbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function xs(path: string): number[] {
  return numbers(path).filter((_, index) => index % 2 === 0);
}

function ys(path: string): number[] {
  return numbers(path).filter((_, index) => index % 2 === 1);
}

function depthNear(path: string, x: number): number {
  const values = numbers(path);
  let best = { distance: Number.POSITIVE_INFINITY, y: 0 };
  for (let i = 0; i + 1 < values.length; i += 2) {
    const distance = Math.abs(values[i] - x);
    if (distance < best.distance || (distance === best.distance && values[i + 1] > best.y)) {
      best = { distance, y: values[i + 1] };
    }
  }
  return best.y;
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function boundingBox(path: string): Box | null {
  const tokens = path.match(/[MLHVCAZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const xsSeen: number[] = [];
  const ysSeen: number[] = [];
  let x = 0;
  let y = 0;
  let command = '';
  let index = 0;
  const take = () => Number(tokens[index++]);
  const visit = (px: number, py: number) => {
    xsSeen.push(px);
    ysSeen.push(py);
  };
  while (index < tokens.length) {
    if (/[MLHVCAZ]/.test(tokens[index])) {
      command = tokens[index++];
      if (command === 'Z') {
        continue;
      }
    }
    if (command === 'M' || command === 'L') {
      x = take();
      y = take();
      visit(x, y);
    } else if (command === 'H') {
      x = take();
      visit(x, y);
    } else if (command === 'V') {
      y = take();
      visit(x, y);
    } else if (command === 'C') {
      for (let point = 0; point < 3; point += 1) {
        x = take();
        y = take();
        visit(x, y);
      }
    } else if (command === 'A') {
      const rx = take();
      const ry = take();
      take();
      take();
      take();
      x = take();
      y = take();
      visit(x, y);
      visit(x, y - ry);
      visit(x, y + ry);
      visit(x - rx, y);
    } else {
      return null;
    }
  }
  if (xsSeen.length === 0) {
    return null;
  }
  return { left: Math.min(...xsSeen), right: Math.max(...xsSeen), top: Math.min(...ysSeen), bottom: Math.max(...ysSeen) };
}

function hasArea(path: string): boolean {
  const box = boundingBox(path);
  return box !== null && box.right - box.left > 0 && box.bottom - box.top > 0;
}

const helpers = Object.entries(liquid).filter(([, value]) => typeof value === 'function') as [string, WorkletShape][];
const GEOMETRY = liquidGeometry(360, 60);

describe('liquid tab bar worklets', () => {
  it('compiles every exported geometry helper as a worklet', () => {
    expect(helpers.map(([name]) => name).sort()).toEqual(['dropletOutline', 'ellipsePath', 'inkCoverage', 'liquidGeometry', 'liquidHalfWidth', 'liquidPaths', 'liquidStretch']);
    for (const [name, fn] of helpers) {
      expect({ name, worklet: fn.__workletHash !== undefined }).toEqual({ name, worklet: true });
    }
  });

  it('never reads a captured value in a parameter default, which runs before the UI runtime unpacks the closure', () => {
    for (const [name, fn] of helpers) {
      const code = fn.__initData?.code ?? '';
      const params = parameterList(code);
      const captured = Object.keys(fn.__closure ?? {});
      const leaked = captured.filter((key) => new RegExp(`\\b${key}\\b`).test(params));
      expect({ name, leaked }).toEqual({ name, leaked: [] });
      expect({ name, defaults: /=/.test(params) }).toEqual({ name, defaults: false });
    }
  });

  it('carries the tab bar constants into the UI runtime through the closure, not through defaults', () => {
    const geometry = liquidGeometry as unknown as WorkletShape;
    expect(Object.keys(geometry.__closure ?? {}).sort()).toEqual(
      ['LIQUID_BOTTOM', 'LIQUID_DEPTH', 'LIQUID_FILLET', 'LIQUID_GLOW', 'LIQUID_HALF_WIDTH', 'LIQUID_REACH', 'LIQUID_RIM'].sort(),
    );
    expect(GEOMETRY).toMatchObject({ width: 360, height: 60, halfWidth: LIQUID_HALF_WIDTH, fillet: LIQUID_FILLET, depth: LIQUID_DEPTH, bottom: LIQUID_BOTTOM });
    const paths = liquidPaths as unknown as WorkletShape;
    expect(Object.keys(paths.__closure ?? {})).toEqual(expect.arrayContaining(['EMPTY', 'liquidStretch', 'dropletOutline', 'ellipsePath']));
    for (const [name, fn] of helpers) {
      for (const [key, value] of Object.entries(fn.__closure ?? {})) {
        if (typeof value === 'function') {
          expect({ name, key, worklet: (value as WorkletShape).__workletHash !== undefined }).toEqual({ name, key, worklet: true });
        }
      }
    }
  });

  it('uses the default icon size when none is passed', () => {
    const center = 100;
    expect(inkCoverage(center, center, center, LIQUID_HALF_WIDTH)).toBe(inkCoverage(center, center, center, LIQUID_HALF_WIDTH, LIQUID_ICON_SIZE));
    expect(inkCoverage(center, center, center, LIQUID_HALF_WIDTH)).toBe(1);
    expect(inkCoverage(center + 200, center + 200, center, LIQUID_HALF_WIDTH)).toBe(0);
    expect(inkCoverage(Number.NaN, Number.NaN, center, LIQUID_HALF_WIDTH)).toBe(0);
  });

  it('sizes the droplet to the narrowest tab, never wider than the default and never too thin to hold the icon', () => {
    expect(liquidHalfWidth(0)).toBe(LIQUID_HALF_WIDTH);
    expect(liquidHalfWidth(Number.NaN)).toBe(LIQUID_HALF_WIDTH);
    expect(liquidHalfWidth(120)).toBe(LIQUID_HALF_WIDTH);
    expect(liquidHalfWidth(50)).toBe(LIQUID_MIN_HALF_WIDTH + 1);
    expect(liquidHalfWidth(10)).toBe(LIQUID_MIN_HALF_WIDTH);
    expect(LIQUID_MIN_HALF_WIDTH).toBeGreaterThan(LIQUID_ICON_SIZE / 2);
    expect(liquidGeometry(100, 60, 18).halfWidth).toBe(18);
  });
});

describe('liquid droplet geometry', () => {
  it('parks every path off the canvas until the bar is measured and a tab is chosen', () => {
    const parked = { body: LIQUID_PARKED_PATH, edge: LIQUID_PARKED_PATH, glow: LIQUID_PARKED_PATH, rim: LIQUID_PARKED_PATH };
    expect(liquidPaths(100, 100, liquidGeometry(0, 60))).toEqual(parked);
    expect(liquidPaths(Number.NaN, 100, GEOMETRY)).toEqual(parked);
    expect(liquidPaths(100, Number.NaN, GEOMETRY)).toEqual(parked);
    const box = boundingBox(LIQUID_PARKED_PATH);
    expect(box).not.toBeNull();
    expect((box as Box).right).toBeLessThan(0);
    expect((box as Box).bottom).toBeLessThan(0);
    expect(ellipsePath(10, 10, 0, 4)).toBe('');
  });

  it('never hands a gradient a zero-size path, which Android rejects with "ending radius must be > 0" (Android QA)', () => {
    const empty = liquidPaths(Number.NaN, Number.NaN, GEOMETRY);
    for (const key of ['body', 'glow', 'rim'] as const) {
      expect({ key, area: hasArea(empty[key]) }).toEqual({ key, area: true });
    }
    for (const [head, tail, width] of [
      [100, 100, 360],
      [300, 40, 360],
      [0, 0, 360],
      [12, 12, 24],
      [Number.NaN, 40, 360],
      [40, 40, 0],
    ]) {
      const paths = liquidPaths(head, tail, liquidGeometry(width, 60, liquidHalfWidth(width / 4)));
      for (const key of ['body', 'glow', 'rim'] as const) {
        expect({ head, tail, width, key, area: hasArea(paths[key]) }).toEqual({ head, tail, width, key, area: true });
      }
    }
    expect(boundingBox('M0 0')).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(hasArea('')).toBe(false);
  });

  it('hangs a closed droplet from the top edge at rest, symmetric about the tab and deep enough to hold the icon', () => {
    const paths = liquidPaths(100, 100, GEOMETRY);
    expect(paths.body.endsWith('Z')).toBe(true);
    expect(paths.edge.endsWith('Z')).toBe(false);
    expect(paths.body.startsWith(paths.edge)).toBe(true);
    const outline = xs(paths.edge);
    expect(Math.min(...outline)).toBe(100 - LIQUID_HALF_WIDTH - LIQUID_FILLET);
    expect(Math.max(...outline)).toBe(100 + LIQUID_HALF_WIDTH + LIQUID_FILLET);
    expect(Math.min(...ys(paths.edge))).toBe(0);
    expect(Math.max(...ys(paths.edge))).toBe(LIQUID_DEPTH);
    expect(numbers(paths.edge).slice(0, 2)).toEqual([100 - LIQUID_HALF_WIDTH - LIQUID_FILLET, 0]);
    expect(numbers(paths.edge).slice(-2)).toEqual([100 + LIQUID_HALF_WIDTH + LIQUID_FILLET, 0]);
    expect(LIQUID_DEPTH).toBeGreaterThan(LIQUID_CENTER_Y + LIQUID_ICON_SIZE / 2);
    expect(LIQUID_DEPTH - (LIQUID_CENTER_Y + LIQUID_ICON_SIZE / 2)).toBeLessThanOrEqual(4);
    const mirrored = xs(paths.edge).map((x) => Math.round((200 - x) * 100) / 100).sort((a, b) => a - b);
    expect(mirrored).toEqual([...xs(paths.edge)].sort((a, b) => a - b));
  });

  it('keeps every outline point inside the bar, between the top edge and the droplet depth', () => {
    for (const [head, tail] of [
      [100, 100],
      [200, 120],
      [120, 200],
      [300, 40],
    ]) {
      const edge = liquidPaths(head, tail, GEOMETRY).edge;
      expect(Math.min(...ys(edge))).toBe(0);
      expect(Math.max(...ys(edge))).toBeLessThanOrEqual(LIQUID_DEPTH);
      expect(Math.max(...ys(edge))).toBeLessThan(GEOMETRY.height);
    }
  });

  it('stretches from the old tab to the new one, shallower and narrower at the trailing end, with a neck between', () => {
    expect(liquidStretch(200, 120, LIQUID_HALF_WIDTH)).toBeCloseTo(80 / (4 * LIQUID_HALF_WIDTH));
    expect(liquidStretch(400, 0, LIQUID_HALF_WIDTH)).toBe(1);
    expect(liquidStretch(5, 5, 0)).toBe(0);
    const forward = liquidPaths(300, 60, GEOMETRY).edge;
    const backward = liquidPaths(60, 300, GEOMETRY).edge;
    expect(forward).not.toEqual(backward);
    expect(depthNear(forward, 300)).toBeGreaterThan(depthNear(forward, 60));
    expect(depthNear(backward, 60)).toBeGreaterThan(depthNear(backward, 300));
    expect(depthNear(forward, 180)).toBeLessThan(depthNear(forward, 60));
    expect(depthNear(forward, 180)).toBeGreaterThanOrEqual(LIQUID_FILLET);
    expect(Math.max(...xs(forward))).toBeGreaterThan(300 + LIQUID_HALF_WIDTH);
    expect(Math.max(...xs(forward))).toBeLessThanOrEqual(300 + LIQUID_HALF_WIDTH + LIQUID_FILLET);
    expect(60 - Math.min(...xs(forward))).toBeLessThan(Math.max(...xs(forward)) - 300);
  });

  it('lights the top edge on both sides of the droplet and centres the glow under it', () => {
    const paths = liquidPaths(150, 150, GEOMETRY);
    const rim = numbers(paths.rim);
    expect((rim[0] + rim[2]) / 2).toBe(150);
    expect(rim[2] - rim[0]).toBeGreaterThan(2 * (LIQUID_HALF_WIDTH + LIQUID_FILLET));
    expect(Math.max(...ys(paths.rim))).toBeLessThanOrEqual(2);
    const glow = numbers(paths.glow);
    expect((glow[0] + glow[7]) / 2).toBe(150);
    const glowBottom = glow[1] + glow[3];
    expect(glowBottom).toBeLessThanOrEqual(LIQUID_CENTER_Y + LIQUID_ICON_SIZE / 2 + 4);
  });

  it('lights every icon the liquid passes under, fading at the droplet edge', () => {
    expect(inkCoverage(300, 100, 200, LIQUID_HALF_WIDTH)).toBe(1);
    const edge = 100 - LIQUID_HALF_WIDTH;
    expect(inkCoverage(100, 100, edge, LIQUID_HALF_WIDTH)).toBeCloseTo(0.5);
    expect(inkCoverage(100, 100, edge - LIQUID_ICON_SIZE, LIQUID_HALF_WIDTH)).toBe(0);
  });

  it('clamps the fillet and the rounded bottom so a shallow droplet stays a valid closed shape', () => {
    const shallow = dropletOutline({ from: 50, to: 50, leftHalf: 20, rightHalf: 20, leftDepth: 8, rightDepth: 8, neckDepth: 8, fillet: 12, bottom: 20 });
    expect(ys(shallow).every((y) => y >= 0 && y <= 8)).toBe(true);
    expect(numbers(shallow).every((value) => Number.isFinite(value))).toBe(true);
  });
});
