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
3. Wait for the deploy to finish. Vercel then gives you a public URL that looks like
   `https://vedella-local-xxxx.vercel.app`.

At this point the database structure exists, but it has no example data yet. That
comes next.

---

## Step 5. Run the SEED once (creates the admin and the two example farms)

The seed creates `miguel@admin.com`, the two example farms **Mas Vallgorguina** and
**Cal Serrat del Bosc** (with their packs, cuts, and lots), and the active cycle
`Cicle novembre 2026`. Run it ONE time. Pick whichever option is easier for you.

### Option A (recommended): run it from your computer against Neon

1. Install a recent Node.js (version 22 or newer) if you do not have it.
2. Download the project code to your computer. Either download the ZIP from the
   GitHub repository page, or if you have `git` installed run:

   ```bash
   git clone https://github.com/bernalcanomiguelangel-oss/vedella-local.git
   cd vedella-local
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run the seed with the Neon strings set for this one command. Use the SAME two
   strings you put in Vercel. On macOS or Linux:

   ```bash
   DATABASE_URL="your-pooled-neon-string" \
   DIRECT_URL="your-direct-neon-string" \
   SEED_ADMIN_TEMP_PASSWORD="Canvi2026!" \
   npm run seed
   ```

   On Windows PowerShell:

   ```powershell
   $env:DATABASE_URL="your-pooled-neon-string"
   $env:DIRECT_URL="your-direct-neon-string"
   $env:SEED_ADMIN_TEMP_PASSWORD="Canvi2026!"
   npm run seed
   ```

   Use the same `SEED_ADMIN_TEMP_PASSWORD` value you set in Vercel so the admin
   password matches.

### Option B: run it as a one-off command in Vercel

If your Vercel plan gives you a deployment shell / command runner, run `npm run seed`
there with the same environment variables already set on the project. If that option
is not available to you, use Option A, which always works.

### Good to know

The seed is **idempotent**: if `miguel@admin.com` or the farm `mas-vallgorguina`
already exists, it does nothing and simply logs that the data is already there. So
running the seed a second time will NOT duplicate data and will NOT wipe anything.

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
