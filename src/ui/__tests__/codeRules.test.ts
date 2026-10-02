import * as ts from 'typescript';
import { read, relative, sourceFiles } from './sourceScan';

const HEX_COLOUR = /['"`]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"`]/;
const FUNCTIONAL_COLOUR = /['"`]\s*(?:rgba?|hsla?)\(/;
const NAMED_COLOUR = /\b(?:color|backgroundColor|borderColor|borderTopColor|borderBottomColor|tintColor|shadowColor|outlineColor|thumbColor)\s*:\s*['"](?!transparent['"])[a-zA-Z]+['"]/;
const FORBIDDEN_UI_IMPORTS = /from\s+['"]@\/(domain|stores|services|db|features|app|export)(\/|['"])/;
const ALLOWED_PRAGMA = /^\/\*\*\s*@jest-environment\s+\w+\s*\*\/$/;

function colourViolations(files: readonly string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    read(file)
      .split('\n')
      .forEach((line, index) => {
        if (HEX_COLOUR.test(line) || FUNCTIONAL_COLOUR.test(line) || NAMED_COLOUR.test(line)) {
          out.push(`${relative(file)}:${index + 1}: ${line.trim()}`);
        }
      });
  }
  return out;
}

function commentsIn(file: string): string[] {
  const text = read(file);
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map<number, string>();
  const record = (pos: number, end: number) => {
    const comment = text.slice(pos, end);
    if (!ALLOWED_PRAGMA.test(comment.trim())) {
      found.set(pos, comment);
    }
  };
  const visit = (node: ts.Node) => {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      ts.forEachLeadingCommentRange(text, node.pos, record);
      ts.forEachTrailingCommentRange(text, node.end, record);
    }
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  return [...found.values()].map((comment) => `${relative(file)}: ${comment.split('\n')[0]}`);
}

describe('colours come only from semantic tokens (§71, G-07)', () => {
  it('has no hex, rgb or named colour literal outside src/ui/theme', () => {
    const files = [...sourceFiles('src/ui'), ...sourceFiles('src/features'), ...sourceFiles('src/app')].filter(
      (file) => !relative(file).startsWith('src/ui/theme/'),
    );
    expect(files.length).toBeGreaterThan(20);
    expect(colourViolations(files)).toEqual([]);
  });

  it('keeps every hex value of the palette inside the theme folder', () => {
    const themeFiles = sourceFiles('src/ui/theme');
    expect(colourViolations(themeFiles).length).toBeGreaterThan(50);
  });

  it('detects violations it is meant to catch', () => {
    expect(HEX_COLOUR.test("color: '#1F5C3A'")).toBe(true);
    expect(FUNCTIONAL_COLOUR.test("backgroundColor: 'rgba(0,0,0,0.5)'")).toBe(true);
    expect(NAMED_COLOUR.test("color: 'white'")).toBe(true);
    expect(NAMED_COLOUR.test("backgroundColor: 'transparent'")).toBe(false);
    expect(HEX_COLOUR.test("label: 'Match #12'")).toBe(false);
  });
});

describe('layering (§60, G-06)', () => {
  it('keeps src/ui free of domain, store, service, db, feature and route imports', () => {
    const offenders = sourceFiles('src/ui')
      .filter((file) => read(file).split('\n').some((line) => FORBIDDEN_UI_IMPORTS.test(line) || /from\s+['"]\.\.\/\.\.\/\.\.\//.test(line)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('keeps the root and tab layouts thin: they import only the design system and the router', () => {
    const owned = sourceFiles('src/app').filter((f) => ['src/app/_layout.tsx', 'src/app/(tabs)/_layout.tsx'].includes(relative(f)));
    expect(owned).toHaveLength(2);
    for (const file of owned) {
      const imports = read(file)
        .split('\n')
        .filter((line) => line.startsWith('import') || line.startsWith('} from'))
        .map((line) => /from\s+['"]([^'"]+)['"]/.exec(line)?.[1])
        .filter((spec): spec is string => spec !== undefined);
      for (const spec of imports) {
        expect(['@/ui', 'expo-router', 'expo-router/js-tabs', '@/stores', 'react']).toContain(spec.replace(/\/[A-Za-z]+Store$/, ''));
      }
    }
  });
});

describe('no code comments (CLAUDE.md, G-04)', () => {
  it('finds no comments in src/ui or the layouts this package owns', () => {
    const files = [
      ...sourceFiles('src/ui', { includeTests: true }),
      ...sourceFiles('src/app').filter((file) => /src\/app\/(_layout|\(tabs\)\/_layout)\.tsx$/.test(relative(file))),
    ];
    const comments = files.flatMap(commentsIn);
    expect(comments).toEqual([]);
  });

  it('recognises real comments and allows only the jest environment pragma', () => {
    expect(ALLOWED_PRAGMA.test('/** @jest-environment node */')).toBe(true);
    expect(ALLOWED_PRAGMA.test('/* note */')).toBe(false);
  });
});
