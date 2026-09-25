import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReviewContext } from '../skills/review/scripts/review-context.mjs';

const script = fileURLToPath(new URL('../skills/review/scripts/review-context.mjs', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'review-context-tests-'));
let count = 0;
function fixture(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(root);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.name', 'Review Context Test');
  git('config', 'user.email', 'review@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
  const commit = () => { git('add', '-A'); git('commit', '--quiet', '--allow-empty', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  return { root, git, write, commit };
}
function test(name, callback) { callback(); count += 1; process.stdout.write(`ok ${count} - ${name}\n`); }

try {
  test('omits Relay, generated headers and attributes while preserving authored inputs and uncertain paths', () => {
    const { root, write, commit } = fixture('classification');
    const base = commit();
    const authored = ['src/query.graphql', 'src/schema.gql', 'src/graphql/resolver.ts', 'src/gen/helper.ts', 'src/generatedPage.ts', 'src/generated/helper.ts', 'src/__generated__/codegen.config.ts', 'src/generated/migrations/001.ts', 'src/generated/view.snap', 'src/generated/package-lock.json', 'src/generated/manual.ts', 'src/generated/unmarked.ts', 'src/nested/attributes/code.ts', 'src/data.ts'];
    write('.gitattributes', 'src/custom/** linguist-generated=true\nsrc/generated/manual.ts -linguist-generated\nsrc/generated/unmarked.ts linguist-generated=false\n/attributes/code.ts linguist-generated=true\nsrc/attribute-schema.gql linguist-generated=true\n');
    for (const file of authored) write(file, `export const authored = '${file}';\n`);
    const generated = ['src/__generated__/Query.graphql.ts', 'src/generated/client.ts', 'src/Query.graphql.js', 'src/client.generated.ts', 'src/custom/client.ts', 'src/header.ts', 'src/generated-schema.graphql', 'src/attribute-schema.gql'];
    for (const file of generated) write(file, `// @generated\n${Array.from({ length: 2000 }, (_, index) => `export const GENERATED_BODY_SENTINEL_${index} = ${index};`).join('\n')}\n`);
    write('src/generated-schema.graphql', '# @generated\ntype Query { generated: String }\n');
    write('src/attribute-schema.gql', 'type Query { generated: String }\n');
    const head = commit();
    const output = path.join(scratch, 'classification-output');
    const result = createReviewContext({ repoRoot: root, base, head, output });
    assert.deepEqual(new Set(result.omittedFiles.map(file => file.path)), new Set(generated));
    for (const file of authored) assert.ok(result.changedFiles.includes(file), file);
    assert.ok(!result.diff.includes('GENERATED_BODY_SENTINEL'));
    assert.ok(result.totalDiffBytes > result.authoredDiffBytes * 50);
    assert.equal(fs.readFileSync(result.output.patchPath, 'utf8'), result.diff);
    assert.ok(!fs.readFileSync(result.output.contextPath, 'utf8').includes('GENERATED_BODY_SENTINEL'));
    assert.ok(!('diff' in JSON.parse(fs.readFileSync(result.output.contextPath, 'utf8'))));
    process.stdout.write(`fixture bytes: ${result.totalDiffBytes} total, ${result.authoredDiffBytes} authored\n`);
  });

  test('generated-only review stays empty while full identity changes with generated bodies', () => {
    const { root, write, commit } = fixture('generated-only');
    write('Query.graphql.ts', '// @generated\nexport const a = 1;\n');
    const base = commit();
    write('Query.graphql.ts', '// @generated\nexport const a = 2;\n');
    const first = createReviewContext({ repoRoot: root, base, worktree: true });
    write('Query.graphql.ts', '// @generated\nexport const a = 3;\n');
    const second = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.equal(first.diff, '');
    assert.deepEqual(first.changedFiles, []);
    assert.deepEqual(first.allChangedFiles, ['Query.graphql.ts']);
    assert.notEqual(first.diffHash, second.diffHash);
    assert.equal(first.authoredPatchHash, second.authoredPatchHash);
  });

  test('deletions and authored/generated renames preserve every authored side', () => {
    const { root, git, write, commit } = fixture('renames');
    write('source.ts', 'export const retainSourceDeletion = 1;\n');
    write('generated/from.generated.ts', 'export const retainSourceAddition = 2;\n');
    write('generated/deleted.generated.ts', 'const OMIT_DELETED = 1;\n');
    write('header.ts', '// @generated\nconst becameAuthored = 1;\n');
    write('new-header.ts', 'const becameGenerated = 1;\n');
    const base = commit();
    git('mv', 'source.ts', 'generated/to.generated.ts');
    git('mv', 'generated/from.generated.ts', 'authored.ts');
    fs.unlinkSync(path.join(root, 'generated/deleted.generated.ts'));
    write('header.ts', 'const becameAuthored = 2;\n');
    write('new-header.ts', '// @generated\nconst becameGenerated = 2;\n');
    const head = commit();
    const result = createReviewContext({ repoRoot: root, base, head });
    assert.deepEqual(new Set(result.changedFiles), new Set(['source.ts', 'authored.ts', 'header.ts', 'new-header.ts']));
    assert.ok(result.diff.includes('-export const retainSourceDeletion'));
    assert.ok(result.diff.includes('+export const retainSourceAddition'));
    assert.ok(!result.diff.includes('OMIT_DELETED'));
  });

  test('captures staged, unstaged and untracked odd paths without changing repository bytes', () => {
    const { root, git, write, commit } = fixture('dirty');
    write('app.ts', 'const value = 0;\n');
    write('generated/old.ts', '// @generated\nconst value = 0;\n');
    const base = commit();
    write('app.ts', 'const value = 1;\n');
    git('add', 'app.ts');
    write('app.ts', 'const value = 2;\n');
    write('generated/old.ts', '// @generated\nconst OMIT_DIRTY = 1;\n');
    write('generated/untracked.ts', '// @generated\nconst OMIT_NEW = 1;\n');
    const odd = ':literal [special]\nfile.ts';
    write(odd, 'const oddAuthored = 1;\n');
    write('src/metadata.ts', 'export const value = 1;\n// @generated is a test fixture below code\n');
    const before = git('status', '--porcelain=v1', '-z');
    const indexBefore = git('diff', '--cached', '--binary');
    const result = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(result.changedFiles.includes(odd));
    assert.ok(result.changedFiles.includes('src/metadata.ts'));
    assert.ok(result.diff.includes('+const value = 2;'));
    assert.ok(result.diff.includes('+const oddAuthored = 1;'));
    assert.ok(!result.diff.includes('OMIT_DIRTY'));
    assert.ok(!result.diff.includes('OMIT_NEW'));
    assert.equal(git('status', '--porcelain=v1', '-z'), before);
    assert.equal(git('diff', '--cached', '--binary'), indexBefore);
    assert.equal(fs.readFileSync(path.join(root, odd), 'utf8'), 'const oddAuthored = 1;\n');
  });

  test('reads only versioned attributes and retains paths covered by unsupported negative rules', () => {
    const { root, write, commit } = fixture('attributes');
    write('.gitattributes', 'generated/*.ts linguist-generated\ngenerated/[ab].ts -linguist-generated\n__generated__/[a-z]* -linguist-generated\nnested/generated/*.ts linguist-generated\n');
    write('nested/.gitattributes', 'generated/*.ts -linguist-generated\n');
    const base = commit();
    write('generated/a.ts', 'const retainedByNegative = true;\n');
    write('nested/generated/a.ts', 'const retainedByNested = true;\n');
    write('__generated__/a.ts', 'const retainedByNegativeGlob = true;\n');
    write('other.ts', 'const authored = true;\n');
    write('.gitattributes', '*.ts linguist-generated\n');
    const result = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(result.changedFiles.includes('generated/a.ts'));
    assert.ok(result.changedFiles.includes('nested/generated/a.ts'));
    assert.ok(result.changedFiles.includes('__generated__/a.ts'));
    assert.ok(result.changedFiles.includes('other.ts'));
  });

  test('unsupported negative and unset attribute patterns retain uncertain committed sources', () => {
    const { root, write, commit } = fixture('unsupported-attributes');
    const base = commit();
    write('.gitattributes', 'src/** linguist-generated\nsrc/[a].ts !linguist-generated\n__generated__/[a-z]* -linguist-generated\n');
    write('src/a.ts', 'const authoredUnset = true;\n');
    write('__generated__/a.ts', 'const authoredNegative = true;\n');
    const head = commit();
    const result = createReviewContext({ repoRoot: root, base, head });
    assert.ok(result.changedFiles.includes('src/a.ts'));
    assert.ok(result.changedFiles.includes('__generated__/a.ts'));
    assert.equal(result.omittedFiles.length, 0);
  });

  test('attribute globs respect directory boundaries and anchored patterns', () => {
    const { root, write, commit } = fixture('glob-boundaries');
    const base = commit();
    write('.gitattributes', 'src/a**b.ts linguist-generated\n/root.ts linguist-generated\n');
    write('src/ab.ts', 'const generated = true;\n');
    write('src/a/nested/b.ts', 'const authored = true;\n');
    write('root.ts', 'const generated = true;\n');
    write('nested/root.ts', 'const authored = true;\n');
    const head = commit();
    const result = createReviewContext({ repoRoot: root, base, head });
    assert.ok(result.changedFiles.includes('src/a/nested/b.ts'));
    assert.ok(result.changedFiles.includes('nested/root.ts'));
    assert.deepEqual(new Set(result.omittedFiles.map(file => file.path)), new Set(['src/ab.ts', 'root.ts']));
  });

  test('dirty attributes cannot hide handwritten changes in generated directories', () => {
    const { root, git, write, commit } = fixture('dirty-attributes');
    write('.gitattributes', '__generated__/** linguist-generated=true\n');
    write('__generated__/handwritten.ts', 'const authored = 1;\n');
    const base = commit();
    write('__generated__/handwritten.ts', 'const authored = 2;\n');
    write('.gitattributes', '__generated__/** -linguist-generated\n');
    const unstaged = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(unstaged.changedFiles.includes('__generated__/handwritten.ts'));
    git('add', '.gitattributes');
    const staged = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(staged.changedFiles.includes('__generated__/handwritten.ts'));
    git('restore', '--staged', '.gitattributes');
    git('restore', '.gitattributes');
    write('__generated__/.gitattributes', '*.ts -linguist-generated\n');
    const untracked = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(untracked.changedFiles.includes('__generated__/handwritten.ts'));
  });

  test('symlink changes remain reviewable without reading linked secrets', () => {
    const { root, write, commit } = fixture('symlinks');
    const secret = path.join(scratch, 'secret.txt');
    fs.writeFileSync(secret, '// @generated\nPRIVATE_CONTENT_MUST_NOT_BE_READ\n');
    write('base.ts', 'const base = 1;\n');
    const base = commit();
    fs.mkdirSync(path.join(root, 'generated'));
    fs.symlinkSync(secret, path.join(root, 'generated/link.ts'));
    const result = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(result.changedFiles.includes('generated/link.ts'));
    assert.ok(result.diff.includes('120000'));
    assert.ok(!result.diff.includes('PRIVATE_CONTENT_MUST_NOT_BE_READ'));
  });

  test('external diff and textconv commands are never executed', () => {
    const { root, git, write, commit } = fixture('external-diff');
    const marker = path.join(scratch, 'external-command-ran');
    write('.gitattributes', '*.ts diff=unsafe\n');
    write('source.ts', 'const a = 1;\n');
    const base = commit();
    write('source.ts', 'const a = 2;\n');
    git('config', 'diff.unsafe.command', `touch ${marker}`);
    git('config', 'diff.unsafe.textconv', `touch ${marker}`);
    const result = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(result.diff.includes('+const a = 2;'));
    assert.ok(!fs.existsSync(marker));
  });

  test('clean and process filters cannot execute or hide authored worktree changes', () => {
    const { root, git, write, commit } = fixture('clean-filters');
    write('.gitattributes', 'source.ts filter=unsafe-clean\nother.ts filter=unsafe-process\n');
    write('source.ts', 'const a = 1;\n');
    write('other.ts', 'const b = 1;\n');
    const base = commit();
    const cleanMarker = path.join(scratch, 'clean-filter-ran');
    const processMarker = path.join(scratch, 'process-filter-ran');
    git('config', 'filter.unsafe-clean.clean', `touch ${cleanMarker}; printf 'const a = 1;\\n'`);
    git('config', 'filter.unsafe-clean.required', 'true');
    git('config', 'filter.unsafe-process.process', `touch ${processMarker}; cat`);
    git('config', 'filter.unsafe-process.required', 'true');
    write('source.ts', 'const a = 2;\n');
    write('other.ts', 'const b = 2;\n');
    const result = createReviewContext({ repoRoot: root, base, worktree: true });
    assert.ok(result.diff.includes('+const a = 2;'));
    assert.ok(result.diff.includes('+const b = 2;'));
    assert.ok(!fs.existsSync(cleanMarker));
    assert.ok(!fs.existsSync(processMarker));
    assert.deepEqual(new Set(result.disabledFilters), new Set(['filter.unsafe-clean', 'filter.unsafe-process']));
  });

  test('rejects physical output paths in repository and symlink artifact destinations', () => {
    const { root, write, commit } = fixture('output');
    write('source.ts', 'const a = 1;\n');
    const base = commit();
    const alias = path.join(scratch, 'repo-alias');
    fs.symlinkSync(root, alias);
    assert.throws(() => createReviewContext({ repoRoot: root, base, output: path.join(alias, 'artifacts') }), /outside/);
    const output = path.join(scratch, 'symlink-output');
    fs.mkdirSync(output);
    fs.symlinkSync(path.join(root, 'source.ts'), path.join(output, 'authored.patch'));
    assert.throws(() => createReviewContext({ repoRoot: root, base, output }));
    assert.equal(fs.readFileSync(path.join(root, 'source.ts'), 'utf8'), 'const a = 1;\n');
  });

  test('honors pre-execution checks, deadlines and refuses a changing worktree', () => {
    const { root, write, commit } = fixture('deadline');
    write('source.ts', 'const a = 1;\n');
    const base = commit();
    assert.throws(() => createReviewContext({ repoRoot: root, base, deadlineMs: Date.now() - 1 }), /deadline/);
    assert.throws(() => createReviewContext({ repoRoot: root, base, beforeExec: () => { throw new Error('budget exhausted'); } }), /budget exhausted/);
    let calls = 0;
    assert.throws(() => createReviewContext({ repoRoot: root, base, worktree: true, beforeExec: () => { calls += 1; if (calls === 7) write('source.ts', 'const a = 2;\n'); } }), /changed during capture/);
  });

  test('CLI emits compact artifact paths and counts instead of patch contents', () => {
    const { root, write, commit } = fixture('cli');
    const base = commit();
    write('source.ts', 'const authored = true;\n');
    write('Query.graphql.ts', '// @generated\nconst NEVER_IN_CLI = true;\n');
    const output = path.join(scratch, 'cli-output');
    const result = spawnSync(process.execPath, [script, '--repo-root', root, '--base', base, '--worktree', '--output', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(result.stdout);
    assert.equal(metadata.authoredFiles, 1);
    assert.equal(metadata.omittedFiles, 1);
    assert.equal(metadata.patchPath, path.join(fs.realpathSync(output), 'authored.patch'));
    assert.ok(!result.stdout.includes('NEVER_IN_CLI'));
  });
  process.stdout.write(`${count} generated-file review-context tests passed\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
