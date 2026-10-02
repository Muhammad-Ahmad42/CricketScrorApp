import type { PoolId, TeamId, TieBreakerKind, UnevenPoolNormalization } from '../../types';
import type { Outcome } from './outcomes';
import { MAX_SCENARIOS } from './scenarioModel';
import type { OpenFixture, Working } from './scenarioModel';
import { CRITERION_CODE, rankByCounting, rankScenario, usesHeadToHead } from './scenarioRanking';
import type { ViewLayout } from './slotLayout';

export interface CrossPool {
  readonly poolId: PoolId;
  readonly teams: readonly TeamId[];
  readonly work: Working;
  readonly fixed: { readonly best: readonly number[]; readonly worst: readonly number[] } | null;
  readonly played: readonly number[];
}

export interface CrossVerdict {
  readonly qualified: boolean;
  readonly eliminated: boolean;
  readonly winsGuarantee: boolean;
}

interface Ranked {
  readonly best: number[];
  readonly worst: number[];
}

interface Step {
  readonly pool: number;
  readonly k: number;
  readonly fixture: OpenFixture;
}

const CROSS_CRITERIA: ReadonlySet<TieBreakerKind> = new Set(['points', 'wins', 'fewer_losses', 'seed']);

export function crossCodes(prefix: readonly TieBreakerKind[]): readonly number[] {
  const codes: number[] = [];
  for (const kind of prefix) {
    if (!CROSS_CRITERIA.has(kind)) break;
    codes.push(CRITERION_CODE[kind] ?? 0);
  }
  return codes;
}

class JointSearch {
  private readonly owner: number[] = [];
  private readonly local: number[] = [];
  private readonly offsets: number[] = [];
  private readonly overallSlots: ReadonlySet<number> | null;
  private readonly ranked: Ranked[];
  private readonly codes: readonly number[];
  private readonly openCount: number[];
  private readonly openWins: number[];
  private readonly canMiss: boolean[];
  private readonly canQualify: boolean[];
  private readonly canMissWinning: boolean[];
  private readonly steps: readonly Step[];
  private settled = false;

  constructor(
    private readonly pools: readonly CrossPool[],
    private readonly layout: ViewLayout,
    prefix: readonly TieBreakerKind[],
  ) {
    pools.forEach((pool, p) => {
      this.offsets.push(this.owner.length);
      pool.teams.forEach((_, i) => {
        this.owner.push(p);
        this.local.push(i);
      });
    });
    const total = this.owner.length;
    const overall = layout.overall?.count ?? 0;
    this.overallSlots = overall > 0 ? new Set(Array.from({ length: overall }, (_, k) => k + 1)) : null;
    this.codes = crossCodes(prefix);
    this.ranked = pools.map((pool) => ({
      best: pool.fixed ? [...pool.fixed.best] : new Array<number>(pool.teams.length).fill(1),
      worst: pool.fixed ? [...pool.fixed.worst] : new Array<number>(pool.teams.length).fill(pool.teams.length),
    }));
    this.openCount = new Array<number>(total).fill(0);
    this.openWins = new Array<number>(total).fill(0);
    this.canMiss = new Array<boolean>(total).fill(false);
    this.canQualify = new Array<boolean>(total).fill(false);
    this.canMissWinning = new Array<boolean>(total).fill(false);
    const steps: Step[] = [];
    pools.forEach((pool, p) => {
      if (pool.fixed) return;
      pool.work.open.forEach((fixture, k) => {
        steps.push({ pool: p, k, fixture });
        this.openCount[this.globalOf(p, fixture.i)] += 1;
        this.openCount[this.globalOf(p, fixture.j)] += 1;
      });
    });
    this.steps = steps;
  }

  scenarioCount(): number {
    return this.steps.reduce((total, step) => total * step.fixture.outcomes.length, 1);
  }

  fixtureCount(): number {
    return this.steps.length;
  }

  run(): ReadonlyMap<TeamId, CrossVerdict> {
    this.visit(0);
    const verdicts = new Map<TeamId, CrossVerdict>();
    this.owner.forEach((p, g) => {
      verdicts.set(this.pools[p].teams[this.local[g]], {
        qualified: !this.canMiss[g],
        eliminated: !this.canQualify[g],
        winsGuarantee: this.openCount[g] > 0 && !this.canMissWinning[g],
      });
    });
    return verdicts;
  }

  private globalOf(pool: number, i: number): number {
    return this.offsets[pool] + i;
  }

  private visit(depth: number): void {
    if (this.settled) return;
    if (depth === this.steps.length) {
      this.leaf();
      return;
    }
    const step = this.steps[depth];
    const work = this.pools[step.pool].work;
    for (const option of step.fixture.outcomes) {
      work.chosen[step.k] = option;
      this.apply(step, option, 1);
      this.visit(depth + 1);
      this.apply(step, option, -1);
      if (this.settled) break;
    }
    work.chosen[step.k] = null;
  }

  private apply(step: Step, option: Outcome, sign: number): void {
    const work = this.pools[step.pool].work;
    const { i, j } = step.fixture;
    work.points[i] += sign * option.pointsA;
    work.won[i] += sign * option.winA;
    work.lost[i] += sign * option.lossA;
    work.points[j] += sign * option.pointsB;
    work.won[j] += sign * option.winB;
    work.lost[j] += sign * option.lossB;
    this.openWins[this.globalOf(step.pool, i)] += sign * option.winA;
    this.openWins[this.globalOf(step.pool, j)] += sign * option.winB;
  }

