import type { InningsSummary, MatchResult, MatchSummary, TeamId } from '../../types';

type TeamMap = (teamId: TeamId) => TeamId;

function remapResult(result: MatchResult, map: TeamMap): MatchResult {
  switch (result.type) {
    case 'win':
      return { ...result, winnerTeamId: map(result.winnerTeamId), loserTeamId: map(result.loserTeamId) };
    case 'tie':
      return result.decider ? { ...result, decider: { ...result.decider, winnerTeamId: map(result.decider.winnerTeamId) } } : result;
    case 'walkover':
      return { ...result, winnerTeamId: map(result.winnerTeamId), loserTeamId: map(result.loserTeamId) };
    case 'awarded':
      return {
        ...result,
        winnerTeamId: result.winnerTeamId === null ? null : map(result.winnerTeamId),
        loserTeamId: result.loserTeamId === null ? null : map(result.loserTeamId),
      };
    case 'no_result':
    case 'abandoned':
      return result;
    default: {
      const never: never = result;
      return never;
    }
  }
}

function remapInnings(innings: InningsSummary, map: TeamMap): InningsSummary {
  return { ...innings, battingTeamId: map(innings.battingTeamId), bowlingTeamId: map(innings.bowlingTeamId) };
}

export function remapSummaryTeams(summary: MatchSummary, mapping: ReadonlyMap<TeamId, TeamId>): MatchSummary {
  if (![summary.teamAId, summary.teamBId].some((teamId) => mapping.has(teamId) && mapping.get(teamId) !== teamId)) return summary;
  const map: TeamMap = (teamId) => mapping.get(teamId) ?? teamId;
  return {
    ...summary,
    teamAId: map(summary.teamAId),
    teamBId: map(summary.teamBId),
    winnerTeamId: summary.winnerTeamId === null ? null : map(summary.winnerTeamId),
    result: remapResult(summary.result, map),
    innings: summary.innings.map((innings) => remapInnings(innings, map)),
    superOvers: summary.superOvers.map((innings) => remapInnings(innings, map)),
    squads: summary.squads.map((squad) => ({ ...squad, teamId: map(squad.teamId) })),
  };
}
