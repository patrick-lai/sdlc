#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-install-smoke-'))

function run(command, args) {
  const result = spawnSync(command, args, { cwd: temp, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout
}

try {
  fs.writeFileSync(path.join(temp, 'package.json'), '{"name":"sdlc-install-smoke","private":true}\n')
  for (const skill of ['pr-warden', 'qa-demo']) {
    run('npx', ['-y', 'skills', 'add', root, '--skill', skill, '-a', 'cursor', '-y'])
    assert.ok(fs.existsSync(path.join(temp, '.agents', 'skills', skill, 'SKILL.md')))
  }

  const adapter = path.join(temp, '.agents/skills/pr-warden/scripts/adapter.mjs')
  const parsed = JSON.parse(run(process.execPath, [adapter, 'parse-link', 'https://github.com/patrick-lai/sdlc/pull/2']))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.link.key.provider, 'github')
  assert.equal(parsed.link.key.number, 2)
  assert.ok(fs.existsSync(path.join(temp, '.agents/skills/qa-demo/scripts/caption-overlay.mjs')))
  assert.ok(fs.existsSync(path.join(temp, '.agents/skills/qa-demo/scripts/a11y-scan.mjs')))
  console.log(`PASS: installed pr-warden + qa-demo into ${path.join(temp, '.agents/skills')}`)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
