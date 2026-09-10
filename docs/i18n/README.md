# Translation quality record (M18)

Lumafoil ships in twelve languages. English (`src/client/locales/en/common.json`)
is the source of truth; the other eleven are translated from it. There is no
human reviewer (Randy, 2026-09-06): translations are produced and checked by the
agent, and a language that does not pass is cut rather than shipped half-right.

## Process used (2026-09-08)

Each non-English catalogue was produced by a dedicated Opus-4.8 agent that:

1. Translated `en/common.json` in one pass with `locales/GLOSSARY.md` (the
   product-term glossary) and the English UI context in front of it, preserving
   every `{{placeholder}}` and `<Trans>` tag, keeping the brand name and pure
   symbol/format tokens verbatim, and using one glossary term per concept.
2. Produced the plural forms the locale's `Intl.PluralRules` requires (see the
   table below), with grammatically correct forms where the language distinguishes
   them for the counts this app renders (notably `ru` few/many and `ar`'s six).
3. Self-audited every key: placeholder and tag parity, a meaning round-trip
   (back-translation to English), glossary consistency, and label length for
   controls that truncate; fixed every key that failed.

Structural completeness is then enforced for all locales by
`src/client/i18n/catalogues.test.ts` (part of `npm run test`): the same key set
as English, no empty values, placeholder and tag parity, and complete plural forms
per `Intl.PluralRules`. `npm run i18n:check` forbids dead or missing keys. Both
run in `npm run quality`, so a regression in any catalogue fails CI.

## Status

| Locale    | Language             | Plural categories                | Result  |
| --------- | -------------------- | -------------------------------- | ------- |
| `es`      | Spanish              | one, many, other                 | shipped |
| `de`      | German               | one, other                       | shipped |
| `fr`      | French               | one, many, other                 | shipped |
| `it`      | Italian              | one, many, other                 | shipped |
| `pt-BR`   | Brazilian Portuguese | one, many, other                 | shipped |
| `nl`      | Dutch                | one, other                       | shipped |
| `ja`      | Japanese             | other                            | shipped |
| `ko`      | Korean               | other                            | shipped |
| `zh-Hans` | Simplified Chinese   | other                            | shipped |
| `ru`      | Russian              | one, few, many, other            | shipped |
| `ar`      | Arabic (RTL)         | zero, one, two, few, many, other | shipped |

**None cut.** All eleven passed the completeness test and their self-QA. To add
or re-do a language: copy `en/common.json`, translate with the glossary, keep the
plural categories `Intl.PluralRules(<locale>)` lists, add the code to
`SUPPORTED_LOCALES` (`src/shared/locales.ts`), and run `npm run quality`.

## Not yet localised (deferred; see PLAN §4)

- Date, number and file-size **formatting** follows the browser default, not the
  active locale (a focused follow-up: `format-date.ts`, `format-bytes.ts`,
  `resolveTextTokens`).
- **Error-message** text (`lib/errors.ts`) and Worker-rendered **email** text stay
  English.
