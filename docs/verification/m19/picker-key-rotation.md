# Picker key retirement and runtime configuration

Updated 2026-09-09. This records credential remediation, not full application
deployment or domain-cutover certification.

A previously committed Google Picker browser API key was retired. Its original
registration was restricted to Picker and the configured app/development
websites. A distinct replacement was created with Picker-only API scope and
the production, local-development and Google-hosted Picker-frame referrers.
Google documents the required iframe referrer in its
[web Picker integration guide](https://developers.google.com/workspace/drive/picker/guides/web-picker).

The replacement was saved only in ignored local configuration and as an encrypted
`GOOGLE_PICKER_API_KEY` Cloudflare Worker binding. The existing deployment's
configuration endpoint was checked without printing the value and matched the
replacement. The old registration was then deleted; Google's deleted-credential
inventory confirmed the original key and deletion date. GitHub's alert was
resolved as **revoked**, and that state was independently read back.

The two confidential account-sign-in clients are also installed using encrypted
Worker bindings: Google client ID/secret and Microsoft client ID/secret/tenant.
The existing authentication and Turnstile secrets were preserved. Public cloud
client identifiers, site keys, URLs and email settings remain ordinary
configuration; they do not grant access to a user's cloud files.

No key value is retained in current source or the scanner registry. An exact
immutable historical fingerprint and SHA-256 digest identify only the retired
key. The stronger publication gate does not honor generic repository ignore
files: it inspects original bytes for configured credentials and archive safety,
then masks that exact digest only in historical scan copies. Working, index and
built artifacts receive no retirement exception. The audit reports historical
masking and accepted findings separately.

The current source audit passed with four configured private values compared,
five retired-key occurrences recognized in historical copies and one exact
historical finding accepted. Current credential matches still fail even within
historical archives. Fifteen regression tests cover these boundaries, including
an actual Gitleaks behavior that otherwise also loads a repository-local ignore
file despite an explicit alternate ignore path.

Only credential bindings changed on the existing Worker during remediation.
Database migrations, the Lumafoil application upload, final hosted OAuth/cloud
journeys and Google branding re-verification remain separate release gates.
