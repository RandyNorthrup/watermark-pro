/** Native controls on the prerendered public landing; the application keeps its React controls. */
;(() => {
  const button = document.querySelector('[data-static-theme]')
  if (!(button instanceof HTMLButtonElement)) return
  const storageKey = 'watermark-pro.theme'
  const media = matchMedia('(prefers-color-scheme: dark)')
  const next = { system: 'light', light: 'dark', dark: 'system' }
  function read() {
    try {
      const value = localStorage.getItem(storageKey)
      if (value === 'light' || value === 'dark') return value
    } catch {
      // Storage denial does not prevent changing this page's appearance.
    }
    return 'system'
  }
  let theme = read()
  function apply() {
    const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    document.documentElement.dataset.theme = resolved
    for (const source of document.querySelectorAll('source[data-theme-picture="dark"]')) {
      source.setAttribute('media', resolved === 'dark' ? 'all' : 'not all')
    }
    const label = button.getAttribute(`data-label-${theme}`) ?? ''
    button.setAttribute('aria-label', label)
    button.setAttribute('title', label)
    const icon = document.querySelector(`template[data-theme-icon="${CSS.escape(theme)}"]`)
    if (icon instanceof HTMLTemplateElement) button.replaceChildren(icon.content.cloneNode(true))
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', resolved === 'dark' ? '#211d21' : '#ffffff')
    }
  }
  button.addEventListener('click', () => {
    theme = next[theme]
    try {
      localStorage.setItem(storageKey, theme)
    } catch {
      /* Preference is optional. */
    }
    apply()
  })
  media.addEventListener('change', apply)
  apply()
})()
