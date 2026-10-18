import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rootDocuments = new Set(['AGENTS.md', 'CLAUDE.md', 'CONTEXT.md', 'README.md']);

export function isDocumentationOnly(paths) {
  return paths.length > 0 && paths.every((path) => rootDocuments.has(path) || path.startsWith('docs/'));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const paths = readFileSync(process.argv[2], 'utf8').split('\0').filter(Boolean);
  console.log(isDocumentationOnly(paths));
}
