/**
 * Makes the English catalogue the source of truth for translation keys: `tsc`
 * checks every `t('…')` call against `typeof en`, so a typo or a removed key
 * fails the type gate rather than silently rendering the key string (M18).
 */
import type en from '../locales/en/common.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: { common: typeof en }
    returnNull: false
  }
}
