import { formatPrintDateTime } from './dates';
import { html, trusted, type SafeHtml } from './html';
import { printCss } from './styles';

export interface PrintOptions {
  readonly generatedAt: string;
  readonly appName?: string;
}

export interface PrintPage {
  readonly title: string;
  readonly runningFooter: string;
  readonly body: SafeHtml;
}

export function printDocument(page: PrintPage, options: PrintOptions): string {
  const app = options.appName ?? 'Scorebook';
  const generated = formatPrintDateTime(options.generatedAt);
  const document = html`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${page.title}</title>
<style>${trusted(printCss(`${app} · ${page.runningFooter}`))}</style>
</head>
<body>
${page.body}
<footer class="doc">Scored with ${app} · generated ${generated}</footer>
</body>
</html>
`;
  return document.html;
}
