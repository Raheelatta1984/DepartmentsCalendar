# Credential storage, XSS, cookies, headers and supply chain — review 2026-10-28

Repository: `Raheelatta1984/DepartmentsCalendar` · default branch `main`
Reviewed commit: `de9d2d6` (branch `arena/d1434569-departmentscalendar`)

Stack: React 19 + Vite 6 SPA (`src/`), dependency-free Node/Vercel functions
(`server/`, `api/`), Neon PostgreSQL for the shared workspace snapshot.
Classification: **server/API + browser front-end (same origin)**.

Scope of this review: can any credential in this application be read by JavaScript,
and do the controls that make such a theft useful actually hold — XSS sinks, cookie
attributes, CORS/CSRF, CSP and security headers, exposed tooling, supply chain.

---

## 1. Applicability verdict

### Tier A — credential exposure: **NOT APPLICABLE (already mitigated)**

The application does **not** put a credential anywhere JavaScript (or an injected
script) can read it:

| Control | Evidence |
| --- | --- |
| Session lives in an `HttpOnly` cookie signed server-side with an HMAC | `server/auth.mjs:10-19`, `server/auth.mjs:21-32` |
| `Secure` + `__Host-` prefix on any HTTPS deployment (prefix requires Secure, `Path=/`, no `Domain`) | `server/auth.mjs:8`, `server/auth.mjs:17-19` |
| `SameSite=Strict`, `Path=/`, `Max-Age=43200` (12 h), no `Domain` attribute | `server/auth.mjs:17-19` |
| Logout clears the same cookie name/attributes **and** the cookie is unforgeable (signature covers expiry + nonce, bound to `SESSION_SECRET` *and* to the current password) | `server/auth.mjs:15`, `server/auth.mjs:21-32` |
| Client never stores a credential: no `localStorage`/`sessionStorage` token, no IndexedDB, no `document.cookie` write, no `Authorization` header | scans §4.2 — zero matches; guard `tests/security-headers.test.mjs:183-207` |
| Fetch uses `credentials: 'same-origin'` — no `include`, no cross-origin API | `src/lib/workspace-api.ts:74` |
| No CORS grant at all on API responses, so a cross-origin page cannot read them | `tests/security-headers.test.mjs:96-118`, scan §4.2 |
| CSRF: unsafe methods require a same-origin `Origin`/`Sec-Fetch-Site`, the body must be `application/json` (forces a preflight cross-origin), and the cookie is `SameSite=Strict` | `server/app.mjs:45-51`, `server/app.mjs:146`, `server/app.mjs:20-22` |

Residual risk accepted and recorded as **Info F-9**: `checkOrigin` does not reject a
request that omits both `Origin` and `Sec-Fetch-Site`. A browser always sends
`Origin` on cross-site `POST`/`PUT`/`DELETE`, so this is not a CSRF hole; requiring
the header unconditionally would break non-browser clients (curl, scripts) for no
security gain. `checkOrigin` also runs *before* authentication, so a forged
cross-site request never reaches the session check.

No migration to a different auth transport is proposed: the current design is the
recommended end state (opaque, signed, `HttpOnly`, `__Host-` cookie + Origin check +
same-origin-only API). **Nothing in Tier A required a code change.**

### Tier B — defence in depth: **APPLICABLE — implemented**

The application serves HTML and a JSON API but shipped **no Content-Security-Policy
on any surface**, `X-Frame-Options: SAMEORIGIN`, and API responses carried only
`nosniff` + `Referrer-Policy`. See findings F-1…F-5.

### Tier C — supply chain and regression guards: **APPLICABLE — implemented**

Lockfile committed (`package-lock.json`), `npm ci` in CI, `npm audit --omit=dev`
already failing on advisories. Gaps: GitHub Actions pinned by mutable tag, no
Dependabot, no regression guard against credential storage. See findings F-6…F-8.

---

## 2. Findings

