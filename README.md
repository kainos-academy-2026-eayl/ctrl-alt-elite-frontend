# Ctrl-Alt-Elite Frontend

The web frontend for Ctrl-Alt-Elite. A Node.js 22 / TypeScript Express service that serves the static pages and proxies `/api/*` requests to the backend.

| Route | What it does |
| --- | --- |
| `GET /` | Homepage ([src/views/homepage.html](src/views/homepage.html)) |
| `GET /register` | Registration page ([src/views/register.html](src/views/register.html)) |
| `GET /unavailable` | Fallback page, served with `503`. Pages redirect here if they cannot be loaded. |
| `GET /assets/*` | Stylesheets from [src/assets/](src/assets) |
| `GET /controllers/*` | Browser scripts from [src/controllers/](src/controllers) |
| `/api/*` | Proxied to `BACKEND_ORIGIN` |
| `GET /health` | Service status and uptime |

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
| `npm run dev` | `tsx watch src/index.ts` | Runs the service from TypeScript source and restarts on file changes. Use this while developing. |
| `npm run typecheck` | `tsc` | Checks types without emitting files. |
| `npm run build` | `tsc` then `esbuild` | Type-checks, then bundles the service into `dist/index.js` for production. |
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
│   ├── views/            # HTML pages (homepage, register, unavailable)
│   ├── assets/           # CSS served at /assets
│   ├── controllers/      # browser-side JavaScript served at /controllers
│   ├── util/
│   │   └── apiProxy.ts   # forwards /api requests to the backend
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
└── tsconfig.json         # TypeScript compiler and type-checking options
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

Put page-specific CSS in `src/assets/` and browser scripts in `src/controllers/`.

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
