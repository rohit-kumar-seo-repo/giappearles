# GI Apparel deployment

## GoDaddy Node.js Hosting (production)

GoDaddy must run the project as a Node.js application, not as a static-only subfolder:

1. Set the application startup command to `npm start`.
2. Set the Node.js version to 20 or newer.
3. Set the application working directory and deployment source to the repository root.
4. Before startup, run `npm install` and `npm run build`. The build generates `dist/`, and `server.js` serves that directory plus the `/api/*` routes.
5. Set `PORT` only if GoDaddy requires an explicit runtime port. `server.js` otherwise uses `3000`.
6. Deploy all repository files except local `.env*` and `node_modules/`. Set environment variables in GoDaddy instead of uploading secrets.

The browser configuration is served at runtime by `/supabase-config.js`; it is not embedded in `dist/`. Set these variables in GoDaddy's application runtime environment:

- `SUPABASE_URL`: the exact Project URL shown in Supabase **Project Settings → API**, for example `https://abcdefghijkl.supabase.co`. Do not include `/auth/v1` or a trailing path.
- `SUPABASE_PUBLISHABLE_KEY`: the public publishable key shown in Supabase **Project Settings → API**. The legacy browser-safe `anon` key is also accepted.

At runtime, `server.js` and order/payment handlers additionally require `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ORDER_NOTIFICATION_TO`, `ORDER_NOTIFICATION_FROM`, `ORDER_RATE_LIMIT_SECRET`, and `APP_ORIGIN=https://giapparel.in`. All of these, especially `SUPABASE_SERVICE_ROLE_KEY`, remain server-only and must never appear in frontend files or `NEXT_PUBLIC_*` variables.

After changing environment variables, restart/redeploy the GoDaddy application so the runtime process loads them. Run `npm run build` after source changes because the build copies the pinned Supabase browser client into `dist/supabase.js`. Authentication does not depend on a third-party CDN at runtime. Verify that `https://giapparel.in/supabase-config.js`, `supabase.js`, `login.js`, and `login.html` return HTTP 200 and contain the newly deployed build. `/supabase-config.js` must contain only the public project URL and publishable key.

Before deploying, confirm the exact Supabase hostname with `nslookup` or `Resolve-DnsName`. The public hostname must resolve in DNS and its HTTPS certificate must be trusted. If DNS returns "not found" or connection attempts fail, update `SUPABASE_URL` to the real project URL from **Supabase → Project Settings → API**; rebuilding cannot repair an incorrect or deleted project hostname. Never point `SUPABASE_URL` at `giapparel.in`, `localhost`, or a guessed/custom domain.

## Vercel build

This is a static HTML/CSS/JavaScript site. Vercel builds it with `npm run build` and serves the generated `dist/` directory; no framework migration or SPA rewrite is needed.
`npm run build` does not require Supabase environment variables. Vercel serves `/supabase-config.js` through a runtime function, which reads the public values from the Vercel runtime environment.

Set these Vercel **Production** environment variables before deploying the order backend:

- `SUPABASE_URL`: the existing GI-Apparel Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: its browser-safe publishable key (or legacy `anon` key).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service-role key. Never add this to a `NEXT_PUBLIC_*` or browser variable.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: the Razorpay API credentials (the key ID is sent to Razorpay Checkout by the server; the secret is server-only).
- `RAZORPAY_WEBHOOK_SECRET`: the separate webhook signing secret configured in Razorpay.
- `RESEND_API_KEY`: server-only Resend API key.
- `ORDER_NOTIFICATION_TO`: `hello.giapparel@gmail.com`.
- `ORDER_NOTIFICATION_FROM`: a sender such as `GI Apparel <orders@giapparel.in>` after `giapparel.in` is verified with Resend.
- `ORDER_RATE_LIMIT_SECRET`: recommended random, private value used to hash requester IPs for database-backed order rate limiting. If omitted, the server derives a separate rate-limit key from `SUPABASE_SERVICE_ROLE_KEY`; set this dedicated value to keep rate-limit windows stable when rotating the Supabase key.
- `APP_ORIGIN`: `https://giapparel.in`.

The runtime config endpoint validates the HTTPS project URL and browser-safe publishable/anon key before returning them. Never use a service-role key, database password, Razorpay secret, Resend API key, or other privileged secret in browser configuration. `.env.example` documents the required values without containing provider secrets; `.env*` files and generated output are excluded from Git.

Create a GitHub repository with `main` as its production branch, then import that repository into Vercel. Select the **Other** framework preset if prompted. Use the repository root as the project root; the build and output settings are already in `vercel.json`. Add both Supabase variables to the Vercel Production environment, then deploy `main`.

## Domain and HTTPS

Add `giapparel.in` and `www.giapparel.in` to the Vercel project's **Settings → Domains**. Make `giapparel.in` the primary domain and configure Vercel to redirect `www.giapparel.in` to it. At the DNS provider, enter the exact records Vercel shows for domain verification. Typical Vercel records are:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Remove conflicting records for those names. Vercel provisions HTTPS after DNS verification; do not add a separate certificate. If Vercel displays different record values, use the values shown in the project dashboard.

