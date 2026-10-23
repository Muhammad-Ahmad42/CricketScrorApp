import { blockingSquadIssue, checkDraftSquadSizes, checkSquadSizes } from '../squadSize';

const EIGHT = { playersPerSide: 8 };
const names: Readonly<Record<string, string>> = { RSL: 'Riverside Lions', SBS: 'Southbay Sharks' };
const name = (teamId: string) => names[teamId] ?? teamId;
const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

function draft(patch: Partial<Parameters<typeof checkDraftSquadSizes>[0]> = {}): Parameters<typeof checkDraftSquadSizes>[0] {
  return {
    rules: EIGHT,
    teamAId: 'SBS',
    teamBId: 'RSL',
    teamAPlayers: null,
    teamBPlayers: null,
    squadA: ids('s', 8),
    squadB: ids('r', 8),
    substitutesA: [],
    substitutesB: [],
    ...patch,
  };
}

describe('squad size against the side size (wave-3 bug #7)', () => {
  it('11 players selected for an 8-a-side tournament fixture is an error that blocks starting', () => {
    const issues = checkDraftSquadSizes(draft({ squadB: ids('r', 11) }), name);
    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'SQUAD_TOO_LARGE',
        teamId: 'RSL',
        teamName: 'Riverside Lions',
        selected: 11,
        sideSize: 8,
        message: 'Riverside Lions: 3 players too many. This match is 8 a side. Remove 3 or make them substitutes.',
        headline: 'Riverside Lions: 3 players too many',
        detail: 'This match is 8 a side. Remove 3 or make them substitutes.',
      },
    ]);
    expect(blockingSquadIssue(issues)?.code).toBe('SQUAD_TOO_LARGE');
  });

  it('one extra player reads in the singular', () => {
    const [issue] = checkDraftSquadSizes(draft({ squadA: ids('s', 9) }), name);
    expect(issue).toMatchObject({
      headline: 'Southbay Sharks: 1 player too many',
      detail: 'This match is 8 a side. Remove 1 or make them a substitute.',
      message: 'Southbay Sharks: 1 player too many. This match is 8 a side. Remove 1 or make them a substitute.',
    });
  });

  it('substitutes do not count towards the side', () => {
    expect(checkDraftSquadSizes(draft({ squadA: ids('s', 9), substitutesA: ['s9'] }), name)).toEqual([]);
  });

  it('a short side is a warning that explains the uneven-sides rule, and does not block', () => {
    const issues = checkDraftSquadSizes(draft({ squadA: ids('s', 7) }), name);
    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'SQUAD_TOO_SMALL',
        selected: 7,
        sideSize: 8,
        headline: 'Southbay Sharks: 7 of 8 players',
        detail: 'The innings ends when only one batter is left.',
        message: 'Southbay Sharks: 7 of 8 players. The innings ends when only one batter is left.',
      }),
    ]);
    expect(blockingSquadIssue(issues)).toBeNull();
  });

  it('an agreed uneven side size replaces the rule for that team', () => {
    expect(checkDraftSquadSizes(draft({ teamAPlayers: 9, squadA: ids('s', 9) }), name)).toEqual([]);
    expect(checkDraftSquadSizes(draft({ teamBPlayers: 7, squadB: ids('r', 8) }), name)[0]).toMatchObject({ code: 'SQUAD_TOO_LARGE', sideSize: 7 });
  });

  it('fewer than two players is an error', () => {
    expect(checkSquadSizes(EIGHT, [{ teamId: 'SBS', teamName: 'Southbay Sharks', selected: 1, sideSize: null }])).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'SQUAD_BELOW_MINIMUM',
        headline: 'Choose at least 2 players for Southbay Sharks',
        message: 'Choose at least 2 players for Southbay Sharks.',
      }),
    ]);
  });

  it('teams not chosen yet are skipped', () => {
    expect(checkDraftSquadSizes(draft({ teamAId: null, teamBId: null }), name)).toEqual([]);
  });
});
