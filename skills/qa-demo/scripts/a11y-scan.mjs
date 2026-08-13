const DEFAULT_BLOCKING_IMPACTS = new Set(['critical', 'serious'])

function normalizeViolation(violation, storyId) {
  return {
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    storyIds: storyId ? [storyId] : [],
    nodes: (violation.nodes ?? []).map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }
}

export async function scanAccessibility(page, {
  axeSource,
  label = 'current state',
  storyId = null,
  include = null,
  exclude = [],
  blockingImpacts = [...DEFAULT_BLOCKING_IMPACTS],
} = {}) {
  if (!axeSource) throw new Error('axe-core source is required for accessibility scanning')
  await page.addScriptTag({ content: axeSource })
  const result = await page.evaluate(async ({ include, exclude }) => {
    const context = include || exclude.length
      ? { include: include ? [include] : undefined, exclude: exclude.map((selector) => [selector]) }
      : document
    return globalThis.axe.run(context, { resultTypes: ['violations'] })
  }, { include, exclude })
  const violations = result.violations.map((violation) => normalizeViolation(violation, storyId))
  const blocking = new Set(blockingImpacts)
  return {
    label,
    storyId,
    testedAt: new Date().toISOString(),
    violations,
    blockingViolations: violations.filter((violation) => blocking.has(violation.impact)),
  }
}

export function mergeAccessibilityScans(scans = []) {
  const byId = new Map()
  for (const scan of scans) {
    for (const violation of scan.violations ?? []) {
      const current = byId.get(violation.id)
      if (!current) {
        byId.set(violation.id, structuredClone(violation))
        continue
      }
      current.storyIds = [...new Set([...(current.storyIds ?? []), ...(violation.storyIds ?? [])])]
      const seen = new Set(current.nodes.map((node) => JSON.stringify(node.target)))
      for (const node of violation.nodes ?? []) {
        const key = JSON.stringify(node.target)
        if (!seen.has(key)) {
          current.nodes.push(node)
          seen.add(key)
        }
      }
    }
  }
  const violations = [...byId.values()]
  return {
    status: 'ran',
    engine: 'axe-core',
    scans: scans.length,
    violations,
    blockingViolations: violations.filter((violation) =>
      DEFAULT_BLOCKING_IMPACTS.has(violation.impact),
    ),
  }
}

export function assertNoBlockingViolations(summary) {
  if (!summary.blockingViolations?.length) return
  const detail = summary.blockingViolations
    .map((violation) => `${violation.id} (${violation.impact}, ${violation.nodes.length} node(s))`)
    .join(', ')
  throw new Error(`Accessibility scan found blocking violations: ${detail}`)
}
