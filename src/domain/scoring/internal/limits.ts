import type { BallCount, BowlerQuotaMode, BowlingCardRow, InningsLimits, MatchSetup, PlayerId, TeamId } from '../../types';
import { allOutThreshold } from './squad';

export function buildLimits(
  ballsPerOver: number,
  maxBalls: BallCount,
  maxWickets: number,
  mode: BowlerQuotaMode,
  uniformQuota: number | null,
  revised: boolean,
): InningsLimits {
  if (mode === 'icc_one_fifth') {
    const overs = Math.ceil(maxBalls / ballsPerOver);
    return {
      maxBalls,
      maxWickets,
      maxOversPerBowler: Math.max(1, Math.floor(overs / 5)),
      bowlerQuotaMode: mode,
      extraOverBowlers: overs % 5,
      revised,
    };
  }
  return { maxBalls, maxWickets, maxOversPerBowler: uniformQuota, bowlerQuotaMode: mode, extraOverBowlers: 0, revised };
}

export function regularLimits(setup: MatchSetup, battingTeamId: TeamId): InningsLimits {
  const { rules } = setup;
  return buildLimits(
    rules.ballsPerOver,
    rules.oversPerInnings * rules.ballsPerOver,
    allOutThreshold(setup, battingTeamId),
    rules.bowlerQuotaMode,
    rules.maxOversPerBowler,
    false,
  );
}

export function superOverLimits(setup: MatchSetup, battingTeamId: TeamId): InningsLimits {
  const { rules } = setup;
  return buildLimits(
    rules.ballsPerOver,
    rules.superOver.overs * rules.ballsPerOver,
    Math.min(rules.superOver.maxWickets, allOutThreshold(setup, battingTeamId)),
    rules.bowlerQuotaMode,
    rules.maxOversPerBowler,
    false,
  );
}

export interface LimitsRevision {
  readonly maxBalls: BallCount;
  readonly maxOversPerBowler?: number | null;
  readonly bowlerQuotaMode?: BowlerQuotaMode;
}

export function reviseLimits(setup: MatchSetup, current: InningsLimits, revision: LimitsRevision): InningsLimits {
  const mode = revision.bowlerQuotaMode ?? current.bowlerQuotaMode;
  const uniformQuota =
    revision.maxOversPerBowler !== undefined
      ? revision.maxOversPerBowler
      : current.bowlerQuotaMode === 'uniform'
        ? current.maxOversPerBowler
        : setup.rules.maxOversPerBowler;
  return buildLimits(setup.rules.ballsPerOver, revision.maxBalls, current.maxWickets, mode, uniformQuota, true);
}

function oversUsedBy(rows: readonly BowlingCardRow[], playerId: PlayerId): number {
  return rows.find((row) => row.playerId === playerId)?.oversUsed ?? 0;
}

export function maxOversFor(limits: InningsLimits, rows: readonly BowlingCardRow[], playerId: PlayerId): number | null {
  if (limits.bowlerQuotaMode === 'uniform') {
    return limits.maxOversPerBowler;
  }
  const base = limits.maxOversPerBowler ?? 1;
  const used = oversUsedBy(rows, playerId);
  if (used > base) {
    return used;
  }
  const extraUsers = rows.filter((row) => row.playerId !== playerId && row.oversUsed > base).length;
  return extraUsers < limits.extraOverBowlers ? base + 1 : base;
}

export function quotaReached(limits: InningsLimits, rows: readonly BowlingCardRow[], playerId: PlayerId): boolean {
  const allowed = maxOversFor(limits, rows, playerId);
  return allowed !== null && oversUsedBy(rows, playerId) >= allowed;
}

export function startsFinalQuotaOver(limits: InningsLimits, rows: readonly BowlingCardRow[], playerId: PlayerId): boolean {
  const allowed = maxOversFor(limits, rows, playerId);
  return allowed !== null && oversUsedBy(rows, playerId) + 1 === allowed;
}
