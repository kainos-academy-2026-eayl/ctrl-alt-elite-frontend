# Ctrl-Alt-Elite Frontend

The web frontend for Ctrl-Alt-Elite. A Node.js 22 / TypeScript Express service that serves the static pages and proxies `/api/*` requests to the backend.

| Route | What it does |
| --- | --- |
| `GET /` | Homepage ([src/views/homepage.html](src/views/homepage.html)) |
| `GET /login` | Nunjucks login page ([src/views/login.njk](src/views/login.njk)), rendered by the [server-side login controller](src/server/controllers/login.ts) |
| `GET /profile` | Read-only profile preview ([src/views/profile.njk](src/views/profile.njk)); guests are redirected to login |
| `POST /logout` | Clears the browser's login cookie and redirects to the homepage |
| `GET /register` | Registration page ([src/views/register.html](src/views/register.html)) |
| `GET /admin` | Admin dashboard shell ([src/views/admin/dashboard.njk](src/views/admin/dashboard.njk)). [adminDashboard.ts](src/controllers/adminDashboard.ts) loads live customer figures in the browser. |
| `GET /admin/customers` | Customer list shell. [adminCustomers.ts](src/controllers/adminCustomers.ts) reads `q`, `email`, `sort` and `page` from the URL and loads, searches, sorts and paginates customers from the backend. |
| `GET /admin/customers/:id` | Customer details shell. [adminCustomerDetail.ts](src/controllers/adminCustomerDetail.ts) loads the customer from the backend. |
| `GET /admin/{orders,inventory,reports,settings}` | "Coming soon" placeholders |
| `GET /unavailable` | Fallback page, served with `503`. Pages redirect here if they cannot be loaded. |
| `GET /assets/*` | Stylesheets from [src/assets/](src/assets) |
| `GET /controllers/*` | Browser scripts, compiled from [src/controllers/](src/controllers) TypeScript into `dist/public/controllers/` |
| `/api/*` | Proxied to `BACKEND_ORIGIN` |
| `GET /health` | Service status and uptime |

### Login flow

Nunjucks is registered as Express's `.njk` view engine in [src/app.ts](src/app.ts),
with templates loaded from `src/views/` and automatic HTML escaping enabled.
Controllers render templates through `res.render()`.

The login view extends [src/views/layout.njk](src/views/layout.njk), which owns
the shared head, header, main wrapper and footer. New Nunjucks pages can extend
this layout and override the title, description, styles, bodyClass, navigation,
content and scripts blocks. Pass `currentYear` when rendering for the footer.

The browser submits the login form to `POST /login` as URL-encoded form data.
The frontend controller calls `BACKEND_ORIGIN/api/auth/login` with JSON.
A successful backend response produces a `303` redirect based on its `role`:
`ADMIN` goes to `/admin` and `CUSTOMER` goes to `/`. A missing or unknown role
renders the login page with an error.
Incorrect credentials render the login page with an error and retain the email,
but never the password. Backend failures also render an error.
Login submission does not require browser JavaScript. An optional browser script
adds an eye-icon button inside the password field with a Show password / Hide
password accessible label; without JavaScript the password
stays masked and the button stays hidden.

Set `JWT_SECRET` in the frontend's private `.env` (at least 32 bytes). Keep it out
of source control and browser scripts. After the backend confirms credentials,
the frontend signs its own one-hour login cookie using the authenticated user ID.
Both the existing `{ user: { id } }` and newer `{ userId }` backend responses are
supported; the backend does not need to issue a token. On subsequent homepage
requests, the frontend verifies the cookie's HS256 signature, issuer, audience,
identity and expiry. The cookie is HttpOnly, SameSite=Lax and expires in one hour.
Production cookies require HTTPS. Invalid or expired cookies are cleared and
render guest options; personalized homepage responses are not cached.

The homepage dropdown stays at the top right, including on mobile. Guests see
Login/Register; signed-in users see My Profile/Logout with a default avatar.
The signed-in button displays the account's first and last name, saved in the
signed cookie at login; if the backend provides no name, it uses the email.
Older cookies without a name keep the Account label until the next login.
Long names are truncated visually to keep the header usable on small screens.
My Profile opens `/profile`, a small read-only preview with the signed-in name,
a default avatar and a coming-soon message. It uses the shared layout and checks
the login cookie server-side; guests and expired sessions are redirected to login.
Profile editing, uploads and settings are not implemented.
The existing dropdown supports keyboard access, Escape and outside-click closing.
Logout clears this browser's cookie only. This frontend login cookie is not a
backend API access token and cannot be used to authorize backend requests.
No profile-management pages or backend changes are included.

