import type { InningsLine, MatchListItem, MatchTeam, TeamRef } from '@/domain/types';
import { formatOvers, formatScore } from '@/domain/scoring/format';
import { formatResult, matchStatusLabel } from '@/domain/scoring/result';
import { formatShortDate } from '@/features/scoring/selectors/dates';

export interface MatchCardVM {
  readonly id: string;
  readonly title: string;
  readonly dateLabel: string | null;
  readonly statusLabel: string;
  readonly inPlay: boolean;
  readonly paused: boolean;
  readonly resultLine: string | null;
  readonly scoreLine: string | null;
  readonly footer: string | null;
  readonly tournamentId: string | null;
  readonly accessibilityLabel: string;
}

function asMatchTeam(team: TeamRef): MatchTeam {
  return { id: team.id, name: team.name, shortName: team.shortName, playersInSide: 0 };
}

function teamOf(item: MatchListItem, teamId: string): TeamRef {
  return item.teamA.id === teamId ? item.teamA : item.teamB;
}

export function inningsText(item: MatchListItem, line: InningsLine): string {
  const team = teamOf(item, line.battingTeamId);
  const overs = formatOvers(line.legalBalls, line.ballsPerOver);
  return `${team.shortName} ${formatScore(line.runs, line.wickets)} (${overs})`;
}

export function selectMatchCard(item: MatchListItem): MatchCardVM {
  const inPlay = item.status === 'live' || item.status === 'paused';
  const statusLabel = matchStatusLabel(item.status, item.result);
  const resultLine = item.result === null ? null : formatResult(item.result, [asMatchTeam(item.teamA), asMatchTeam(item.teamB)]);
  const regular = item.innings.filter((line) => line.kind === 'regular');
  const scoreLine = regular.length === 0 ? null : regular.map((line) => inningsText(item, line)).join(' · ');
  const footer = [`${item.oversPerInnings} overs`, item.tournamentName].filter((part): part is string => part !== null).join(' · ');
  const title = `${item.teamA.name} v ${item.teamB.name}`;
  const dateLabel = formatShortDate(item.scheduledDate ?? item.updatedAt);
  return {
    id: item.id,
    title,
    dateLabel,
    statusLabel,
    inPlay,
    paused: item.status === 'paused',
    resultLine,
    scoreLine,
    footer,
    tournamentId: item.tournamentId,
    accessibilityLabel: [title, dateLabel, resultLine ?? statusLabel, scoreLine, footer].filter((part): part is string => part !== null && part !== '').join(', '),
  };
}

export interface ContinueVM {
  readonly id: string;
  readonly title: string;
  readonly badge: string;
  readonly paused: boolean;
  readonly battingTeam: string;
  readonly score: string;
  readonly overs: string;
  readonly oversText: string;
  readonly other: string;
  readonly tournamentId: string | null;
  readonly accessibilityLabel: string;
}

export function selectContinue(item: MatchListItem): ContinueVM {
  const regular = item.innings.filter((line) => line.kind === 'regular');
  const current = item.innings[item.innings.length - 1];
  const battingTeam = current === undefined ? item.teamA : teamOf(item, current.battingTeamId);
  const otherTeam = battingTeam.id === item.teamA.id ? item.teamB : item.teamA;
  const score = current === undefined ? '0/0' : formatScore(current.runs, current.wickets);
  const overs = current === undefined ? '0' : formatOvers(current.legalBalls, current.ballsPerOver, { alwaysShowBalls: true });
  const otherLine = regular.find((line) => line !== current);
  const other = otherLine === undefined ? `${otherTeam.name} yet to bat` : inningsText(item, otherLine);
  const badge = item.status === 'paused' ? 'Paused' : 'Live';
  const title = `${item.teamA.name} v ${item.teamB.name} · ${item.oversPerInnings} ov`;
  return {
    id: item.id,
    title,
    badge,
    paused: item.status === 'paused',
    battingTeam: battingTeam.name,
    score,
    overs: `${overs} ov`,
    oversText: `${overs} overs`,
    other,
    tournamentId: item.tournamentId,
    accessibilityLabel: `${title}, ${badge}, ${battingTeam.name} ${score} after ${overs} overs, ${other}`,
  };
}
