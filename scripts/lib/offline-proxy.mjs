/** Per-test loopback HTTP outage transport; original application URLs and end-to-end data stay intact. */
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'

import { forwardedHeaders } from './compressing-proxy.mjs'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const FORBIDDEN = 403
const CREATED = 201

/** Forward only the named local gate, or sever owned connections while its browser is disconnected. */
export async function createOfflineProxy(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin)
  if (
    upstream.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(upstream.hostname) ||
    upstream.pathname !== '/' ||
    upstream.search !== '' ||
    upstream.hash !== '' ||
    upstream.username !== '' ||
    upstream.password !== ''
  )
    throw new Error('Offline fixtures require an exact loopback HTTP gate origin.')
  const sockets = new Set()
  const tunnels = new Set()
  const requests = new Set()
  const state = { disconnected: false, forwarded: 0, photoDrop: null }
  const server = createServer((incoming, outgoing) => {
    if (state.disconnected) {
      incoming.destroy()
      return
    }
    let target
    try {
      target = new URL(incoming.url, upstream)
    } catch {
      outgoing.writeHead(FORBIDDEN)
      outgoing.end()
      return
    }
    if (
      target.origin !== upstream.origin ||
      incoming.headers.host !== upstream.host ||
      target.username !== '' ||
      target.password !== '' ||
      target.hash !== ''
    ) {
      outgoing.writeHead(FORBIDDEN)
      outgoing.end()
      return
    }
    state.forwarded++
    const drop =
      incoming.method === 'POST' &&
      target.pathname === state.photoDrop?.path &&
      target.search === ''
        ? state.photoDrop
        : null
    if (drop !== null) state.photoDrop = null
    const forwarded = httpRequest(
      target,
      { method: incoming.method, headers: forwardedHeaders(incoming.headers) },
      (response) => {
        if (response.statusCode === undefined) {
          response.destroy()
          outgoing.destroy()
          return
        }
        if (drop !== null) {
          drop.responseStatus = response.statusCode
          if (response.statusCode === CREATED) {
            response.once('error', () => outgoing.destroy())
            response.once('end', () => {
              outgoing.once('close', () => {
                drop.didDrop = true
              })
              outgoing.destroy()
            })
            // The server committed and its entire real acknowledgement arrived.
            // Only delivery to this one client is lost; no response is fabricated.
            response.resume()
            return
          }
        }
        outgoing.writeHead(
          response.statusCode,
          response.statusMessage,
          forwardedHeaders(response.headers),
        )
        response.once('error', () => outgoing.destroy())
        response.pipe(outgoing)
      },
    )
    requests.add(forwarded)
    forwarded.once('close', () => requests.delete(forwarded))
    forwarded.once('error', () => outgoing.destroy())
    incoming.once('aborted', () => forwarded.destroy())
    incoming.once('error', () => forwarded.destroy())
    outgoing.once('error', () => forwarded.destroy())
    outgoing.once('close', () => {
      if (!outgoing.writableFinished) forwarded.destroy()
    })
    incoming.pipe(forwarded)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  // Playwright's API client uses CONNECT even for the HTTP gate. Admit only
  // that exact authority, preserving every tunneled byte and owning both ends.
  server.on('connect', (request, socket, head) => {
    if (state.disconnected || request.url !== upstream.host) {
      socket.destroy()
      return
    }
    state.forwarded++
    const tunnel = connect(
      {
        host: upstream.hostname.replaceAll(/[[\]]/g, ''),
        port: Number(upstream.port || 80),
      },
      () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length > 0) tunnel.write(head)
        socket.pipe(tunnel).pipe(socket)
      },
    )
    tunnels.add(tunnel)
    tunnel.once('close', () => tunnels.delete(tunnel))
    tunnel.once('error', () => socket.destroy())
    socket.once('error', () => tunnel.destroy())
    socket.once('close', () => tunnel.destroy())
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Offline proxy did not bind a loopback port.')
  }
  function disconnect() {
    for (const request of requests) request.destroy()
    for (const tunnel of tunnels) tunnel.destroy()
    for (const socket of sockets) socket.destroy()
  }
  let closing
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    get forwardedRequests() {
      return state.forwarded
    },
    setDisconnected(value) {
      state.disconnected = value
      if (value) disconnect()
    },
    dropNextPhotoAcknowledgement(path) {
      if (state.photoDrop !== null || !/^\/api\/orgs\/[A-Za-z0-9_-]+\/photos$/.test(path))
        throw new Error('A single exact photo-upload acknowledgement may be armed.')
      const drop = { path, responseStatus: null, didDrop: false }
      state.photoDrop = drop
      return {
        get responseStatus() {
          return drop.responseStatus
        },
        get didDrop() {
          return drop.didDrop
        },
        clear() {
          if (state.photoDrop === drop) state.photoDrop = null
        },
      }
    },
    close() {
      closing ??= new Promise((resolve, reject) => {
        state.disconnected = true
        server.close((error) => (error ? reject(error) : resolve()))
        disconnect()
      })
      return closing
    },
  }
}
