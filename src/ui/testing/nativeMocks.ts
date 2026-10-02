jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

jest.mock('lucide-react-native', () => {
  const react: typeof import('react') = jest.requireActual('react');
  const native: typeof import('react-native') = jest.requireActual('react-native');
  const cache = new Map<string, unknown>();
  const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const make = (name: string) => {
    const StubIcon = (props: Record<string, unknown>) =>
      react.createElement(native.View, {
        testID: typeof props['testID'] === 'string' ? props['testID'] : `lucide-${kebab(name)}`,
        accessible: false,
        importantForAccessibility: 'no' as const,
        style: { width: Number(props['size'] ?? 0), height: Number(props['size'] ?? 0), borderColor: String(props['color'] ?? '') },
      });
    StubIcon.displayName = name;
    return StubIcon;
  };
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__esModule') {
          return true;
        }
        if (typeof property !== 'string' || property === 'then') {
          return undefined;
        }
        if (!cache.has(property)) {
          cache.set(property, make(property));
        }
        return cache.get(property);
      },
    },
  );
});

jest.mock('react-native-gifted-charts', () => {
  const react: typeof import('react') = jest.requireActual('react');
  const native: typeof import('react-native') = jest.requireActual('react-native');
  const chart = (testID: string) =>
    jest.fn((props: Record<string, unknown>) => react.createElement(native.View, { testID, accessibilityLabel: String(props['maxValue'] ?? '') }));
  return {
    LineChart: chart('gifted-line-chart'),
    BarChart: chart('gifted-bar-chart'),
  };
});

export {};
