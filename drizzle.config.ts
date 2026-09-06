import { defineConfig } from 'drizzle-kit'

/**
 * Migration generation only. Migrations are applied by wrangler
 * (`npm run db:migrate:local` / `npm run db:migrate:remote`) and by the
 * Workers test project, never by drizzle-kit directly.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
  strict: true,
  verbose: true,
})
