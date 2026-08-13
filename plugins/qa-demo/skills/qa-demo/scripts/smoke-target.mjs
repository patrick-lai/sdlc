const MODES = new Set(['todomvc', 'example', 'generic'])

export function resolveSmokeMode(url, explicitMode = null) {
  if (explicitMode) {
    const normalized = String(explicitMode).trim().toLowerCase()
    const mode = normalized === 'todo' ? 'todomvc' : normalized
    if (!MODES.has(mode)) {
      throw new Error(`Unsupported SDLC_SMOKE_MODE "${explicitMode}"; use todomvc, example, or generic`)
    }
    return mode
  }

  const parsed = new URL(url)
  const target = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
  if (target.includes('todomvc')) return 'todomvc'
  if (parsed.hostname === 'example.com' || parsed.hostname === 'www.example.com') return 'example'
  return 'generic'
}
