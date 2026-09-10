import {
  Crop,
  Download,
  FileText,
  FolderHeart,
  Languages,
  Link2,
  Moon,
  ScanLine,
  ShieldCheck,
  Video,
  WifiOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { APP_NAME } from '../../shared/constants'

const MAIN_FEATURES = ['marks', 'batch', 'fonts', 'stickers', 'qr', 'templates'] as const
const FEATURE_COPY = {
  marks: { title: 'landing.capabilities.marks.title', body: 'landing.capabilities.marks.body' },
  batch: { title: 'landing.capabilities.batch.title', body: 'landing.capabilities.batch.body' },
  fonts: { title: 'landing.capabilities.fonts.title', body: 'landing.capabilities.fonts.body' },
  stickers: {
    title: 'landing.capabilities.stickers.title',
    body: 'landing.capabilities.stickers.body',
  },
  qr: { title: 'landing.capabilities.qr.title', body: 'landing.capabilities.qr.body' },
  templates: {
    title: 'landing.capabilities.templates.title',
    body: 'landing.capabilities.templates.body',
  },
  editing: {
    title: 'landing.capabilities.editing.title',
    body: 'landing.capabilities.editing.body',
  },
  smart: { title: 'landing.capabilities.smart.title', body: 'landing.capabilities.smart.body' },
  video: { title: 'landing.capabilities.video.title', body: 'landing.capabilities.video.body' },
  pdf: { title: 'landing.capabilities.pdf.title', body: 'landing.capabilities.pdf.body' },
  export: { title: 'landing.capabilities.export.title', body: 'landing.capabilities.export.body' },
  gallery: {
    title: 'landing.capabilities.gallery.title',
    body: 'landing.capabilities.gallery.body',
  },
  sharing: {
    title: 'landing.capabilities.sharing.title',
    body: 'landing.capabilities.sharing.body',
  },
  offline: {
    title: 'landing.capabilities.offline.title',
    body: 'landing.capabilities.offline.body',
  },
  privacy: {
    title: 'landing.capabilities.privacy.title',
    body: 'landing.capabilities.privacy.body',
  },
  languages: {
    title: 'landing.capabilities.languages.title',
    body: 'landing.capabilities.languages.body',
  },
  theme: { title: 'landing.capabilities.theme.title', body: 'landing.capabilities.theme.body' },
} as const
const EXAMPLE_WIDTHS = { small: 480, medium: 720, full: 960 } as const
const EXAMPLE_SIZES =
  '(min-width: 1280px) 568px, (min-width: 1024px) calc((100vw - 144px) / 2), (min-width: 768px) calc((100vw - 112px) / 2), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)'
const MORE_FEATURES = [
  { key: 'editing', icon: Crop },
  { key: 'smart', icon: ScanLine },
  { key: 'video', icon: Video },
  { key: 'pdf', icon: FileText },
  { key: 'export', icon: Download },
  { key: 'gallery', icon: FolderHeart },
  { key: 'sharing', icon: Link2 },
  { key: 'offline', icon: WifiOff },
  { key: 'privacy', icon: ShieldCheck },
  { key: 'languages', icon: Languages },
  { key: 'theme', icon: Moon },
] as const

/** Concrete product capabilities, with examples drawn from Lumafoil's own tools and assets. */
export function LandingFeatures() {
  const { t } = useTranslation()
  return (
    <section
      id="tools"
      aria-labelledby="features-heading"
      className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20"
    >
      <div className="mb-12 max-w-2xl">
        <h2 id="features-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.featuresHeading')}
        </h2>
        <p className="mt-4 text-base leading-7 text-ink-muted">{t('landing.featuresIntro')}</p>
      </div>
      <div className="grid gap-14 lg:gap-20">
        {MAIN_FEATURES.map((key, index) => (
          <article
            key={key}
            className="glass-panel glass-lift grid items-center gap-7 border p-6 sm:p-8 md:grid-cols-2 md:gap-12 lg:gap-16 lg:p-10"
          >
            <div className={index % 2 === 0 ? 'md:order-2' : undefined}>
              <h3 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
                {t(FEATURE_COPY[key].title)}
              </h3>
              <p className="mt-4 text-base leading-7 text-ink-muted">{t(FEATURE_COPY[key].body)}</p>
            </div>
            <FeatureExample kind={key} />
          </article>
        ))}
      </div>
      <div className="mt-16 border-t border-line pt-12 lg:mt-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('landing.moreHeading')}
        </h2>
        <ul className="mt-9 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="glass-panel glass-lift border p-6">
              <Icon aria-hidden="true" className="mb-4 size-6 text-brand-600 dark:text-brand-300" />
              <h3 className="font-semibold">{t(FEATURE_COPY[key].title)}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{t(FEATURE_COPY[key].body)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function FeatureExample({ kind }: { kind: (typeof MAIN_FEATURES)[number] }) {
  const { t } = useTranslation()
  if (['fonts', 'stickers', 'qr', 'templates'].includes(kind)) {
    return (
      <img
        src={`/product/${kind}.webp`}
        srcSet={Object.values(EXAMPLE_WIDTHS)
          .map((width) => `/product/${kind}-${String(width)}.webp ${String(width)}w`)
          .join(', ')}
        sizes={EXAMPLE_SIZES}
        width={960}
        height={720}
        loading="lazy"
        decoding="async"
        alt={t(FEATURE_COPY[kind].title)}
        className="aspect-4/3 w-full rounded-2xl border border-line bg-surface-raised object-cover shadow-card"
      />
    )
  }
  if (kind === 'batch') {
    return (
      <div
        aria-hidden="true"
        className="bg-surface-sunken grid aspect-4/3 grid-cols-3 gap-3 overflow-hidden rounded-xl border border-line p-5 sm:p-7"
      >
        {['50% 30%', '25% 50%', '65% 45%', '40% 70%', '80% 60%', '50% 95%'].map((position) => (
          <div
            key={position}
            className="relative min-h-0 overflow-hidden rounded-md bg-stone-200 shadow-sm"
          >
            <img
              src="/photography/coast-480.webp"
              width={480}
              height={600}
              loading="lazy"
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: position }}
            />
            <span className="absolute inset-x-0 bottom-3 text-center text-[0.5rem] font-semibold tracking-[0.12em] text-white drop-shadow-md sm:text-[0.65rem]">
              {APP_NAME.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="relative aspect-4/3 overflow-hidden rounded-xl bg-stone-300">
      <img
        src="/photography/coast-840.webp"
        width={840}
        height={1050}
        loading="lazy"
        alt=""
        className="h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
      <img
        src="/brand/logo-light.svg"
        width={360}
        height={72}
        loading="lazy"
        alt=""
        className="absolute inset-x-0 bottom-10 mx-auto w-2/5"
      />
    </div>
  )
}
