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

const LUCIDE_ICON_MODULES: Readonly<Record<string, string>> = {
  'arrow-left-right': 'ArrowLeftRight',
  'calendar-days': 'CalendarDays',
  check: 'Check',
  'chevron-down': 'ChevronDown',
  'chevron-left': 'ChevronLeft',
  'chevron-right': 'ChevronRight',
  'chevron-up': 'ChevronUp',
  'circle-alert': 'CircleAlert',
  'circle-check': 'CircleCheck',
  'circle-dot': 'CircleDot',
  'cloud-rain': 'CloudRain',
  clock: 'Clock',
  ellipsis: 'Ellipsis',
  'file-text': 'FileText',
  'hard-drive-download': 'HardDriveDownload',
  'rotate-ccw-clock': 'History',
  house: 'House',
  info: 'Info',
  minus: 'Minus',
  pause: 'Pause',
  'pencil-line': 'PencilLine',
  play: 'Play',
  plus: 'Plus',
  'redo-2': 'Redo2',
  search: 'Search',
  settings: 'Settings',
  share: 'Share',
  trash: 'Trash2',
  'triangle-alert': 'TriangleAlert',
  trophy: 'Trophy',
  'undo-2': 'Undo2',
  x: 'X',
};

for (const [mockFile, mockName] of Object.entries(LUCIDE_ICON_MODULES)) {
  jest.mock(`lucide-react-native/icons/${mockFile}`, () => ({
    __esModule: true,
    default: (jest.requireMock('lucide-react-native') as Record<string, unknown>)[mockName],
  }));
}

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
