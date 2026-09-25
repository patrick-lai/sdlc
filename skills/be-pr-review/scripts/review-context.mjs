#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const gitOptions = ['--no-pager', '-c', 'core.quotePath=true', '-c', 'core.fsmonitor=false', '-c', 'diff.orderFile=/dev/null'];
const patchOptions = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--full-index', '--binary', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', '--submodule=short'];
const quoted = value => JSON.stringify(value);

function protectedPath(file) {
  const name = path.posix.basename(file);
  if (['.gitattributes', '.gitignore', '.gitmodules'].includes(name)) return true;
  return /\.(?:snap|lock)$/i.test(name)
    || /^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|uv\.lock|composer\.lock|go\.sum)$/i.test(name)
    || /(?:^|\/)migrations?(?:\/|$)/i.test(file)
    || /(?:^|[._-])(?:config|codegen|generator)(?:[._-]|$)/i.test(name)
    || /(?:^|\/)(?:generators?|codegen)(?:\/|$)/i.test(file);
}

function pathReason(file) {
  if (/\.(?:graphql|gql)$/i.test(file)) return null;
  if (/(?:^|\/)__generated__(?:\/|$)/.test(file)) return 'generated output directory';
  if (/\.graphql\.(?:js|ts)$/.test(file)) return 'Relay generated module';
  if (/\.(?:generated|gen)\.[^/]+$/.test(file)) return 'generated output filename';
  if (/(?:\.pb\.(?:go|rs|cc|h)|_pb2(?:_grpc)?\.py)$/.test(file)) return 'protobuf generated module';
  return null;
}

