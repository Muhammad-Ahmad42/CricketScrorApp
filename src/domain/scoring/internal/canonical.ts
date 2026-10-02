const stringify = JSON.stringify;
const isArray = Array.isArray;
const isFiniteNumber = Number.isFinite;
const keysOf = Object.keys;
const imul = Math.imul;

function canonicalValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  switch (typeof value) {
    case 'number':
      return isFiniteNumber(value) ? stringify(value) : 'null';
    case 'string':
    case 'boolean':
      return stringify(value);
    case 'object':
      break;
    default:
      return 'null';
  }
  if (isArray(value)) {
    let out = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) {
        out += ',';
      }
      out += canonicalValue(value[index]);
    }
    return `${out}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = keysOf(record).sort();
  let out = '{';
  let first = true;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const item = record[key];
    if (item === undefined) {
      continue;
    }
    if (!first) {
      out += ',';
    }
    first = false;
    out += `${stringify(key)}:${canonicalValue(item)}`;
  }
  return `${out}}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}

function mix(hash: number, byte: number): number {
  return imul(hash ^ byte, 0x01000193) >>> 0;
}

export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  const length = text.length;
  for (let index = 0; index < length; index += 1) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      hash = mix(hash, code);
    } else if (code < 0x800) {
      hash = mix(mix(hash, 0xc0 | (code >> 6)), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      hash = mix(mix(mix(hash, 0xe0 | (code >> 12)), 0x80 | ((code >> 6) & 0x3f)), 0x80 | (code & 0x3f));
    } else {
      hash = mix(mix(mix(mix(hash, 0xf0 | (code >> 18)), 0x80 | ((code >> 12) & 0x3f)), 0x80 | ((code >> 6) & 0x3f)), 0x80 | (code & 0x3f));
    }
  }
  return hash.toString(16).padStart(8, '0');
}
