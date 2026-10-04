/** Named browser-only fixture; its dimensions model the provider without verifying humans. */
/* global document */
const widgets = new Map()
const counter = { generation: 0 }
Object.defineProperty(globalThis, 'turnstile', {
  value: {
    render(container, options) {
      counter.generation += 1
      const id = `human-fixture-${String(counter.generation)}`
      const panel = document.createElement('div')
      panel.style.width = options.size === 'compact' ? '150px' : '300px'
      panel.style.height = options.size === 'compact' ? '140px' : '65px'
      panel.style.border = '1px dashed #64748b'
      panel.style.display = 'flex'
      panel.style.flexWrap = 'wrap'
      panel.style.alignItems = 'center'
      panel.setAttribute('aria-label', 'Named human verification fixture')
      const solve = document.createElement('button')
      solve.type = 'button'
      solve.textContent = 'Solve verification fixture'
      solve.addEventListener('click', () => options.callback(`fixture-${options.action}-${id}`))
      const expire = document.createElement('button')
      expire.type = 'button'
      expire.textContent = 'Expire verification fixture'
      expire.addEventListener('click', options['expired-callback'])
      panel.append(solve, expire)
      container.append(panel)
      widgets.set(id, panel)
      return id
    },
    remove(id) {
      widgets.get(id)?.remove()
      widgets.delete(id)
    },
  },
})
