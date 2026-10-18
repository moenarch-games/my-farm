import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocumentationOnly } from './ci-docs-only.mjs';

for (const [name, paths, expected] of [
  ['existing root documentation exception', ['AGENTS.md', 'CLAUDE.md', 'CONTEXT.md', 'README.md'], true],
  ['existing nested docs exception', ['docs/adr/decision.md', 'docs/screenshots/farm.png'], true],
  ['empty comparison requires validation', [], false],
  ['Rust source requires validation', ['crates/my_farm_core/src/lib.rs'], false],
  ['workflow changes require validation', ['.github/workflows/validate.yml'], false],
  ['mixed documentation and code requires validation', ['README.md', 'apps/web/src/main.tsx'], false],
  ['renamed code into docs still requires validation', ['crates/old.rs', 'docs/old.rs'], false],
  ['renamed docs into code still requires validation', ['docs/old.md', 'scripts/new.mjs'], false],
]) {
  test(name, () => assert.equal(isDocumentationOnly(paths), expected));
}
