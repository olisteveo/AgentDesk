/**
 * Detects whether a task is code-related based on title + description keywords.
 * Used at task creation time to tag tasks with isCodeTask for VS Code integration.
 */

const CODE_ACTION_WORDS = [
  'build', 'implement', 'fix', 'debug', 'refactor', 'deploy', 'test',
  'code', 'develop', 'program', 'compile', 'optimize', 'lint', 'scaffold',
  'migrate', 'parse', 'serialize', 'render', 'transpile',
];

const CODE_TECHNICAL_TERMS = [
  'api', 'component', 'function', 'class', 'module', 'endpoint',
  'database', 'query', 'schema', 'migration', 'route', 'middleware',
  'hook', 'state', 'interface', 'type', 'bug', 'error', 'exception',
  'frontend', 'backend', 'server', 'client',
  'css', 'html', 'typescript', 'javascript', 'react', 'node', 'sql',
  'rest', 'graphql', 'json', 'xml', 'yaml',
  'npm', 'webpack', 'vite', 'docker', 'git',
  'redux', 'zustand', 'express', 'nextjs', 'postgres', 'mongodb',
  'algorithm', 'recursion', 'async', 'promise', 'callback',
  'variable', 'constant', 'enum', 'struct',
];

const CODE_FILE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|rb|go|rs|java|cpp|c|h|css|scss|html|sql|sh|yml|yaml|json|toml|dockerfile)\b/i;

const CODE_PATTERNS = /`[^`]+`|```[\s\S]*?```/;

const allKeywords = [...CODE_ACTION_WORDS, ...CODE_TECHNICAL_TERMS];
const keywordRegex = new RegExp(`\\b(${allKeywords.join('|')})\\b`, 'i');

export function isCodeRelatedTask(title: string, description: string): boolean {
  const text = `${title} ${description}`;

  if (CODE_PATTERNS.test(text)) return true;
  if (CODE_FILE_EXTENSIONS.test(text)) return true;

  return keywordRegex.test(text);
}
