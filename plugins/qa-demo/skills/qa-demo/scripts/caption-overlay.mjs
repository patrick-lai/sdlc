/**
 * On-screen narration captions for TestReel / Playwright demos.
 *
 * TestReel has no built-in caption action. Inject a fixed lower-third via
 * page.evaluate so viewers know what is being proved without audio.
 *
 * Element id: __sdlc_caption
 *
 * Usage:
 *   await showCaption(page, {
 *     kicker: '01 · addTask',
 *     claim: 'High-priority issue lands as TB-1',
 *     detail: 'Title + HIGH persist — TaskBoardService.addTask',
 *   })
 *   await showCaption(page, 'Opening the new Filter panel') // string still works
 */

const CAPTION_ID = '__sdlc_caption'

/**
 * @typedef {object} CaptionSpec
 * @property {string} claim Audience-facing line (what changed / what we prove)
 * @property {string} [kicker] Beat label, e.g. "02 · complete"
 * @property {string} [detail] Helper: the contract or assertion
 * @property {'top' | 'bottom'} [position]
 * @property {string} [background]
 * @property {string} [color]
 * @property {string} [accent]
 * @property {number} [maxWidthPx]
 */

/**
 * @param {string | CaptionSpec} text
 * @param {Partial<CaptionSpec>} [options]
 * @returns {CaptionSpec}
 */
export function normalizeCaption(text, options = {}) {
  const fromObj = text && typeof text === 'object' ? text : null
  const claim = fromObj
    ? String(fromObj.claim ?? fromObj.text ?? '')
    : String(text ?? '')
  return {
    claim,
    kicker: String(fromObj?.kicker ?? options.kicker ?? ''),
    detail: String(fromObj?.detail ?? options.detail ?? ''),
    position: (fromObj?.position ?? options.position) === 'top' ? 'top' : 'bottom',
    background: fromObj?.background ?? options.background ?? 'rgba(9, 30, 66, 0.94)',
    color: fromObj?.color ?? options.color ?? '#f8fafc',
    accent: fromObj?.accent ?? options.accent ?? '#4c9aff',
    maxWidthPx: fromObj?.maxWidthPx ?? options.maxWidthPx ?? 760,
  }
}

/**
 * Create or update the caption banner.
 * @param {import('playwright').Page | import('playwright-core').Page} page
 * @param {string | CaptionSpec} text
 * @param {Partial<CaptionSpec>} [options]
 */
export async function showCaption(page, text, options = {}) {
  const spec = { id: CAPTION_ID, ...normalizeCaption(text, options) }

  await page.evaluate((opts) => {
    const existing = document.getElementById(opts.id)
    const root = existing ?? document.createElement('div')
    root.id = opts.id
    root.setAttribute('role', 'status')
    root.setAttribute('aria-live', 'polite')
    root.replaceChildren()

    const kicker = document.createElement('div')
    kicker.dataset.part = 'kicker'
    kicker.textContent = opts.kicker
    kicker.style.display = opts.kicker ? 'block' : 'none'
    kicker.style.fontFamily = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    kicker.style.fontSize = '11px'
    kicker.style.fontWeight = '700'
    kicker.style.letterSpacing = '0.08em'
    kicker.style.textTransform = 'uppercase'
    kicker.style.color = opts.accent
    kicker.style.marginBottom = '4px'

    const claim = document.createElement('div')
    claim.dataset.part = 'claim'
    claim.textContent = opts.claim
    claim.style.fontSize = 'clamp(16px, 1.9vw, 21px)'
    claim.style.fontWeight = '650'
    claim.style.letterSpacing = '-0.02em'
    claim.style.lineHeight = '1.3'

    const detail = document.createElement('div')
    detail.dataset.part = 'detail'
    detail.textContent = opts.detail
    detail.style.display = opts.detail ? 'block' : 'none'
    detail.style.marginTop = '6px'
    detail.style.fontSize = '13px'
    detail.style.lineHeight = '1.4'
    detail.style.fontWeight = '500'
    detail.style.color = 'rgba(248, 250, 252, 0.78)'

    root.append(kicker, claim, detail)

    Object.assign(root.style, {
      position: 'fixed',
      left: '28px',
      right: 'auto',
      transform: 'none',
      [opts.position === 'top' ? 'top' : 'bottom']: '24px',
      [opts.position === 'top' ? 'bottom' : 'top']: 'auto',
      zIndex: '2147483647',
      maxWidth: `min(${opts.maxWidthPx}px, calc(100vw - 56px))`,
      boxSizing: 'border-box',
      padding: '12px 16px 12px 14px',
      borderRadius: '6px',
      background: opts.background,
      color: opts.color,
      border: '1px solid rgba(248, 250, 252, 0.12)',
      borderLeft: `3px solid ${opts.accent}`,
      boxShadow: '0 12px 32px rgba(9, 30, 66, 0.28)',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textAlign: 'left',
      pointerEvents: 'none',
      opacity: '1',
    })

    if (!existing) document.documentElement.appendChild(root)
  }, spec)
}

/**
 * Update caption text (keeps current styles / position).
 * @param {import('playwright').Page | import('playwright-core').Page} page
 * @param {string | { claim?: string, kicker?: string, detail?: string }} text
 */
export async function updateCaption(page, text) {
  const spec = normalizeCaption(text)
  await page.evaluate(
    ({ id, claim, kicker, detail }) => {
      const root = document.getElementById(id)
      if (!root) return
      const set = (part, value) => {
        const node = root.querySelector(`[data-part="${part}"]`)
        if (!node) return
        node.textContent = value
        node.style.display = value ? 'block' : 'none'
      }
      set('kicker', kicker)
      set('claim', claim)
      set('detail', detail)
    },
    { id: CAPTION_ID, claim: spec.claim, kicker: spec.kicker, detail: spec.detail },
  )
}

/**
 * Remove the caption banner.
 * @param {import('playwright').Page | import('playwright-core').Page} page
 */
export async function hideCaption(page) {
  await page.evaluate((id) => {
    document.getElementById(id)?.remove()
  }, CAPTION_ID)
}

export { CAPTION_ID }

/**
 * Inline evaluate snippet for agents who cannot import this module.
 * Prefer the exported helpers above.
 */
export const CAPTION_EVALUATE_SNIPPET = `
(() => {
  const id = '__sdlc_caption';
  const spec = typeof arguments[0] === 'object' && arguments[0]
    ? arguments[0]
    : { claim: String(arguments[0] ?? '') };
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.documentElement.appendChild(el);
  }
  el.textContent = '';
  const kicker = document.createElement('div');
  kicker.textContent = spec.kicker || '';
  const claim = document.createElement('div');
  claim.textContent = spec.claim || spec.text || '';
  const detail = document.createElement('div');
  detail.textContent = spec.detail || '';
  el.append(kicker, claim, detail);
  Object.assign(el.style, {
    position: 'fixed', left: '28px', bottom: '24px',
    zIndex: '2147483647', maxWidth: 'min(760px, calc(100vw - 56px))',
    padding: '12px 16px', borderRadius: '6px',
    background: 'rgba(9, 30, 66, 0.94)', color: '#f8fafc',
    border: '1px solid rgba(248,250,252,0.12)', borderLeft: '3px solid #4c9aff',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    pointerEvents: 'none', boxShadow: '0 12px 32px rgba(9,30,66,0.28)'
  });
})()
`
