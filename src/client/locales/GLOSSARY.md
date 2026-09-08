# Translation glossary (M18)

These are the product's load-bearing terms. Each must be translated **the same
way every time it appears** in a language, so the interface reads as one product
rather than a thesaurus. Decide one target word per concept before translating a
catalogue, and reuse it. When a term is an established loanword in the target
language (many of these are, in software), the loanword is usually the right
choice — consistency matters more than novelty.

Do not translate the **brand name** "Watermark Pro"; leave it verbatim in every
language. Do not translate the placeholder tokens shown in braces (`{{name}}`,
`{{count}}`, …) — keep them exactly, only moving them within the sentence as the
grammar requires.

| English term    | What it means in the app                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| watermark       | The visible/invisible mark applied to a photo; also the noun for a saved design.          |
| preset          | A saved, reusable watermark design in the library.                                        |
| mark            | One element drawn onto a photo (text, logo, shape, QR); a watermark is one or more marks. |
| layer           | One mark in a stack of marks on the same photo.                                           |
| smart placement | The mode that analyses the photo and chooses where the mark goes.                         |
| contrast        | Auto/fixed choice of light vs dark ink so the mark stays legible.                         |
| tile            | Repeating the mark across the whole photo in a grid.                                      |
| batch           | Processing many photos at once (the Bulk tool).                                           |
| gallery         | The store of the user's watermarked photos inside the app.                                |
| share link      | A public URL that shows selected gallery photos to people without an account.             |
| organization    | A workspace/team that owns presets, photos and members.                                   |
| member          | A person who belongs to an organization.                                                  |
| owner           | The organization role with full control (RBAC).                                           |
| admin           | The organization role below owner; manages members and content (RBAC).                    |
| editor          | The organization role that can create and apply watermarks but not manage members (RBAC). |
| viewer          | The read-only organization role (RBAC).                                                   |
| editor (tool)   | The single-photo editing screen — distinct from the _editor role_; context decides.       |
| bulk            | The many-photos tool.                                                                     |
| documents       | The PDF-watermarking tool.                                                                |
