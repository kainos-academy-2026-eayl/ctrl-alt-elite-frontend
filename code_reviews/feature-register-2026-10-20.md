# Review: feature/register – registration page and /api proxy

---

## 🚦 Verdict

| | |
|---|---|
| **Status** | 🟡 Amber |
| **Summary** | Functional registration page and backend proxy with good test coverage; no confirmed high-severity defects, but the proxy lacks a timeout and hop-by-hop header handling, and the register HTML is malformed. |
| **Large-diff mode** | No |
| **Coverage confidence** | Complete |
| **Coverage note** | `diffTruncated` is false; the full unified diff (10 files, 573 insertions, 25 deletions) was reviewed. |
| **Branch** | `feature/register` → `origin/main` |
| **Date** | 2026-10-20 |

---

## 📋 Change summary

Adds a Register page (`WebPage/RegisterPage/`) with client-side validation (email format, password ≥ 8 chars with a digit and one of `@ £ $ % &`, confirmation match) that POSTs to `/api/auth/register`. The Express app now takes a `backendOrigin` argument, mounts a new fetch-based reverse proxy (`src/util/apiProxy.ts`) at `/api`, and serves the register page assets. `src/index.ts` requires and validates a new `BACKEND_ORIGIN` env var. Adds `npm test` and an integration test suite covering routes, static assets and proxy behaviour.

---

## 🔍 Findings

### 🔴 High

No high severity findings.

### 🟡 Medium

1. **No upstream timeout in the proxy** – `src/util/apiProxy.ts`: `fetch` has no `AbortSignal.timeout(...)`. A hung backend keeps the client request and the upstream socket open indefinitely, which can exhaust resources. Add a timeout and return 504 on abort.
2. **Hop-by-hop request headers are forwarded** – `src/util/apiProxy.ts`: only `host`, `connection` and `content-length` are skipped. `transfer-encoding`, `keep-alive`, `upgrade`, `te`, `proxy-authorization` etc. are passed through. With a streamed body and `duplex: 'half'` a client-supplied `transfer-encoding` can conflict with what undici sets. Skip the standard hop-by-hop set. Consider also setting `x-forwarded-for`/`x-forwarded-proto` so the backend can see the real client.
3. **Malformed HTML** – `WebPage/RegisterPage/Register.html`: nested/duplicate `<html>` opening tags (the IE conditional comments plus `<html>`), an extra stray `</div>` after the container is closed, and a duplicate `</HTML>` after `</html>`. Browsers will recover, but this is invalid and may produce inconsistent DOM. Remove the legacy IE boilerplate and the extra tags.
4. **Unused `config/default.json`** – no code reads `backendOrigin` from it (`src/index.ts` uses `process.env.BACKEND_ORIGIN`). Either wire it up or remove it to avoid two conflicting sources of truth.
5. **Client-only password policy and plain-HTTP backend default** – password rules live only in `register.js` (and `minlength` in HTML); confirm the backend enforces the same policy. `.env.example` defaults the backend to `http://`; passwords are proxied in clear text, so production must use `https://` for `BACKEND_ORIGIN`.

### 🔵 Nitpick

- `src/app.ts`: the diff adds semicolons to every existing line, producing noise unrelated to the feature (and `src/index.ts` remains semicolon-free). Keep style changes in a separate commit or follow one convention.
- `src/app.ts`: the `/register` handler logs "Unable to load the homepage" (copy/paste); should say "register page".
- `WebPage/RegisterPage/register.js`: `areAllInputsValid()` is evaluated before the individual checks and then largely duplicates them; the flow could be simplified (run field checks, then `checkValidity`). An empty email shows "valid email" instead of the native "required" message because the email check runs first.
- `WebPage/RegisterPage/register.js`: `firstName`/`lastName` accept whitespace-only values (`required` only checks non-empty); consider `trim()`. `API_BASE_URL` and `submitButton` constants are declared mid-file; move to the top.
- `WebPage/RegisterPage/register.css`: `.login-link` styles are unused (no matching markup); global `label`/`input` selectors may leak if the stylesheet is later reused.
- `src/app.ts`: `/register.css` and `/register.js` are served from the site root via a second `express.static`, which also exposes `/Register.html` directly; fine, but intentional-ness should be confirmed.
- `test/app.test.ts`: no tests for client-side validation logic in `register.js`; consider extracting validators for unit testing. The proxy 502 test is good; a timeout test would be needed once finding 1 is addressed.

---

## 🗂 Files reviewed

<details>
<summary><strong>10 files changed</strong></summary>

| File | Stat |
|---|---|
| `.env.example` | +1 |
| `WebPage/RegisterPage/Register.html` | +87 |
| `WebPage/RegisterPage/register.css` | +102 |
| `WebPage/RegisterPage/register.js` | +119 |
| `config/default.json` | +3 |
| `package.json` | +1 |
| `src/app.ts` | +55 -… (mostly semicolon churn) |
| `src/index.ts` | +13 -… |
| `src/util/apiProxy.ts` | +47 |
| `test/app.test.ts` | +170 |

</details>

---

## 🔬 Review scope

| | |
|---|---|
| **Feature branch** | `feature/register` |
| **Base branch** | `origin/main` |
| **Merge base** | `0ecbf356c95d4d5f1a170a20ddb9ac75085b98fd` |
| **Head commit** | `2200f9d66ff0332160e7dccdca91eef2d06a1ad9` |
| **Compared refs** | `origin/main...feature/register` |
