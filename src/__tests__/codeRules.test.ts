/** @jest-environment node */
import { commentsIn, importsOf, isAllowedPragma, layerOf, namedImportsOf, propertiesOf, sourceTree, type ImportSite, type SourceFile } from './sourceTree';

const ALL = sourceTree('src');
const PRODUCTION = ALL.filter((source) => !source.isTest);

const PRINT_PALETTE_FILE = 'src/export/pdf/styles.ts';
const HEX_COLOUR = /['"`]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"`]/;
const FUNCTIONAL_COLOUR = /['"`]\s*(?:rgba?|hsla?)\(/;
const NETWORK_API = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b/;
const REMOTE_URL = /https?:\/\//;
const SQL_COMMENT = /--\s|\/\*/;

const FORBIDDEN_LAYERS: Readonly<Record<string, readonly string[]>> = {
  domain: ['db', 'services', 'stores', 'ui', 'features', 'app', 'export'],
  db: ['services', 'stores', 'ui', 'features', 'app', 'export'],
  export: ['db', 'services', 'stores', 'ui', 'features', 'app'],
  services: ['stores', 'ui', 'features', 'app'],
  stores: ['db', 'ui', 'features', 'app', 'export'],
  ui: ['domain', 'db', 'services', 'stores', 'features', 'app', 'export'],
  features: ['db', 'export'],
  app: ['db', 'export'],
};

const GLASS_PACKAGE = /^(?:expo-glass-effect|expo-blur)(?:\/|$)/;
const GLASS_MODULE = 'src/ui/glass/';

function glassImportsOutside(sources: readonly SourceFile[], prefix: string): readonly string[] {
  return sources
    .flatMap(importsOf)
    .filter((site) => GLASS_PACKAGE.test(site.spec) && !site.from.startsWith(prefix))
    .map((site) => `${site.from} imports ${site.spec}`);
}

const PLATFORM_PACKAGE = /^(?:react|react-native|react-dom|expo|expo-[\w-]+|@expo\/[\w-]+|@react-native[\w-/]*|zustand|sql\.js|@react-native-async-storage\/async-storage|lucide-react-native|react-native-[\w-]+)(?:\/|$)/;

function lines(source: SourceFile, pattern: RegExp): readonly string[] {
  return source.text
    .split('\n')
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, index }) => `${source.rel}:${index + 1}: ${line.trim()}`);
}

function layerViolation(site: ImportSite): string | null {
  const from = layerOf(site.from);
  if (from === null) {
    return null;
  }
  const to = site.target.startsWith('src/') ? layerOf(site.target) : null;
  if (to !== null && (FORBIDDEN_LAYERS[from] ?? []).includes(to)) {
    return `${site.from} imports ${site.spec}`;
  }
  if ((from === 'features' || from === 'app') && to === 'services' && site.target !== 'src/services/contracts') {
    return `${site.from} imports the service implementation ${site.spec}`;
  }
  return null;
}

describe('no code comments (CLAUDE.md, G-04)', () => {
  it('scans the whole source tree, tests included', () => {
    expect(ALL.length).toBeGreaterThan(300);
    expect(ALL.some((source) => source.isTest)).toBe(true);
  });

  it('finds no comment in any TypeScript file except the jest environment pragma', () => {
    expect(ALL.flatMap(commentsIn)).toEqual([]);
  });

  it('finds no SQL comment in migrations or repository SQL', () => {
    const sql = PRODUCTION.filter((source) => source.rel.startsWith('src/db/'));
    expect(sql.flatMap((source) => lines(source, SQL_COMMENT))).toEqual([]);
  });

  it('recognises the pragma and real comments', () => {
    expect(isAllowedPragma('/** @jest-environment node */')).toBe(true);
    expect(isAllowedPragma('/* note */')).toBe(false);
    const probe: SourceFile = { file: 'probe.ts', rel: 'src/probe.ts', text: "const a = 'http://x';\nconst b = 1;\n", isTest: false };
    expect(commentsIn(probe)).toEqual([]);
    expect(commentsIn({ ...probe, text: 'const b = 1; // why\n' })).toHaveLength(1);
  });
});

