# M18 — Localisation: twelve languages, right-to-left, locale formatting

## Goal

eZy Watermark ships in eleven languages; we ship in English. After M18
the whole client (every page, control, message, token label, error) is
available in twelve languages including one right-to-left script, follows
the user's saved preference or their browser, formats dates, numbers and
file sizes for that locale, and has gates that keep every language
complete as features are added.

This milestone comes after every feature milestone on purpose: strings are
extracted once. Do not start it while M11–M17 are open.

## Languages

`en` (source), `es`, `de`, `fr`, `it`, `pt-BR`, `nl`, `ja`, `ko`,
`zh-Hans`, `ru`, `ar` (RTL). `SUPPORTED_LOCALES` in
`src/shared/locales.ts` with native names for the picker ("Deutsch",
"日本語", "العربية").

Translations are produced by the implementing agent and marked
"machine-translated; native review pending" in PLAN §4 per language. A
glossary (`src/client/locales/GLOSSARY.md`) fixes the product terms first
(preset, mark, layer, smart placement, contrast, tile, batch, gallery,
share link, organization, member, owner, admin, editor, viewer) so every
language uses one word per concept.

## Library

`i18next` + `react-i18next` (MIT). At the time of writing the newest
versions (26.4.2 and 17.0.13) are younger than the seven-day
`min-release-age`; install the newest version that is at least seven days
old on the day (`npm view i18next time --json`), pin it, and check
`react-i18next` peers (`i18next >= 26.2.0`, `react >= 16.8`). No
`i18next-http-backend` (catalogues are bundled and code-split), no
`i18next-browser-languagedetector` (detection is ours: saved preference →
`navigator.languages` → `en`), no ICU plugin (i18next's JSON v4 plurals
use `Intl.PluralRules`). `eslint-plugin-i18next` (ISC) supplies the
`no-literal-string` gate.

## Behaviour

- Language picker in the account menu and on the landing/auth pages
  (a `Languages` icon button opening a menu of native names). Choosing one
  applies immediately, saves to `localStorage` (`watermark-pro:locale`)
  and, when signed in, to the user (`PATCH /api/me { locale }`, new; stored
  in a new nullable `locale` column on `user` via Better Auth
  `user.additionalFields`, migration generated). On sign-in the saved
  locale wins over the browser.
- `<html lang>` and `dir` follow the locale; `ar` sets `dir="rtl"`.
- Every user-visible string in `src/client` comes from the catalogue:
  JSX text, `aria-label`s, `title`s, placeholders, `alt`s, toast and error
  messages, select options, the token hint, the filters' labels, the
  `describeSpec`/`describePlacement` sentences, document titles.
  Exceptions, listed in the ESLint config: brand name "Watermark Pro",
  font family names, icon names, token literals (`{date}`), file
  extensions, URLs, and test files.
- Formatting through the active locale: `format-date.ts` and
  `format-bytes.ts` take the locale from the i18n instance
  (`Intl.DateTimeFormat(locale, …)`, `Intl.NumberFormat(locale, { style:
'unit', unit: 'megabyte' })`); `resolveTextTokens` receives the locale
  for `{date}`/`{time}`/`{taken}` (a stamp on a photo follows the user's
  language).