For your real accounts, open `http://localhost:3000` (or your configured frontend
port). Temporary test servers are not connected to your account database.

Server-side controllers live in `src/server/controllers/` and are not bundled for the
browser. Browser scripts remain in `src/controllers/`; registration still uses its
existing browser script and API proxy.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| [nvm](https://github.com/nvm-sh/nvm) | latest | Required. Manages your Node version per project. |
| Node.js | 22 | Pinned in [.nvmrc](.nvmrc). Install it with nvm, not with a system installer. |
| npm | 10+ | Ships with Node 22. |

Install nvm, then from the repository root run:

```sh
nvm install   # reads .nvmrc and installs Node 22
nvm use       # switches this shell to Node 22
```

Run `nvm use` every time you open a new terminal in this project, or configure your shell to do it automatically. Using a different Node version may cause confusing build failures.

Verify you are on the right version:

```sh
node -v   # should print v22.x.x
```

## Quick start

```sh
nvm use
npm ci             # install exact dependency versions from package-lock.json
cp .env.example .env
npm run dev        # start the service with hot reload
```

Then in another terminal:

```sh
curl http://localhost:3000/health
# {"status":"ok","uptime":1.234}
```

Use `npm ci` rather than `npm install`. It installs the exact versions recorded in `package-lock.json`, so everyone on the team runs identical dependencies. Use `npm install` only when you are deliberately adding or upgrading a package.

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `build:client` then `tsx watch src/index.ts` | Compiles the browser scripts once, then runs the service from TypeScript source and restarts on file changes. Use this while developing. |
| `npm run dev:client` | `esbuild … --watch` | Rebuilds the browser scripts whenever `src/controllers/*.ts` changes. Run it in a second terminal alongside `npm run dev`. |
| `npm run typecheck` | `tsc` and `tsc -p tsconfig.client.json` | Checks types without emitting files: the server code and tests, then the browser scripts (which use DOM types). |
| `npm run build:client` | `esbuild` | Compiles `src/controllers/*.ts` to browser JavaScript in `dist/public/controllers/`. Runs automatically before `build` and `test`. |
| `npm run build` | typecheck, `build:client`, then `esbuild` | Type-checks, compiles the browser scripts, then bundles the service into `dist/index.js` for production. |
| `npm start` | `node dist/index.js` | Runs the built output. Requires `npm run build` first. |
| `npm run lint` | `biome check .` | Lints and checks formatting/import order with [Biome](https://biomejs.dev/). Reports issues without changing files. |
| `npm run lint:fix` | `biome check --write .` | Runs Biome and applies every safe fix it can (formatting, import order, safe lint fixes). |
| `npm run format` | `biome format --write .` | Formats files with Biome only (no lint rules or import sorting). |
| `npm test` | `vitest run --passWithNoTests` | Runs the route, static asset, link and proxy tests (`*.test.ts`) with [Vitest](https://vitest.dev/). Also runs as a Husky `pre-push` hook. |

Biome is configured in `biome.json`. A [Husky](https://typicode.github.io/husky/) `pre-push` hook runs `npm test` and `npm run lint` and blocks the push if either fails; hooks are installed automatically by `npm install`.

Before pushing, run `npm run lint`, `npm test`, `npm run typecheck` and `npm run build`.

## Project structure

```
.
├── src/
│   ├── index.ts          # entry point: config, server startup, shutdown
│   ├── app.ts            # builds the Express app: routes, static folders, API proxy
│   ├── views/            # HTML pages (homepage, register, unavailable) and admin/ Nunjucks shells
│   ├── assets/           # CSS served at /assets
│   ├── server/
│   │   └── controllers/  # server-side controllers (login)
│   ├── controllers/      # browser-side TypeScript, compiled and served at /controllers
│   ├── util/
│   │   ├── apiProxy.ts   # forwards /api requests to the backend
│   │   ├── customers.ts  # customer types, query parsing and formatting (shared by controllers)
│   │   ├── customerViews.ts / adminDashboard.ts  # pure HTML rendering helpers used by the controllers
│   │   └── adminPortal.ts # admin navigation and placeholder content
│   ├── repos/            # reserved for data access code
│   └── services/         # reserved for business logic
├── test/
│   └── app.test.ts       # route, static asset, page link and proxy tests
├── .env                  # your local secrets and config (not committed)
├── .env.example          # template listing required env variables
├── .github/              # GitHub configuration and CI workflow
├── .gitignore            # files git should ignore
├── .npmrc                # pins the public npm registry for this project
├── .nvmrc                # the Node version this project uses
├── package.json          # project metadata, scripts and dependencies
├── package-lock.json     # exact dependency versions, committed
├── tsconfig.json         # TypeScript options for the server code
└── tsconfig.client.json  # TypeScript options for src/controllers (adds DOM types)
```

Generated folders — `node_modules/` and `dist/` — are ignored by git and safe to delete and regenerate.

### Why `app.ts` and `index.ts` are separate

[src/app.ts](src/app.ts) creates and configures the Express app but never starts listening. [src/index.ts](src/index.ts) reads configuration and starts the server. Keeping those responsibilities separate makes route registration independent from server startup, and lets the tests call `createApp()` directly.

## Adding a new page

Say you want a `/about` page.

**1. Create the view** at `src/views/about.html`. File names are lowercase, because Linux filesystems are case-sensitive. Reference assets and scripts with absolute paths, so they resolve whatever the page URL is:

```html
<link rel="stylesheet" href="/assets/styles.css" />
<script src="/controllers/script.js" defer></script>
```

Put page-specific CSS in `src/assets/` and browser scripts in `src/controllers/` as TypeScript (e.g. `about.ts`). Reference the compiled output with `src="/controllers/about.js"`. Browsers cannot run `.ts`, so `npm run build:client` compiles each file to `dist/public/controllers/`. Keep server-side request handlers in `src/server/controllers/`.

**2. Register the route** in [src/app.ts](src/app.ts), following the existing pages:

```ts
const ABOUT_PAGE_PATH = fileURLToPath(new URL('about.html', VIEWS_DIRECTORY));

// inside createApp()
app.get('/about', async (_req: Request, res: Response) => {
  try {
    res.type('html').send(await readFile(ABOUT_PAGE_PATH, 'utf8'));
  } catch (error) {
    console.error('Unable to load the about page:', error);
    res.redirect('/unavailable');
  }
});
```

Link to it with `href="/about"`, not `./about.html`. Views are only served through their routes.

Paths in `app.ts` use `../src/...` so they resolve both when running from source (`src/app.ts`) and from the production bundle (`dist/index.js`). Imports of TypeScript modules do not need a `.js` extension, as this project uses bundler-style module resolution.

**3. Add it to the link test** by appending the route to the page list in the `page references` test in [test/app.test.ts](test/app.test.ts), then verify:

```sh
npm test
npm run typecheck
npm run build
```

## Configuration

Environment variables are loaded from `.env` by [dotenv](https://github.com/motdotla/dotenv) at startup.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | yes | Port the service listens on. The service exits at startup if it is missing or invalid. |
| `BACKEND_ORIGIN` | yes | Origin of the backend API, e.g. `http://localhost:8080`. Requests to `/api/*` are proxied here. The service exits at startup if it is missing or invalid. |

The server binds to `0.0.0.0` so it is reachable from outside a container. Add new variables to both your `.env` and [.env.example](.env.example).

## Troubleshooting

**`Cannot find module` or unexpected type errors** — you may be on the wrong Node version. Run `nvm use`, then `rm -rf node_modules && npm ci`.

**`PORT` or `BACKEND_ORIGIN environment variable is not set`** — you have not created your `.env`. Run `cp .env.example .env` and fill in both values.

**`EADDRINUSE`** — another process is already using that port. Stop it, or change `PORT` in `.env`.

**A page redirects to `/unavailable`, or a stylesheet or script is missing (404)** — check the server log for `Unable to load ...`, and that the file name in `src/app.ts` matches the lowercase file in `src/views/` exactly.

**`npm start` fails with a missing file** — run `npm run build` first to generate `dist/`.
