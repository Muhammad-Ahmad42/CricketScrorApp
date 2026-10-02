export function joinPath(base: string, ...parts: readonly string[]): string {
  const head = base.endsWith('/') ? base.slice(0, -1) : base;
  const tail = parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter((part) => part.length > 0);
  return [head, ...tail].join('/');
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length === 0 ? 'export' : cleaned.slice(0, 120).trim();
}

export function exportsDirectory(cacheDirectory: string): string {
  return joinPath(cacheDirectory, 'exports');
}