function headerReason(bytes) {
  const header = bytes.subarray(0, 8192).toString('utf8').split(/\r?\n/).slice(0, 80);
  for (const line of header) {
    if (!line.trim() || /^#!/.test(line)) continue;
    if (!/^\s*(?:\/\/|\/\*|\*|#|--|<!--)/.test(line)) break;
    if (/@generated\b|\b(?:auto[- ]generated|automatically generated)\b|\b(?:code )?generated\b.*\bdo not (?:edit|modify)\b/i.test(line)) return 'generated-file header';
  }
  return null;
}

function globRegex(pattern) {
  if (!pattern || /[\[\]\\\s"]|\*{3,}/.test(pattern) || pattern.startsWith('!') || pattern.endsWith('/')) return null;
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/' && (index === 0 || pattern[index - 1] === '/')) { expression += '(?:.*/)?'; index += 2; }
      else { expression += pattern[index - 1] === '/' && index + 2 === pattern.length ? '.*' : '[^/]*'; index += 1; }
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${expression}$`);
}

function parseRawPatch(buffer) {
  if (!buffer.length) return [];
  const separator = buffer.indexOf(Buffer.from([0, 0]));
  if (separator < 0) throw new Error('Git did not return NUL-delimited diff metadata');
  const raw = buffer.subarray(0, separator).toString('utf8').split('\0');
  const patches = buffer.subarray(separator + 2).toString('utf8').split(/(?=^diff --git )/m).filter(Boolean);
  if (raw.length % 2 || patches.length !== raw.length / 2) throw new Error('Diff metadata and patch sections disagree; refusing an unfiltered fallback');
  const records = [];
  for (let index = 0; index < raw.length; index += 2) {
    const match = /^:(\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([A-Z])$/.exec(raw[index]);
    if (!match || raw[index + 1].includes('\uFFFD')) throw new Error('Unsupported diff metadata or non-UTF-8 filename');
    records.push({ path: raw[index + 1], oldMode: match[1], newMode: match[2], status: match[5], patch: patches[index / 2] });
  }
  return records;
}

function actualPath(target) {
  let existing = path.resolve(target);
  const suffix = [];
  while (!fs.existsSync(existing)) {
    suffix.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error(`Cannot resolve output location: ${target}`);
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...suffix);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function createReviewContext({ repoRoot, base, head = 'HEAD', worktree = false, mergeBase = false, output, beforeExec, gitTimeoutMs = 30000, deadlineMs } = {}) {
  if (!repoRoot || !base) throw new Error('repoRoot and base are required');
  let root = fs.realpathSync(repoRoot);
  const disabledFilterOptions = [];
  function git(args, allowed = [0]) {
    const overrides = beforeExec?.() || {};
    const remaining = deadlineMs == null ? Infinity : deadlineMs - Date.now();
    const timeout = Math.min(gitTimeoutMs, overrides.timeout ?? Infinity, remaining);
    if (!(timeout > 0)) throw new Error('Review context deadline exceeded');
    const result = spawnSync('git', [...gitOptions, ...disabledFilterOptions, '-C', root, ...args], { encoding: null, maxBuffer: 256 * 1024 * 1024, timeout: Math.ceil(timeout), windowsHide: true });
    if (result.error) throw result.error;
    if (!allowed.includes(result.status)) throw new Error(`Git ${args[0]} failed: ${result.stderr.toString('utf8').trim()}`);
    return result.stdout;
  }
  root = fs.realpathSync(git(['rev-parse', '--show-toplevel']).toString('utf8').trim());
  const resolve = ref => git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString('utf8').trim();
  const requestedBase = resolve(base);
  const headSha = resolve(head);
  const baseSha = mergeBase ? git(['merge-base', requestedBase, headSha]).toString('utf8').trim() : requestedBase;
  const filterKeys = git(['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'], [0, 1]).toString('utf8').split('\0').filter(Boolean);
  const disabledFilters = [...new Set(filterKeys.map(key => key.slice(0, key.lastIndexOf('.'))))];
  for (const filter of disabledFilters) disabledFilterOptions.push('-c', `${filter}.clean=`, '-c', `${filter}.process=`, '-c', `${filter}.required=false`);
  const tracked = () => git(['diff', ...patchOptions, '--raw', '-z', '--abbrev=64', '--patch', baseSha, ...(worktree ? [] : [headSha]), '--']);
  const untrackedNames = () => worktree ? git(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean) : [];
  function untrackedPatch(file) {
    if (file.includes('\uFFFD')) throw new Error('Unsupported non-UTF-8 filename');
    const original = git(['diff', '--no-index', ...patchOptions, '--', '/dev/null', path.join(root, file)], [0, 1]).toString('utf8');
    return original.replace(/^diff --git .*$/m, `diff --git ${quoted(`a/${file}`)} ${quoted(`b/${file}`)}`)
      .replace(/^\+\+\+ .*$/m, `+++ ${quoted(`b/${file}`)}`);
  }
  const rawDiff = tracked();
  const entries = parseRawPatch(rawDiff);
  const untracked = untrackedNames();
  const extra = untracked.map(file => ({ path: file, oldMode: '000000', newMode: fs.lstatSync(path.join(root, file)).isSymbolicLink() ? '120000' : '100644', status: 'A', patch: untrackedPatch(file) }));
  const dirtyAttributeScopes = worktree ? [...entries, ...extra].filter(entry => path.posix.basename(entry.path) === '.gitattributes').map(entry => entry.path === '.gitattributes' ? '' : `${path.posix.dirname(entry.path)}/`) : [];
  const attributeCache = new Map();
  function attributes(commit) {
    if (attributeCache.has(commit)) return attributeCache.get(commit);
    const names = git(['ls-tree', '-r', '--name-only', '-z', commit]).toString('utf8').split('\0').filter(file => path.posix.basename(file) === '.gitattributes');
    const rules = [];
    for (const file of names.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
      const directory = file === '.gitattributes' ? '' : `${path.posix.dirname(file)}/`;
      for (const line of git(['show', `${commit}:${file}`]).toString('utf8').split(/\r?\n/)) {
        const tokens = line.trim().split(/\s+/);
        if (!tokens[0] || tokens[0].startsWith('#')) continue;
        let state;
        for (const token of tokens.slice(1)) {
          if (token === 'linguist-generated' || token === 'linguist-generated=true') state = true;
          else if (token === '-linguist-generated' || token === 'linguist-generated=false') state = false;
          else if (token === '!linguist-generated') state = null;
        }
        if (state === undefined) continue;
        const pattern = tokens[0].replace(/^\//, '');
        const regex = globRegex(pattern);
        if (regex) rules.push({ directory, basename: !tokens[0].includes('/'), regex, state });
        else if (state === false || state === null) rules.push({ directory, basename: false, regex: /.*/, state: false });
      }
    }
    attributeCache.set(commit, rules);
    return rules;
  }
  function attributeState(file, commit) {
    let state;
    for (const rule of attributes(commit)) {
      if (!file.startsWith(rule.directory)) continue;
      const relative = file.slice(rule.directory.length);
      if (rule.regex.test(rule.basename ? path.posix.basename(relative) : relative)) state = rule.state;
    }
    return state;
  }
  function header(file, commit, current) {
    if (!current) return git(['show', `${commit}:${file}`]);
    const absolute = path.join(root, file);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) return Buffer.alloc(0);
    const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { const buffer = Buffer.alloc(8192); return buffer.subarray(0, fs.readSync(descriptor, buffer, 0, buffer.length, 0)); }
    finally { fs.closeSync(descriptor); }
  }
  function reason(file, commit, current, mode) {
    if (protectedPath(file) || !['100644', '100755'].includes(mode)) return null;
    if (current && dirtyAttributeScopes.some(directory => file.startsWith(directory))) return null;
    const attributed = attributeState(file, commit);
    if (attributed === false) return null;
    if (attributed === true) return 'versioned linguist-generated attribute';
    return pathReason(file) || headerReason(header(file, commit, current));
  }
  const omittedFiles = [];
  const authored = [];
  for (const entry of [...entries, ...extra]) {
    const reasons = [];
    if (entry.oldMode !== '000000') reasons.push(reason(entry.path, baseSha, false, entry.oldMode));
    if (entry.newMode !== '000000') reasons.push(reason(entry.path, headSha, worktree, entry.newMode));
    if (reasons.length && reasons.every(Boolean)) omittedFiles.push({ path: entry.path, reason: [...new Set(reasons)].join('; ') });
    else authored.push(entry);
  }
  if (worktree) {
    if (!rawDiff.equals(tracked()) || JSON.stringify(untracked) !== JSON.stringify(untrackedNames()) || extra.some(entry => entry.patch !== untrackedPatch(entry.path))) throw new Error('Working tree changed during capture; retry the snapshot before reviewing');
  }
  const diff = authored.map(entry => entry.patch).join('');
  const fullPatch = [...entries, ...extra].map(entry => entry.patch).join('');
  const changedFiles = [...new Set(authored.map(entry => entry.path))];
  const result = { repoRoot: root, base: baseSha, head: headSha, worktree, disabledFilters, diff, changedFiles, allChangedFiles: [...new Set([...entries, ...extra].map(entry => entry.path))], omittedFiles,
    diffHash: hash(Buffer.concat([Buffer.from(JSON.stringify({ base: baseSha, head: headSha, worktree })), rawDiff, Buffer.from(JSON.stringify(extra))])), authoredPatchHash: hash(diff), totalDiffBytes: Buffer.byteLength(fullPatch), authoredDiffBytes: Buffer.byteLength(diff) };
  if (output) {
    const directory = actualPath(output);
    const gitDirectory = actualPath(git(['rev-parse', '--absolute-git-dir']).toString('utf8').trim());
    const commonDirectory = actualPath(path.resolve(root, git(['rev-parse', '--git-common-dir']).toString('utf8').trim()));
    if (isInside(root, directory) || isInside(gitDirectory, directory) || isInside(commonDirectory, directory)) throw new Error('Review context output must be outside the reviewed repository and its Git directory');
    fs.mkdirSync(directory, { recursive: true });
    result.output = { directory, contextPath: path.join(directory, 'context.json'), patchPath: path.join(directory, 'authored.patch'), omittedPath: path.join(directory, 'omitted-files.json') };
    const write = (file, contents) => {
      if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Review artifact destination must not be a symlink');
      const temporary = fs.mkdtempSync(path.join(directory, '.review-write-'));
      try {
        const staged = path.join(temporary, 'artifact');
        fs.writeFileSync(staged, contents, { flag: 'wx', mode: 0o600 });
        fs.renameSync(staged, file);
      } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    };
    write(result.output.patchPath, diff);
    write(result.output.omittedPath, `${JSON.stringify(omittedFiles, null, 2)}\n`);
    const { diff: ignored, ...metadata } = result;
    write(result.output.contextPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = { mergeBase: true };
    for (let index = 2; index < process.argv.length; index += 1) {
      const flag = process.argv[index];
      if (flag === '--worktree') options.worktree = true;
      else if (flag === '--exact-base') options.mergeBase = false;
      else if (['--repo-root', '--base', '--head', '--output'].includes(flag)) {
        const value = process.argv[++index];
        if (!value) throw new Error(`Missing value for ${flag}`);
        options[{ '--repo-root': 'repoRoot', '--base': 'base', '--head': 'head', '--output': 'output' }[flag]] = value;
      } else throw new Error(`Unknown argument: ${flag}`);
    }
    options.output ||= fs.mkdtempSync(path.join(os.tmpdir(), 'review-context-'));
    const result = createReviewContext(options);
    process.stdout.write(`${JSON.stringify({ ...result.output, base: result.base, head: result.head, diffHash: result.diffHash, authoredFiles: result.changedFiles.length, omittedFiles: result.omittedFiles.length, totalDiffBytes: result.totalDiffBytes, authoredDiffBytes: result.authoredDiffBytes })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
