import type { MatchRules, RunsTo } from '@/domain/types';
import { bye, legBye, noBall, overthrowBoundary, scoreRuns, wide, type ScoringIntent } from '@/domain/scoring/commands';

export type ExtrasTab = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'other';

export const EXTRAS_TABS: readonly { readonly key: ExtrasTab; readonly label: string }[] = [
  { key: 'wide', label: 'Wide' },
  { key: 'no_ball', label: 'No ball' },
  { key: 'bye', label: 'Bye' },
  { key: 'leg_bye', label: 'Leg bye' },
  { key: 'other', label: 'Other' },
];

export interface ExtrasChip {
  readonly key: string;
  readonly label: string;
  readonly caption: string | null;
  readonly accessibilityLabel: string;
  readonly intent: ScoringIntent;
}

function chip(key: string, label: string, caption: string | null, accessibilityLabel: string, intent: ScoringIntent): ExtrasChip {
  return { key, label, caption, accessibilityLabel, intent };
}

function wideChips(): readonly ExtrasChip[] {
  return [
    chip('wd', 'WD', null, 'Wide', wide()),
    chip('wd1', 'WD+1', 'ran 1', 'Wide plus 1 run', wide(1)),
    chip('wd2', 'WD+2', 'ran 2', 'Wide plus 2 runs', wide(2)),
    chip('wd3', 'WD+3', 'ran 3', 'Wide plus 3 runs', wide(3)),
    chip('wd4', 'WD+4', 'ran 4', 'Wide plus 4 runs, ran', wide(4)),
    chip('wdb', 'Boundary', 'to the rope', 'Wide to the boundary', wide(0, { boundary: true })),
  ];
}

const RUNS_TO_WORD: { readonly [K in RunsTo]: string } = { bat: 'off the bat', bye: 'byes', leg_bye: 'leg byes' };

function noBallChips(runsTo: RunsTo): readonly ExtrasChip[] {
  const word = RUNS_TO_WORD[runsTo];
  const chips: ExtrasChip[] = [
    chip('nb', 'NB', null, 'No ball', noBall({ runsTo })),
    chip('nb1', '+1', null, `No ball plus 1 ${word}`, noBall({ runsTo, runsRun: 1 })),
    chip('nb2', '+2', null, `No ball plus 2 ${word}`, noBall({ runsTo, runsRun: 2 })),
    chip('nb3', '+3', null, `No ball plus 3 ${word}`, noBall({ runsTo, runsRun: 3 })),
    chip('nb4', '+4', runsTo === 'bat' ? 'four' : 'boundary', `No ball plus 4 ${word}, boundary`, noBall({ runsTo, boundary: 4 })),
  ];
  if (runsTo === 'bat') {
    chips.push(chip('nb6', '+6', 'six', 'No ball plus a six', noBall({ runsTo, boundary: 6 })));
  }
  return chips;
}

function byeChips(kind: 'bye' | 'leg_bye'): readonly ExtrasChip[] {
  const prefix = kind === 'bye' ? 'B' : 'LB';
  const word = kind === 'bye' ? 'bye' : 'leg bye';
  const make = kind === 'bye' ? bye : legBye;
  return [
    chip(`${prefix}1`, `${prefix}1`, null, `1 ${word}`, make(1)),
    chip(`${prefix}2`, `${prefix}2`, null, `2 ${word}s`, make(2)),
    chip(`${prefix}3`, `${prefix}3`, null, `3 ${word}s`, make(3)),
    chip(`${prefix}4`, `${prefix}4`, 'boundary', `4 ${word}s, boundary`, make(0, { boundary: true })),
  ];
}

function otherChips(): readonly ExtrasChip[] {
  return [
    chip('r5', '5 runs', null, '5 runs', scoreRuns(5)),
    chip('r7', '7 runs', null, '7 runs', scoreRuns(7)),
    chip('ar4', 'All-run 4', null, 'All-run 4, not a boundary', scoreRuns(4, { allRun: true })),
    chip('ot1', '1 + 4 overthrows', null, '1 run plus 4 overthrows', overthrowBoundary(1)),
    chip('ot2', '2 + 4 overthrows', null, '2 runs plus 4 overthrows', overthrowBoundary(2)),
  ];
}

export function extrasChips(tab: ExtrasTab, runsTo: RunsTo): readonly ExtrasChip[] {
  switch (tab) {
    case 'wide':
      return wideChips();
    case 'no_ball':
      return noBallChips(runsTo);
    case 'bye':
    case 'leg_bye':
      return byeChips(tab);
    case 'other':
      return otherChips();
    default: {
      const unreachable: never = tab;
      return unreachable;
    }
  }
}

export interface CustomExtras {
  readonly runsRun: number;
  readonly boundary: 0 | 4 | 6;
  readonly shortRuns: number;
}

export function customIntent(tab: ExtrasTab, runsTo: RunsTo, custom: CustomExtras): ScoringIntent {
  const shortRuns = Math.min(custom.shortRuns, custom.runsRun);
  const short = shortRuns > 0 ? { shortRuns } : {};
  switch (tab) {
    case 'wide':
      return wide(custom.runsRun, { boundary: custom.boundary !== 0, ...short });
    case 'no_ball':
      return noBall({ runsTo, runsRun: custom.runsRun, boundary: runsTo === 'bat' ? custom.boundary : custom.boundary === 0 ? 0 : 4, ...short });
    case 'bye':
      return bye(custom.runsRun, { boundary: custom.boundary !== 0, ...short });
    case 'leg_bye':
      return legBye(custom.runsRun, { boundary: custom.boundary !== 0, ...short });
    case 'other':
      return { type: 'runs', runsRun: custom.runsRun, boundary: custom.boundary, ...short };
    default: {
      const unreachable: never = tab;
      return unreachable;
    }
  }
}

export function allowsSix(tab: ExtrasTab, runsTo: RunsTo): boolean {
  return tab === 'other' || (tab === 'no_ball' && runsTo === 'bat');
}

export function extrasRuleNote(tab: ExtrasTab, rules: MatchRules): string | null {
  switch (tab) {
    case 'wide': {
      const runs = rules.wide.penaltyRuns;
      const again = rules.wide.countsAsBall ? 'counts as a ball' : 'bowled again';
      return `Wide: ${runs} ${runs === 1 ? 'run' : 'runs'} · ${again}`;
    }
    case 'no_ball': {
      const runs = rules.noBall.penaltyRuns;
      const free = rules.noBall.freeHit ? ' · free hit next' : '';
      return `No-ball: ${runs} ${runs === 1 ? 'run' : 'runs'}${free}`;
    }
    case 'bye':
    case 'leg_bye':
    case 'other':
      return null;
    default: {
      const unreachable: never = tab;
      return unreachable;
    }
  }
}
