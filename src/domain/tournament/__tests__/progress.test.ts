import { evaluateTournament } from '../evaluate';
import { tournamentProgress } from '../progress';
import { cupSnapshot } from './standingsKit/cup';
import { deepFreeze, simpleWin } from './standingsKit/summaries';
import { entry, fixture, makeSnapshot, pool, stage, team, withResult } from './standingsKit/tournament';

describe('tournamentProgress (wave-3 review: GROUP STAGE label counted every tournament match)', () => {
  it('counts only the current stage under its name and gives the overall count as detail', () => {
    const snapshot = deepFreeze(cupSnapshot({ playedA: 4 }));
    const progress = tournamentProgress(snapshot, evaluateTournament(snapshot));
    expect(progress).toMatchObject({
      overall: { done: 10, total: 15 },
      current: { stageId: 'groups', stageName: 'Group stage', done: 10, total: 12, complete: false },
      label: 'Group stage',
      countText: '10 of 12',
      detail: '10 of 15 overall · Knockouts: 3 matches',
    });
    expect(progress.ratio).toBeCloseTo(10 / 12, 9);
    expect(progress.stages.map((line) => [line.stageId, line.done, line.total])).toEqual([
      ['groups', 10, 12],
      ['ko', 0, 3],
    ]);
  });

  it('moves on to the knockouts once the group stage is complete', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const progress = tournamentProgress(snapshot, evaluateTournament(snapshot));
    expect(progress).toMatchObject({ label: 'Knockouts', countText: '0 of 3', detail: '12 of 15 overall', current: { stageId: 'ko' } });
  });

  it('a finished tournament reports the whole tournament', () => {
    const snapshot = deepFreeze(
      cupSnapshot({ ko: { sf1: simpleWin('sf1m', 'LIO', 'COB'), sf2: simpleWin('sf2m', 'BUL', 'TIG'), final: simpleWin('fm', 'BUL', 'LIO') } }),
    );
    const progress = tournamentProgress(snapshot, evaluateTournament(snapshot));
    expect(progress).toMatchObject({ label: 'Tournament', countText: '15 of 15', ratio: 1, current: null, detail: '15 of 15 matches played' });
  });

  it('a single-stage league uses the stage name and the same count everywhere', () => {
    const played = simpleWin('m1', 'LIO', 'TIG');
    const snapshot = deepFreeze(
      makeSnapshot({
        teams: ['LIO', 'TIG', 'EAG'],
        stages: [stage('league', 'League', 'league', 0, { decidesChampion: true })],
        pools: [pool('pL', 'league', 'League', 0)],
        poolEntries: ['LIO', 'TIG', 'EAG'].map((id) => entry('league', 'pL', team(id))),
        fixtures: [
          withResult(fixture('f1', 'league', 'pL', 1, team('LIO'), team('TIG')), played),
          fixture('f2', 'league', 'pL', 2, team('TIG'), team('EAG')),
          fixture('f3', 'league', 'pL', 3, team('EAG'), team('LIO')),
        ],
        summaries: [played],
      }),
    );
    expect(tournamentProgress(snapshot, evaluateTournament(snapshot))).toMatchObject({ label: 'League', countText: '1 of 3', detail: '1 of 3 matches played' });
    expect(tournamentProgress(snapshot, null)).toMatchObject({ overall: { done: 0, total: 3 }, countText: '0 of 3' });
  });
});
