# Self-hosting Lumafoil

Lumafoil's source is available under the repository's MIT license. Bundled fonts,
stickers, and other third-party assets keep their own included licenses and
notices. Preserve those notices when distributing a build. Source availability
does not include hosting, email, or provider-account costs.

## Prepare your deployment

Follow the repository installation and quality instructions first. Create your
own Cloudflare Worker, D1 database, R2 bucket, custom domain, rate-limit bindings,
and production email sender, then update `wrangler.jsonc` with those resources.
Use your own domain and provider registrations; do not reuse the original
operator's identifiers or credentials. Set `APP_URL` to the exact HTTPS origin.

Generate a private `BETTER_AUTH_SECRET` and install it as a Worker secret. Configure
the verified email sender and `EMAIL_PROVIDER=cloudflare`. Production deliberately
refuses the development console mailbox. Apply all database migrations before
starting the production application. The reserved empty-account migration marker performs no data changes. Any legacy
workspace split requires a separate, explicitly targeted operator command.

Account OAuth is optional. For each enabled provider, register a confidential Web
client with callbacks at your origin plus `/api/auth/callback/google` or
`/api/auth/callback/microsoft`. Install the paired account client ID and secret
listed in `.dev.vars.example`. Cloud-file integrations use different registrations
and are configured separately. If Turnstile is enabled, register your hostname
and configure both its public and secret keys.

## Create the first owner without opening registration

Run the operator bootstrap only against your intended, migrated database. It
executes one conditional SQL insert and refuses a database that already contains
any account. It does not overwrite, promote, or reset existing users. No public
bootstrap endpoint, temporary public-signup switch, password, or bearer token is
created.

Inspect the CLI first:

```shell
node scripts/bootstrap-owner.mjs --help
```

Then supply your own database, email, and display name. For a remote production
database, the command shape is:

```shell
node scripts/bootstrap-owner.mjs --database YOUR_DATABASE --target remote --environment production --email YOU@YOUR_DOMAIN --name "Your Name"
```

For local development, choose `--target local` explicitly. The remote example is
an operator procedure; it has not been executed against the original production
database. The bootstrap's SQL behavior is verified against SQLite and the
resulting verification/password flow is tested through real Better Auth.

The inserted owner starts **unverified and without a password**. Mailbox control
is required before access:

1. Open your site's `/check-email?email=YOUR_URL_ENCODED_EMAIL` page and select
   **Resend verification email**.
2. Follow the message received at your own mailbox. Verification signs you in;
   the app creates your private workspace.
3. To use a password, open **Forgot password**, request a reset for that same
   address, and choose your password through the emailed link. A credential
   account is created through Better Auth's normal reset flow.
4. Alternatively, while signed in, open **Account settings** and explicitly link
   Google or Microsoft using the same email. Subsequent sign-in uses that linked
   provider without another invitation.

The bootstrap does not send email itself and does not print credentials. Configure
and test production email before this step. If the bootstrap refuses an existing
database, recover the existing owner through the normal email/password process;
do not delete accounts or disable the admission gate to get around it.

## Invite users and verify isolation

Open **Invite people** to send an email-bound invitation or copy your unique,
revocable invitation link. Invitees receive their own accounts and personal
workspaces. These actions share no photos or presets. Create a separate workspace
and use its Members screen only when intentional collaboration is wanted.

The owner's Administration page shows registered and verified account totals and
pending/accepted invitation counts. Confirm an ordinary test account cannot open
the global-count API or another account's gallery/library. Test verification mail,
password reset, sign-out, an offline edit/reconnect cycle, and each enabled OAuth
provider on your deployed origin before inviting others. Full deployment checks
remain the operator's responsibility; a local build alone is not hosted proof.

See [Private accounts](private-accounts.md) for invitation limits, token handling,
account linking, and migration constraints.

## Existing deployments and one site administrator

Site administration is a singleton. Private workspace ownership does not make a
user a site administrator. The application cannot promote another administrator,
demote or delete its anchored owner, or rewrite another account's email/password.
Use normal mailbox-based recovery and explicit provider linking.

For an occupied pre-singleton database, migration 0010 requires exactly one
existing administrator. If there are none or several, first verify the intended
owner's identity privately, back up the database, and select that verified user
explicitly with `bootstrap-owner.mjs --existing-user-id` plus the same explicit
database/target flags. This operation preserves accounts/content and changes only
site roles. After the singleton migration, the anchor cannot be transferred by
this command; an ownership change requires a separately reviewed operator
migration. Do not place live user/database identifiers in public documentation,
SQL files, screenshots, or verification artifacts.

An old shared workspace may be split only when the deployment has no saved
content or sessions and its identity/member counts match the operator's explicit
inputs. Inspect `node scripts/split-empty-workspace.mjs --help`; the command uses a
private temporary migration so no deployment-specific identifier is embedded in
public migrations. Never bypass its empty-state guard to migrate populated data.
