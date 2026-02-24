/**
 * Parses markdown-style fenced code blocks from AI response text.
 *
 * Splits text into alternating segments of plain text and code blocks.
 * If no code fences are found, returns a single text segment (backward compatible).
 *
 * Usage:
 *   const segments = parseCodeBlocks(responseText);
 *   segments.forEach(seg => {
 *     if (seg.type === 'code') { // render styled code block }
 *     else                       { // render plain text }
 *   });
 */

export type CodeSegment = { type: 'code'; language: string; content: string };
export type TextSegment = { type: 'text'; content: string };
export type Segment = CodeSegment | TextSegment;

const CODE_FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;

/** Language alias normalization (common AI output variations). */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  '': 'code',
};

/** Map language to file extension for temp file creation. */
export const LANG_EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  ruby: 'rb',
  bash: 'sh',
  shell: 'sh',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
  rust: 'rs',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  swift: 'swift',
  kotlin: 'kt',
  php: 'php',
  dockerfile: 'dockerfile',
  toml: 'toml',
  graphql: 'graphql',
  markdown: 'md',
  code: 'txt',
  tsx: 'tsx',
  jsx: 'jsx',
};

export function parseCodeBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  CODE_FENCE_RE.lastIndex = 0; // reset global regex state

  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE_RE.exec(text)) !== null) {
    // Text before this code block
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim();
      if (textContent) {
        segments.push({ type: 'text', content: textContent });
      }
    }

    const rawLang = match[1].toLowerCase();
    const language = LANG_ALIASES[rawLang] || rawLang || 'code';

    segments.push({
      type: 'code',
      language,
      content: match[2].trimEnd(),
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: 'text', content: remaining });
    }
  }

  // No code blocks found — return the whole thing as text
  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

/** Get file extension for a language (used by the backend temp file endpoint). */
export function getExtension(language: string): string {
  return LANG_EXTENSIONS[language] || LANG_EXTENSIONS[LANG_ALIASES[language]] || 'txt';
}
