interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
}

interface FileSystem {
  existsSync(target: string): boolean;
  readdirSync(target: string, options: { readonly withFileTypes: true }): DirEntry[];
  readFileSync(target: string, encoding: 'utf8'): string;
}

interface PathModule {
  readonly sep: string;
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
}

declare const __dirname: string;

const fs = jest.requireActual<FileSystem>('fs');
const path = jest.requireActual<PathModule>('path');

export const ROOT = path.resolve(__dirname, '..', '..', '..');

export function sourceFiles(relativeDir: string, options: { readonly includeTests?: boolean } = {}): string[] {
  const start = path.join(ROOT, relativeDir);
  if (!fs.existsSync(start)) {
    return [];
  }
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!options.includeTests && (entry.name === '__tests__' || entry.name === 'testing')) {
          continue;
        }
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  };
  walk(start);
  return out;
}

export function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

export function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}
