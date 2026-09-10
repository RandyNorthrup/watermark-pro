// Strict flat ESLint config (ESLint 10). Type-aware: every TypeScript file must
// belong to one of the tsconfig.*.json projects or the type-checked rules fail
// with "was not found by the project service" — that error is a signal to add
// the file to a project, not to disable the rule.
//
// TypeScript is pinned to 6.0.3 because every published typescript-eslint
// declares peerDependencies.typescript ">=4.8.4 <6.1.0". TypeScript 7 installs
// fine and then silently disables every type-aware rule below. Verify before
// bumping: npm info typescript-eslint peerDependencies
//
// eslint-plugin-react and eslint-plugin-jsx-a11y are deliberately absent: both
// cap their ESLint peer range at 9. See PLAN.md §3.3 for the compensating
// controls (axe in e2e, Lighthouse accessibility budget).

import js from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import i18next from 'eslint-plugin-i18next'
import { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefreshPlugin from 'eslint-plugin-react-refresh'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import { config as defineEslintConfig, configs as tseslintConfigs } from 'typescript-eslint'

// M18 "Right-to-left": physical Tailwind utilities do not mirror under
// `dir="rtl"`, so the client uses logical ones (`ms`/`me`, `ps`/`pe`,
// `start`/`end`, `text-start`/`text-end`, `border-s`/`border-e`,
// `rounded-s`/`rounded-e`). This regex matches the *physical* forms only. Each
// branch is anchored so it never fires on a logical utility or a substring of an
// unrelated class:
//   - `border-line` (colour) is excluded by the `\b` after `[lr]`;
//   - `rounded-lg`/`rounded-md`/`rounded-none` are excluded by `(?![a-z])`;
//   - `text-start`/`text-end` and `ms/me/ps/pe/start/end/border-s/border-e` are
//     simply not in any branch;
//   - inset `left/right` must carry a value (`left-3`, `right-1/2`, `left-[…]`)
//     and must not be the tail of `text-left` (the lookbehind rejects a leading
//     `-`) nor the `right` inside `to_right` in a gradient (rejects a leading
//     word char).
const PHYSICAL_TAILWIND_UTILITY =
  /\b(?:ml|mr|pl|pr)-|\btext-(?:left|right)\b|\bborder-[lr]\b|\brounded-(?:tl|tr|bl|br|[lr])(?![a-z])|(?<![\w-])-?(?:left|right)-(?:[\d.]|\[|auto|full|px)/

// Where a physical utility is genuinely spatial geometry (the editor overlays,
// and centred modals whose `left-1/2` pairs with a physical `-translate-x-1/2`),
// the line — or the line just above it — carries this marker and is exempt. The
// overlay files are additionally turned off wholesale below. See PLAN.md §9.
const GEOMETRY_MARKER = 'physical: geometry'

/** Flat-config inline plugin: fail on physical Tailwind class utilities in JSX. */
const rtlPlugin = {
  rules: {
    'no-physical-utilities': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Use logical Tailwind utilities so the layout mirrors under dir="rtl" (M18).',
        },
        schema: [],
        messages: {
          physical:
            'Physical Tailwind utility "{{match}}" does not mirror in RTL. Use the logical form ' +
            '(ms/me, ps/pe, start/end, text-start/text-end, border-s/border-e, rounded-s/rounded-e), ' +
            'or mark a genuine geometry case with a /* physical: geometry */ comment. See PLAN.md §9.',
        },
      },
      create(context) {
        const { lines } = context.sourceCode
        const isExempt = (node) => {
          const line = node.loc.start.line
          const onLine = lines[line - 1] ?? ''
          const above = lines[line - 2] ?? ''
          return onLine.includes(GEOMETRY_MARKER) || above.includes(GEOMETRY_MARKER)
        }
        const inspect = (node, value) => {
          if (typeof value !== 'string') {
            return
          }
          const found = PHYSICAL_TAILWIND_UTILITY.exec(value)
          if (found === null || isExempt(node)) {
            return
          }
          context.report({ node, messageId: 'physical', data: { match: found[0] } })
        }
        return {
          Literal(node) {
            inspect(node, node.value)
          },
          TemplateElement(node) {
            inspect(node, node.value.raw)
          },
        }
      },
    },
  },
}

