import type { IdGenerator, IsoDateTime, Seed } from '@/domain/types';
import type { Clock, FileSystemAdapter, PrintAdapter, ShareAdapter, ShareMimeType } from '../contracts';

export interface TestClock extends Clock {
  readonly calls: number;
  set(iso: IsoDateTime): void;
  advance(ms: number): void;
}

export function fixedClock(start: IsoDateTime = '2026-05-01T10:00:00.000Z', stepMs = 1000): TestClock {
  let current = Date.parse(start);
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    now() {
      const value = new Date(current).toISOString();
      current += stepMs;
      calls += 1;
      return value;
    },
    set(iso) {
      current = Date.parse(iso);
    },
    advance(ms) {
      current += ms;
    },
  };
}

export function sequentialIds(prefix = 'id'): IdGenerator {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  };
}

export function seedSource(seeds: readonly Seed[] = [847291]): () => Seed {
  let index = 0;
  return () => {
    const seed = seeds[index % seeds.length];
    index += 1;
    return seed;
  };
}

export interface MemoryFileSystem extends FileSystemAdapter {
  readonly files: ReadonlyMap<string, string>;
  failNext(operation: 'write' | 'read' | 'move', error: Error): void;
  put(fileUri: string, text: string): void;
}

export function memoryFileSystem(cacheDirectory = 'file:///cache/'): MemoryFileSystem {
  const files = new Map<string, string>();
  const failures = new Map<'write' | 'read' | 'move', Error>();
  const check = (operation: 'write' | 'read' | 'move') => {
    const error = failures.get(operation);
    if (error !== undefined) {
      failures.delete(operation);
      throw error;
    }
  };
  return {
    cacheDirectory,
    files,
    failNext(operation, error) {
      failures.set(operation, error);
    },
    put(fileUri, text) {
      files.set(fileUri, text);
    },
    async writeText(fileUri, text) {
      check('write');
      files.set(fileUri, text);
    },
    async readText(fileUri) {
      check('read');
      const text = files.get(fileUri);
      if (text === undefined) {
        throw new Error(`ENOENT: ${fileUri}`);
      }
      return text;
    },
    async move(fromUri, toUri) {
      check('move');
      const text = files.get(fromUri);
      if (text === undefined) {
        throw new Error(`ENOENT: ${fromUri}`);
      }
      files.delete(fromUri);
      files.set(toUri, text);
    },
    async remove(fileUri) {
      files.delete(fileUri);
    },
  };
}

export interface FakePrinter extends PrintAdapter {
  readonly printed: readonly string[];
  failWith(error: Error | null): void;
}

export function fakePrinter(fileSystem: MemoryFileSystem): FakePrinter {
  const printed: string[] = [];
  let failure: Error | null = null;
  return {
    printed,
    failWith(error) {
      failure = error;
    },
    async printToFile(html) {
      if (failure !== null) {
        throw failure;
      }
      printed.push(html);
      const uri = `file:///cache/print-${printed.length}.pdf`;
      fileSystem.put(uri, html);
      return uri;
    },
  };
}

export interface SharedFile {
  readonly fileUri: string;
  readonly mimeType: ShareMimeType;
  readonly dialogTitle: string;
}

export interface FakeSharer extends ShareAdapter {
  readonly shared: readonly SharedFile[];
  setAvailable(available: boolean): void;
  failWith(error: Error | null): void;
}

export function fakeSharer(): FakeSharer {
  const shared: SharedFile[] = [];
  let available = true;
  let failure: Error | null = null;
  return {
    shared,
    setAvailable(value) {
      available = value;
    },
    failWith(error) {
      failure = error;
    },
    async isAvailable() {
      return available;
    },
    async share(fileUri, options) {
      if (failure !== null) {
        throw failure;
      }
      shared.push({ fileUri, mimeType: options.mimeType, dialogTitle: options.dialogTitle });
    },
  };
}
