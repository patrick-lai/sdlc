/**
 * On-screen narration captions for TestReel / Playwright demos.
 *
 * TestReel has no built-in caption action. Inject a fixed banner via
 * page.evaluate so viewers always know what is happening.
 *
 * Element id: __sdlc_caption
 *
 * Usage:
 *   import { showCaption, updateCaption, hideCaption } from './caption-overlay.mjs'
 *   await showCaption(page, 'Opening the new Filter panel')
 *   await page.waitForTimeout(1500)
 *   await updateCaption(page, 'Submitting the form')
 *   await hideCaption(page)
 */

const CAPTION_ID = '__sdlc_caption'

/**
 * @typedef {object} CaptionOptions
 * @property {'top' | 'bottom'} [position='bottom'] Banner edge
 * @property {string} [background='rgba(15, 23, 42, 0.92)'] High-contrast panel
 * @property {string} [color='#f8fafc'] Text color
 * @property {string} [accent='#38bdf8'] Left accent bar
 * @property {number} [maxWidthPx=920] Readable line length
 */

/**
 * Create or update the caption banner.
 * @param {import('playwright').Page | import('playwright-core').Page} page
 * @param {string} text Audience-facing caption (keep short)
 * @param {CaptionOptions} [options]
 */
export async function showCaption(page, text, options = {}) {
  const payload = {
    id: CAPTION_ID,
    text: String(text ?? ''),
    position: options.position === 'top' ? 'top' : 'bottom',
    background: options.background ?? 'rgba(15, 23, 42, 0.92)',
    color: options.color ?? '#f8fafc',
    accent: options.accent ?? '#38bdf8',
    maxWidthPx: options.maxWidthPx ?? 920,
  }

  await page.evaluate((opts) => {
    const existing = document.getElementById(opts.id)
    const el = existing ?? document.createElement('div')
    el.id = opts.id
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.textContent = opts.text

    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      [opts.position === 'top' ? 'top' : 'bottom']: '28px',
      [opts.position === 'top' ? 'bottom' : 'top']: 'auto',
      zIndex: '2147483647',
      maxWidth: `min(${opts.maxWidthPx}px, calc(100vw - 48px))`,
      boxSizing: 'border-box',
      padding: '14px 22px 14px 20px',
      borderRadius: '10px',
      background: opts.background,
      color: opts.color,
      border: '1px solid rgba(248, 250, 252, 0.12)',
      borderLeft: `4px solid ${opts.accent}`,
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(18px, 2.1vw, 24px)',
      fontWeight: '650',
      lineHeight: '1.35',
      letterSpacing: '-0.01em',
      textAlign: 'left',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 160ms ease',
    })

    if (!existing) {
      document.documentElement.appendChild(el)
    }
  }, payload)
}

/**
 * Update caption text only (keeps current styles / position).
 * @param {import('playwright').Page | import('playwright-core').Page} page
 * @param {string} text
 */
export async function updateCaption(page, text) {
  await page.evaluate(
    ({ id, text: next }) => {
      const el = document.getElementById(id)
      if (!el) return
      el.textContent = next
    },
    { id: CAPTION_ID, text: String(text ?? '') },
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
 *
 * await page.evaluate(({ text }) => { … }, { text: 'Opening filters' })
 */
export const CAPTION_EVALUATE_SNIPPET = `
(() => {
  const id = '__sdlc_caption';
  const text = arguments[0];
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.documentElement.appendChild(el);
  }
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
    zIndex: '2147483647', maxWidth: 'min(920px, calc(100vw - 48px))',
    padding: '14px 22px', borderRadius: '10px',
    background: 'rgba(15, 23, 42, 0.92)', color: '#f8fafc',
    border: '1px solid rgba(248,250,252,0.12)', borderLeft: '4px solid #38bdf8',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 'clamp(18px, 2.1vw, 24px)', fontWeight: '650', lineHeight: '1.35',
    pointerEvents: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.35)'
  });
})()
`