export default defineEslintConfig(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.wrangler/**',
      // Ephemeral agent git worktrees: full repo copies with no node_modules of
      // their own, so linting them only produces spurious unresolved-import noise.
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
      // Disposable gate databases, scanner mirrors and red-drill checkout copies.
      // Publication policy rejects this entire directory; canonical code stays outside it.
      'temp/**',
      'worker-configuration.d.ts',
      'src/client/routeTree.gen.ts',
    ],
  },

  js.configs.recommended,

  // strictTypeChecked > strict > recommended. Includes the no-unsafe-* rules
  // that stop `any` from silently propagating through the codebase.
  ...tseslintConfigs.strictTypeChecked,
  ...tseslintConfigs.stylisticTypeChecked,

  importXFlatConfigs.recommended,
  importXFlatConfigs.typescript,
  reactHooks.configs.flat.recommended,
  reactRefreshPlugin.configs.vite,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['tsconfig.*.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
      // Virtual modules provided by workerd; they have no file on disk.
      'import-x/core-modules': ['cloudflare:workers', 'cloudflare:test'],
    },
    plugins: { unicorn },
    rules: {
      ...unicorn.configs.recommended.rules,

      // --- dead code ---
      'no-unused-private-class-members': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // Underscore prefix is the documented opt-out, e.g. (_req, res).
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],

      // --- async correctness: the most common real bug class in TS ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],

      // --- escape hatches must be justified in writing ---
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // `onClick={() => setOpen(true)}` is the idiomatic React handler; the
      // rule's other cases (returning void from a block, void in a ternary)
      // stay on.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // TanStack Router signals redirects and not-found by throwing plain
      // Response objects; those are the framework's contract, not errors.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [{ from: 'lib', name: 'Response' }],
          allowThrowingAny: false,
          allowThrowingUnknown: false,
        },
      ],

      // --- strictness beyond the presets ---
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // --- consistency ---
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Workers observability reads structured console output, so info-level
      // logging is a feature, not a leftover. Plain console.log remains banned.
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],

      // --- import hygiene ---
      'import-x/no-unresolved': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.{ts,tsx}',
            '**/test-setup.ts',
            '**/test-support/**',
            'e2e/**',
            'scripts/**',
            '*.config.ts',
            'eslint.config.mjs',
          ],
        },
      ],
      'import-x/order': [
        'error',
        {
          // Externals first, then one block of project-local imports.
          groups: ['builtin', 'external', ['internal', 'parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // --- magic numbers ---
      // Enforces the "every tunable is a named constant" rule. The ignore list
      // is the set of literals whose meaning is not improved by naming:
      // identity and zero elements, -1 for "not found", 2 for a midpoint or
      // halving, 100 for percentage conversion.
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2, 100],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],

      // unicorn defaults that fight normal code more than they help
      'unicorn/prevent-abbreviations': 'off',
      // Successor to prevent-abbreviations: renames `env` to `environment`,
      // `props` to `properties`, and so on. The Cloudflare and React
      // ecosystems use the short forms as API names, so the rule mostly
      // produces churn against vendor vocabulary.
      'unicorn/name-replacements': 'off',
      'unicorn/no-null': 'off',
      // A one-line `/** … */` is still JSDoc: editors surface it on hover and
      // TypeScript attaches it to the declaration. Turning it into `//` loses
      // that, so the rule is off.
      'unicorn/single-line-block-comment-style': 'off',

      // --- rules that conflict with Prettier; the formatter owns formatting ---
      // unicorn/number-literal-case wants uppercase hex digits and Prettier
      // rewrites them to lowercase. With both enabled, format and lint can
      // never both pass.
      'unicorn/number-literal-case': 'off',
    },
  },

  {
    // Browser-only code: globalThis lacks the Window members that TypeScript
    // puts on `window`, so unicorn/prefer-global-this produces hard type errors
    // here. It stays on for the Worker and shared code.
    files: ['src/client/**/*.{ts,tsx}'],
    rules: { 'unicorn/prefer-global-this': 'off' },
  },

  {
    // TanStack Router file routes: `__root.tsx`, `$photoId.tsx`, `_layout.tsx`
    // are the framework's naming convention, and route modules must export
    // `Route` as a named const for the generated tree to import.
    files: ['src/client/routes/**/*.tsx'],
    rules: {
      'unicorn/filename-case': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    // Localisation gate (M18): every user-visible string in a client component
    // must come from the i18next catalogue, not a JSX literal. The ignored
    // attributes are non-textual (identifiers, routing, variants); the brand
    // name is the one allowed literal. Test files are exempt (the block below
    // turns it off for them).
    files: ['src/client/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          'should-validate-template': false,
          message: 'Wrap this string in the i18next catalogue via t() — see M18.',
          'jsx-attributes': {
            include: ['alt', 'aria-label', 'placeholder', 'title'],
          },
          words: {
            // The brand name is the one allowed word; the middot is a decorative
            // separator (always in an aria-hidden span), not translatable text.
            exclude: ['Lumafoil', '·'],
          },
        },
      ],
    },
  },

  {
    // Right-to-left gate (M18): physical Tailwind utilities in a client component
    // do not mirror under `dir="rtl"`. `scripts/logical-utilities.mjs` swept the
    // existing ones to their logical equivalents; this keeps them from creeping
    // back. Geometry cases carry a `/* physical: geometry */` marker (the overlay
    // files are exempted wholesale just below). Test files are exempt in the
    // block that already turns the i18next rule off for them.
    files: ['src/client/**/*.tsx'],
    plugins: { 'watermark-rtl': rtlPlugin },
    rules: { 'watermark-rtl/no-physical-utilities': 'error' },
  },

  {
    // The editor overlays position elements by literal pixel geometry, where
    // left/right/inset are spatial and must stay physical (they track pointer and
    // keyboard coordinates, which are not mirrored). See PLAN.md §9.
    files: [
      'src/client/components/editor/crop-overlay.tsx',
      'src/client/components/editor/mark-overlay.tsx',
    ],
    rules: { 'watermark-rtl/no-physical-utilities': 'off' },
  },

  {
    // Constants modules are the one place literals belong; the rule would be
    // unsatisfiable there.
    files: ['src/shared/constants.ts', 'src/**/constants.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },

  {
    // Catalogue data tables (fonts, symbols): every entry is a literal record
    // and the numbers in it (font weights, glyph geometry) are the data.
    files: ['src/client/**/catalogue.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },

  {
    // Byte-format code (JPEG segments, PNG chunks, TIFF/Exif edits): the marker
    // bytes, chunk-type codes and field offsets are the file format itself;
    // naming every `+2`/`+4` offset would obscure, not clarify. See PLAN.md §9.
    files: ['src/client/engine/metadata/**/*.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },

  {
    // Test files: assertions and non-null access are idiomatic there, and the
    // expected values in an assertion *are* the meaning — naming them would
    // move the assertion into a constant and make the test a tautology.
    files: ['**/*.test.{ts,tsx}', '**/test-support/**', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      // Vitest fixtures are assigned in beforeEach and read by every test in
      // the file; that is the framework's documented pattern.
      'unicorn/no-top-level-assignment-in-function': 'off',
      // Tests assert on literal English; they are not localised (M18).
      'i18next/no-literal-string': 'off',
    },
  },

  {
    // Page/component tests assert on the class strings a component renders and on
    // overlay geometry; the RTL gate is for shipped components, not their
    // assertions (M18). Scoped to client `.tsx` tests, the only place the rule is
    // enabled, so the plugin is in scope to switch off.
    files: ['src/client/**/*.test.tsx'],
    rules: { 'watermark-rtl/no-physical-utilities': 'off' },
  },

  {
    // Tooling configs are pure literals; naming every port and timeout there
    // is done already via local consts, but coverage thresholds and similar
    // tables are more readable inline.
    files: ['*.config.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },

  {
    // This file is .mjs and so is not in the TypeScript program, which makes
    // the type-aware rules fail with "was not found by the project service".
    // Turning them off for .mjs is narrower than pulling JavaScript into a
    // TypeScript-only tsconfig. The syntactic rules still apply.
    files: ['**/*.mjs'],
    extends: [tseslintConfigs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    // Plain-JS service workers under public/ are not in the TypeScript program
    // (they ship as-is, no bundler), so type-aware rules cannot run on them.
    files: ['public/**/*.js'],
    extends: [tseslintConfigs.disableTypeChecked],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
)
