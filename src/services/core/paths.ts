export function joinPath(base: string, ...parts: readonly string[]): string {
  const head = base.endsWith('/') ? base.slice(0, -1) : base;
  const tail = parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter((part) => part.length > 0);
  return [head, ...tail].join('/');
}

export function safeFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
  return slug.length === 0 ? 'export' : slug;
}

export function exportsDirectory(cacheDirectory: string): string {
  return joinPath(cacheDirectory, 'exports');
}