  private rankOpenPools(): void {
    this.pools.forEach((pool, p) => {
      if (pool.fixed) return;
      const target = this.ranked[p];
      if (usesHeadToHead(pool.work.prefix)) {
        const result = rankScenario(pool.work);
        for (let t = 0; t < pool.teams.length; t += 1) {
          target.best[t] = result.best[t];
          target.worst[t] = result.worst[t];
        }
        return;
      }
      const codes = pool.work.prefix.map((kind) => CRITERION_CODE[kind] ?? 0);
      rankByCounting(pool.work, codes, target.best, target.worst);
    });
  }

  private leaf(): void {
    this.rankOpenPools();
    let open = false;
    for (let g = 0; g < this.owner.length; g += 1) {
      const outcome = this.evaluate(g);
      if (!outcome.certain) {
        this.canMiss[g] = true;
        if (this.openCount[g] > 0 && this.openWins[g] === this.openCount[g]) this.canMissWinning[g] = true;
      }
      if (outcome.possible) this.canQualify[g] = true;
      if (!this.canMiss[g] || !this.canQualify[g] || (this.openCount[g] > 0 && !this.canMissWinning[g])) open = true;
    }
    if (!open) this.settled = true;
  }

  private key(g: number, code: number, normalization: UnevenPoolNormalization): number {
    const pool = this.pools[this.owner[g]];
    const i = this.local[g];
    const work = pool.work;
    if (code === 0) {
      if (normalization !== 'per_match_average') return work.points[i];
      const played = pool.played[i];
      return played > 0 ? work.points[i] / played : Number.NEGATIVE_INFINITY;
    }
    if (code === 1) return work.won[i];
    if (code === 2) return -work.lost[i];
    const seed = work.seeds[i];
    return seed === null ? Number.NEGATIVE_INFINITY : -seed;
  }

  private compare(u: number, t: number, normalization: UnevenPoolNormalization): number {
    for (const code of this.codes) {
      const a = this.key(u, code, normalization);
      const b = this.key(t, code, normalization);
      if (a !== b) return a > b ? 1 : -1;
    }
    return 0;
  }

  private bestOfRanks(g: number, position: number, normalization: UnevenPoolNormalization): { readonly best: number; readonly worst: number } {
    let best = 1;
    let worst = 1;
    const own = this.owner[g];
    this.pools.forEach((pool, p) => {
      const start = this.offsets[p];
      if (p === own || pool.teams.length < position) return;
      const ranked = this.ranked[p];
      let anyLevelOrAbove = false;
      let allAbove = true;
      for (let i = 0; i < pool.teams.length; i += 1) {
        if (ranked.best[i] > position || ranked.worst[i] < position) continue;
        const order = this.compare(start + i, g, normalization);
        if (order >= 0) anyLevelOrAbove = true;
        if (order <= 0) allAbove = false;
      }
      if (anyLevelOrAbove) worst += 1;
      if (allAbove) best += 1;
    });
    return { best, worst };
  }

  private overallRanks(g: number): { readonly best: number; readonly worst: number } {
    let best = 1;
    let worst = 1;
    this.pools.forEach((pool, p) => {
      const start = this.offsets[p];
      const ranked = this.ranked[p];
      const holders = this.layout.poolSlots.get(pool.poolId) ?? new Set<number>();
      const seen = new Set<number>();
      for (let i = 0; i < pool.teams.length; i += 1) {
        const from = ranked.best[i];
        if (seen.has(from)) continue;
        seen.add(from);
        const to = ranked.worst[i];
        let held = 0;
        for (let position = from; position <= to; position += 1) if (holders.has(position)) held += 1;
        const own = this.owner[g] === p && ranked.best[this.local[g]] === from;
        const free = to - from + 1 - held - (own ? 1 : 0);
        if (free <= 0) continue;
        const order = own ? 0 : this.compare(start + i, g, 'raw');
        if (order >= 0) worst += free;
        if (order > 0) best += free;
      }
    });
    return { best, worst };
  }

  private evaluate(g: number): { readonly certain: boolean; readonly possible: boolean } {
    const pool = this.pools[this.owner[g]];
    const ranked = this.ranked[this.owner[g]];
    const i = this.local[g];
    const holders = this.layout.poolSlots.get(pool.poolId) ?? new Set<number>();
    let certain = true;
    let possible = false;
    for (let position = ranked.best[i]; position <= ranked.worst[i]; position += 1) {
      if (holders.has(position)) {
        possible = true;
        continue;
      }
      const bestOf = this.layout.bestOf.get(position);
      let range: { readonly best: number; readonly worst: number } | null = null;
      let slots: ReadonlySet<number> | null = null;
      if (bestOf) {
        range = this.bestOfRanks(g, position, bestOf.normalization ?? 'raw');
        slots = bestOf.ranks;
      } else if (this.overallSlots) {
        range = this.overallRanks(g);
        slots = this.overallSlots;
      }
      if (!range || !slots) {
        certain = false;
        continue;
      }
      let all = true;
      for (let rank = range.best; rank <= range.worst; rank += 1) {
        if (slots.has(rank)) possible = true;
        else all = false;
      }
      if (!all) certain = false;
    }
    return { certain, possible };
  }
}

export function jointVerdicts(
  pools: readonly CrossPool[],
  layout: ViewLayout,
  prefix: readonly TieBreakerKind[],
  limit: number,
): ReadonlyMap<TeamId, CrossVerdict> | null {
  const search = new JointSearch(pools, layout, prefix);
  if (search.fixtureCount() > limit || search.scenarioCount() > MAX_SCENARIOS) return null;
  return search.run();
}
