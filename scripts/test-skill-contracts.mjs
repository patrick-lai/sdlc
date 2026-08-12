#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function filesUnder(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(file))
    else out.push(file)
  }
  return out.sort()
}

function assertMirror(name) {
  const canonical = path.join(root, 'skills', name)
  const plugin = path.join(root, 'plugins', name, 'skills', name)
  const relative = (base) => filesUnder(base).map((file) => path.relative(base, file))
  assert.deepEqual(relative(plugin), relative(canonical), `${name} plugin file list drifted`)
  for (const file of relative(canonical)) {
    assert.deepEqual(
      fs.readFileSync(path.join(plugin, file)),
      fs.readFileSync(path.join(canonical, file)),
      `${name} plugin copy drifted at ${file}`,
    )
  }
}

for (const name of ['pr-warden', 'qa-demo']) assertMirror(name)

const publicRoots = ['README.md', '.claude-plugin', 'skills', 'plugins', 'fixtures']
const textExtensions = new Set(['.md', '.json', '.mjs', '.js', '.html', '.txt', '.yaml', '.yml'])
const publicFiles = publicRoots
  .flatMap((entry) => {
    const file = path.join(root, entry)
    return fs.statSync(file).isDirectory() ? filesUnder(file) : [file]
  })
  .filter((file) => textExtensions.has(path.extname(file)))
const banned = [
  /\btwg\b/i,
  /\bRaphael\b/i,
  /\bLumine\b/i,
  /\/Users\//,
  /atlassian-frontend-monorepo/i,
  /\.atlassian\.net/i,
]
for (const file of publicFiles) {
  const body = fs.readFileSync(file, 'utf8')
  for (const pattern of banned) {
    assert.ok(!pattern.test(body), `public/internal leak ${pattern} in ${path.relative(root, file)}`)
  }
}

const qa = fs.readFileSync(path.join(root, 'skills/qa-demo/SKILL.md'), 'utf8')
for (const marker of [
  'NOT_APPLICABLE',
  'BLOCKED',
  'storageState',
  'temporary scratch directory',
  'provider CLI/API',
  'tested commit/source revision',
]) {
  assert.ok(qa.includes(marker), `qa-demo missing pressure-test contract: ${marker}`)
}

const warden = fs.readFileSync(path.join(root, 'skills/pr-warden/SKILL.md'), 'utf8')
for (const marker of ['Never merge', '--html', 'GitHub', 'Bitbucket', '3 automatic repair attempts']) {
  assert.ok(warden.includes(marker), `pr-warden missing public contract: ${marker}`)
}

console.log('PASS: public skill contracts, mirrors, and internal-leak guard')
