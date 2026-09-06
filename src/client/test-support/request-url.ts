/** Normalises the first `fetch` argument to a URL string for stubbed fetches. */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  return input instanceof URL ? input.href : input.url
}
