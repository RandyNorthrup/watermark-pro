/** Send one request to an owned loopback listener and collect its exact response bytes. */
import { request as httpRequest } from 'node:http'

export function loopbackRequest(origin, pathname, { host, headers = {}, ...options } = {}, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin)
    const outgoing = httpRequest(
      {
        hostname: '127.0.0.1',
        port: url.port,
        path: pathname,
        ...options,
        headers: { host: host ?? url.host, ...headers },
      },
      async (incoming) => {
        try {
          const chunks = await Array.fromAsync(incoming)
          resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            bytes: Buffer.concat(chunks),
          })
        } catch (error) {
          reject(error)
        }
      },
    )
    outgoing.once('error', reject)
    outgoing.end(body)
  })
}
