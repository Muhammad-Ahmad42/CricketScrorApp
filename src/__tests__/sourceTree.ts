import * as ts from 'typescript';

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
  dirname(target: string): string;
  relative(from: string, to: string): string;
}

declare const __dirname: string;

const fs = jest.requireActual<FileSystem>('fs');
const path = jest.requireActual<PathModule>('path');

export const ROOT = path.resolve(__dirname, '..', '..');

export interface SourceFile {
  readonly file: string;
  readonly rel: string;
  readonly text: string;
  readonly isTest: boolean;
}

function toPosix(target: string): string {
  return target.split(path.sep).join('/');
}

export function sourceTree(relativeDir = 'src'): readonly SourceFile[] {
  const start = path.join(ROOT, relativeDir);
  const out: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        const rel = toPosix(path.relative(ROOT, full));
        out.push({ file: full, rel, text: fs.readFileSync(full, 'utf8'), isTest: /(^|\/)(__tests__|testing)\//.test(rel) });
      }
    }
  };
  if (fs.existsSync(start)) {
    walk(start);
  }
  return out;
}

const PRAGMA = /^\/\*\*\s*@jest-environment\s+[\w-]+\s*\*\/$/;

export function commentsIn(source: SourceFile): readonly string[] {
  const kind = source.rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(source.rel, source.text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map<number, string>();
  const record = (pos: number, end: number) => {
    const comment = source.text.slice(pos, end);
    if (!PRAGMA.test(comment.trim())) {
      found.set(pos, comment);
    }
  };
  const visit = (node: ts.Node) => {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      ts.forEachLeadingCommentRange(source.text, node.pos, record);
      ts.forEachTrailingCommentRange(source.text, node.end, record);
    }
    node.getChildren(tree).forEach(visit);
  };
  visit(tree);
  return [...found.values()].map((comment) => `${source.rel}: ${comment.split('\n')[0]}`);
}

export function isAllowedPragma(comment: string): boolean {
  return PRAGMA.test(comment.trim());
}

export interface ImportSite {
  readonly from: string;
  readonly spec: string;
  readonly target: string;
}

export function importsOf(source: SourceFile): readonly ImportSite[] {
  const kind = source.rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(source.rel, source.text, ts.ScriptTarget.Latest, true, kind);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression.getText(tree);
      if (callee === 'require' || callee === 'import' || callee.startsWith('jest.')) {
        specs.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return specs.map((spec) => ({ from: source.rel, spec, target: resolveSpec(source.rel, spec) }));
}

function resolveSpec(fromRel: string, spec: string): string {
  if (spec.startsWith('@/')) {
    return `src/${spec.slice(2)}`;
  }
  if (spec.startsWith('.')) {
    return toPosix(path.relative(ROOT, path.join(ROOT, path.dirname(fromRel), spec)));
  }
  return spec;
}

export function layerOf(rel: string): string | null {
  const match = /^src\/([^/]+)(?:\/|$)/.exec(rel);
  return match ? match[1] : null;
}

function parse(source: SourceFile): ts.SourceFile {
  const kind = source.rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(source.rel, source.text, ts.ScriptTarget.Latest, true, kind);
}

export interface NamedImport {
  readonly from: string;
  readonly spec: string;
  readonly name: string;
  readonly typeOnly: boolean;
}

export function namedImportsOf(source: SourceFile): readonly NamedImport[] {
  const tree = parse(source);
  const found: NamedImport[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
      const bindings = node.importClause.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          found.push({
            from: source.rel,
            spec: node.moduleSpecifier.text,
            name: (element.propertyName ?? element.name).text,
            typeOnly: node.importClause.isTypeOnly || element.isTypeOnly,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

export interface StyleProperty {
  readonly at: string;
  readonly key: string;
  readonly text: string;
  readonly number: number | null;
  readonly string: string | null;
}

function literalNumber(node: ts.Expression): number | null {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  return null;
}

export function propertiesOf(source: SourceFile): readonly StyleProperty[] {
  const tree = parse(source);
  const found: StyleProperty[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      const value = node.initializer;
      found.push({
        at: `${source.rel}:${line}`,
        key: node.name.text,
        text: node.getText(tree).replace(/\s+/g, ' '),
        number: literalNumber(value),
        string: ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}
