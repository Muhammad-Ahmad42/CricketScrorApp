const handled = new Set<string>();

export function markResumeHandled(ids: readonly string[]): void {
  for (const id of ids) {
    handled.add(id);
  }
}

export function isResumeHandled(id: string): boolean {
  return handled.has(id);
}

export function resetResumeSession(): void {
  handled.clear();
}
