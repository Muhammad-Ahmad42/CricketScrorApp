const INDEX_KEY = /^(?:0|[1-9]\d*)$/;
const MAX_INDEX = 4294967294;

function isIndexKey(key: string): boolean {
  return INDEX_KEY.test(key) && Number(key) <= MAX_INDEX;
}

function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

interface ArrayFrame {
  readonly kind: 'array';
  readonly items: readonly unknown[];
  next: number;
}

interface ObjectFrame {
  readonly kind: 'object';
  readonly record: Readonly<Record<string, unknown>>;
  readonly names: readonly string[];
  next: number;
  written: number;
}

type Frame = ArrayFrame | ObjectFrame;

function open(value: unknown, out: string[], stack: Frame[]): void {
  if (value === null || typeof value !== 'object') {
    out.push(JSON.stringify(value) ?? 'null');
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    stack.push({ kind: 'array', items: value, next: 0 });
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  out.push('{');
  stack.push({ kind: 'object', record, names: Object.keys(record).sort(), next: 0, written: 0 });
}

function advanceArray(frame: ArrayFrame, out: string[], stack: Frame[]): void {
  if (frame.next >= frame.items.length) {
    out.push(']');
    stack.pop();
    return;
  }
  if (frame.next > 0) {
    out.push(',');
  }
  const entry = frame.items[frame.next];
  frame.next += 1;
  open(isOmitted(entry) ? null : entry, out, stack);
}

function advanceObject(frame: ObjectFrame, out: string[], stack: Frame[]): void {
  while (frame.next < frame.names.length && isOmitted(frame.record[frame.names[frame.next]])) {
    frame.next += 1;
  }
  if (frame.next >= frame.names.length) {
    out.push('}');
    stack.pop();
    return;
  }
  const name = frame.names[frame.next];
  frame.next += 1;
  out.push(frame.written > 0 ? ',' : '', JSON.stringify(name), ':');
  frame.written += 1;
  open(frame.record[name], out, stack);
}

function iterativeCanonicalJson(value: unknown): string {
  const out: string[] = [];
  const stack: Frame[] = [];
  open(isOmitted(value) ? null : value, out, stack);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.kind === 'array') {
      advanceArray(frame, out, stack);
    } else {
      advanceObject(frame, out, stack);
    }
  }
  return out.join('');
}

function nativeCanonicalJson(value: unknown): string | null {
  let needsSlowPath = false;
  const text = JSON.stringify(value, (_key: string, entry: unknown) => {
    if (needsSlowPath || entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return entry;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record);
    if (keys.some(isIndexKey)) {
      needsSlowPath = true;
      return entry;
    }
    keys.sort();
    const sorted: Record<string, unknown> = {};
    for (const name of keys) {
      sorted[name] = record[name];
    }
    return sorted;
  });
  return needsSlowPath ? null : (text ?? 'null');
}

export function canonicalJson(value: unknown): string {
  let text: string | null;
  try {
    text = nativeCanonicalJson(value);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    text = null;
  }
  return text ?? iterativeCanonicalJson(value);
}
