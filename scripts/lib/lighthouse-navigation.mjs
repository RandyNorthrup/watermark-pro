/** Reject redirected, broken, or incorrectly modelled audit navigations before scoring them. */
export function validateAuditNavigation({ origin, pathname, finalDisplayedUrl, requests }) {
  const expected = new URL(pathname, origin)
  const displayed = new URL(finalDisplayedUrl)
  const document = Array.isArray(requests)
    ? requests.find(
        (request) => request.resourceType === 'Document' && request.url === displayed.href,
      )
    : undefined
  if (
    displayed.origin !== expected.origin ||
    displayed.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '') ||
    document?.statusCode !== 200
  ) {
    throw new Error('Lighthouse did not reach the expected successful page.')
  }
  const completed = requests.filter((request) => {
    const url = new URL(request.url)
    // Decoded photo and canvas-preview blobs are in-memory resources, not HTTP requests.
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    return request.finished && isHttp && url.origin === origin
  })
  if (completed.some((request) => request.statusCode < 200 || request.statusCode >= 400))
    throw new Error('Lighthouse observed an unexpected HTTP error on the audit origin.')
  const protocols = [...new Set(completed.map((request) => request.protocol))]
  if (document.protocol !== 'h2' || protocols.length !== 1 || protocols[0] !== 'h2')
    throw new Error('The audit origin must negotiate HTTP/2 for every completed request.')
  return protocols
}
