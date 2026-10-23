/** @jest-environment node */
import {
  canTransitionFixture,
  canTransitionMatch,
  canTransitionStage,
  canTransitionTournament,
  matchEditPolicy,
  tournamentEditPolicy,
  type EditPermission,
  type Guard,
  type TournamentEditPolicy,
  type TournamentGuardContext,
} from '@/domain/tournament/stateMachine';
import { FIXTURE_STATUSES, MATCH_STATUSES, TOURNAMENT_STATUSES, type MatchStatus, type StageStatus, type TournamentStatus } from '@/domain/types';

const READY: TournamentGuardContext = {
  activeTeamCount: 8,
  stageCount: 2,
  poolsComplete: true,
  firstStageFixturesConfirmed: true,
  matchesStarted: 0,
  matchesCompleted: 0,
  allStagesComplete: true,
  championDecided: true,
};

function allowedPairs<S extends string>(statuses: readonly S[], check: (from: S, to: S) => Guard): readonly string[] {
  return statuses.flatMap((from) => statuses.filter((to) => check(from, to).ok).map((to) => `${from}>${to}`)).sort();
}

function reason(guard: Guard): string | null {
  return guard.ok ? null : guard.reason;
}

describe('canTransitionTournament', () => {
  const EDGES = [
    'draft>registration',
    'registration>structure_configured',
    'structure_configured>pools_configured',
    'pools_configured>fixtures_generated',
    'fixtures_generated>active',
    'active>completed',
    'completed>archived',
    'archived>completed',
    'completed>active',
    'structure_configured>registration',
    'pools_configured>structure_configured',
    'fixtures_generated>pools_configured',
  ].sort();

  it('allows exactly the §62 edges when every guard is satisfied', () => {
    expect(allowedPairs(TOURNAMENT_STATUSES, (from, to) => canTransitionTournament(from, to, READY))).toEqual(EDGES);
  });

  it('U-SM-09 registration needs two teams and a stage', () => {
    expect(reason(canTransitionTournament('registration', 'structure_configured', { ...READY, activeTeamCount: 1, stageCount: 1 }))).toBe(
      'Add at least two teams and one stage.',
    );
    expect(canTransitionTournament('registration', 'structure_configured', { ...READY, stageCount: 0 }).ok).toBe(false);
    expect(canTransitionTournament('registration', 'structure_configured', { ...READY, activeTeamCount: 2, stageCount: 1 }).ok).toBe(true);
  });

  it('pools must be complete (knockout-only structures pass once seeding is done)', () => {
    expect(reason(canTransitionTournament('structure_configured', 'pools_configured', { ...READY, poolsComplete: false }))).toBe(
      'Some teams are not in a pool yet.',
    );
  });

  it('fixtures must be confirmed', () => {
    expect(reason(canTransitionTournament('pools_configured', 'fixtures_generated', { ...READY, firstStageFixturesConfirmed: false }))).toBe(
      "Confirm the first stage's fixtures.",
    );
  });

  it('U-SM-10 backward setup steps are refused once a match started', () => {
    const started = { ...READY, matchesStarted: 1 };
    for (const [from, to] of [
      ['fixtures_generated', 'pools_configured'],
      ['pools_configured', 'structure_configured'],
      ['structure_configured', 'registration'],
    ] as const) {
      expect(reason(canTransitionTournament(from, to, started))).toBe('Matches have already started.');
      expect(canTransitionTournament(from, to, READY).ok).toBe(true);
    }
  });

  it('U-SM-11 completion needs a champion or every stage complete', () => {
    const open = { ...READY, championDecided: false, allStagesComplete: false };
    expect(reason(canTransitionTournament('active', 'completed', open))).toBe("The champion hasn't been decided yet.");
    expect(canTransitionTournament('active', 'completed', { ...open, championDecided: true }).ok).toBe(true);
    expect(canTransitionTournament('active', 'completed', { ...open, allStagesComplete: true }).ok).toBe(true);
  });

  it('U-SM-12 completed and archived go both ways; reopening warns', () => {
    expect(canTransitionTournament('completed', 'archived', READY)).toEqual({ ok: true, warnings: [] });
    expect(canTransitionTournament('archived', 'completed', READY)).toEqual({ ok: true, warnings: [] });
    const reopen = canTransitionTournament('completed', 'active', { ...READY, matchesStarted: 10, matchesCompleted: 10 });
    expect(reopen.ok && reopen.warnings.length).toBe(1);
  });

  it('refuses everything else with a readable reason', () => {
    expect(reason(canTransitionTournament('active', 'draft', READY))).toBe("A tournament can't go from Active back to Draft.");
    expect(reason(canTransitionTournament('archived', 'active', READY))).toBe("A tournament can't go from Archived back to Active.");
    expect(reason(canTransitionTournament('draft', 'active', READY))).toBe("A tournament can't go from Draft to Active.");
    expect(reason(canTransitionTournament('active', 'active', READY))).toBe('The tournament is already Active.');
    expect(canTransitionTournament('archived', 'active', READY).ok).toBe(false);
  });
});

