export function formatSignedNrr(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–';
  const rounded = Math.round(Math.abs(value) * 1000) / 1000;
  if (rounded === 0) return '0.000';
  const sign = value < 0 ? '-' : '+';
  return `${sign}${rounded.toFixed(3)}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function joinNames(names: readonly string[], conjunction = 'and'): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function positionWord(position: number): string {
  if (position === 1) return 'winners';
  if (position === 2) return 'runners-up';
  return ordinal(position);
}

export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

export function pointsText(value: number): string {
  return `${formatPoints(value)} ${value === 1 ? 'pt' : 'pts'}`;
}
