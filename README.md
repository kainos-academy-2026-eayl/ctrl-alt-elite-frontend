# Ctrl-Alt-Elite Frontend

The web frontend for Ctrl-Alt-Elite. A Node.js 22 / TypeScript Express service that serves the static pages and proxies `/api/*` requests to the backend.

| Route | What it does |
| --- | --- |
| `GET /` | Homepage ([src/views/homepage.njk](src/views/homepage.njk)). Products come from the backend `/api/products` catalogue (via [CatalogService](src/server/services/catalog-service.ts)) and are chosen by [homepage-products.ts](src/server/services/homepage-products.ts): "Featured products" is the first six in-stock products, and a looping CSS-only conveyor shows six other in-stock products picked at random on each visit, each linking to its product page. The products listed in [src/data/hiddenProducts.ts](src/data/hiddenProducts.ts) are never shown on the homepage. |
| `GET /login` | Nunjucks login page ([src/views/login.njk](src/views/login.njk)), rendered by the [server-side login controller](src/server/controllers/login.ts). Safe `returnTo` paths return users to their intended page after login, provided the destination matches their role. |
| `GET /register` | Registration page ([src/views/register.njk](src/views/register.njk)) |
| `GET /profile` | Signed-in profile ([src/views/profile.njk](src/views/profile.njk)). [AccountController](src/server/controllers/account-controller.ts) uses [ProfileService](src/server/services/profile-service.ts) to load saved username, names, email, address and phone from authenticated `GET /api/profile`. Username is display-only; email is the read-only login identifier. Older sessions without a backend token show a sign-in notice with editing disabled. Rejected authentication clears the session and redirects to login; API outages redirect to `/unavailable`. |
| `POST /profile` | Same-origin protected form save through backend `PATCH /api/profile`. Preserves submitted values on validation/conflict errors, refreshes the displayed account name without extending login expiry, and redirects after success. Optional address/phone/username fields may be cleared; first and last names are required. |
| `GET /basket` | Basket page, rendered on the server with no client-side JavaScript: [basketRouter](src/routes/basketRouter.ts) → [BasketController](src/server/controllers/basketController.ts) → [BasketService](src/services/basketService.ts) (calls the backend `/api/baskets`) → [basket.page.ts](src/views/basket.page.ts) → [basket.njk](src/views/basket.njk). The basket id is kept in an httpOnly `basket_id` cookie. |
| `GET /products/:id` | Product page, rendered on the server with no client-side JavaScript: [ProductDetailController](src/server/controllers/productDetailController.ts) → [CatalogService](src/server/services/catalog-service.ts) (calls the backend `/api/products/:id`) → [product-detail.page.ts](src/views/product-detail.page.ts) → [product-detail.njk](src/views/product-detail.njk). Has an "Add to Basket" form; unknown products show a 404 page. |
| `GET /search?q=` | Product search, rendered on the server with no client-side JavaScript: [SearchController](src/server/controllers/searchController.ts) → [ProductService](src/services/productService.ts) (calls the backend `/api/products/search`) → [search.page.ts](src/views/search.page.ts) → [search.njk](src/views/search.njk). Results have "Add to Basket" forms and a **Filter & sort** dropdown (see below). |
| `GET /products` | Product catalogue ([product.njk](src/views/product.njk)), loaded from the backend `/api/products` by [CatalogController](src/server/controllers/catalog-controller.ts). Has the same **Filter & sort** dropdown as search, and **View details** links to each product page. |
| `POST /basket/items` | "Add to Basket" form (`productId`), then redirects to `/basket` |
| `POST /basket/items/:productId` | Quantity +/− form (`change` = `1` or `-1`), then redirects to `/basket` |
| `POST /basket/items/:productId/remove` | Remove form, then redirects to `/basket` |
| `POST /basket/checkout` | Verifies the saved basket and redirects to `/checkout` |
| `GET /checkout` | Checkout, rendered on the server with no client-side JavaScript: [checkoutRouter](src/routes/checkoutRouter.ts) → [CheckoutController](src/server/controllers/checkoutController.ts) → [CheckoutService](src/services/checkoutService.ts) (calls the backend `/api/account`, `/api/delivery-options` and `/api/orders`) → [checkout.page.ts](src/views/checkout.page.ts) → [checkout.njk](src/views/checkout.njk). Anyone without a login session sees only **Log in** (`/login?returnTo=/checkout`) and **Create an account** buttons, because orders are paid from the account's credit balance. Logged-in customers go through three steps, starting with an empty form: 1. their details and home address, 2. delivery (standard 3–5 days, express 1–2 days, or one of three collection points), 3. payment from their credit balance, then **Checkout**. |
| `POST /checkout` | Every checkout step. The form posts all fields each time (earlier steps as hidden inputs), with `action` set to `continue-to-delivery`, `edit-details`, `continue-to-payment`, `edit-delivery` or `place-order`. Postcodes must really exist: [PostcodeService](src/services/postcodeService.ts) checks them with [postcodes.io](https://postcodes.io) (free, no API key; only the postcode is sent). Customers enter their address manually; the service does not suggest unverified addresses. Email addresses and UK phone numbers are checked before the customer can continue, and again by the backend. Placing the order clears the `basket_id` cookie and redirects to the confirmation. Simultaneous submissions for one basket share the same in-process order request. |
| `GET /checkout/confirmation/:orderId` | Order confirmation ([order-confirmation.njk](src/views/order-confirmation.njk)): says the order was successful and shows the order number, items, delivery, address and remaining credit balance. Only the customer who placed the order can see it. |
| `GET /admin` | Admin dashboard shell ([src/views/admin/dashboard.njk](src/views/admin/dashboard.njk)), Admin role only. [adminDashboard.ts](src/client/adminDashboard.ts) loads live customer figures in the browser. |
| `GET /admin/customer-service` | Customer Service dashboard ([customer-service-dashboard.njk](src/views/admin/customer-service-dashboard.njk)) linking to Customers, Orders, Support Tickets and Settings. Customer Service role only; other staff are redirected to their own dashboard. |
| `GET /dashboard` | Target of the **Dashboard** option in the homepage Account menu (staff only). Redirects staff to the dashboard of their role, and visitors to `/login`. |
| `GET /admin/customers` | Customer list shell. [adminCustomers.ts](src/client/adminCustomers.ts) reads `q`, `email`, `sort` and `page` from the URL and loads, searches, sorts and paginates customers from the backend. |
| `GET /admin/customers/:id` | Customer details shell. [adminCustomerDetail.ts](src/client/adminCustomerDetail.ts) loads the customer from the backend. |
| `GET /admin/settings` | Settings page ([settings.njk](src/views/admin/settings.njk)): profile (name, email, role) rendered by the server, a dark mode toggle and dashboard widget choices saved in the browser's `localStorage` ([adminPreferences.ts](src/client/adminPreferences.ts) applies them on every admin page), and system information whose backend and database status [adminSettings.ts](src/client/adminSettings.ts) loads in the browser. |
| `GET /admin/support` | Support ticket list shell ([support.njk](src/views/admin/support.njk)). [adminSupport.ts](src/client/adminSupport.ts) loads every ticket (ID, customer name, subject, category, status, date created) and applies `q` (ticket ID, customer name or subject), `status` and `category` from the URL. |
| `GET /admin/support/:id` | Ticket details (subject, category, description, customer, date created, status) with a status form and a comment thread (refreshes every 10 seconds; read-only once the ticket is closed). [adminSupportDetail.ts](src/client/adminSupportDetail.ts) loads the ticket, saves status changes and posts replies. |
| `GET /admin/inventory` | Product list shell (menu label **Products**), Admin role only |
| `GET /admin/inventory/new` | Add-product form shell, Admin role only |
| `GET /admin/inventory/:id` | Edit-product form shell, Admin role only |
| `GET /admin/stock/dashboard` | Inventory Dashboard shell ([stock-dashboard.njk](src/views/admin/stock-dashboard.njk)), Inventory Manager (`INVENTORY_MANAGEMENT`) role only and its landing page; other staff are redirected to their own dashboard. [adminStockDashboard.ts](src/client/adminStockDashboard.ts) loads the summary cards and low-stock table from `GET /api/admin/inventory/dashboard`. |
| `GET /admin/stock` | Inventory list shell ([stock.njk](src/views/admin/stock.njk)), Inventory Manager and Admin only. [adminStockList.ts](src/client/adminStockList.ts) lists every product with name search, a status filter (`status`), a low-stock-only toggle (`low`), inline stock and threshold editing, and an out-of-stock toggle with confirmation and undo, using the `/api/admin/inventory` endpoints. |
| `GET /admin/{orders,reports}` | "Coming soon" placeholders |
| `GET /account/support` | Customer support dashboard shell ([support.njk](src/views/support.njk)): lists the customer's tickets with ID, subject, status and created date. Requires a login cookie, otherwise redirects to `/login`. |
| `GET /account/support/new` | Create-ticket form (subject, category, description) with validation that blocks empty submissions |
| `GET /account/support/:id` | Ticket details (subject, description, created date, status) and a comment thread to reply to support (refreshes every 10 seconds; read-only once the ticket is closed). [support.ts](src/client/support.ts) loads and submits tickets in the browser. |
| `GET /unavailable` | Fallback page, served with `503`. Pages redirect here if they cannot be loaded. |
| `GET /assets/*` | Stylesheets from [src/assets/](src/assets) |
| `GET /client/*` | Browser scripts, compiled from [src/client/](src/client) TypeScript into `dist/public/client/` |
| `/api/*` | Proxied to `BACKEND_ORIGIN` |
| `GET /health` | Service status and uptime |

Profile pictures are loaded, previewed, uploaded and removed by the existing
[browser script](src/client/script.ts). Uploads go through the authenticated
API proxy as raw JPG, PNG or WebP bytes (20 MiB and 16 megapixels maximum).
Picture changes are saved separately from the details form. The homepage dropdown
loads the current display name and picture, with a default avatar when no picture
is saved and an explicit notice if profile data cannot be loaded.
JavaScript is required for picture changes, but the details form works without it.
The backend profile contact-details migration must be applied before using these
fields; email cannot be changed through the profile API.

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
`ADMIN` goes to `/admin`, `CUSTOMER_SERVICE` goes to `/admin/customer-service`
and `CUSTOMER` goes to `/`. A missing or unknown role
renders the login page with an error.

Staff roles are defined in [staffRoles.ts](src/util/staffRoles.ts): each role has
a dashboard path, template and a list of permissions (`dashboard`, `orders`,
`customers`, `support`, `inventory`, `reports`, `settings`). The admin guard asks
the backend for the signed-in user's role (`/api/admin/profile`) and every
`/admin` route then checks the role's permissions, so the sidebar and the
reachable routes only include what the role may use. Adding a role (Finance,
Super Admin, ...) means adding one entry to `STAFF_ROLES`, a dashboard template
and a dashboard route. A role the portal does not know is denied.
Incorrect credentials render the login page with an error and retain the email,
but never the password. Backend failures also render an error.
Login submission does not require browser JavaScript. An optional browser script
adds an eye-icon button inside the password field with a Show password / Hide
password accessible label; without JavaScript the password
stays masked and the button stays hidden. This verifies credentials only; it
does not establish a persistent session or protect the homepage.

Server-side controllers live in `src/server/controllers/` and are not bundled for the
browser. Browser scripts live in `src/client/`; registration still uses its
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
| `npm run dev:client` | `esbuild … --watch` | Rebuilds the browser scripts whenever `src/client/*.ts` changes. Run it in a second terminal alongside `npm run dev`. |
| `npm run typecheck` | `tsc` and `tsc -p tsconfig.client.json` | Checks types without emitting files: the server code and tests, then the browser scripts (which use DOM types). |
| `npm run build:client` | `esbuild` | Compiles `src/client/*.ts` to browser JavaScript in `dist/public/client/`. Runs automatically before `build` and `test`. |
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
│   │   ├── controllers/  # server-side controllers (home, account, admin, support, status, login, catalog)
│   │   ├── routes/       # route tables that wire URLs to controllers (admin)
│   │   └── middleware/   # shared Express middleware (same-origin check)
│   ├── client/           # browser-side TypeScript, compiled and served at /client
│   ├── util/
│   │   ├── apiProxy.ts   # forwards /api requests to the backend
│   │   ├── customers.ts  # customer types, query parsing and formatting (shared by controllers)
│   │   ├── customerViews.ts / adminDashboard.ts  # pure HTML rendering helpers used by the controllers
│   │   ├── adminPortal.ts # admin navigation
│   │   └── adminResources.ts # admin placeholder content
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
└── tsconfig.client.json  # TypeScript options for src/client (adds DOM types)
```

Generated folders — `node_modules/` and `dist/` — are ignored by git and safe to delete and regenerate.

### Why `app.ts` and `index.ts` are separate

[src/app.ts](src/app.ts) creates and configures the Express app but never starts listening. [src/index.ts](src/index.ts) reads configuration and starts the server. Keeping those responsibilities separate makes route registration independent from server startup, and lets the tests call `createApp()` directly.

## Accessibility, language and currency

Every customer page has a "Skip to main content" link and a floating accessibility button. The button opens a panel to choose:

- **Language:** English, Welsh (`cy`), Irish (`ga`) or French (`fr`). This translates page text and product names and descriptions.
- **Currency:** pounds or euros. Euros are display-only, at a fixed rate in [src/i18n/locales.ts](src/i18n/locales.ts). Checkout, order confirmation and credit balances always show the exact amount in pounds.
- **Button position:** any corner. You can also drag the button to a corner.

The panel is a plain form that posts to `POST /preferences`. It saves the choices in the `lang`, `currency` and `a11y_position` cookies, so it works without JavaScript. With JavaScript, Escape closes the panel and the search filters. Without a `lang` cookie, the language comes from the browser's `Accept-Language` header. Staff pages (`/admin`, `/dashboard`) always stay in English and pounds.

How it fits together:

- [src/i18n/messages/en.ts](src/i18n/messages/en.ts) holds every English string and is the source of truth. `cy.ts`, `ga.ts` and `fr.ts` translate the same keys, and any missing key falls back to English.
- Templates call `t('key')`, `tCount('key', n)` and `prefs()`. Server code imports `t` from [src/i18n/runtime.ts](src/i18n/runtime.ts). Keys starting with `js.` are also sent to browser scripts.
- Product translations come from the backend's `GET /api/product-translations?lang=` and are cached for five minutes.

To add a string, add the key to `en.ts` and each translation file. To add a language, add it to `LOCALES` in [src/i18n/locales.ts](src/i18n/locales.ts), add a messages file, register it in [src/i18n/server.ts](src/i18n/server.ts) and seed product translations in the backend. The translations were machine-made and should be checked by native speakers.

## Adding a new page

Say you want a `/about` page.

**1. Create the view** at `src/views/about.njk`. File names are lowercase, because Linux filesystems are case-sensitive. Reference assets and scripts with absolute paths, so they resolve whatever the page URL is:

```html
<link rel="stylesheet" href="/assets/styles.css" />
<script src="/client/script.js" defer></script>
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
