const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

class Sha256 {
  private readonly hash = new Uint32Array(INITIAL);
  private readonly block = new Uint8Array(64);
  private readonly words = new Uint32Array(64);
  private filled = 0;
  private length = 0;

  push(byte: number): void {
    this.block[this.filled] = byte;
    this.filled += 1;
    this.length += 1;
    if (this.filled === 64) {
      this.compress();
      this.filled = 0;
    }
  }

  pushText(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      let code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        const low = text.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          index += 1;
        } else {
          code = 0xfffd;
        }
      } else if (code >= 0xd800 && code <= 0xdfff) {
        code = 0xfffd;
      }
      this.pushCodePoint(code);
    }
  }

  private pushCodePoint(code: number): void {
    if (code < 0x80) {
      this.push(code);
    } else if (code < 0x800) {
      this.push(0xc0 | (code >> 6));
      this.push(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      this.push(0xe0 | (code >> 12));
      this.push(0x80 | ((code >> 6) & 0x3f));
      this.push(0x80 | (code & 0x3f));
    } else {
      this.push(0xf0 | (code >> 18));
      this.push(0x80 | ((code >> 12) & 0x3f));
      this.push(0x80 | ((code >> 6) & 0x3f));
      this.push(0x80 | (code & 0x3f));
    }
  }

  digest(): string {
    const bitLength = this.length * 8;
    this.push(0x80);
    while (this.filled !== 56) {
      this.push(0);
    }
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    [high >>> 24, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff, low >>> 24, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff].forEach(
      (byte) => this.push(byte),
    );
    return Array.from(this.hash, (word) => word.toString(16).padStart(8, '0')).join('');
  }

  private compress(): void {
    const w = this.words;
    const b = this.block;
    for (let i = 0; i < 16; i += 1) {
      w[i] = (b[i * 4] << 24) | (b[i * 4 + 1] << 16) | (b[i * 4 + 2] << 8) | b[i * 4 + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, h] = this.hash;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) | 0;
    }
    this.hash[0] += a;
    this.hash[1] += bb;
    this.hash[2] += c;
    this.hash[3] += d;
    this.hash[4] += e;
    this.hash[5] += f;
    this.hash[6] += g;
    this.hash[7] += h;
  }
}

export function sha256Hex(text: string): string {
  const hasher = new Sha256();
  hasher.pushText(text);
  return hasher.digest();
}