describe('canTransitionStage', () => {
  const STAGES: readonly StageStatus[] = ['pending', 'active', 'completed'];
  const ready = { fixturesConfirmed: true, entrantsResolved: true, allFixturesTerminal: true };

  it('allows pending > active > completed and completed > active only', () => {
    expect(allowedPairs(STAGES, (from, to) => canTransitionStage(from, to, ready))).toEqual(['active>completed', 'completed>active', 'pending>active']);
  });

  it('guards starting and completing a stage', () => {
    expect(reason(canTransitionStage('pending', 'active', { ...ready, fixturesConfirmed: false }))).toBe("Confirm this stage's fixtures first.");
    expect(canTransitionStage('pending', 'active', { ...ready, entrantsResolved: false })).toEqual({
      ok: true,
      warnings: ['Some places in this stage are still to be decided.'],
    });
    expect(reason(canTransitionStage('active', 'completed', { ...ready, allFixturesTerminal: false }))).toBe("Some matches in this stage haven't finished yet.");
  });

  it('U-SM-13 a completed stage reopens for a correction', () => {
    expect(canTransitionStage('completed', 'active', { fixturesConfirmed: true, entrantsResolved: true, allFixturesTerminal: false }).ok).toBe(true);
  });
});

describe('canTransitionFixture', () => {
  const EDGES = [
    'scheduled>postponed',
    'postponed>rescheduled',
    'rescheduled>postponed',
    'scheduled>cancelled',
    'postponed>cancelled',
    'rescheduled>cancelled',
    'cancelled>scheduled',
    'scheduled>live',
    'rescheduled>live',
    'scheduled>completed',
    'postponed>completed',
    'rescheduled>completed',
    'scheduled>abandoned',
    'rescheduled>abandoned',
    'live>completed',
    'live>abandoned',
    'abandoned>rescheduled',
    'completed>live',
    'abandoned>live',
  ].sort();

  it('allows exactly the §39 edges', () => {
    expect(allowedPairs(FIXTURE_STATUSES, (from, to) => canTransitionFixture(from, to, { hasMatch: true, replayAllowed: true }))).toEqual(EDGES);
  });

  it('U-SM-06 a replay of an abandoned fixture needs the stage to allow it', () => {
    expect(canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: false }).ok).toBe(false);
    expect(canTransitionFixture('abandoned', 'rescheduled', { hasMatch: true, replayAllowed: true }).ok).toBe(true);
  });

  it('U-SM-07 a live fixture cannot go back to scheduled', () => {
    expect(reason(canTransitionFixture('live', 'scheduled', { hasMatch: true, replayAllowed: true }))).toBe("A live fixture can't be marked scheduled.");
    expect(reason(canTransitionFixture('abandoned', 'completed', { hasMatch: true, replayAllowed: true }))).toBe("An abandoned fixture can't be marked completed.");
  });

  it('EC-T-13 a rescheduled fixture can be postponed again by the organizer', () => {
    for (const hasMatch of [false, true]) {
      for (const replayAllowed of [false, true]) {
        expect(canTransitionFixture('rescheduled', 'postponed', { hasMatch, replayAllowed })).toEqual({ ok: true, warnings: [] });
      }
    }
  });

  it('EC-Q-13 a postponed fixture becomes completed only through its match (walkover for a withdrawn team)', () => {
    expect(canTransitionFixture('postponed', 'completed', { hasMatch: true, replayAllowed: false })).toEqual({ ok: true, warnings: [] });
    expect(reason(canTransitionFixture('postponed', 'completed', { hasMatch: false, replayAllowed: false }))).toBe(
      'A fixture only becomes completed through its match.',
    );
    expect(canTransitionFixture('postponed', 'live', { hasMatch: true, replayAllowed: true }).ok).toBe(false);
    expect(canTransitionFixture('postponed', 'abandoned', { hasMatch: true, replayAllowed: true }).ok).toBe(false);
  });

  it('U-SM-08 a cancelled fixture can be restored', () => {
    expect(canTransitionFixture('cancelled', 'scheduled', { hasMatch: false, replayAllowed: false })).toEqual({ ok: true, warnings: [] });
  });

  it('mirror states need a match, organizer states do not', () => {
    for (const to of ['live', 'completed', 'abandoned'] as const) {
      expect(canTransitionFixture('scheduled', to, { hasMatch: false, replayAllowed: true }).ok).toBe(false);
    }
    for (const [from, to] of [
      ['scheduled', 'postponed'],
      ['postponed', 'rescheduled'],
      ['rescheduled', 'cancelled'],
    ] as const) {
      expect(canTransitionFixture(from, to, { hasMatch: false, replayAllowed: false }).ok).toBe(true);
    }
  });
});

