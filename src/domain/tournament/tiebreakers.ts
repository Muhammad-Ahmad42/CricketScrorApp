import type { Runs, TeamId, TieBreakerKind, TournamentOverride } from '../types';
import {
  compareHeadToHead,
  compareRecords,
  CRITERION_LABEL,
  CRITERION_PHRASE,
  headToHeadValueText,
  isHeadToHead,
  isResolution,
  recordValueText,
  splitSorted,
} from './evaluation/criteria';
import type { HeadToHeadCriterion, RecordCriterion } from './evaluation/criteria';
import { formatPoints, joinNames } from './evaluation/format';

export interface TeamRecord {
  readonly teamId: TeamId;
  readonly points: number;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
  readonly noResult: number;
  readonly nrr: number | null;
  readonly runsScored: Runs;
  readonly wicketsTaken: number;
  readonly seed: number | null;
  readonly name: string;
}

export interface HeadToHeadRecord {
  readonly points: number;
  readonly wins: number;
  readonly matchesPlayed: number;
  readonly nrr: number | null;
}

export interface RankContext {
  readonly headToHead: (teamIds: readonly TeamId[]) => {
    readonly records: ReadonlyMap<TeamId, HeadToHeadRecord>;
    readonly complete: boolean;
  };
  readonly headToHeadRequiresCompleteMiniLeague: boolean;
  readonly resolutions: readonly Extract<TournamentOverride, { readonly kind: 'tie_resolution' }>[];
}

export interface RankedTeam {
  readonly teamId: TeamId;
  readonly position: number;
  readonly shared: boolean;
  readonly separatedBy: TieBreakerKind | null;
  readonly detail: string;
  readonly headline: string;
}

type Resolution = RankContext['resolutions'][number];

interface Run {
  readonly teams: readonly TeamRecord[];
  readonly path: readonly number[];
}

interface StepEntry {
  readonly separatedAs: TieBreakerKind;
  readonly describe: (upper: TeamRecord, lower: TeamRecord) => string;
  readonly headline: (upper: TeamRecord, lower: TeamRecord) => string;
  readonly skipNote: string | null;
}

const SHORT_PHRASE: { readonly [K in TieBreakerKind]: string } = {
  ...CRITERION_PHRASE,
  nrr: 'NRR',
  head_to_head_nrr: 'head-to-head NRR',
};

function aheadOn(kind: TieBreakerKind): (upper: TeamRecord, lower: TeamRecord) => string {
  return (_upper, lower) => `Ahead of ${lower.name} on ${SHORT_PHRASE[kind]}`;
}

interface CriterionOutcome {
  readonly groups: readonly (readonly TeamRecord[])[];
  readonly entry: StepEntry;
}

const EMPTY_HEAD_TO_HEAD: HeadToHeadRecord = { points: 0, wins: 0, matchesPlayed: 0, nrr: null };

function recordOutcome(kind: RecordCriterion, run: readonly TeamRecord[]): CriterionOutcome {
  return {
    groups: splitSorted(run, (a, b) => compareRecords(kind, a, b)),
    entry: {
      separatedAs: kind,
      skipNote: null,
      headline: kind === 'points' ? (upper, lower) => `${formatPoints(upper.points - lower.points)} pts ahead of ${lower.name}` : aheadOn(kind),
      describe: (upper, lower) =>
        kind === 'points'
          ? `${recordValueText(kind, upper)}, ${formatPoints(upper.points - lower.points)} ahead of ${lower.name}`
          : kind === 'nrr' && (upper.nrr === null || lower.nrr === null)
            ? nrrAgainstUnplayed(upper, lower)
            : `Ahead of ${lower.name} on ${CRITERION_PHRASE[kind]} (${recordValueText(kind, upper)} vs ${recordValueText(kind, lower)})`,
    },
  };
}

function nrrAgainstUnplayed(upper: TeamRecord, lower: TeamRecord): string {
  if (upper.nrr !== null) return `Ahead of ${lower.name} on net run rate (${recordValueText('nrr', upper)}; ${lower.name} have no net run rate yet)`;
  if (lower.nrr !== null) return `Ahead of ${lower.name} on net run rate (no net run rate yet vs ${recordValueText('nrr', lower)})`;
  return `Ahead of ${lower.name}; neither team has a net run rate yet`;
}

function missingPairs(run: readonly TeamRecord[], ctx: RankContext): string {
  const pairs: string[] = [];
  for (let i = 0; i < run.length; i += 1) {
    for (let j = i + 1; j < run.length; j += 1) {
      if (!ctx.headToHead([run[i].teamId, run[j].teamId]).complete) pairs.push(`${run[i].name} v ${run[j].name}`);
    }
  }
  if (pairs.length === 0 || pairs.length > 3) return `the mini-league among ${joinNames(run.map((team) => team.name))} is not complete`;
  return `${joinNames(pairs)} ${pairs.length === 1 ? 'was' : 'were'} not completed`;
}

