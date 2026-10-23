import type { EventValidationCode, MatchEventInput, MatchSetup, MatchState, PlayerId } from '../../types';
import type { ScoringIntent } from '../commands';
import { inProgressInnings, vacancies } from './eligibility';
import { suggestedBattingTeam } from './pending';
import { defaultPenaltyInnings } from './phase';
import { designatedKeeper } from './squad';

export type Step = MatchEventInput | ((state: MatchState) => MatchEventInput | null);

export type Plan = { readonly ok: true; readonly steps: readonly Step[] } | { readonly ok: false; readonly code: EventValidationCode; readonly message: string };

function planned(...steps: Step[]): Plan {
  return { ok: true, steps };
}

function refused(code: EventValidationCode, message: string): Plan {
  return { ok: false, code, message };
}

interface Stamps {
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId | null;
  readonly bowlerId: PlayerId;
}

function stampsOf(state: MatchState): Stamps {
  const innings = inProgressInnings(state);
  return {
    strikerId: innings?.strikerId ?? '',
    nonStrikerId: innings?.nonStrikerId ?? null,
    bowlerId: innings?.bowlerId ?? '',
  };
}

function boundaryOf(flag: boolean | undefined): 0 | 4 {
  return flag === true ? 4 : 0;
}

function batterInAtVacancy(setup: MatchSetup, playerId: PlayerId | null | undefined): Step[] {
  if (playerId === undefined || playerId === null) {
    return [];
  }
  return [
    (state: MatchState): MatchEventInput | null => {
      const innings = inProgressInnings(state);
      if (innings === null) {
        return null;
      }
      const open = vacancies(setup, innings);
      if (open.length === 0) {
        return null;
      }
      return { kind: 'batter_in', playerId, position: open[0] };
    },
  ];
}

function deliveryPlan(setup: MatchSetup, state: MatchState, intent: ScoringIntent): Plan | null {
  const stamps = stampsOf(state);
  switch (intent.type) {
    case 'runs':
      return planned({
        kind: 'delivery',
        call: 'fair',
        runsTo: 'bat',
        ...stamps,
        runsRun: intent.runsRun,
        shortRuns: intent.shortRuns ?? 0,
        boundary: intent.boundary ?? 0,
        wicket: null,
      });
    case 'wide':
      return planned({
        kind: 'delivery',
        call: 'wide',
        ...stamps,
        runsRun: intent.runsRun ?? 0,
        shortRuns: intent.shortRuns ?? 0,
        boundary: boundaryOf(intent.boundary),
        wicket: null,
      });
    case 'no_ball':
      return planned({
        kind: 'delivery',
        call: 'no_ball',
        runsTo: intent.runsTo ?? 'bat',
        ...stamps,
        runsRun: intent.runsRun ?? 0,
        shortRuns: intent.shortRuns ?? 0,
        boundary: intent.boundary ?? 0,
        wicket: null,
      });
    case 'bye':
    case 'leg_bye':
      return planned({
        kind: 'delivery',
        call: 'fair',
        runsTo: intent.type,
        ...stamps,
        runsRun: intent.runsRun,
        shortRuns: intent.shortRuns ?? 0,
        boundary: boundaryOf(intent.boundary),
        wicket: null,
      });
    case 'wicket':
      return wicketPlan(setup, state, intent, stamps);
    default:
      return null;
  }
}

function wicketPlan(setup: MatchSetup, state: MatchState, intent: Extract<ScoringIntent, { readonly type: 'wicket' }>, stamps: Stamps): Plan {
  const innings = inProgressInnings(state);
  const keeper = innings === null ? null : designatedKeeper(setup, innings.bowlingTeamId);
  const fielderIds = intent.fielderIds ?? (intent.dismissal === 'stumped' && keeper !== null ? [keeper] : []);
  const wicket = {
    type: intent.dismissal,
    playerOutId: intent.playerOutId ?? stamps.strikerId,
    fielderIds,
    dismissalEnd: intent.dismissalEnd ?? null,
  };
  const call = intent.call ?? 'fair';
  const common = { ...stamps, runsRun: intent.runsRun ?? 0, shortRuns: 0, boundary: 0 as const, wicket };
  const delivery: MatchEventInput =
    call === 'wide' ? { kind: 'delivery', call, ...common } : { kind: 'delivery', call, runsTo: intent.runsTo ?? 'bat', ...common };
  return planned(delivery, ...batterInAtVacancy(setup, intent.nextBatterId));
}

