#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skills = ['qa-demo', 'pr-warden', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion']

for (const name of skills) {
  const src = path.join(root, 'skills', name)
  const dest = path.join(root, 'plugins', name, 'skills', name)
  if (!fs.existsSync(src)) throw new Error(`canonical skill missing: ${src}`)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
}

const agentPath = path.join(root, 'plugins/second-opinion/agents/second-opinion.md')
const reviewer = fs.readFileSync(path.join(root, 'skills/second-opinion/references/reviewer.md'), 'utf8')
const agent = fs.readFileSync(agentPath, 'utf8')
const frontmatter = agent.match(/^---\n[\s\S]*?\n---\n/)
if (!frontmatter) throw new Error('plugins/second-opinion/agents/second-opinion.md is missing YAML frontmatter')
fs.writeFileSync(agentPath, `${frontmatter[0]}${reviewer}`)

console.log('synced plugin skill mirrors and second-opinion Claude agent body')
