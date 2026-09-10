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

The inserted account has the global **Owner** role and starts **unverified and
without a password**. Bootstrap does not create an Admin account. Global Owner
is separate from ownership of an individual workspace. Mailbox control is
required before access:

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

## Existing deployments and the anchored site owner

The global Owner is a singleton anchored to one account. An Admin is not that
owner, and private workspace ownership grants neither global role. Normal
account-management operations cannot demote or delete the anchored owner or
rewrite another account's email/password. Use normal mailbox-based recovery and
explicit provider linking.

On an existing deployment already anchored by historical migration 0010, the
`0012_site_roles.sql` upgrades the anchored account from the former `admin` role
to `owner` and normalizes the other existing accounts to `user`. The anchor,
account identities, workspace memberships, and saved content remain intact.

The bootstrap tool also accepts `--existing-user-id` with the same explicit
database/target flags for a deliberately prepared database **before its owner
guards are installed**. The target must already exist and have verified email.
The single SQL update assigns that account `owner` and every other account
`user`, leaving no global admins. It preserves account identities, workspace
roles, and content. Back up the database, privately verify the chosen identity,
and review the compatible migration path before using this form.

Do not use this current selector as a generic repair before historical migration
0010: that immutable migration expects the old `admin` representation, while the
selector now writes `owner`. An occupied deployment that has not reached the
historical anchor requires a separately reviewed migration procedure. After an
anchor exists, this command cannot transfer ownership; a transfer requires its
own reviewed operator migration. Keep live identities and database identifiers
out of public documentation, SQL files, screenshots, and verification artifacts.

An old shared workspace may be split only when the deployment has no saved
content or sessions and its identity/member counts match the operator's explicit
inputs. Inspect `node scripts/split-empty-workspace.mjs --help`; the command uses a
private temporary migration so no deployment-specific identifier is embedded in
public migrations. Never bypass its empty-state guard to migrate populated data.
