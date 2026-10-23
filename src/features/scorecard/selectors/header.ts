import type { Venue } from '@/domain/types';
import type { LiveMatch } from '@/services/contracts';
import { formatRequirement } from '@/domain/scoring/format';
import { matchStatusLabel } from '@/domain/scoring/result';
import { currentInnings } from '@/domain/scoring/replay';
import { matchLongDate } from '@/features/scoring/selectors/dates';
import { teamName } from '@/features/scoring/selectors/names';
import { formatLabel } from '@/features/scoring/selectors/scoreboard';

export interface ScorecardHeaderVM {
  readonly resultLine: string;
  readonly statusLabel: string;
  readonly isLive: boolean;
  readonly tossLine: string;
  readonly metaLine: string;
  readonly tournamentId: string | null;
  readonly canReopen: boolean;
  readonly canDelete: boolean;
}

export function selectScorecardHeader(live: LiveMatch, venues: readonly Venue[]): ScorecardHeaderVM {
  const { match, setup, state } = live;
  const isLive = state.lifecycle === 'live' || state.lifecycle === 'paused';
  const innings = currentInnings(state);
  const chase = isLive && innings?.status === 'in_progress' ? state.chase : null;
  const statusLabel = matchStatusLabel(match.status, match.result ?? state.result);
  const resultLine =
    state.resultText ??
    (chase !== null && innings !== null
      ? `${teamName(setup, innings.battingTeamId)}: ${formatRequirement(chase.runsRequired, chase.ballsRemaining)}`
      : isLive
        ? innings === null
          ? 'Not started'
          : `${teamName(setup, innings.battingTeamId)} batting`
        : statusLabel);
  const toss = setup.toss;
  const tossLine =
    toss === null ? 'Toss not recorded' : `${teamName(setup, toss.winnerTeamId)} won the toss and chose to ${toss.decision === 'bat' ? 'bat' : 'bowl'}`;
  const venue = match.venueId === null ? null : venues.find((entry) => entry.id === match.venueId)?.name ?? null;
  const metaLine = [venue, matchLongDate(match), formatLabel(match.formatId, setup.rules.oversPerInnings)]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const lastEvent = live.events[live.events.length - 1];
  const terminal = state.lifecycle === 'completed' || state.lifecycle === 'abandoned';
  return {
    resultLine,
    statusLabel,
    isLive,
    tossLine,
    metaLine,
    tournamentId: match.tournamentId,
    canReopen: terminal && lastEvent?.kind === 'match_ended',
    canDelete: match.tournamentId === null,
  };
}
