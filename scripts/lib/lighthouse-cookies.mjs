/** Set origin-scoped cookies in the audit-owned Chrome, then detach before Lighthouse controls targets. */
const CDP_TIMEOUT_MS = 15_000

export async function setAuditCookies(port, origin, cookieHeader) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(CDP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('Audit browser debugging endpoint is unavailable.')
  const version = await response.json()
  const endpoint = new URL(version.webSocketDebuggerUrl)
  if (
    endpoint.protocol !== 'ws:' ||
    !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
    endpoint.port !== String(port)
  )
    throw new Error('Audit browser returned an unexpected debugging endpoint.')
  const socket = new WebSocket(endpoint)
  const signal = AbortSignal.timeout(CDP_TIMEOUT_MS)
  let nextId = 0
  async function command(method, params = {}) {
    const id = ++nextId
    await new Promise((resolve, reject) => {
      function stop() {
        reject(new Error('Audit cookie command timed out.'))
      }
      function receive(event) {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        socket.removeEventListener('message', receive)
        signal.removeEventListener('abort', stop)
        if (message.error === undefined) {
          resolve()
        } else {
          reject(new Error('Audit browser rejected cookie setup.'))
        }
      }
      signal.addEventListener('abort', stop, { once: true })
      socket.addEventListener('message', receive)
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener(
        'error',
        () => reject(new Error('Audit browser connection failed.')),
        { once: true },
      )
      signal.addEventListener(
        'abort',
        () => reject(new Error('Audit browser connection timed out.')),
        { once: true },
      )
    })
    await command('Storage.clearCookies')
    if (cookieHeader !== '') {
      const cookies = cookieHeader.split(';').map((pair) => {
        const separator = pair.indexOf('=')
        if (separator <= 0) throw new Error('Invalid audit session cookie.')
        return {
          name: pair.slice(0, separator).trim(),
          value: pair.slice(separator + 1),
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        }
      })
      await command('Storage.setCookies', { cookies })
    }
  } finally {
    socket.close()
  }
}