| # | Severity | Finding | Evidence | Action | Tier |
| --- | --- | --- | --- | --- | --- |
| F-1 | Medium | No `Content-Security-Policy` anywhere: `vercel.json` sends no CSP, the API sends none, the dev/preview servers sent none. The primary defence against an XSS bug stealing *use* of the session cookie was missing. | `vercel.json:11-18` (pre-change), `server/app.mjs:110-112` (pre-change) | One shared policy in `server/security-headers.mjs`; enforced on Vercel, `vite preview` and reported in dev | B |
| F-2 | Low | API responses lacked `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and any CSP; only success paths were consistent. | `server/app.mjs:110-112` (pre-change) | `apiSecurityHeaders()` applied to **every** response including 4xx/5xx | B |
| F-3 | Low | `X-Frame-Options: SAMEORIGIN` (and no `frame-ancestors`) allowed same-site framing; clickjacking a password form is a realistic UI-redress attack. | `vercel.json:14` (pre-change) | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | B |
| F-4 | Low | Dev and preview servers answered every request with `Access-Control-Allow-Origin: *` (Vite `server.cors: true`), letting any website read the bundle and the proxied dev responses. | `vite.config.ts:15` (pre-change) | `cors: false` on `server` and `preview`; the app has no cross-origin consumer | B |
| F-5 | Low | No HSTS from the application layer; only the host's default (and none for the API in a self-hosted deployment). | `vercel.json:11-18` (pre-change) | `Strict-Transport-Security: max-age=63072000; includeSubDomains` where the deployment is HTTPS (matches Vercel's existing value, so nothing is downgraded) | B |
| F-6 | Medium | GitHub Actions pinned to mutable tags (`@v4`, `@v5`, `@v3`): a moved tag executes arbitrary code with the release token. | `.github/workflows/ci.yml:22-23`, `.github/workflows/deploy.yml:19-42` (pre-change) | All 7 uses pinned to 40-char commit SHAs with a `# vX` comment | C |
| F-7 | Low | No Dependabot/Renovate, so pins and dependencies silently age into known-vulnerable versions. | repository root (pre-change) | `.github/dependabot.yml` (npm + github-actions, weekly) | C |
| F-8 | Low | Nothing prevented a future commit from putting a token into web storage; the only guard was a reviewer's memory. | `tests/` (pre-change) | `tests/security-headers.test.mjs` (static scan + key enumeration) and a CI grep step | C |
| F-9 | Info | `checkOrigin` accepts a request with no `Origin` and no `Sec-Fetch-Site` when the body is JSON. | `server/app.mjs:45-51` | Accepted: browsers always send `Origin` cross-site; JSON is preflight-only cross-origin; `SameSite=Strict` is the backstop. Requiring it would break CLI/script clients. | A |
| F-10 | Info | `SameSite=Strict` means a link opened from email/chat lands signed-out (the cookie is not sent on the cross-site navigation). `Lax` is the usual default. | `server/auth.mjs:17-19` | **Deliberately kept `Strict`** — it is strictly stronger, and the Origin check means a future move to `Lax` would still be safe. Recorded as a product decision, not a defect. | A |
| F-11 | Info | Demo mode persists the seeded demo workspace in `localStorage` (`orbit.portal.state.v1`). | `src/store.tsx:103`, `src/store.tsx:220-233` | Accepted: demo-only seed data, never credentials; shared mode returns before the write (`src/store.tsx:220-225`), asserted in `tests/security-headers.test.mjs:195-210`. | A |
| F-12 | Info | No subresource-integrity hashes are required because there are **no** third-party `<script>` origins or CDN assets: the built `dist/index.html` contains only relative `/assets/*` references. | scan §4.2; `dist/index.html` | Nothing to pin. If a CDN is ever added, it needs `integrity` + `crossorigin`. | B |
| F-13 | Info | The GitHub Pages workflow (`deploy.yml`) cannot set response headers, so that static demo has no CSP. | `.github/workflows/deploy.yml` | Follow-up: use a host that supports headers (Vercel) for anything but the public browser-only demo. | B |

