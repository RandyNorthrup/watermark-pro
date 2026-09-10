/** The base catalogue may itself be unavailable; this small last-resort message does not depend on React or translations. */
export function showBootFailure(
  root: Element,
  reload: () => void = () => window.location.reload(),
): void {
  const main = document.createElement('main')
  main.className = 'mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 px-6'
  const heading = document.createElement('h1')
  heading.className = 'text-2xl font-semibold'
  heading.textContent = 'Lumafoil could not load'
  const message = document.createElement('p')
  message.textContent = 'Reconnect, then reload to download the language files.'
  message.setAttribute('role', 'alert')
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'min-h-11 rounded-lg bg-brand-600 px-5 py-3 font-medium text-white'
  retry.textContent = 'Reload'
  retry.addEventListener('click', reload)
  main.append(heading, message, retry)
  root.replaceChildren(main)
}
