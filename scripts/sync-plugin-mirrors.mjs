#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const regularSkills = ['qa-demo', 'pr-warden', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion', 'jev-fast-coding']
const reviewLearningVariants = ['review-learn-from-me', 'review-learn-from-all']
const reviewLearningContract = path.join(root, 'templates/review-learn-contract.md')
const reviewWorkflow = path.join(root, 'templates/review-workflow.md')
const reviewLenses = path.join(root, 'skills/review/references/lenses.md')
const blockerComment = path.join(root, 'skills/review/references/blocking-pr-comment.md')
const generatedFiles = path.join(root, 'skills/review/references/generated-files.md')
const reviewContext = path.join(root, 'skills/review/scripts/review-context.mjs')
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
requireFile(reviewWorkflow, 'canonical review workflow')
requireFile(reviewLenses, 'canonical review lenses')
requireFile(blockerComment, 'canonical blocker comment format')
requireFile(generatedFiles, 'canonical generated-file guidance')
requireFile(reviewContext, 'canonical review context helper')
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

for (const name of ['review', 'fe-pr-review', 'be-pr-review']) {
  const references = path.join(root, 'skills', name, 'references')
  fs.mkdirSync(references, { recursive: true })
  fs.copyFileSync(reviewWorkflow, path.join(references, 'workflow.md'))
  if (name !== 'review') {
    fs.copyFileSync(reviewLenses, path.join(references, 'lenses.md'))
    fs.copyFileSync(blockerComment, path.join(references, 'blocking-pr-comment.md'))
  }
}

for (const name of ['fe-pr-review', 'be-pr-review', 'second-opinion']) {
  const canonical = path.join(root, 'skills', name)
  fs.mkdirSync(path.join(canonical, 'references'), { recursive: true })
  fs.mkdirSync(path.join(canonical, 'scripts'), { recursive: true })
  fs.copyFileSync(generatedFiles, path.join(canonical, 'references/generated-files.md'))
  fs.copyFileSync(reviewContext, path.join(canonical, 'scripts/review-context.mjs'))
}

for (const name of regularSkills) {
  const src = path.join(root, 'skills', name)
  const dest = path.join(root, 'plugins', name, 'skills', name)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true, filter: (source) => !['.pr-warden-ledger.json', '.pr-warden-state.json', '.pr-warden-report.html'].includes(path.basename(source)) })
}

const reviewLearningPluginSkills = path.join(root, 'plugins/review-learn/skills')
fs.rmSync(reviewLearningPluginSkills, { recursive: true, force: true })
fs.mkdirSync(reviewLearningPluginSkills, { recursive: true })
for (const name of reviewLearningVariants) {
  fs.cpSync(path.join(root, 'skills', name), path.join(reviewLearningPluginSkills, name), { recursive: true })
}

fs.writeFileSync(agentPath, `${frontmatter[0]}${reviewer}`)

console.log('synced review-learning variants, plugin skill mirrors, and second-opinion Claude agent body')
