import type { DeliveryPayload, DeliveryRunsBreakdown, MatchRules, Runs, RunsTo } from '../../types';

export interface DeliveryFigures {
  readonly isLegal: boolean;
  readonly isBallFaced: boolean;
  readonly runsTo: RunsTo | 'wide';
  readonly batterRuns: Runs;
  readonly extras: DeliveryRunsBreakdown;
  readonly extraRuns: Runs;
  readonly totalRuns: Runs;
  readonly bowlerRuns: Runs;
  readonly isFour: boolean;
  readonly isSix: boolean;
}

const NO_EXTRAS: DeliveryRunsBreakdown = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };

function credited(runsTo: RunsTo, runs: Runs): { readonly batterRuns: Runs; readonly byes: Runs; readonly legByes: Runs } {
  switch (runsTo) {
    case 'bat':
      return { batterRuns: runs, byes: 0, legByes: 0 };
    case 'bye':
      return { batterRuns: 0, byes: runs, legByes: 0 };
    case 'leg_bye':
      return { batterRuns: 0, byes: 0, legByes: runs };
    default: {
      const unreachable: never = runsTo;
      return unreachable;
    }
  }
}

export function deliveryFigures(rules: MatchRules, delivery: DeliveryPayload): DeliveryFigures {
  const scored = delivery.runsRun - delivery.shortRuns + delivery.boundary;
  if (delivery.call === 'wide') {
    const wides = rules.wide.penaltyRuns + scored;
    return {
      isLegal: rules.wide.countsAsBall,
      isBallFaced: false,
      runsTo: 'wide',
      batterRuns: 0,
      extras: { ...NO_EXTRAS, wides },
      extraRuns: wides,
      totalRuns: wides,
      bowlerRuns: wides,
      isFour: false,
      isSix: false,
    };
  }
  const split = credited(delivery.runsTo, scored);
  const offBat = delivery.runsTo === 'bat' && delivery.runsRun === 0;
  const noBalls = delivery.call === 'no_ball' ? rules.noBall.penaltyRuns : 0;
  const extras: DeliveryRunsBreakdown = { wides: 0, noBalls, byes: split.byes, legByes: split.legByes };
  const extraRuns = noBalls + split.byes + split.legByes;
  return {
    isLegal: delivery.call === 'fair' ? true : rules.noBall.countsAsBall,
    isBallFaced: true,
    runsTo: delivery.runsTo,
    batterRuns: split.batterRuns,
    extras,
    extraRuns,
    totalRuns: extraRuns + split.batterRuns,
    bowlerRuns: noBalls + split.batterRuns,
    isFour: offBat && delivery.boundary === 4,
    isSix: offBat && delivery.boundary === 6,
  };
}
