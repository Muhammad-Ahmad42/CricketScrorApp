import { formatResult } from '@/domain/scoring';
import type { Match, MatchLifecycle, MatchRules, MatchSetup, Toss } from '@/domain/types';
import { formatPrintDate } from '../dates';
import { standingsDocument } from '../standings';
import { joinPresent, nameLookup, pluralize, type NameLookup } from '../text';
import { inningsDocument, type InningsContext } from './innings';
import type { ScorecardDocument, ScorecardSource } from './model';

function unfinishedText(lifecycle: MatchLifecycle, match: Match): string {
  switch (lifecycle) {
    case 'not_started':
      if (match.status === 'postponed') {
        return 'Match postponed';
      }
      return match.status === 'cancelled' ? 'Match cancelled' : 'Match not started';
    case 'live':
      return 'Match in progress';
    case 'paused':
      return 'Play suspended';
    case 'completed':
    case 'abandoned':
      return 'Result not recorded';
    default: {
      const unreachable: never = lifecycle;
      return unreachable;
    }
  }
}

function resultLine(source: ScorecardSource): string {
  const { state, match, setup } = source;
  if (state.resultText !== null && state.resultText.trim().length > 0) {
    return state.resultText;
  }
  if (match.result !== null) {
    return formatResult(match.result, setup.teams);
  }
  return unfinishedText(state.lifecycle, match);
}

function tossLine(toss: Toss | null, teamName: NameLookup): string | null {
  if (toss === null) {
    return null;
  }
  return `${teamName(toss.winnerTeamId)} won the toss and chose to ${toss.decision === 'bat' ? 'bat' : 'bowl'}`;
}

function formatLine(rules: MatchRules, setup: MatchSetup): string {
  const [teamA, teamB] = setup.teams;
  const sides =
    teamA.playersInSide !== teamB.playersInSide
      ? `${teamA.name} ${teamA.playersInSide} v ${teamB.name} ${teamB.playersInSide} players`
      : rules.playersPerSide !== 11
        ? `${rules.playersPerSide} players a side`
        : null;
  return joinPresent(
    [
      `${pluralize(rules.oversPerInnings, 'over', 'overs')} a side`,
      rules.ballsPerOver !== 6 ? `${rules.ballsPerOver}-ball overs` : null,
      sides,
      rules.lastManStands ? 'last man stands' : null,
    ],
    ', ',
  );
}

function matchDate(match: Match): string | null {
  return formatPrintDate(match.scheduledDate ?? match.startedAt);
}

export function scorecardDocument(source: ScorecardSource): ScorecardDocument {
  const { match, setup, state, venue, tournament } = source;
  const teamName = nameLookup(
    setup.teams.map((team) => [team.id, team.name] as const),
    'Unknown team',
  );
  const squad = new Map(setup.players.map((player) => [player.playerId, player] as const));
  const ctx: InningsContext = {
    ballsPerOver: setup.rules.ballsPerOver,
    teamName,
    playerName: nameLookup(
      setup.players.map((player) => [player.playerId, player.name] as const),
      'Unknown',
    ),
    squad,
  };
  const teams = `${setup.teams[0].name} v ${setup.teams[1].name}`;
  const matchTeams = new Set([setup.teams[0].id, setup.teams[1].id]);
  return {
    title: match.title.trim().length > 0 ? match.title.trim() : teams,
    kicker: tournament === null ? null : joinPresent([tournament.tournamentName, tournament.stageName, tournament.poolName, tournament.fixtureLabel], ' · '),
    teams,
    result: resultLine(source),
    toss: tossLine(setup.toss ?? match.toss, teamName),
    venue: venue === null ? null : joinPresent([venue.name, venue.location], ', '),
    date: matchDate(match),
    format: formatLine(setup.rules, setup),
    innings: state.innings.filter((innings) => innings.kind === 'regular').map((innings) => inningsDocument(innings, ctx)),
    superOvers: state.innings.filter((innings) => innings.kind === 'super_over').map((innings) => inningsDocument(innings, ctx)),
    standings: source.standings.map((entry) =>
      standingsDocument(
        entry.title,
        entry.table,
        nameLookup(
          entry.teams.map((team) => [team.id, team.name] as const),
          'Unknown team',
        ),
        matchTeams,
      ),
    ),
  };
}