function bowlerPlan(state: MatchState, intent: Extract<ScoringIntent, { readonly type: 'select_bowler' }>): Plan {
  if (intent.reason !== undefined) {
    return planned({ kind: 'bowler_selected', bowlerId: intent.bowlerId, reason: intent.reason });
  }
  const innings = inProgressInnings(state);
  if (innings !== null && innings.currentOver !== null) {
    return refused('BOWLER_CHANGE_REASON_INVALID', 'This over has started. Choose injury or suspension as the reason.');
  }
  return planned({ kind: 'bowler_selected', bowlerId: intent.bowlerId, reason: 'over_start' });
}

function startInningsPlan(setup: MatchSetup, state: MatchState, intent: Extract<ScoringIntent, { readonly type: 'start_innings' }>): Plan {
  const battingTeamId = intent.battingTeamId ?? suggestedBattingTeam(setup, state, state.innings.length);
  if (battingTeamId === null) {
    return refused('WRONG_BATTING_TEAM', 'Choose which team bats first.');
  }
  return planned({
    kind: 'innings_started',
    inningsIndex: state.innings.length,
    battingTeamId,
    strikerId: intent.strikerId,
    nonStrikerId: intent.nonStrikerId,
    bowlerId: intent.bowlerId,
  });
}

function revisionPlan(setup: MatchSetup, intent: Extract<ScoringIntent, { readonly type: 'revise_overs' }>): Plan {
  const maxBalls = intent.balls ?? (intent.overs === undefined ? undefined : intent.overs * setup.rules.ballsPerOver);
  if (maxBalls === undefined) {
    return refused('INVALID_OVERS_REVISION', 'Enter the new number of overs or balls.');
  }
  const optional = {
    ...(intent.maxOversPerBowler !== undefined ? { maxOversPerBowler: intent.maxOversPerBowler } : {}),
    ...(intent.bowlerQuotaMode !== undefined ? { bowlerQuotaMode: intent.bowlerQuotaMode } : {}),
    ...(intent.powerplays !== undefined ? { powerplays: intent.powerplays } : {}),
  };
  const current: MatchEventInput = {
    kind: 'overs_revised',
    inningsIndex: intent.inningsIndex,
    maxBalls,
    target: intent.target ?? null,
    ...optional,
    terminal: intent.terminal ?? false,
    reason: intent.reason,
  };
  if (intent.scope !== 'both_innings') {
    return planned(current);
  }
  if (intent.inningsIndex !== 0) {
    return refused('INVALID_OVERS_REVISION', 'Revise both innings from the first innings.');
  }
  const chase: MatchEventInput = { kind: 'overs_revised', inningsIndex: 1, maxBalls, target: null, ...optional, terminal: false, reason: intent.reason };
  return planned(chase, current);
}

export function intentPlan(setup: MatchSetup, state: MatchState, intent: ScoringIntent): Plan {
  const delivery = deliveryPlan(setup, state, intent);
  if (delivery !== null) {
    return delivery;
  }
  switch (intent.type) {
    case 'swap_strike':
      return planned({ kind: 'strike_swapped' });
    case 'select_bowler':
      return bowlerPlan(state, intent);
    case 'batter_in': {
      const innings = inProgressInnings(state);
      const position = intent.position ?? (innings === null ? 'striker' : (vacancies(setup, innings)[0] ?? 'striker'));
      return planned({ kind: 'batter_in', playerId: intent.playerId, position });
    }
    case 'retire':
      return planned(
        { kind: 'batter_retired', playerId: intent.playerId, retirement: intent.retirement },
        ...batterInAtVacancy(setup, intent.nextBatterId),
      );
    case 'off_ball_dismissal':
      return planned(
        { kind: 'batter_dismissed', playerId: intent.playerId, type: intent.dismissal, fielderIds: intent.fielderIds ?? [] },
        ...batterInAtVacancy(setup, intent.nextBatterId),
      );
    case 'start_innings':
      return startInningsPlan(setup, state, intent);
    case 'revise_overs':
      return revisionPlan(setup, intent);
    case 'penalty':
      return planned({
        kind: 'penalty_awarded',
        teamId: intent.teamId,
        inningsIndex: intent.inningsIndex ?? defaultPenaltyInnings(setup, state, intent.teamId),
        runs: intent.runs,
        reason: intent.reason,
      });
    case 'suspend_play':
      return planned({ kind: 'play_suspended', reason: intent.reason, note: intent.note ?? null });
    case 'resume_play':
      return planned({ kind: 'play_resumed' });
    case 'end_innings':
      return planned({ kind: 'innings_ended', reason: intent.reason, absentees: intent.absentees ?? [] });
    case 'start_super_over':
      return planned({ kind: 'super_over_started', round: (state.superOverRound ?? 0) + 1 });
    case 'end_match':
      return planned({ kind: 'match_ended', outcome: intent.outcome });
    default:
      return refused('UNKNOWN_EVENT_KIND', 'That action is not recognised.');
  }
}
