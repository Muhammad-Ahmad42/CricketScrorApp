import type { BallCount, InningsState, PowerplayPhaseStatus, PowerplayRule, PowerplayStatus } from '../../types';

export function clampPhases(phases: readonly PowerplayRule[], maxBalls: BallCount, ballsPerOver: number): readonly PowerplayRule[] {
  const maxOvers = Math.ceil(maxBalls / ballsPerOver);
  return phases
    .filter((phase) => phase.fromOver <= maxOvers)
    .map((phase) => (phase.toOver > maxOvers ? { ...phase, toOver: maxOvers } : phase));
}

export function phasesFromBalls(rules: readonly PowerplayRule[], innings: Pick<InningsState, 'balls'>): readonly PowerplayPhaseStatus[] {
  return rules.map((rule) => {
    let runs = 0;
    let wickets = 0;
    let legalBalls = 0;
    for (const ball of innings.balls) {
      const overNumber = ball.overIndex + 1;
      if (overNumber >= rule.fromOver && overNumber <= rule.toOver) {
        runs += ball.totalRuns;
        wickets += ball.wicket === null ? 0 : 1;
        legalBalls += ball.isLegal ? 1 : 0;
      }
    }
    return { rule, state: 'upcoming', runs, wickets, legalBalls };
  });
}

function phaseState(innings: InningsState, phase: PowerplayPhaseStatus, ballsPerOver: number): PowerplayPhaseStatus['state'] {
  if (innings.legalBalls >= phase.rule.toOver * ballsPerOver) {
    return 'complete';
  }
  if (innings.status === 'complete') {
    return innings.legalBalls > (phase.rule.fromOver - 1) * ballsPerOver ? 'complete' : 'upcoming';
  }
  const nextOver = Math.floor(innings.legalBalls / ballsPerOver) + 1;
  return nextOver >= phase.rule.fromOver ? 'active' : 'upcoming';
}

export function withPhaseStates(innings: InningsState, ballsPerOver: number): PowerplayStatus {
  const current = innings.powerplay;
  let active: PowerplayRule | null = null;
  let phases: PowerplayPhaseStatus[] | null = null;
  for (let index = 0; index < current.phases.length; index += 1) {
    const phase = current.phases[index];
    const state = phaseState(innings, phase, ballsPerOver);
    if (state === 'active') {
      active = phase.rule;
    }
    if (state !== phase.state) {
      phases = phases ?? current.phases.slice();
      phases[index] = { rule: phase.rule, state, runs: phase.runs, wickets: phase.wickets, legalBalls: phase.legalBalls };
    }
  }
  if (phases === null && active === current.active) {
    return current;
  }
  return { active, phases: phases ?? current.phases };
}
