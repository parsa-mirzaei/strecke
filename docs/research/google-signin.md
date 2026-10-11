# Research: an app-created sheet via Google sign-in (no implementation)

Round 4, slice 6. **Question:** with one sign-in and the narrowest scope, can the static PWA create the learner's spreadsheet with all tabs and headers, and later read and write it, so no template copy and no "Publish to web" step are needed? This page compares that route with the Apps Script alternative and gives a recommendation. Nothing here is built.

**Sources.** Google's developer and help pages, researched on 2026-10-11. The build container could not open google.com domains directly, so the facts were taken from search-engine summaries of the cited official pages. Each needs one human check against the live page before a build decision: Google changes OAuth policy and quotas without notice.

## 1. Can it be done with `drive.file`?

**Yes, for a sheet the app creates itself.**
- `drive.file` is listed as **Recommended** and **Non-sensitive**. It grants access only to "the specific Google Drive files you use with this app" ([Choose Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes); [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).
- `spreadsheets.create` accepts `drive.file` ([spreadsheets.create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create)). One `batchUpdate` can then add the tabs (Words, Inbox, Meta), the header rows, the header notes and the dropdown validations ([Create and manage spreadsheets](https://developers.google.com/workspace/sheets/api/guides/create)).
- **Reading and appending later.** The app can keep reading and appending to *that* file with the same scope, because the app created it.
- **An existing sheet.** `drive.file` cannot list or open a sheet the app did not create. To adopt a learner's existing list, Google recommends `drive.file` together with the **Google Picker**: the learner picks the file once, which grants the app access to it ([Choose Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)). Listing all spreadsheets needs a restricted scope, which is out of the question.
- **Not wanted.** The broader `spreadsheets` scope is **sensitive** (it reads all of the learner's sheets).

## 2. Verification and consent screen

| Situation | What Google says |
| --- | --- |
| Only non-sensitive scopes (`drive.file`, plus basic identity) | No full app verification. **Brand verification** is needed to show the app name and logo on the consent screen: an automated check that often takes minutes, or a manual review of about **2–3 business days** ([Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)). A compliant result must be published within 7 days. |
| Sensitive scopes | Sensitive-scope verification: 3–5 business days by one page, up to 10 by the FAQ ([Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification); [OAuth API verification FAQs](https://support.google.com/cloud/answer/9110914)). Not needed here. |
| Restricted scopes | A third-party security assessment, several weeks ([Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)). Not needed here. |
| Publishing status **Testing** | At most **100 test users**, listed by hand. **Refresh tokens expire after 7 days**, unless only basic identity scopes are requested. Test users see a warning screen ([Manage App Audience](https://support.google.com/cloud/answer/15549945); [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)). |
| Publishing status **In production**, unverified | The hard cap of 100 users and the "unverified app" warning apply to apps requesting **sensitive or restricted** scopes ([Unverified apps](https://support.google.com/cloud/answer/7454865)). The summaries do not say these apply to a non-sensitive-only app. *Verify this before relying on it.* |

For a private learning app used by a handful of people, staying in Testing is possible, but every learner must be added by hand and sees a warning. "In production" with only `drive.file` is the clean route.

## 3. Tokens in a pure client-side PWA

- The browser route is the Google Identity Services **token model**. It issues **access tokens only, no refresh token**, and a token is "not stored by the OS or browser" ([Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model); [Migrate to Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis)).
  - The documented example has `expires_in: 3599`, about one hour. The migration guide warns tokens may be shorter-lived, so read `expires_in` at runtime.
  - A new token comes from `requestAccessToken()`, which Google advises calling from a user gesture such as a button press. Automatic background refresh "is not supported".
  - The 7-day refresh-token limit of Testing status therefore does not bite the browser flow, because there is no refresh token. But there is also no unattended access.
- **What that means for Strecke:**
  - **Reads** (sync on return) need a valid token. After about an hour the app needs one tap ("Reconnect to Google") before it can read again. A silent re-grant may work when the Google session is active, but Google documents the user-gesture path; check it on the phone.
  - **Offline-queued writes** (if the app ever writes, for example a "skip" back to the sheet): they stay queued in IndexedDB until the learner is online *and* has a fresh token, then flush idempotently by event id. Nothing is lost; the cost is one tap.
  - In the current design (D49) the app never writes to the sheet, so only reads would need the token.
- **A refresh token would need a server.** Avoiding the hourly tap needs the authorization-code flow with a server holding a client secret. That is ruled out by "no server" (D49).

## 4. Who owns the Client ID in an open-source app

- A browser app is a **public client**. It has a client ID but **no client secret**. The client ID is an identifier, not a credential, and consent is still the user's ([Setting up OAuth 2.0](https://support.google.com/googleapi/answer/6158849); [Manage OAuth Clients](https://support.google.com/cloud/answer/15549257)).
- The client is locked to **Authorized JavaScript origins** registered in Cloud Console: exact origins, no wildcards and no paths ([Setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)).
- **Ownership.** The product owner creates one Google Cloud project and one OAuth client for the official GitHub Pages origin. The client ID may sit in the public repo: it is not a secret, and the origin lock stops others using it from their sites.
- **Forks.** A fork on another origin (`someone.github.io`) cannot use that client. Forks must create their own Cloud project and client and put their client ID into configuration. Document it as a 10-minute step for forkers, and keep the published-CSV route (D56) as the zero-setup fallback.

## 5. What the owner would do in Google Cloud Console

Only a human can do these, signed in as the owner. An estimate is about 30–45 minutes of clicking, plus Google's review time.

1. Create a Google Cloud project, for example "Strecke".
2. Enable the **Google Sheets API**, the **Google Drive API** (needed only for the Picker / `drive.file` file access) and the **Google Picker API** if adopting existing sheets.
3. Configure the OAuth consent screen (Google Auth Platform): app name, support email, the app's home page (the GitHub Pages URL), a privacy policy page (a short page in the repo is enough) and the authorized domain. Audience: **External**.
4. Add the scope `.../auth/drive.file` (plus `openid`/`email` only if sign-in identity is wanted).
5. Create an **OAuth client ID** of type *Web application*, with Authorized JavaScript origin `https://<owner>.github.io`, and the preview origin if it is different.
6. If adopting existing sheets: create an **API key** restricted to the Picker API and to the same HTTP referrer.
7. Publish the app (In production) and submit **brand verification**: minutes when automated, about 2–3 business days with manual review.
8. Hand the client ID (and Picker key) to the build as configuration. These are not secrets, but by the repo's own privacy rule they are kept out of the repo until the owner decides otherwise.

## 6. Quotas

- **Sheets API:** 300 read and 300 write requests per minute per project; **60 read and 60 write per minute per user per project**. There is no daily cap while within those, and the API returns HTTP 429 above them ([Usage limits](https://developers.google.com/workspace/sheets/api/limits)). The page says charges for exceeding quota are planned for later in 2026; check before launch.
- Strecke's usage is a few requests per sync, so these are not a concern.

## 7. Comparison

| | Published CSV (built, D56) | Google sign-in, `drive.file` (researched) | Apps Script web app + token (D31/D45, built in core, not used) |
| --- | --- | --- | --- |
| Setup for the learner | Make or copy a sheet, Publish to web, paste the link (about 2 min, on a computer) | Tap "Sign in with Google", allow; the app creates the sheet (about 30 s, works on the phone) | Copy a sheet with its script, deploy the web app, copy the URL and token (10–15 min, error-prone) |
| Owner setup | None | Cloud project, consent screen, client ID, brand verification (about 45 min + up to about 3 business days) | None centrally; every learner deploys their own |
| Who can read the data | Anyone with the published link (that one tab) | Only the learner's Google account | Anyone with the URL and token |
| App can write (skip, keep, captures) | No | Yes, while a token is valid | Yes |
| Works offline | Yes (cached copy) | Yes (cached copy, writes queued) | Yes (cached copy, writes queued) |
| Re-authorisation | Never | One tap after about an hour when syncing | Never (until the token is rotated) |
| Existing sheet | Any sheet with a `word` column | Via Google Picker (one pick) | The sheet the script is bound to |
| Forks | Work as is | Need their own Cloud client | Work as is |
| Server to run | None | None | None (Google runs the script) |
| Main risks | Public tab; CORS of published CSV unverified; refresh delay of a few minutes | Google policy or verification changes; hourly re-consent friction; GIS behaviour in an installed PWA (popup) to be checked | Leaked token opens the sheet; Apps Script quota and latency; setup friction |

## 8. Recommendation

**Keep the published-CSV route (D56) as the default, and plan Google sign-in with `drive.file` as an optional "Create my sheet for me" path.**

Why:
- `drive.file` is non-sensitive. It avoids the 100-user cap and the warnings that sensitive scopes bring, and needs only brand verification.
- It makes the first run phone-only and private: no public link.
- It is the only route that lets the app write back (skips, captures) without a server.
- The published-CSV route stays because it needs no Cloud project and works for forks unchanged.

**Main risks to test before building:**
1. Whether the token popup works inside the **installed PWA** on Android Chrome. Google documents the browser flow; the PWA window is not covered.
2. The friction of the hourly token on return: is a silent re-grant possible, or is a tap always needed?
3. Whether "In production, unverified, non-sensitive only" really shows no warning to new users. Check in a test project.
4. Google's 2026 quota-billing change.

**Steps only a human can do:** the Cloud Console steps in section 5 (project, APIs, consent screen, client ID, origin, Picker key, publishing, brand verification), the privacy-policy page text, and the phone tests of risks 1–3.