function headToHeadOutcome(kind: HeadToHeadCriterion, run: readonly TeamRecord[], ctx: RankContext): CriterionOutcome {
  const league = ctx.headToHead(run.map((team) => team.teamId));
  if (ctx.headToHeadRequiresCompleteMiniLeague && !league.complete) {
    return {
      groups: [run],
      entry: {
        separatedAs: kind,
        skipNote: `Head-to-head not used: ${missingPairs(run, ctx)}.`,
        describe: () => '',
        headline: () => '',
      },
    };
  }
  const recordOf = (team: TeamRecord) => league.records.get(team.teamId) ?? EMPTY_HEAD_TO_HEAD;
  const among = run.map((team) => team.name).join(', ');
  return {
    groups: splitSorted(run, (a, b) => compareHeadToHead(kind, recordOf(a), recordOf(b))),
    entry: {
      separatedAs: kind,
      skipNote: null,
      headline: aheadOn(kind),
      describe: (upper, lower) =>
        `Ahead of ${lower.name} on ${CRITERION_PHRASE[kind]} (${headToHeadValueText(kind, recordOf(upper))} vs ${headToHeadValueText(
          kind,
          recordOf(lower),
        )} among ${among})`,
    },
  };
}

function matchingResolution(run: readonly TeamRecord[], resolutions: readonly Resolution[]): Resolution | null {
  const ids = new Set(run.map((team) => team.teamId));
  const matches = resolutions.filter(
    (resolution) =>
      resolution.revokedAt === null &&
      resolution.orderedTeamIds.length === ids.size &&
      new Set(resolution.orderedTeamIds).size === ids.size &&
      resolution.orderedTeamIds.every((teamId) => ids.has(teamId)),
  );
  if (matches.length === 0) return null;
  return matches.reduce((latest, candidate) => (candidate.createdAt > latest.createdAt ? candidate : latest));
}

function resolutionOutcome(kind: 'organizer_decision' | 'draw_lots', run: readonly TeamRecord[], ctx: RankContext): CriterionOutcome {
  const resolution = matchingResolution(run, ctx.resolutions);
  if (!resolution) return { groups: [run], entry: { separatedAs: kind, skipNote: null, describe: () => '', headline: () => '' } };
  const byId = new Map(run.map((team) => [team.teamId, team]));
  const ordered = resolution.orderedTeamIds.map((teamId) => byId.get(teamId)).filter((team): team is TeamRecord => !!team);
  return {
    groups: ordered.map((team) => [team]),
    entry: {
      separatedAs: resolution.method,
      skipNote: null,
      headline: (_upper, lower) => `Above ${lower.name} by ${resolution.method === 'draw_lots' ? 'draw of lots' : 'organizer decision'}`,
      describe: (_upper, lower) =>
        resolution.method === 'draw_lots'
          ? `Placed above ${lower.name} by draw of lots${resolution.seed !== null ? ` (seed ${resolution.seed})` : ''}`
          : `Placed above ${lower.name} by organizer decision (Manual Override: '${resolution.reason}')`,
    },
  };
}

function evaluateCriterion(kind: TieBreakerKind, run: readonly TeamRecord[], ctx: RankContext): CriterionOutcome {
  if (isHeadToHead(kind)) return headToHeadOutcome(kind, run, ctx);
  if (isResolution(kind)) return resolutionOutcome(kind, run, ctx);
  return recordOutcome(kind, run);
}

function firstDivergence(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

export const LEVEL_DECISION = ': organizer decides';

export function rankTeams(records: readonly TeamRecord[], chain: readonly TieBreakerKind[], ctx: RankContext): readonly RankedTeam[] {
  if (records.length === 0) return [];
  let runs: Run[] = [{ teams: records, path: [] }];
  const steps: Map<TeamId, StepEntry>[] = [];
  for (const kind of chain) {
    const stepEntries = new Map<TeamId, StepEntry>();
    const next: Run[] = [];
    for (const run of runs) {
      if (run.teams.length < 2) {
        next.push({ teams: run.teams, path: [...run.path, 0] });
        continue;
      }
      const outcome = evaluateCriterion(kind, run.teams, ctx);
      outcome.groups.forEach((group, index) => next.push({ teams: group, path: [...run.path, index] }));
      run.teams.forEach((team) => stepEntries.set(team.teamId, outcome.entry));
    }
    steps.push(stepEntries);
    runs = next;
  }
  const decisionRequired = chain.some(isResolution);
  const flat: { readonly team: TeamRecord; readonly run: Run; readonly start: number }[] = [];
  runs.forEach((run) => {
    const start = flat.length;
    run.teams.forEach((team) => flat.push({ team, run, start }));
  });
  return flat.map((entry, index) => {
    const below = flat[index + 1];
    const base = { teamId: entry.team.teamId, position: entry.start + 1, shared: entry.run.teams.length > 1 };
    if (!below) return { ...base, separatedBy: null, detail: '', headline: '' };
    if (below.run === entry.run) {
      return {
        ...base,
        separatedBy: null,
        detail: `Level with ${below.team.name}${decisionRequired ? ' — organizer decision required' : ''}`,
        headline: `Level with ${below.team.name}${decisionRequired ? LEVEL_DECISION : ''}`,
      };
    }
    const step = firstDivergence(entry.run.path, below.run.path);
    const stepEntry = step >= 0 ? steps[step].get(entry.team.teamId) : undefined;
    if (!stepEntry) return { ...base, separatedBy: null, detail: '', headline: '' };
    const notes = steps
      .slice(0, step)
      .map((entries) => entries.get(entry.team.teamId)?.skipNote ?? null)
      .filter((note): note is string => note !== null);
    const detail = [...new Set(notes), stepEntry.describe(entry.team, below.team)].join(' ');
    return { ...base, separatedBy: stepEntry.separatedAs, detail, headline: stepEntry.headline(entry.team, below.team) };
  });
}

export function describeTieBreakerChain(chain: readonly TieBreakerKind[]): string {
  return chain.map(tieBreakerLabel).join(' → ');
}

export function tieBreakerLabel(kind: TieBreakerKind): string {
  return CRITERION_LABEL[kind];
}
