# Ctrl-Alt-Elite Frontend

The web frontend for Ctrl-Alt-Elite. A Node.js 22 / TypeScript Express service that serves the static pages and proxies `/api/*` requests to the backend.

| Route | What it does |
| --- | --- |
| `GET /` | Homepage ([src/views/homepage.njk](src/views/homepage.njk)). Currently lists temporary products from [src/data/sampleProducts.ts](src/data/sampleProducts.ts) until the product ticket is complete. |
| `GET /login` | Nunjucks login page ([src/views/login.njk](src/views/login.njk)), rendered by the [server-side login controller](src/server/controllers/login.ts) |
| `GET /register` | Registration page ([src/views/register.njk](src/views/register.njk)) |
| `GET /basket` | Basket page ([src/views/basket.njk](src/views/basket.njk)). Items are stored by the backend basket API (`/api/baskets`, via the `/api` proxy); [src/controllers/basket.ts](src/controllers/basket.ts) keeps only the basket id in `sessionStorage`. |
| `GET /admin` | Admin dashboard shell ([src/views/admin/dashboard.njk](src/views/admin/dashboard.njk)). [adminDashboard.ts](src/controllers/adminDashboard.ts) loads live customer figures in the browser. |
| `GET /admin/customers` | Customer list shell. [adminCustomers.ts](src/controllers/adminCustomers.ts) reads `q`, `email`, `sort` and `page` from the URL and loads, searches, sorts and paginates customers from the backend. |
| `GET /admin/customers/:id` | Customer details shell. [adminCustomerDetail.ts](src/controllers/adminCustomerDetail.ts) loads the customer from the backend. |
| `GET /admin/settings` | Settings page ([settings.njk](src/views/admin/settings.njk)): profile (name, email, role) rendered by the server, a dark mode toggle and dashboard widget choices saved in the browser's `localStorage` ([adminPreferences.ts](src/controllers/adminPreferences.ts) applies them on every admin page), and system information whose backend and database status [adminSettings.ts](src/controllers/adminSettings.ts) loads in the browser. |
| `GET /admin/support` | Support ticket list shell ([support.njk](src/views/admin/support.njk)). [adminSupport.ts](src/controllers/adminSupport.ts) loads every ticket (ID, customer name, subject, category, status, date created) and applies `q` (ticket ID, customer name or subject), `status` and `category` from the URL. |
| `GET /admin/support/:id` | Ticket details (subject, category, description, customer, date created, status) with a status form and a comment thread (refreshes every 10 seconds; read-only once the ticket is closed). [adminSupportDetail.ts](src/controllers/adminSupportDetail.ts) loads the ticket, saves status changes and posts replies. |
| `GET /admin/{orders,inventory,reports}` | "Coming soon" placeholders |
| `GET /account/support` | Customer support dashboard shell ([support.njk](src/views/support.njk)): lists the customer's tickets with ID, subject, status and created date. Requires a login cookie, otherwise redirects to `/login`. |
| `GET /account/support/new` | Create-ticket form (subject, category, description) with validation that blocks empty submissions |
| `GET /account/support/:id` | Ticket details (subject, description, created date, status) and a comment thread to reply to support (refreshes every 10 seconds; read-only once the ticket is closed). [support.ts](src/controllers/support.ts) loads and submits tickets in the browser. |
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
stays masked and the button stays hidden. This verifies credentials only; it
does not establish a persistent session or protect the homepage.

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
│   ├── views/            # Nunjucks page templates and admin/ shells
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

**1. Create the view** at `src/views/about.njk`. File names are lowercase, because Linux filesystems are case-sensitive. Reference assets and scripts with absolute paths, so they resolve whatever the page URL is:

```html
<link rel="stylesheet" href="/assets/styles.css" />
<script src="/controllers/script.js" defer></script>
```

Put page-specific CSS in `src/assets/` and browser scripts in `src/controllers/` as TypeScript (e.g. `about.ts`). Reference the compiled output with `src="/controllers/about.js"`. Browsers cannot run `.ts`, so `npm run build:client` compiles each file to `dist/public/controllers/`. Keep server-side request handlers in `src/server/controllers/`.

**2. Register the route** in [src/app.ts](src/app.ts), following the existing pages:

```ts
// inside createApp()
app.get('/about', (_req: Request, res: Response) => {
  try {
    res.type('html').send(adminTemplates.render('about.njk'));
  } catch (error) {
    console.error('Unable to load the about page:', error);
    res.redirect('/unavailable');
  }
});
```

Link to it with `href="/about"`, not `./about.njk`. Views are only served through their routes.

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
