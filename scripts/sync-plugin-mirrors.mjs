#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const regularSkills = ['qa-demo', 'pr-warden', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion']
const reviewLearningVariants = ['review-learn-from-me', 'review-learn-from-all']
const reviewLearningContract = path.join(root, 'templates/review-learn-contract.md')
const agentPath = path.join(root, 'plugins/second-opinion/agents/second-opinion.md')
const reviewerPath = path.join(root, 'skills/second-opinion/references/reviewer.md')

function requireDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`${label} missing: ${directory}`)
  }
}

function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${label} missing: ${file}`)
  }
}

// Validate every canonical input before creating, deleting, or overwriting any mirror.
requireFile(reviewLearningContract, 'canonical review-learning contract')
for (const name of reviewLearningVariants) {
  const canonical = path.join(root, 'skills', name)
  requireDirectory(canonical, `canonical review-learning variant ${name}`)
  requireFile(path.join(canonical, 'SKILL.md'), `canonical review-learning variant SKILL.md ${name}`)
}
for (const name of regularSkills) {
  const canonical = path.join(root, 'skills', name)
  requireDirectory(canonical, `canonical skill ${name}`)
  requireFile(path.join(canonical, 'SKILL.md'), `canonical skill SKILL.md ${name}`)
}
requireFile(reviewerPath, 'second-opinion reviewer')
requireFile(agentPath, 'second-opinion Claude agent')

const reviewer = fs.readFileSync(reviewerPath, 'utf8')
const agent = fs.readFileSync(agentPath, 'utf8')
const frontmatter = agent.match(/^---\n[\s\S]*?\n---\n/)
if (!frontmatter) throw new Error('plugins/second-opinion/agents/second-opinion.md is missing YAML frontmatter')

for (const name of reviewLearningVariants) {
  const references = path.join(root, 'skills', name, 'references')
  fs.mkdirSync(references, { recursive: true })
  fs.copyFileSync(reviewLearningContract, path.join(references, 'contract.md'))
}

for (const name of regularSkills) {
  const src = path.join(root, 'skills', name)
  const dest = path.join(root, 'plugins', name, 'skills', name)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
}

const reviewLearningPluginSkills = path.join(root, 'plugins/review-learn/skills')
fs.rmSync(reviewLearningPluginSkills, { recursive: true, force: true })
fs.mkdirSync(reviewLearningPluginSkills, { recursive: true })
for (const name of reviewLearningVariants) {
  fs.cpSync(path.join(root, 'skills', name), path.join(reviewLearningPluginSkills, name), { recursive: true })
}

fs.writeFileSync(agentPath, `${frontmatter[0]}${reviewer}`)

console.log('synced review-learning variants, plugin skill mirrors, and second-opinion Claude agent body')