XSS sinks (`1.5`): **none found**. No `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`dangerouslySetInnerHTML`, `document.write`, `srcdoc`, `eval`, `new Function`,
`javascript:` URL or server-side raw-output filter exists in `src/`, `server/` or
`api/`. React escapes all interpolated values by construction, so the escaping in
this codebase is **structural**, not per-call-site. The only HTML-string sinks in the
product are file exports (CSV/ICS), which escape their own delimiters
(`src/lib/export.ts:17-28`, `src/lib/export.ts:38-39`) and never render into the page.

---

## 3. Changes in this PR

| File | Change |
| --- | --- |
| `server/security-headers.mjs` | **new.** Single source of truth for the page policy, the JSON-API policy, HSTS/Permissions/CORP/COOP values and the two appliers. |
| `server/app.mjs` | Every API response (success, 4xx, 5xx, 404) now carries `apiSecurityHeaders()`; `Cache-Control: no-store` unchanged. |
| `server/dev.mjs` | Dev server serves the same policy as `Content-Security-Policy-Report-Only` (the React Fast Refresh preamble is an inline module script that a strict `script-src 'self'` would block). |
| `vite.config.ts` | `preview` enforces the production policy; `cors: false` on dev and preview. |
| `vercel.json` | Enforced CSP (+`upgrade-insecure-requests`), HSTS, `X-Frame-Options: DENY`, CORP/COOP and an expanded `Permissions-Policy`. `Cache-Control: no-store` on `/api/(.*)` unchanged. |
| `tests/security-headers.test.mjs` | **new.** 9 tests: policy strictness, dev-vs-prod modes, `vercel.json` drift guard, headers on success and error responses, cookie attributes on login/logout (prod `__Host-` + dev fallback), foreign-origin and `Sec-Fetch-Site` rejection, credential-storage scan, storage-key allowlist. |
| `.github/workflows/ci.yml` | Actions pinned to SHAs; CI step that fails if a credential is written to web storage. `npm audit --omit=dev` kept unchanged (it already fails on High/Critical). |
| `.github/workflows/deploy.yml` | All 5 actions pinned to SHAs. |
| `.github/dependabot.yml` | **new.** Weekly npm + github-actions updates, production/dev grouping. |

### Why the policy looks like this

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
```

* `script-src 'self'` — **enforced**, no `'unsafe-inline'`, no `'unsafe-eval'`. This is
  possible because the production bundle has no inline script, no `eval`, and no
  third-party script origins (`dist/index.html` verified).
* `style-src 'unsafe-inline'` — inline **style attributes** are generated by the
  theme studio and status-colour helpers (91 call sites), not authored CSS. Moving
  them to classes would mean rewriting the theme engine; style injection cannot
  execute script. This is the one documented exception.
* `img-src ... https:` — entity logos are administrator-supplied image URLs
  (`src/pages/ThemeStudioPage.tsx:91`, rendered at `src/components/Layout.tsx:95`).
  Restricting to `'self'` would break a shipped feature; images cannot execute script.
* `connect-src 'self'` — the client fetches nothing but its own `/api/*`
  (scan: no external `fetch`/`axios` targets).

---

## 4. Verification evidence

### 4.1 Baseline (before any change), same commands as CI

```
npm run typecheck  → pass
npm test           → 39/39 tests + tenancy/leave/standup/store smokes pass
npm run build      → pass (dist/assets/index-*.js 775.95 kB)
npm run smoke      → pass, errors: 0
npm audit --omit=dev → found 0 vulnerabilities
```
Baseline was **green**; no pre-existing failures to discount.

### 4.2 Discovery scans (re-run after the changes)