## Supabase Auth

In **Supabase → Authentication → URL Configuration**, set the Site URL to `https://giapparel.in`. Add these redirect URLs:

- `https://giapparel.in/**`
- `https://www.giapparel.in/**`

Also add the exact Vercel Preview URL pattern you use if password-reset links need to work on previews. Test email confirmation, password reset, sign-in and sign-out on the production domain. The account page supports customer registration; configure Supabase email confirmation according to the store's launch policy.
In **Authentication → Providers → Email**, keep email/password sign-in enabled and configure production SMTP delivery so confirmation and recovery emails reliably reach customers.

## Customer accounts and order history

In the Supabase Dashboard, open **SQL Editor → New query**, paste the complete contents of [`supabase/migrations/20261018000000_create_customer_accounts.sql`](./supabase/migrations/20261018000000_create_customer_accounts.sql), and run it once against the existing project. This migration must be applied before using the account dashboard: it creates customer profiles and address storage, links new signed-in orders to Supabase Auth users, and adds owner-only RLS policies for profiles, addresses and order history. It also asks PostgREST to reload its schema cache. This is separate from the orders migration above; do not rerun the orders migration.

Customers can register and sign in using Supabase Auth. Registration confirms account creation and directs customers to sign in, with an additional email-verification prompt when confirmation is enabled. Supabase restores valid sessions across page loads; the storefront header shows the customer's name and links to their account, orders, addresses, profile, and sign-out. Customers can update their profile and password, manage saved addresses, and see the latest 50 of their own orders. Authenticated order submissions are tied to the verified Supabase user on the server; the browser cannot choose the order owner. Guest checkout remains available and guest orders are not shown in customer accounts. The account browser client uses only `SUPABASE_PUBLISHABLE_KEY`; service-role credentials remain server-only.

## Orders, payments, and owner notifications

The site now includes Vercel serverless order endpoints. Before accepting orders:

1. The migration [`supabase/migrations/20261008000000_create_orders.sql`](./supabase/migrations/20261008000000_create_orders.sql) has already been applied to the existing Supabase project. **Do not run it again.** It created the `orders` table and database-backed rate limiter with browser-role writes revoked; customer reads are granted separately with owner-scoped RLS by the customer-account migration below.
2. In Vercel **Project → Settings → Environment Variables**, add the values in the table below for **Production**. Put only the URL and publishable key in browser/build configuration; set the service-role key and other provider secrets as server-side Vercel environment variables. `ORDER_RATE_LIMIT_SECRET` is recommended; generate it locally (for example, in PowerShell, `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). If it is not set, the server derives a separate rate-limit key from the service-role key and logs a warning. Do not send secrets in chat, screenshots, source files, or Git.
3. Create/configure a Razorpay account and use its **test** keys first. In Razorpay, add the webhook URL `https://giapparel.in/api/payments/webhook`, subscribe to `payment.captured`, and set the webhook secret to the same value as `RAZORPAY_WEBHOOK_SECRET`. A captured Razorpay payment is checked against the server-created order ID, amount, and currency before the order is marked paid.
4. Verify `giapparel.in` as a sending domain in Resend, publish the DNS records Resend requires, then configure the resulting sender in `ORDER_NOTIFICATION_FROM`. The owner email is `hello.giapparel@gmail.com`.
5. Run test-mode offline and Razorpay purchases end-to-end. Verify that an offline request appears in Supabase and sends the owner an email; verify a successful online test payment appears as paid and sends the owner an email. Test cancelled payments, invalid signatures, duplicate webhook delivery, failed email delivery, and excessive order attempts before switching Razorpay to live keys.

The backend recalculates all product prices using a server catalog that is checked against `data.js` during every build. Flat shipping is **₹150 per order**, set in `server/catalog.js`; an order total is item total plus this shipping charge. Updating storefront product prices or sizes requires updating the server order catalog too; the build fails if the two drift. The owner can also review saved order records in the Supabase project's **Table Editor → `orders`**.

Offline checkout creates an order request, emails the owner, and leaves payment/order confirmation to GI Apparel. It does not claim that the offline payment was received. Razorpay orders are marked paid only after the server verifies a captured payment. If Resend fails, the order is still saved and the customer is explicitly told to contact GI Apparel; the failed notification is recorded in Supabase.

Serverless endpoints:

- `POST /api/orders` — quotes a cart (`action: "quote"`) or creates an offline/Razorpay order.
- `POST /api/payments/verify` — verifies the Razorpay Checkout response and confirms capture server-side.
- `POST /api/payments/webhook` — verifies Razorpay webhook signatures and reconciles captured payments.

## Launch limitations

The application code for checkout integration is present. The Supabase orders/rate-limiter migration has already been run in the existing project; do **not** run it again. Production service credentials, Razorpay webhook, Resend sender verification, GitHub repository, and Vercel deployment still need configuration and end-to-end testing. Do not accept live orders/payments until those steps have been completed successfully. Cart state is still browser-memory-only and does not persist across refreshes.

The current image assets total about 48 MB. Product card images load lazily, but image resizing and modern WebP/AVIF derivatives should be completed and visually checked before a high-traffic launch.