describe('domain purity (CLAUDE.md, G-05)', () => {
  const domain = ALL.filter((source) => source.rel.startsWith('src/domain/'));

  it('imports nothing outside src/domain, tests included', () => {
    const outside = domain
      .flatMap(importsOf)
      .filter((site) => !site.target.startsWith('src/domain/') && site.target !== 'src/domain')
      .map((site) => `${site.from} imports ${site.spec}`);
    expect(outside).toEqual([]);
  });

  it('never reads the clock or an unseeded random source', () => {
    expect(domain.flatMap((source) => lines(source, /\bDate\.now\(|\bMath\.random\(/))).toEqual([]);
  });

  it('constructs no Date in production domain code', () => {
    expect(domain.filter((source) => !source.isTest).flatMap((source) => lines(source, /\bnew Date\(/))).toEqual([]);
  });
});

describe('layering (§60, §103, G-06)', () => {
  it('keeps every import pointing to an allowed layer', () => {
    const violations = PRODUCTION.flatMap(importsOf)
      .map(layerViolation)
      .filter((entry): entry is string => entry !== null);
    expect(violations).toEqual([]);
  });

  it('keeps platform packages out of the domain, the export builders and the db contracts', () => {
    const pure = PRODUCTION.filter(
      (source) => source.rel.startsWith('src/domain/') || source.rel.startsWith('src/export/') || source.rel === 'src/db/types.ts',
    );
    const offenders = pure
      .flatMap(importsOf)
      .filter((site) => PLATFORM_PACKAGE.test(site.spec))
      .map((site) => `${site.from} imports ${site.spec}`);
    expect(offenders).toEqual([]);
  });

  it('detects a feature screen reaching into the database or a service implementation', () => {
    expect(layerViolation({ from: 'src/features/home/HomeScreen.tsx', spec: '@/db', target: 'src/db' })).not.toBeNull();
    expect(layerViolation({ from: 'src/features/home/HomeScreen.tsx', spec: '@/services/match', target: 'src/services/match' })).not.toBeNull();
    expect(layerViolation({ from: 'src/features/home/HomeScreen.tsx', spec: '@/services/contracts', target: 'src/services/contracts' })).toBeNull();
    expect(layerViolation({ from: 'src/ui/Button.tsx', spec: '@/domain/types', target: 'src/domain/types' })).not.toBeNull();
  });
});

describe('colours only from semantic tokens (§71, G-07)', () => {
  it('has no hex or functional colour literal outside src/ui/theme and the documented print palette', () => {
    const files = PRODUCTION.filter((source) => !source.rel.startsWith('src/ui/theme/') && source.rel !== PRINT_PALETTE_FILE);
    expect(files.flatMap((source) => [...lines(source, HEX_COLOUR), ...lines(source, FUNCTIONAL_COLOUR)])).toEqual([]);
  });

  it('keeps the print palette as named constants only', () => {
    const palette = PRODUCTION.find((source) => source.rel === PRINT_PALETTE_FILE);
    expect(palette).toBeDefined();
    const hexLines = palette === undefined ? [] : lines(palette, HEX_COLOUR);
    expect(hexLines.length).toBeGreaterThan(0);
    expect(hexLines.every((line) => /^\S+:\d+: \w+: '#[0-9A-Fa-f]{6}',$/.test(line))).toBe(true);
  });
});

describe('offline only (§85, G-08)', () => {
  it('uses no network API and names no remote URL in production code', () => {
    expect(PRODUCTION.flatMap((source) => [...lines(source, NETWORK_API), ...lines(source, REMOTE_URL)])).toEqual([]);
  });
});

describe('liquid glass stays inside the design system (§106)', () => {
  it('imports expo-glass-effect and expo-blur only from src/ui, tests included', () => {
    expect(glassImportsOutside(ALL, 'src/ui/')).toEqual([]);
  });

  it('keeps those imports inside the glass module, where the platform resolver and Reduce Transparency live', () => {
    expect(glassImportsOutside(ALL, GLASS_MODULE)).toEqual([]);
  });

  it('really renders glass from the design system: the glass module imports both packages', () => {
    const glassModule = PRODUCTION.filter((source) => source.rel.startsWith(GLASS_MODULE));
    const specs = new Set(glassModule.flatMap(importsOf).map((site) => site.spec));
    expect(specs.has('expo-glass-effect')).toBe(true);
    expect(specs.has('expo-blur')).toBe(true);
  });

  it('detects a feature or a store reaching for the glass packages directly', () => {
    const feature: SourceFile = {
      file: 'probe.tsx',
      rel: 'src/features/home/Probe.tsx',
      text: "import { BlurView } from 'expo-blur';\nimport { GlassView } from 'expo-glass-effect';\n",
      isTest: false,
    };
    const store: SourceFile = { ...feature, rel: 'src/stores/probe.ts', text: "jest.mock('expo-glass-effect');\n" };
    const primitive: SourceFile = { ...feature, rel: 'src/ui/primitives/Probe.tsx' };
    expect(glassImportsOutside([feature, store], 'src/ui/')).toHaveLength(3);
    expect(glassImportsOutside([primitive], 'src/ui/')).toHaveLength(0);
    expect(glassImportsOutside([primitive], GLASS_MODULE)).toHaveLength(2);
  });
});

const SCREEN_CODE = PRODUCTION.filter((source) => source.rel.startsWith('src/features/') || source.rel.startsWith('src/app/'));
const RAW_CONTROLS = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'TouchableNativeFeedback', 'TextInput']);
const TYPE_KEYS = new Set(['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing']);
const SPACING_KEY = /^(?:(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End|Block|Inline)?|gap|rowGap|columnGap)$/;

function rawControls(sources: readonly SourceFile[]): readonly string[] {
  return sources
    .flatMap(namedImportsOf)
    .filter((site) => site.spec === 'react-native' && !site.typeOnly && RAW_CONTROLS.has(site.name))
    .map((site) => `${site.from} imports ${site.name} from react-native`);
}

function typeOverrides(sources: readonly SourceFile[]): readonly string[] {
  return sources
    .flatMap(propertiesOf)
    .filter((property) => TYPE_KEYS.has(property.key))
    .map((property) => `${property.at}: ${property.text}`);
}

function rawSpacing(sources: readonly SourceFile[]): readonly string[] {
  return sources
    .flatMap(propertiesOf)
    .filter((property) => SPACING_KEY.test(property.key) && property.number !== null && property.number !== 0)
    .map((property) => `${property.at}: ${property.text}`);
}

function centredText(sources: readonly SourceFile[]): readonly string[] {
  return sources
    .flatMap(propertiesOf)
    .filter((property) => property.key === 'textAlign' && property.string === 'center')
    .map((property) => `${property.at}: ${property.text}`);
}

describe('UI consistency in screens and routes (CLAUDE.md "UI consistency", "Text layout")', () => {
  it('scans every production feature and route file', () => {
    expect(SCREEN_CODE.filter((source) => source.rel.startsWith('src/features/')).length).toBeGreaterThan(100);
    expect(SCREEN_CODE.some((source) => source.rel.startsWith('src/app/'))).toBe(true);
  });

  it('builds controls and fields from src/ui, never from raw react-native Pressable, Touchable* or TextInput', () => {
    expect(rawControls(SCREEN_CODE)).toEqual([]);
  });

  it('sets type only through Text variants: no fontSize, fontWeight, fontFamily, lineHeight or letterSpacing', () => {
    expect(typeOverrides(SCREEN_CODE)).toEqual([]);
  });

  it('spaces only with space tokens: no numeric padding, margin or gap other than 0', () => {
    expect(rawSpacing(SCREEN_CODE)).toEqual([]);
  });

  it('never centres text through a textAlign style; centred figures come from the design system', () => {
    expect(centredText(SCREEN_CODE)).toEqual([]);
  });

  it('detects each violation and lets the allowed forms through', () => {
    const probe = (text: string): SourceFile => ({ file: 'probe.tsx', rel: 'src/features/home/Probe.tsx', text, isTest: false });
    const bad = probe(
      [
        "import { Pressable, TextInput as Field, TouchableOpacity, View } from 'react-native';",
        'const styles = StyleSheet.create({',
        "  a: { fontSize: 13, fontWeight: '700', paddingHorizontal: 6, marginTop: -2, gap: 10, textAlign: 'center' },",
        '});',
      ].join(String.fromCharCode(10)),
    );
    expect(rawControls([bad])).toEqual([
      'src/features/home/Probe.tsx imports Pressable from react-native',
      'src/features/home/Probe.tsx imports TextInput from react-native',
      'src/features/home/Probe.tsx imports TouchableOpacity from react-native',
    ]);
    expect(typeOverrides([bad])).toHaveLength(2);
    expect(rawSpacing([bad])).toHaveLength(3);
    expect(centredText([bad])).toHaveLength(1);
    const good = probe(
      [
        "import { StyleSheet, View, type TextInput } from 'react-native';",
        "import type { Pressable } from 'react-native';",
        'const styles = StyleSheet.create({',
        "  a: { padding: 0, margin: space.md, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: StyleSheet.hairlineWidth, textAlign: 'right' },",
        '});',
      ].join(String.fromCharCode(10)),
    );
    expect(rawControls([good])).toEqual([]);
    expect(typeOverrides([good])).toEqual([]);
    expect(rawSpacing([good])).toEqual([]);
    expect(centredText([good])).toEqual([]);
  });
});
