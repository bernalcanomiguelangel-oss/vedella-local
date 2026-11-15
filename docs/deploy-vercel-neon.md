# Deploy Vedella Local on Vercel + Neon (free, step by step)

This guide puts the app online with a free public link you can share, for example
with a professor. It is written for a non-technical reader: follow the numbered
steps in order and copy-paste the values where indicated.

What you get at the end:

- The app hosted on **Vercel** (free Hobby plan) at a public `https://...vercel.app`
  address.
- The database hosted on **Neon** (free Postgres).
- The AI layer running in **mock** mode, so it is deterministic and costs nothing.
- A ready-to-use admin account `miguel@admin.com` and two example farms
  (**Mas Vallgorguina** and **Cal Serrat del Bosc**) with packs, cuts, lots, and
  one active reservation cycle.

You will set four environment variables: `DATABASE_URL`, `DIRECT_URL`,
`SEED_ADMIN_TEMP_PASSWORD`, and `AI_PROVIDER`. You will deliberately leave
`AI_API_KEY` unset so the app uses the free mock AI.

---

## Step 1. Create a free Neon project and copy BOTH connection strings

1. Go to [neon.tech](https://neon.tech) and sign up (the free plan is enough).
2. Create a new project. Neon creates a database for you (commonly named `neondb`).
3. Open the project **Dashboard** and find the **Connection Details** (sometimes
   labelled "Connect" or "Connection string").
4. You need **two** different connection strings. Neon shows a toggle, usually a
   checkbox or dropdown labelled **"Connection pooling"** (or **"Pooled connection"**):
   - **Pooled string** (pooling ON): the host contains `-pooler`, for example
     `ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech`. Copy this one for
     `DATABASE_URL`.
   - **Direct string** (pooling OFF): the host does NOT contain `-pooler`, for
     example `ep-cool-name-123456.eu-central-1.aws.neon.tech`. Copy this one for
     `DIRECT_URL`.
5. Both strings must end with `?sslmode=require`. Neon includes this by default; if
   you do not see it, add `?sslmode=require` to the end of each string.

Keep both strings somewhere safe for the next steps. They look like this:

```
# Pooled  -> DATABASE_URL (note the "-pooler" in the host)
postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require

# Direct  -> DIRECT_URL (no "-pooler" in the host)
postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require
```

The app uses the pooled `DATABASE_URL` while it is running. Prisma uses the direct
`DIRECT_URL` only to apply database migrations.

---

## Step 2. Import the GitHub repository into Vercel

1. Go to [vercel.com](https://vercel.com) and sign up or log in (free Hobby plan).
2. Click **Add New...** then **Project**.
3. Choose **Import Git Repository** and select
   `bernalcanomiguelangel-oss/vedella-local`. If you do not see it, connect your
   GitHub account and grant Vercel access to the repository first.
4. Vercel auto-detects the framework as **Next.js**. Leave the default build
   settings as they are. The project already defines the correct build command
   (`vercel-build`), so you do not need to change it.
5. Do NOT click Deploy yet. First add the environment variables in Step 3.

---

## Step 3. Set the Environment Variables in Vercel

In the Vercel project, open **Settings** then **Environment Variables** (you can
also add them on the import screen before the first deploy). Add these four:

| Name                       | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`             | the **pooled** Neon string from Step 1 (host has `-pooler`)        |
| `DIRECT_URL`               | the **direct** Neon string from Step 1 (host has no `-pooler`)     |
| `SEED_ADMIN_TEMP_PASSWORD` | a temporary password you pick, for example `Canvi2026!`            |
| `AI_PROVIDER`              | `mock`                                                             |

Notes:

- `SEED_ADMIN_TEMP_PASSWORD` is the first password for the admin account
  `miguel@admin.com`. It is only temporary: the app forces a password change on
  first login (Step 6). Pick a throwaway value like `Canvi2026!`.
- **Leave `AI_API_KEY` UNSET on purpose.** With no key, the app runs on the
  deterministic mock AI provider at zero cost. You do not need to add
  `AI_API_KEY` at all.
- Apply the variables to the **Production** environment (adding them to Preview and
  Development too is fine).

### Enable Vercel Blob for farm image uploads

On Vercel the serverless filesystem is read-only and ephemeral, so farm image
uploads must go to object storage instead of `public/uploads`. The app uses
**Vercel Blob** for this and falls back to the local filesystem automatically
when no Blob token is present (for example on your laptop or in tests).

1. In the Vercel project, open **Storage** then **Create** and choose **Blob**.
2. Create the Blob store and connect it to this project. Vercel then adds the
   `BLOB_READ_WRITE_TOKEN` environment variable to the project automatically, so
   you normally do **not** set it by hand. (If you ever need to, paste the token
   into **Settings → Environment Variables** as `BLOB_READ_WRITE_TOKEN`.)
3. Redeploy so the new variable is picked up.

With the token present, uploads are stored as Blob objects and the database
keeps the returned `https://<id>.public.blob.vercel-storage.com/...` URL. The
token is a secret: it is read only from the environment and is never logged or
sent to the browser. With no token (local/offline), uploads write to
`public/uploads` exactly as before.

**Approval still applies.** Switching storage to Blob does **not** change the
approval model: a `farm_manager`'s uploaded media is still **submitted for
review** and only becomes public after a `platform_admin` approves it (governed
by `MEDIA_REQUIRES_APPROVAL`). AI never approves or publishes media.

### (Optional) Enable the free Google Gemini AI provider

The app runs end-to-end on the deterministic mock with no key, so this step is
**optional**. To switch to the free Google Gemini tier (model
`gemini-1.5-flash`):

1. Create a free Google AI Studio API key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. In the Vercel project, open **Settings → Environment Variables** and add
   `GEMINI_API_KEY` with your key as the value. **Never paste the key into the
   chat, the code, or a committed file** — it is read only from the environment.
3. Set `AI_PROVIDER` to `gemini` (replacing the `mock` value from the env table
   above).
4. Redeploy so the variables are picked up.

With a key present and `AI_PROVIDER=gemini`, the per-use-case feature flags
decide which assistants call Gemini; anything still flagged off falls back to the
mock. With no key, everything stays on the mock. The key value is never logged or
sent to the browser; the Settings page shows only whether a key is present. A
leaked key is considered compromised — rotate it in Google AI Studio and update
the Vercel variable.

---

## Step 4. Deploy

1. Click **Deploy** (or push a commit, which triggers a deploy automatically).
2. During the build, Vercel runs the project's `vercel-build` script, which does
   three things in order:
   - `prisma generate` builds the database client.
   - `prisma migrate deploy` applies the committed Postgres migrations to your Neon
     database, so all tables and constraints are created automatically on the first
     deploy.
   - `next build` builds the web app.

   **The build no longer runs the seed.** This is deliberate: the seed is
   destructive (on a fresh database it wipes every table before recreating the demo
   data), so running it on every production deploy is unsafe. Seeding is now a
   separate, explicit command you run by hand (see Step 5).
3. Wait for the deploy to finish. Vercel then gives you a public URL that looks like
   `https://vedella-local-xxxx.vercel.app`.

At this point the database **structure** exists (tables + constraints), but it has
**no example data yet**. Run the seed once (Step 5) to create the admin and the two
example farms, then log in (Step 6).

---

## Step 5. Seed the example data once (explicit, manual step)

The seed is **not** part of the Vercel build. You run it yourself, once, against the
database you want populated. It creates:

- the admin account `miguel@admin.com` (with the temporary password you set in
  `SEED_ADMIN_TEMP_PASSWORD`, forced to change on first login),
- the two example farms **Mas Vallgorguina** and **Cal Serrat del Bosc** with their
  packs, cuts, and lots,
- the active reservation cycle `Cicle novembre 2026`.

The seed command is:

```bash
npm run db:seed
```

### Where the seed may run

Run the seed **only** against:

- local development,
- the isolated PostgreSQL test environment,
- a dedicated preview database,
- a manually authorised environment.

It must **not** run automatically against the Neon production database.

### The built-in production guard

The seed has a hard environment guard that runs **before** it touches any table. It
**refuses to run** when it detects a production target — specifically when
`VERCEL_ENV` is `production`, or when the `DATABASE_URL` host looks like a managed
Neon host. The guard is **fail-closed**: if it cannot prove the target is
non-production, it refuses. It never prints the connection string; it logs only a
safe message such as:

```
Refusing to seed: production environment detected; set ALLOW_PRODUCTION_SEED=yes to override.
```

To seed a production-like database **on purpose** (for example, to populate the demo
data the very first time), set the explicit, dedicated override:

```bash
ALLOW_PRODUCTION_SEED=yes npm run db:seed
```

Only set `ALLOW_PRODUCTION_SEED=yes` when you have confirmed you are targeting the
right database and you intend to run the destructive seed there.

> **Open question — do Vercel preview and production share one database?** This cannot
> be answered from the repository; it depends on how you configured the Neon
> connection strings per Vercel environment. **You must confirm this yourself.** If
> preview and production can point at the same database, a careless preview seed could
> wipe production data. The guard above is intentionally conservative regardless: it
> treats any managed/Neon-looking host as possibly-production and refuses without the
> explicit override.

### Seeding the first time against Neon

To populate the demo data on your Neon database the first time, from your own computer:

1. Install a recent Node.js (version 22 or newer).
2. Get the project code (download the ZIP from GitHub, or `git clone` it) and run
   `npm install`.
3. Run the seed with the SAME two Neon strings you put in Vercel, plus the explicit
   override (because the Neon host trips the production guard). On macOS or Linux:

   ```bash
   DATABASE_URL="your-pooled-neon-string" \
   DIRECT_URL="your-direct-neon-string" \
   SEED_ADMIN_TEMP_PASSWORD="Canvi2026!" \
   ALLOW_PRODUCTION_SEED=yes \
   npm run db:seed
   ```

   On Windows PowerShell:

   ```powershell
   $env:DATABASE_URL="your-pooled-neon-string"
   $env:DIRECT_URL="your-direct-neon-string"
   $env:SEED_ADMIN_TEMP_PASSWORD="Canvi2026!"
   $env:ALLOW_PRODUCTION_SEED="yes"
   npm run db:seed
   ```

The seed also keeps an **idempotency guard**: if `miguel@admin.com` or the farm
`mas-vallgorguina` already exists, it does nothing and logs that the data is already
there, without deleting or duplicating anything.

---

## Step 6. Log in and set your real password

1. Open your public Vercel URL and go to `/admin/login`, for example
   `https://vedella-local-xxxx.vercel.app/admin/login`.
2. Log in with:
   - Email: `miguel@admin.com`
   - Password: the `SEED_ADMIN_TEMP_PASSWORD` value you chose (for example
     `Canvi2026!`).
3. The app detects that this is a temporary password and sends you to the forced
   change-password screen. Enter a new, real password and confirm it.
4. You are now in the admin area with your own password.

### Share the link with your professor

Share the public homepage, which is the marketplace, for example
`https://vedella-local-xxxx.vercel.app/`. The professor can browse the two example
farms, their packs and cuts, and the active reservation cycle without logging in.
Only hand out the admin password if you want someone to manage the platform.

---

## Troubleshooting and notes

- **This was not run in CI.** The actual Postgres migration (`prisma migrate deploy`),
  the seed, and the Neon connectivity happen on YOUR Vercel deploy and your machine.
  They were not run in the project's automated checks, because that environment has no
  Postgres server and no external network. The steps above are the real ones to run;
  the automated test suite only confirms the code and schema are consistent.
- **If `prisma migrate deploy` fails during the Vercel build**, it is almost always a
  wrong or missing `DIRECT_URL`. Migrations need the **direct, non-pooled** string
  (host with no `-pooler`). The running app, by contrast, uses the **pooled**
  `DATABASE_URL`. Double-check that the two variables are not swapped and that both
  end with `?sslmode=require`, then redeploy.
- **Local development now needs Postgres too.** Because the committed schema is
  Postgres, running the app locally needs a Postgres `DATABASE_URL` and `DIRECT_URL`.
  A free Neon dev branch works perfectly for this: create a branch in your Neon
  project and paste its two strings into a local, git-ignored `.env` (copy
  `.env.example` to `.env`). See the project `README.md` for the local steps.
- **The automated test suite still runs on SQLite with no setup.** You do not need
  Postgres to run `npm test`; the test suite uses a local SQLite test client so it
  works fully offline.
- **The AI stays in mock mode.** With `AI_PROVIDER=mock` and `AI_API_KEY` unset, every
  AI feature uses the deterministic mock provider. There is nothing to pay for and no
  key to manage.
- **Running the Playwright e2e suite against a Vercel-realistic Postgres.** The
  end-to-end flows boot the dev server against PostgreSQL (the production engine), not
  SQLite. Provide a Neon dev branch via `E2E_DATABASE_URL` (or a local Docker Postgres
  via `TEST_DATABASE_URL`), then run `npm run db:test:setup && npm run test:e2e`. The
  Neon path applies migrations (`prisma migrate deploy`) and then seeds the dev branch
  explicitly with `npm run db:seed` (a Neon host needs `ALLOW_PRODUCTION_SEED=yes` to
  pass the guard) before `next build`. The seed is no longer part of `vercel-build`.
  Full walkthrough: `docs/postgres-e2e-env.md`.
