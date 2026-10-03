# Built account removal and privacy — 2026-10-03

Fresh production build passes 42 built assertions, all bundle budgets and strict
built publication. Desktop/light and actual WebKit phone/Arabic/dark deletion
journeys pass, including real personal upload/share, invalid confirmation/cancel,
server deletion, public-link 404, null session and old-credential 401. Only device
storage failure is an explicit named fixture: its prototype descriptor is saved,
invocation count asserted, and exact descriptor restored before actual storage
retry. Generic root failure/retry remains visible after login; deletion API is
not repeated. Both axe scans per journey report zero violations.

Public privacy journeys also pass on those two projects, with exact current
account/payment copy, zero axe/overflow. All retained sections were visually
reviewed. Tight Arabic region crops exclude glyph overhang; the full viewport
capture confirmed normal page gutters and unclipped text. The first phone
cleanup warning showed the login panel through its translucent background;
opaque parent surface fixed it and the current built journeys/images pass.

Initial harness receipts remain honest: JSON imports first failed collection,
instance-only failure injection missed the phone boundary, and string arrow
functions were initially uninvoked. The final prototype fixture executes and
proves its call counter on both engines. Node-only DOM/void-generic lint mistakes
were fixed without suppressions. These results do not certify full four-device
E2E, physical phones, live provider behavior, SAST or M19 completion.

`results.json` records finite report/image checksums without raw authenticated
responses, trace archives or credentials. Next: combined required gates and
remaining release/account/funding decisions. Public launch remains closed.
