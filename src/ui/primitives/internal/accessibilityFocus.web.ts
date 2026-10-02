import type { HostInstance } from 'react-native';

interface Focusable {
  readonly focus?: unknown;
}

export function moveAccessibilityFocus(target: HostInstance): void {
  const node = target as unknown as Focusable;
  if (typeof node.focus === 'function') {
    (node.focus as () => void).call(node);
  }
}
