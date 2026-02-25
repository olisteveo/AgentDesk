/**
 * Browser-based file download utility.
 *
 * Creates a Blob from content, generates a temporary object URL,
 * and triggers a download via an ephemeral <a> click.
 *
 * This is the Free-tier file export mechanism. A future Pro-tier
 * local agent/CLI will provide direct filesystem writes.
 */

import { LANG_EXTENSIONS } from './parseCodeBlocks';

// ── MIME types by extension ────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  md:    'text/markdown',
  txt:   'text/plain',
  json:  'application/json',
  html:  'text/html',
  css:   'text/css',
  js:    'application/javascript',
  ts:    'application/typescript',
  tsx:   'application/typescript',
  jsx:   'application/javascript',
  py:    'text/x-python',
  rb:    'text/x-ruby',
  sh:    'text/x-shellscript',
  sql:   'text/x-sql',
  yaml:  'text/yaml',
  xml:   'application/xml',
  rs:    'text/x-rust',
  go:    'text/x-go',
  java:  'text/x-java',
  cpp:   'text/x-c++src',
  c:     'text/x-csrc',
  swift: 'text/x-swift',
  kt:    'text/x-kotlin',
  php:   'text/x-php',
};

// ── Core download function ─────────────────────────────────────

interface DownloadOptions {
  /** File contents (string). */
  content: string;
  /** Filename including extension, e.g. "summary.md". */
  filename: string;
  /** Optional MIME type override. Inferred from extension if omitted. */
  mimeType?: string;
}

/**
 * Trigger a browser download for arbitrary text content.
 *
 * Works in all modern browsers. The file lands in the user's
 * configured Downloads folder.
 */
export function downloadFile({ content, filename, mimeType }: DownloadOptions): void {
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt';
  const mime = mimeType || MIME_TYPES[ext] || 'text/plain';

  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up after a tick so the browser has time to start the download
  requestAnimationFrame(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

// ── Convenience: download a code block ─────────────────────────

/**
 * Download a single code block with an appropriate file extension.
 *
 * @param code     - The code content.
 * @param language - Normalised language name (e.g. "typescript").
 * @param basename - Optional base filename (default: "code").
 */
export function downloadCodeBlock(
  code: string,
  language: string,
  basename = 'code',
): void {
  const ext = LANG_EXTENSIONS[language] || 'txt';
  downloadFile({ content: code, filename: `${basename}.${ext}` });
}

// ── Convenience: download full task/chat response ──────────────

/**
 * Download an entire AI response as a markdown file.
 *
 * Preserves code fences, headings, and other markdown formatting
 * so the user gets a ready-to-use .md file.
 *
 * @param content  - The raw AI response text (may include code fences).
 * @param title    - Used for the filename, sanitised automatically.
 */
export function downloadAsMarkdown(content: string, title = 'response'): void {
  const safeName = title
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)
    || 'response';

  downloadFile({ content, filename: `${safeName}.md` });
}