```
### web-storage credential writes/reads      (no matches)
### JS-set cookies                           (no matches)
### IndexedDB / localforage                  (no matches)
### Bearer built from storage                (no matches)
### persisted state libs                     (no matches)
### tokens in URLs                           (no matches)
### DOM XSS sinks                            (no matches)
### code-execution sinks                     (no matches)
### CORS headers                             only tests/security-headers.test.mjs:58, which asserts their absence
### CDN scripts without SRI                  (no matches)
### debug tooling / swagger / graphql        (no matches)
### tracked .env files                       (none)
### tracked lockfile                         package-lock.json
### Actions pinned by tag                    (none — 7/7 pinned by SHA)
```

### 4.3 After the changes

```
npm run check      → pass (typecheck + test + build + smoke + smoke:store)
node --test        → 48 tests, 48 pass, 0 fail   (39 existing + 9 new)
npm audit --omit=dev → found 0 vulnerabilities
```

Runtime header probe, `vite preview` (production bundle, port 4173):

```
$ curl -sS -D - -o /dev/null http://127.0.0.1:4173/
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none';
  base-uri 'none'; frame-ancestors 'none'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
(no Access-Control-Allow-Origin)
```

Dev server (`npm run dev`, port 5173): the same policy as
`Content-Security-Policy-Report-Only`, plus the enforced non-CSP headers; no
`Access-Control-Allow-Origin`.

API probe (in-process handler, `NODE_ENV=production` + `PUBLIC_ORIGIN`):

```
POST /api/session   Origin: https://evil.example      -> 403
POST /api/session   Sec-Fetch-Site: cross-site        -> 403
PUT  /api/workspace Origin: https://evil.example      -> 403
POST /api/session   same origin, wrong password       -> 503 (passed CSRF, reached the DB layer; no DB in probe)
GET  /api/config    Origin: https://evil.example      -> 200 (read-only, no state change)
/docs /api/docs /swagger /swagger-ui /graphql /redoc  -> 404 404 404 404 404 404 (no exposed tooling)

GET /api/config headers:
  Cache-Control: no-store
  Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  (no Set-Cookie on a failed login; no Access-Control-Allow-*)
```

Cookie attributes are asserted in `tests/security-headers.test.mjs:120-155` rather
than by a live login, because this checkout has no Neon credentials (the local app
runs in demo mode and `/api/session` correctly answers 503):

```
__Host-orbit_session=<id>; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure
logout → __Host-orbit_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure
local dev (no HTTPS) → orbit_session=...; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200
```

Browser harness: none in this repository (no Playwright/Cypress), so CSP violations
were not checked from a browser; the policy was validated against the built
`dist/index.html` (no inline script) and by the header probes above.

---

## 5. Deferred / follow-ups

| Item | Why deferred |
| --- | --- |
| Enforcing the full CSP on the **dev** server | The React Fast Refresh preamble is an inline module script; enforcing would break HMR. Reported, not enforced; `vite preview` and Vercel enforce the identical policy. |
| Nonce/hash-based `style-src` (drop `'unsafe-inline'`) | Requires moving 91 inline style attributes into generated classes; a refactor of the theme engine, out of scope for a security patch. No script execution is possible through CSS in a modern browser. |
| Headers for the GitHub Pages demo | Static hosting cannot set response headers. Use Vercel (which has `vercel.json`) for anything but the public demo. |
| Requiring `Origin` on every unsafe request | Would break non-browser API clients; `SameSite=Strict` + JSON-only bodies already close the CSRF path. |
| Distributed session store / refresh rotation | Not applicable: the session is a stateless signed cookie with a 12 h TTL and no refresh token. Rotation = change `SESSION_SECRET` (invalidates all sessions by design, `server/auth.mjs:21-32`). |

---

## 6. Behaviour changes users will notice

**None.** No forced re-login, no cookie name change, no API contract change. The
same site keeps its session; only response headers were added and a dev-only
wildcard CORS grant was removed (the app is same-origin).
