import { vi } from 'vitest'

import { type FakeGalleryState, handleGallery } from './fake-gallery-api'
import { type FakeShareState, handleShares } from './fake-share-api'
import { requestUrl } from './request-url'
import { type AssetDto, saveWatermarkRequestSchema, type WatermarkDto } from '../../shared/api'
import { API_ERROR_CODE, HTTP_STATUS } from '../../shared/constants'

/**
 * In-memory stand-in for the library routes, installed as `fetch`. It
 * mirrors the Worker's status codes and error envelope so page tests can
 * exercise real query and mutation code paths in jsdom.
 */
export interface FakeLibraryState {
  watermarks: WatermarkDto[]
  assets: AssetDto[]
  /** When set, every request fails with this code. */
  failWith: keyof typeof API_ERROR_CODE | null
  gallery: FakeGalleryState
  shares: FakeShareState
}

const STATUS_BY_CODE: Record<keyof typeof API_ERROR_CODE, number> = {
  notFound: HTTP_STATUS.notFound,
  internalError: HTTP_STATUS.internalServerError,
  invalidConfiguration: HTTP_STATUS.internalServerError,
  unauthenticated: HTTP_STATUS.unauthorized,
  forbidden: HTTP_STATUS.forbidden,
  validation: HTTP_STATUS.badRequest,
  rateLimited: HTTP_STATUS.tooManyRequests,
  conflict: HTTP_STATUS.conflict,
  payloadTooLarge: HTTP_STATUS.payloadTooLarge,
  unsupportedMedia: HTTP_STATUS.unsupportedMediaType,
  quotaExceeded: HTTP_STATUS.badRequest,
}

function readBody(init: RequestInit): string {
  if (typeof init.body !== 'string') {
    throw new TypeError('expected a JSON string body')
  }
  return init.body
}

function formText(form: FormData, key: string): string | null {
  const value = form.get(key)
  return typeof value === 'string' ? value : null
}

function errorResponse(code: keyof typeof API_ERROR_CODE): Response {
  return Response.json({ error: API_ERROR_CODE[code] }, { status: STATUS_BY_CODE[code] })
}

export function makeWatermark(overrides: Partial<WatermarkDto> = {}): WatermarkDto {
  return {
    id: 'wm-1',
    organizationId: 'org-1',
    name: 'Studio signature',
    spec: {
      kind: 'text',
      text: '© Acme Studio',
      fontFamily: 'Inter Variable',
      fontWeight: 600,
      letterSpacing: 0,
      curve: 0,
      effect: 'solid',
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: {
        opacity: 0.85,
        rotation: 0,
        scale: 0.22,
        margin: 0.04,
        tiling: { enabled: false, spacing: 1.5 },
        backdrop: { enabled: false, opacity: 0.6 },
      },
    },
    createdBy: 'user-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  }
}

export function makeAsset(overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    id: 'asset-1',
    organizationId: 'org-1',
    kind: 'logo',
    name: 'Brand mark',
    contentType: 'image/png',
    size: 1234,
    width: 320,
    height: 160,
    createdBy: 'user-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

const ROUTE =
  /^\/api\/orgs\/(?<org>[^/]+)\/(?<resource>watermarks|assets)(?:\/(?<id>[^/]+))?(?<file>\/file)?$/

let nextId = 1

function handle(state: FakeLibraryState, url: string, init: RequestInit): Response {
  if (state.failWith !== null) {
    return errorResponse(state.failWith)
  }
  const gallery = handleGallery(state.gallery, url, init)
  if (gallery !== null) {
    return gallery
  }
  const shared = handleShares(state.shares, state.gallery, url, init)
  if (shared !== null) {
    return shared
  }
  const method = init.method ?? 'GET'
  const match = ROUTE.exec(new URL(url, 'http://localhost').pathname)
  if (match?.groups === undefined) {
    throw new Error(`unexpected fetch ${method} ${url}`)
  }
  const { resource, id, file } = match.groups
  if (resource === 'watermarks') {
    if (method === 'GET') {
      return Response.json({ watermarks: state.watermarks })
    }
    if (method === 'POST' || method === 'PUT') {
      const parsed = saveWatermarkRequestSchema.safeParse(JSON.parse(readBody(init)))
      if (!parsed.success) {
        return errorResponse('validation')
      }
      if (method === 'POST') {
        nextId += 1
        const created = makeWatermark({ id: `wm-${String(nextId)}`, ...parsed.data })
        state.watermarks.push(created)
        return Response.json(created, { status: HTTP_STATUS.created })
      }
      const index = state.watermarks.findIndex((candidate) => candidate.id === id)
      const existing = state.watermarks[index]
      if (existing === undefined) {
        return errorResponse('notFound')
      }
      const updated = { ...existing, ...parsed.data }
      state.watermarks[index] = updated
      return Response.json(updated)
    }
    if (method === 'DELETE') {
      const before = state.watermarks.length
      state.watermarks = state.watermarks.filter((candidate) => candidate.id !== id)
      return state.watermarks.length === before
        ? errorResponse('notFound')
        : new Response(null, { status: HTTP_STATUS.noContent })
    }
  } else if (resource === 'assets') {
    if (method === 'GET' && file !== undefined) {
      return new Response(new Uint8Array([0x89, 0x50]), {
        headers: { 'content-type': 'image/png' },
      })
    }
    if (method === 'GET') {
      return Response.json({ assets: state.assets })
    }
    if (method === 'POST') {
      const form = init.body
      if (!(form instanceof FormData)) {
        return errorResponse('validation')
      }
      const upload = form.get('file')
      if (!(upload instanceof File)) {
        return errorResponse('validation')
      }
      nextId += 1
      const created = makeAsset({
        id: `asset-${String(nextId)}`,
        name: formText(form, 'name') ?? upload.name,
        size: upload.size,
        width: Number(form.get('width')),
        height: Number(form.get('height')),
      })
      state.assets.push(created)
      return Response.json(created, { status: HTTP_STATUS.created })
    }
    if (method === 'DELETE') {
      if (state.watermarks.some((wm) => wm.spec.kind === 'image' && wm.spec.assetId === id)) {
        return errorResponse('conflict')
      }
      state.assets = state.assets.filter((candidate) => candidate.id !== id)
      return new Response(null, { status: HTTP_STATUS.noContent })
    }
  }
  throw new Error(`unhandled ${method} ${url}`)
}

/** Installs the fake as `globalThis.fetch`; returns the mutable state. */
export function installLibraryApi(initial: Partial<FakeLibraryState> = {}): FakeLibraryState {
  const state: FakeLibraryState = {
    watermarks: [],
    assets: [],
    failWith: null,
    gallery: { photos: [], maxBytes: 2 * 1024 * 1024 * 1024, uploadFailsWith: null },
    shares: { shares: [] },
    ...initial,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) =>
      Promise.resolve(handle(state, requestUrl(input), init)),
    ),
  )
  return state
}