- API errors: the Worker returns codes (unchanged); the client maps code →
  key in `lib/errors.ts` (already a mapping; it becomes `t(`errors.${code}`)`).
  Worker-rendered text that reaches users (verification and invitation
  emails, the share page's `<title>`) stays English in this milestone;
  record it in PLAN §4 as the next step (needs the locale on the server
  side of each flow).
- Pluralisation via `count` and `_one`/`_other` keys (plus `_zero`, `_few`,
  `_many` for `ru`, `ar`); every plural key must exist in every language
  with the forms `Intl.PluralRules(locale).resolvedOptions().pluralCategories`
  requires (the completeness test checks this).

## Right-to-left

- Tailwind: replace physical utilities with logical ones across
  `src/client` (`ml-`→`ms-`, `mr-`→`me-`, `pl-`→`ps-`, `pr-`→`pe-`,
  `left-`→`start-`, `right-`→`end-`, `text-left`→`text-start`,
  `rounded-l-`→`rounded-s-`, `border-l-`→`border-s-`, `space-x-` →
  `gap` in flex parents) with a one-off `scripts/logical-utilities.mjs`
  sweep (commit the script; run it once; delete it after review is a
  choice — keep it, it is the record). Add an ESLint restriction
  (`no-restricted-syntax` on JSX class strings matching
  `/\b(ml|mr|pl|pr|left|right|text-left|text-right)-/`) so physical
  utilities cannot creep back; exceptions for the editor overlays, where
  left/right are geometric, via a `/* physical: geometry */` comment and
  a §9 row.
- Icons that imply direction (`ChevronRight`, `ArrowLeft`, undo/redo)
  get `rtl:-scale-x-100` where the meaning is directional, not where it
  is fixed (a "rotate right" icon stays).
- Sliders, the crop and mark overlays, and keyboard arrows keep physical
  behaviour (arrow-left moves left in both directions of text).
- Screenshots for `ar` at three widths are part of the certification and
  reviewed for mirrored layouts and clipped text.

## Catalogue layout

`src/client/locales/<locale>/common.json` — one namespace, nested by
area (`shell`, `auth`, `library`, `designer`, `editor`, `bulk`, `gallery`,
`shares`, `admin`, `video`, `documents`, `verify`, `errors`, `tokens`,
`filters`, `a11y`). English is the source of truth and is typed:
`src/client/i18n/resources.d.ts` declares `CustomTypeOptions` with
`resources: { common: typeof en }`, so `t('editor.tabs.adjust')` is
checked by `tsc` and a typo fails the type gate. Other locales are loaded
lazily: `import.meta.glob('../locales/*/common.json')` and
`i18n.addResourceBundle` on switch; `en` is bundled with the app.

`src/client/i18n/index.ts` creates the instance (`initReactI18next`,
`fallbackLng: 'en'`, `interpolation.escapeValue: false` because React
escapes, `returnNull: false`), exports `detectLocale()`, `setLocale()`,
`useLocale()`, `isRtl(locale)`. `main.tsx` awaits `initI18n()` before
rendering so the first paint is in the right language.

## Gates

- ESLint `i18next/no-literal-string` on `src/client/**/*.tsx` with
  `markupOnly: false`, `ignoreAttribute: ['className', 'to', 'href',
'type', 'role', 'name', 'id', 'data-testid', 'value', 'variant', 'size',
'side', 'mode', 'kind', 'format', 'aria-hidden']`, `ignore` list for the
  brand and the exceptions above. Proven to fire (a drill).
- `src/client/i18n/catalogues.test.ts`: every locale has exactly the key
  set of `en` (deep), no empty strings, every `{{placeholder}}` in `en`
  appears in the translation, plural forms complete per
  `Intl.PluralRules`, no locale contains an untranslated copy of an
  English string longer than three words except keys listed in
  `SAME_AS_ENGLISH` (brand, proper nouns).
- `scripts/i18n-extract.mjs`: walks `src/client` for `t('…')` and `<Trans
i18nKey>` usages, reports keys missing from `en` and keys in `en` that
  nothing uses (dead strings); `npm run i18n:check` is part of
  `quality`. Keep it simple (a regex over `t\(\s*'([^']+)'`); the typed
  resources already catch the first case at compile time, this catches
  dead keys.

## Files

New: `src/shared/locales.ts`, `src/client/i18n/{index,resources.d,use-locale}.ts`,
`src/client/locales/<12>/common.json`, `src/client/locales/GLOSSARY.md`,
`src/client/components/language-menu.tsx`, `scripts/i18n-extract.mjs`,
`scripts/logical-utilities.mjs`, `src/worker/routes/me.ts` (+ tests:
PATCH locale validates against `SUPPORTED_LOCALES`, 400 otherwise; the
session's user gets the field), migration for `user.locale`.

Modified: every `.tsx` under `src/client` (strings), `format-date.ts`,
`format-bytes.ts`, `errors.ts`, `spec-tokens.ts`, `watermark.ts`
(`resolveTextTokens(text, context, locale)`), `main.tsx`, `index.html`
(`lang` set at boot), `eslint.config.mjs`, `package.json` scripts,
`vitest.config.ts` (the jsdom setup initialises i18n with `en`),
`e2e/support.ts` (`createWorkspace` accepts a locale; a new
`e2e/locale.spec.ts`), `scripts/screenshots.mjs` (an `ar` pass at three
widths under `docs/screenshots/m18/ar/`), README, CHANGELOG, PLAN §4
(review status per language), §9 (the physical-utility exceptions).

## Tests

Unit: `detectLocale` precedence (saved → navigator → en; unsupported
`navigator.languages` entries skipped; `pt` matches `pt-BR`); `isRtl`;
catalogue completeness; formatting helpers in `de` (comma decimal) and
`ar` (Arabic-Indic digits are not forced: use `numberingSystem: 'latn'`
for file sizes and dates so numbers stay readable next to Latin file
names; assert it); `resolveTextTokens` in `de` renders `{date}` as
`6. Sept. 2026`.

Page: the language menu switches the heading of `/app/library` to Spanish
and sets `dir="rtl"` for Arabic; the choice persists across a remount;
an API error code renders its translated message.

e2e (`e2e/locale.spec.ts`, all four projects): sign up in English, switch
to Spanish in the account menu, reload, the library heading is
"Biblioteca de marcas de agua"; switch to Arabic, `html[dir=rtl]`, the
sidebar is on the right (bounding box check on desktop), axe passes;
switch back.

Red drills:

| Name                                       | Mutation                                          | Command                             |
| ------------------------------------------ | ------------------------------------------------- | ----------------------------------- |
| i18n: a hard-coded string slips into JSX   | add `<p>Hello</p>` to `app-shell.tsx`             | gate `lint` (`/no-literal-string/`) |
| i18n: a language misses a key              | delete `editor.tabs.adjust` from `de/common.json` | unit-client `catalogues.test`       |
| i18n: a placeholder dropped in translation | remove `{{count}}` from a French plural           | unit-client `catalogues.test`       |
| i18n: unsupported locale saved             | `PATCH /api/me` accepts any string                | unit-worker `me.test`               |
| i18n: RTL not applied                      | `isRtl` returns false for `ar`                    | unit-client `i18n.test`             |
| i18n: physical utility slips in            | add `ml-2` to a component                         | gate `lint`                         |
| i18n: `{date}` ignores the locale          | `resolveTextTokens` uses `undefined` locale       | unit `watermark.test`               |

## Docs

README: "Languages" section (list, how detection works, how to add a
language: copy `en/common.json`, translate, add to `SUPPORTED_LOCALES`,
run `npm run i18n:check`, add screenshots); CHANGELOG; PLAN §3.1 rows;
§4 review status; SECURITY.md: the locale value is validated server-side
against the list (no free text stored).

## Certification checklist

- [ ] gates incl. `i18n:check`; seven drills red; Lighthouse in `en` and
      `ar` for `/`, `/app/library`, `/app/editor` (mobile and desktop)
      within budget; screenshots for `en` and `ar` at three widths
- [ ] every language reviewed once by reading the library, editor and
      bulk pages in it (the agent's own read-through; note any string that
      overflowed its control and fix the layout, not the translation)
- [ ] version 1.10.0, tag, deploy, release
