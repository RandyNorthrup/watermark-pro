/** Build-time rendering and unit tests read the same checked-in data that browsers fetch as JSON assets. */
import { type Locale, SUPPORTED_LOCALES } from '../../shared/locales'

const sources = import.meta.glob<Record<string, unknown>>('../locales/*/common.json', {
  eager: true,
  import: 'default',
})
export const sourceCatalogues: Partial<Record<Locale, Record<string, unknown>>> = {}
for (const locale of SUPPORTED_LOCALES) {
  const catalogue = sources[`../locales/${locale.code}/common.json`]
  if (catalogue === undefined)
    throw new Error(`Missing checked-in language catalogue: ${locale.code}`)
  sourceCatalogues[locale.code] = catalogue
}