describe('canTransitionMatch', () => {
  const EDGES = [
    'scheduled>postponed',
    'postponed>scheduled',
    'scheduled>cancelled',
    'postponed>cancelled',
    'cancelled>scheduled',
    'scheduled>live',
    'scheduled>completed',
    'postponed>completed',
    'scheduled>abandoned',
    'postponed>abandoned',
    'live>paused',
    'paused>live',
    'live>completed',
    'paused>completed',
    'live>abandoned',
    'paused>abandoned',
    'completed>live',
    'completed>paused',
    'abandoned>live',
    'abandoned>paused',
  ].sort();

  it('allows exactly the §63 edges', () => {
    expect(allowedPairs(MATCH_STATUSES, (from, to) => canTransitionMatch(from, to, { hasDeliveries: false }))).toEqual(EDGES);
  });

  it('U-SM-01 scheduled to live', () => {
    expect(canTransitionMatch('scheduled', 'live', { hasDeliveries: false })).toEqual({ ok: true, warnings: [] });
  });

  it('U-SM-02 paused to completed (natural result while paused)', () => {
    expect(canTransitionMatch('paused', 'completed', { hasDeliveries: true }).ok).toBe(true);
  });

  it('U-SM-03 walkover or award only before play', () => {
    expect(reason(canTransitionMatch('scheduled', 'completed', { hasDeliveries: true }))).toBe(
      'Too late for a walkover or award. Play has started.',
    );
    expect(canTransitionMatch('postponed', 'completed', { hasDeliveries: true }).ok).toBe(false);
    expect(canTransitionMatch('live', 'completed', { hasDeliveries: true }).ok).toBe(true);
  });

  it('U-SM-04 completed and abandoned matches reopen', () => {
    expect(canTransitionMatch('completed', 'live', { hasDeliveries: true }).ok).toBe(true);
    expect(canTransitionMatch('abandoned', 'live', { hasDeliveries: true }).ok).toBe(true);
  });

  it('U-SM-05 a cancelled match cannot go live', () => {
    expect(reason(canTransitionMatch('cancelled', 'live', { hasDeliveries: false }))).toBe("A cancelled match can't become live.");
  });
});

type Row = Omit<TournamentEditPolicy, 'seeds' | 'deleteTournament'>;

function row(values: readonly EditPermission[]): Row {
  const [info, addTeams, removeTeams, stages, pools, generateFixtures, fixtureSchedule, fixtureTeams, rules, overrides, matchResults] = values;
  return { info, addTeams, removeTeams, stages, pools, generateFixtures, fixtureSchedule, fixtureTeams, rules, overrides, matchResults };
}

