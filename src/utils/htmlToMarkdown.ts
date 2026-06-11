import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  codeBlockStyle: 'fenced',
});

// Custom rule to extract LaTeX math formulas from KaTeX elements
turndownService.addRule('katex', {
  filter: (node) => {
    return node.classList.contains('katex') || node.tagName === 'MATH';
  },
  replacement: (_content, node) => {
    const annotation = node.querySelector('annotation');
    const tex = annotation
      ? annotation.textContent?.trim() || ''
      : node.textContent?.trim() || '';

    // Check if it's block math
    const isBlock =
      node.classList.contains('katex-display') ||
      node.parentElement?.classList.contains('katex-display');

    return isBlock ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
  },
});

// Custom rule to convert HTML tables to GitHub Flavored Markdown (GFM) tables
turndownService.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll('th,td')).map((cell) => {
        return (cell.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\|/g, '\\|');
      }),
    );

    if (!rows.length) return '';

    const header = rows[0];
    const separator = header.map(() => '---');
    const body = rows.slice(1);

    const tableMarkdown = [header, separator, ...body]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n');

    return `\n\n${tableMarkdown}\n\n`;
  },
});

/**
 * Converts HTML string to clean Markdown.
 */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';
  
  // Clean up heavy and non-content elements to speed up turndown processing
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  return turndownService.turndown(cleanHtml);
}
