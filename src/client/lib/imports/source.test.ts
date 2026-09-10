import { describe, expect, it } from 'vitest'

import { configuredProviders, isProviderConfigured, PROVIDER_LABELS } from './source'
import type { PublicConfig } from '../../../shared/api'

/** A config with every cloud provider disabled; tests turn on one field at a time. */
const NONE: PublicConfig = {
  googleAuthEnabled: false,
  microsoftAuthEnabled: false,
  turnstileSiteKey: null,
  googleOAuthClientId: null,
  googlePickerApiKey: null,
  googlePickerAppId: null,
  microsoftClientId: null,
  dropboxAppKey: null,
}

const GOOGLE_KEYS: PublicConfig = {
  ...NONE,
  googleOAuthClientId: 'client',
  googlePickerApiKey: 'key',
  googlePickerAppId: 'app',
}

describe('isProviderConfigured', () => {
  it('is false for every provider when nothing is configured', () => {
    expect(isProviderConfigured(NONE, 'google')).toBe(false)
    expect(isProviderConfigured(NONE, 'dropbox')).toBe(false)
    expect(isProviderConfigured(NONE, 'onedrive')).toBe(false)
  })

  it('requires all three Google keys, not just some', () => {
    expect(isProviderConfigured({ ...NONE, googleOAuthClientId: 'client' }, 'google')).toBe(false)
    expect(
      isProviderConfigured(
        { ...NONE, googleOAuthClientId: 'client', googlePickerApiKey: 'key' },
        'google',
      ),
    ).toBe(false)
    expect(isProviderConfigured(GOOGLE_KEYS, 'google')).toBe(true)
  })

  it('reads the single key each of Dropbox and OneDrive needs', () => {
    expect(isProviderConfigured({ ...NONE, dropboxAppKey: 'key' }, 'dropbox')).toBe(true)
    expect(isProviderConfigured({ ...NONE, microsoftClientId: 'id' }, 'onedrive')).toBe(true)
  })
})

describe('configuredProviders', () => {
  it('is empty when nothing is configured', () => {
    expect(configuredProviders(NONE)).toEqual([])
  })

  it('lists only configured providers, in the stable google/dropbox/onedrive order', () => {
    const config: PublicConfig = { ...GOOGLE_KEYS, microsoftClientId: 'id', dropboxAppKey: 'key' }
    expect(configuredProviders(config)).toEqual(['google', 'dropbox', 'onedrive'])
  })

  it('omits a provider whose keys are only partially set', () => {
    const config: PublicConfig = { ...NONE, googleOAuthClientId: 'client', dropboxAppKey: 'key' }
    expect(configuredProviders(config)).toEqual(['dropbox'])
  })
})

describe('PROVIDER_LABELS', () => {
  it('names every provider id', () => {
    expect(PROVIDER_LABELS.google).toBe('Google Drive')
    expect(PROVIDER_LABELS.dropbox).toBe('Dropbox')
    expect(PROVIDER_LABELS.onedrive).toBe('OneDrive')
  })
})
