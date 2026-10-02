export interface SafeHtml {
  readonly html: string;
}

export type HtmlValue = SafeHtml | string | number | null | undefined | false | readonly HtmlValue[];

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function cssString(value: string): string {
  return `"${value.replace(/[\\"'<>&\n\r\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
}

function isSafe(value: HtmlValue): value is SafeHtml {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function render(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (isSafe(value)) {
    return value.html;
  }
  return value.map(render).join('');
}

export function trusted(markup: string): SafeHtml {
  return { html: markup };
}

export function html(strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml {
  let out = strings[0];
  values.forEach((value, index) => {
    out += render(value) + strings[index + 1];
  });
  return { html: out };
}

export function join(values: readonly HtmlValue[], separator: HtmlValue = ''): SafeHtml {
  const rendered = render(separator);
  return { html: values.map(render).filter((part) => part.length > 0).join(rendered) };
}

export function when(condition: boolean, value: () => HtmlValue): HtmlValue {
  return condition ? value() : null;
}
