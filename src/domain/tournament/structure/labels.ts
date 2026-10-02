export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function letterName(index: number): string {
  let remaining = index + 1;
  let letters = '';
  while (remaining > 0) {
    remaining -= 1;
    letters = String.fromCharCode(65 + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26);
  }
  return letters;
}

const POOL_PREFIX = /^(pool|group)\s+/i;

export function poolShortName(name: string, orderIndex: number): string {
  const stripped = name.trim().replace(POOL_PREFIX, '').trim();
  if (/^[A-Za-z]{1,3}$/.test(stripped)) {
    return stripped.toUpperCase();
  }
  if (/^\d{1,3}$/.test(stripped)) {
    return `G${stripped}-`;
  }
  return letterName(orderIndex);
}

export function poolPositionLabel(poolName: string, orderIndex: number, position: number): string {
  return `${poolShortName(poolName, orderIndex)}${position}`;
}

export function bestOfPositionLabel(position: number, rank: number): string {
  if (position === 1) {
    return rank === 1 ? 'Best pool winner' : `${ordinal(rank)} best pool winner`;
  }
  if (position === 2) {
    return rank === 1 ? 'Best runner-up' : `${ordinal(rank)} best runner-up`;
  }
  return rank === 1 ? `Best ${ordinal(position)}` : `Best ${ordinal(position)} #${rank}`;
}

export function overallLabel(rank: number): string {
  return `${ordinal(rank)} overall`;
}

export function roundNameFor(teamsInRound: number, round: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Quarterfinal';
    case 16:
      return 'Round of 16';
    case 32:
      return 'Round of 32';
    default:
      return `Round ${round}`;
  }
}

export function bracketFixtureLabel(teamsInRound: number, round: number, number: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return `SF${number}`;
    case 8:
      return `QF${number}`;
    case 16:
      return `R16-${number}`;
    case 32:
      return `R32-${number}`;
    default:
      return `R${round}-${number}`;
  }
}

function roundShortName(teamsInRound: number, round: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'SF';
    case 8:
      return 'QF';
    case 16:
      return 'R16';
    case 32:
      return 'R32';
    default:
      return `R${round}`;
  }
}

export function byeSeedLabel(teamsInRound: number, round: number, seed: number): string {
  return `${roundShortName(teamsInRound, round)} seed ${seed}`;
}

export const THIRD_PLACE_NAME = 'Third place';

export const DIRECT_ENTRY_LABEL = 'Direct entry';

export const TBD_LABEL = 'TBD';

export function numberedLabel(base: string, index: number, count: number): string {
  return count > 1 ? `${base} ${index + 1}` : base;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function poolPositionLabelFor(poolName: string, position: number): string {
  const stripped = poolName.trim().replace(POOL_PREFIX, '').trim();
  if (/^[A-Za-z]{1,3}$/.test(stripped) || /^\d{1,3}$/.test(stripped)) {
    return `${poolShortName(poolName, 0)}${position}`;
  }
  return `${poolName.trim()} ${ordinal(position)}`;
}
