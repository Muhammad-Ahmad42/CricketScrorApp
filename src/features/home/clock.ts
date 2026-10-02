export type HourSource = () => number;

const deviceHour: HourSource = () => new Date().getHours();

let source: HourSource = deviceHour;

export function setHourSource(next: HourSource | null): void {
  source = next ?? deviceHour;
}

export function currentHour(): number {
  return source();
}