const A = 'allowed';
const W = 'warn';
const C = 'confirm';
const F = 'forbidden';

describe('tournamentEditPolicy', () => {
  const zero = { ...READY, matchesStarted: 0, matchesCompleted: 0, championDecided: false, allStagesComplete: false };
  const started = { ...zero, matchesStarted: 3 };
  const played = { ...zero, matchesStarted: 5, matchesCompleted: 2 };

  it.each<[string, TournamentStatus, TournamentGuardContext, Row, EditPermission]>([
    ['draft', 'draft', zero, row([A, A, A, A, A, A, A, A, A, A, F]), A],
    ['registration', 'registration', zero, row([A, A, A, A, A, A, A, A, A, A, F]), A],
    ['structure_configured', 'structure_configured', zero, row([A, A, A, A, A, A, A, A, A, A, F]), A],
    ['pools_configured', 'pools_configured', zero, row([A, A, A, A, A, A, A, A, A, A, F]), A],
    ['fixtures_generated, no match started', 'fixtures_generated', zero, row([A, W, W, W, W, W, A, A, A, A, F]), A],
    ['active, no match started', 'active', zero, row([A, W, W, W, W, W, A, A, A, A, F]), A],
    ['active, matches started, none completed', 'active', started, row([A, W, C, W, W, W, A, W, W, C, W]), C],
    ['active, completed matches exist', 'active', played, row([A, C, C, C, C, C, A, C, C, C, C]), C],
    ['completed', 'completed', played, row([A, F, F, F, F, F, F, F, C, C, C]), C],
    ['archived', 'archived', played, row([F, F, F, F, F, F, F, F, F, F, F]), F],
  ])('U-SM-14 %s', (_, status, ctx, expected, deletion) => {
    expect(tournamentEditPolicy(status, ctx)).toEqual({ ...expected, seeds: expected.rules, deleteTournament: deletion });
  });

  it('U-SM-14 deletion: allowed before any match, confirm after, forbidden when archived', () => {
    expect(tournamentEditPolicy('fixtures_generated', zero).deleteTournament).toBe('allowed');
    expect(tournamentEditPolicy('active', started).deleteTournament).toBe('confirm');
    expect(tournamentEditPolicy('completed', played).deleteTournament).toBe('confirm');
    expect(tournamentEditPolicy('archived', zero).deleteTournament).toBe('forbidden');
  });

  it('seeds follow the rules column in every situation', () => {
    for (const status of TOURNAMENT_STATUSES) {
      for (const ctx of [zero, started, played]) {
        const policy = tournamentEditPolicy(status, ctx);
        expect(policy.seeds).toBe(policy.rules);
      }
    }
  });
});

describe('matchEditPolicy', () => {
  const policy = (details: EditPermission, teams: EditPermission, rules: EditPermission, squads: EditPermission, toss: EditPermission, scoring: EditPermission, history: EditPermission, del: EditPermission) => ({
    details,
    teams,
    rules,
    squads,
    toss,
    scoring,
    history,
    delete: del,
  });

  it.each<[MatchStatus, boolean, ReturnType<typeof policy>]>([
    ['scheduled', false, policy(A, A, A, A, A, A, F, A)],
    ['postponed', false, policy(A, A, A, A, A, A, F, A)],
    ['scheduled', true, policy(A, A, A, A, A, A, F, F)],
    ['live', false, policy(A, F, C, A, C, A, W, C)],
    ['paused', false, policy(A, F, C, A, C, A, W, C)],
    ['live', true, policy(A, F, C, A, C, A, W, F)],
    ['completed', false, policy(A, F, C, A, C, F, C, C)],
    ['abandoned', false, policy(A, F, C, A, C, F, C, C)],
    ['completed', true, policy(A, F, C, A, C, F, C, F)],
    ['cancelled', false, policy(A, A, A, A, F, F, F, A)],
    ['cancelled', true, policy(A, A, A, A, F, F, F, A)],
  ])('U-SM-15 %s (in tournament: %p)', (status, inTournament, expected) => {
    expect(matchEditPolicy(status, { inTournament })).toEqual(expected);
  });
});
