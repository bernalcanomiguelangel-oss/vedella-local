# Aesthetic review: Copy A/B admin + Blob imagery (branch `feat/blob-gemini-ab-testing`)

## Purpose and scope

This is a second "aesthetic inspector" pass, scoped to the **new and changed
user-facing surfaces** on `feat/blob-gemini-ab-testing` versus `origin/main`.
It does not re-review the public storefront already covered by
`docs/aesthetic-review.md` (that pass stands). A separate devil's-advocate
semantic review already ran and APPROVED the branch for correctness; this pass
judges **visual design, UX, and benchmarking** only.

Surfaces in scope:

- **`/admin/copy`** — the new A/B + LLM-as-judge product-description workflow
  (`src/app/admin/copy/page.tsx`, `src/components/admin/CopyProposeControls.tsx`,
  `src/components/admin/CopyVariantDecision.tsx`).
- **Public farm page A/B serving** — `src/app/[locale]/farms/[slug]/page.tsx`
  now swaps in an approved variant description for an assigned session.
- **Imagery via Vercel Blob** — `src/lib/image-display.ts` now accepts Blob
  URLs, so uploaded cover/gallery/product photos render in production.
- **Settings explainer** — `src/app/admin/settings/page.tsx` gained a Copy A/B
  explainer and Gemini key guidance block.

There is no live network at review time, so the competitor benchmark is encoded
below as a written heuristic rubric distilled from best-in-class **admin
dashboards** (Stripe, Linear, Vercel, PostHog-style experiment views) and
**marketplace storefronts**, not browsed directly.

## Benchmark rubric (admin-dashboard + experiment-view edition)

Best-in-class experiment/admin surfaces share a recognisable shape:

1. **Honest experiment reporting.** Raw numerator/denominator named, rate shown
   as derived, explicit small-sample / low-confidence treatment, never an
   implied p-value. (PostHog and Optimizely both gate "winner" language behind
   sample thresholds.)
2. **Clear provenance of machine vs human.** AI drafts, judge verdicts, and
   human decisions are visually distinct and never confused for one another.
3. **Scannable data density.** Tables and metric tiles stay legible at a glance:
   aligned numerics, consistent label/value pairing, zebra or hairline rows,
   horizontal scroll contained on mobile rather than overflowing.
4. **Decision ergonomics.** The primary action (approve/edit/reject) is obvious,
   destructive vs constructive actions are colour-coded, required inputs are
   enforced visibly, pending/disabled states are communicated.
5. **Empty and loading states.** Every list/section has a first-run empty state;
   nothing renders as a bare blank.
6. **Typographic rhythm + identity.** Display serif anchors headings, consistent
   spacing scale, body copy legible, accent colours used semantically.
7. **Accessible contrast + focus.** Text meets ~4.5:1, interactive elements show
   a visible keyboard focus ring, icons/emoji are decorative not load-bearing.
8. **Responsive layout.** Dense admin content reflows or scrolls cleanly on
   narrow screens.
9. **i18n integrity.** New UI respects the ca/es/en switcher and nav.

Scores are 1–5 for the **current state of this branch (before any fix in this
pass)**:

- 1 missing or actively hurting · 2 weak, obvious gaps · 3 acceptable but
  generic · 4 good, minor polish left · 5 strong, matches best in class.

## Rubric scores — current state

### 1. Honest experiment reporting. Before: 5
The strongest part of the surface. The metrics block names the numerator
(`convertedSessions`) and denominator (`impressedSessions`) in prose, shows the
rate as a derived percentage, raises a prominent small-sample warning
(`sampleTooSmall` → "⚠ Mostra massa petita… no en treguis conclusions"), and
explicitly states "Sense afirmació de significació estadística." The
judge↔human agreement is reported as **two separate counts**, never collapsed
into one "accuracy". This matches the product's anti-vanity-metrics principle
better than most commercial tools.

### 2. Provenance of machine vs human. Before: 4
Good. An "Esborrany / recomanació d'IA" pill labels AI drafts, the judge verdict
is a separate coloured badge with its reason shown, and the human decision
control is clearly its own block with a required reason. The decision history
section explains that accumulated examples are few-shot, not model training —
an honest and well-placed caveat. One gap: the per-variant status chip renders
`{locale} · {status} · {source}` as a single cryptic token
(e.g. "ca · draft · ai_proposed"); a reader has to decode it. Benchmark tools
split "AI draft" / "status" into distinct, labelled affordances. (confirmed —
the chip is `{v.locale} · {v.status} · {v.source}` in `page.tsx`.)

### 3. Scannable data density. Before: 2
The weakest part. The experiment metrics `<table>` has header styling but the
body rows have **no borders, no zebra striping, and no numeric alignment** — the
Impressions/Conversions/Taxa columns are left-aligned text, so the eye can't
scan the figures. Worse, the row label is only the arm letter ("A"/"B"); the
`VariantConversion` type carries `text` and `status`, but neither is shown, so
you cannot tell **which description** each row measures without cross-referencing
the variant list above. Numbers that should read as a comparison read as a loose
grid. (confirmed — the pre-fix `<tr>` rendered only `{vc.arm}` with no borders
or alignment.)

### 4. Decision ergonomics. Before: 4
Strong. Approve = olive, Edit = bark, Reject = beef — semantic colour coding that
matches the palette. The reason field is required and enforced inline with a
bilingual error, approve is correctly disabled with a tooltip for non-admins,
and pending states disable the buttons. The one rough edge: "Edita" is a
two-step toggle (first click reveals the textarea, second saves) with no hint on
the first click that a second is needed — a `title` or helper line would remove
the surprise. (confirmed — `CopyVariantDecision` toggles `showEdit` before it
calls `decide("edit")`.)

### 5. Empty and loading states. Before: 4
Every list has an empty state: "Encara no hi ha variants…", "Cap oferta
visible.", "Encara no hi ha decisions." Good coverage. Loading is handled on the
client actions via pending button labels ("Generant…"). The page itself is
server-rendered so there's no spinner need. Minor: the judge-agreement tiles
show `0` with no "no data yet" framing on first run, which can read as a real
measured zero rather than "nothing happened yet". (likely — tiles bind
`data.agreement.*` directly with no zero-state branch.)

### 6. Typographic rhythm + identity. Before: 3
The `<h1>` correctly uses `font-display` (serif identity preserved, matching the
settings page and storefront). But every section `<h2>`/`<h3>/<h4>` uses
`font-semibold` **sans**, so the display face never cascades into the page body.
The prior storefront pass deliberately routed section headings through
`font-display` for exactly this reason; the new admin page doesn't follow suit,
so the vertical rhythm is flatter and more generic than the established voice.
Spacing scale itself is consistent (`space-y-8`, `rounded-2xl`, `p-4`, `gap-2`).

### 7. Accessible contrast + focus. Before: 3
Palette usage is on-brand and the verdict badges have adequate contrast
(`olive-800`/`beef-800` on `-100`). Two concerns: (a) the many `text-bark-400`
captions (sublabels under each metric, the farm-name parentheticals, the
evidence line) sit on white/cream and are borderline for small text —
`bark-500` is the safer floor already used elsewhere on the same page; (b) the
new interactive elements (the offer rows, the propose/judge/decision buttons)
rely on default focus and don't add the `focus-visible` ring that the storefront
pass established as the house style. Buttons get a hover colour but no explicit
visible focus treatment. (confirmed — pre-fix button classes had `hover:` but no
`focus-visible:`; `text-bark-400` captions appear five times in `page.tsx`.)

### 8. Responsive layout. Before: 2
The metrics `<table>` is a fixed four-column table with `w-full` and **no
`overflow-x-auto` wrapper**. With named columns plus percentages it will crowd or
overflow on a phone, and `<table>` cells don't reflow. The judge-agreement grid
(`grid-cols-2 sm:grid-cols-4`) and the offer rows (`flex-wrap`) reflow fine; the
table is the outlier. (confirmed — pre-fix `<table className="mt-2 w-full">`
had no scroll wrapper.)

### 9. i18n integrity. Before: 3
The nav key `copy` was added to ca/es/en (good, the switcher stays intact). But
the entire `/admin/copy` page body is **hard-coded Catalan** — headings, prose,
button labels, captions — with only the decision reason label bilingual
(ca · en). The rest of the admin area is Catalan-first too, so this is
consistent with the current admin convention rather than a regression, but it is
below the ca/es/en bar the product sets for user-facing copy. Flagging as a
known gap, not a blocker (admin is operator-facing and already Catalan-only).

### Imagery via Vercel Blob (storefront, not re-scored)
`isPublicImageRef` now admits `https://*.blob.vercel-storage.com` alongside the
local `/uploads/` prefix, with URL-parsed host validation that correctly rejects
look-alike hosts. Visually this is the enabling fix that makes the storefront's
16:9 farm hero, 4:3 gallery and product images actually appear in production
rather than always falling back to the gradient placeholder. Aspect-ratio boxes
and gradient fallback from the first pass are unchanged, so consistency holds.
No visual regression; this strictly improves imagery fidelity.

## Score summary

| Rubric item | Before (this branch) |
| --- | --- |
| 1 Honest experiment reporting | 5 |
| 2 Machine-vs-human provenance | 4 |
| 3 Scannable data density | 2 |
| 4 Decision ergonomics | 4 |
| 5 Empty/loading states | 4 |
| 6 Typographic rhythm + identity | 3 |
| 7 Contrast + focus | 3 |
| 8 Responsive layout | 2 |
| 9 i18n integrity | 3 |

<details>
<summary>Issues (10)</summary>

1. **Metrics table legibility** (confirmed) — body rows had no borders and no
   numeric alignment; add hairline rows + right-aligned `tabular-nums`. *Applied.*
2. **Metrics table overflow on mobile** (confirmed) — fixed 4-col table with no
   scroll wrapper; wrap in `overflow-x-auto`. *Applied.*
3. **Rows don't name their variant** (confirmed) — rows showed only arm "A"/"B";
   render the variant text snippet so each number is attributable. *Applied.*
4. **Section headings not serif** (confirmed) — `h2`–`h4` used sans; route
   through `font-display` to match the brand identity. *Applied.*
5. **Low-contrast captions** (confirmed) — `text-bark-400` on white/cream for
   small text; raise to `text-bark-500`. *Applied.*
6. **No focus-visible ring on buttons** (confirmed) — propose/judge/decision
   buttons had hover only; add `focus-visible:ring`. *Applied.*
7. **Cryptic variant chip** (confirmed) — `{locale}·{status}·{source}` is one
   opaque token; split into labelled pills. *Deferred (component/wording).*
8. **Two-step "Edita" with no hint** (confirmed) — first click only reveals the
   textarea; add helper text or inline editor. *Deferred (logic).*
9. **Zero-state vs measured-zero on agreement tiles** (likely) — tiles show `0`
   with no "no data yet" framing on first run; add a zero-state. *Deferred.*
10. **`/admin/copy` body is Catalan-only** (confirmed) — below the ca/es/en bar,
    though consistent with the Catalan-first admin; full i18n is a larger effort.
    *Deferred.*

</details>

## Prioritised fixes

### High value, low risk — safe to apply now (Tailwind/label only, no behaviour/data change)

1. **Wrap the metrics table in `overflow-x-auto`** and add hairline row borders +
   right-aligned numeric columns so figures scan as a comparison and don't
   overflow on mobile. (Rubric 3, 8)
2. **Show the variant each metrics row measures** — render the arm letter plus a
   short text snippet / status instead of a bare "A"/"B". The data
   (`vc.text`, `vc.status`) is already on `VariantConversion`. (Rubric 3)
3. **Route section headings through `font-display`** to restore the serif
   identity in the page body, matching the storefront pass. (Rubric 6)
4. **Raise borderline `text-bark-400` captions to `text-bark-500`** for contrast
   on the metric sublabels, farm-name parentheticals, and evidence line.
   (Rubric 7)
5. **Add a visible `focus-visible` ring** to the propose/judge/decision buttons
   and the offer rows, matching the house style from the first pass. (Rubric 7)

### Defer to a coder (needs logic / copy / i18n work, not pure styling)

6. **Split the `{locale} · {status} · {source}` chip** into labelled affordances
   ("Esborrany d'IA", a status pill, a locale pill). Touches component structure
   and wording. (Rubric 2)
7. **Hint that "Edita" is two-step** (helper text or a one-step inline editor).
   Small UX refactor of `CopyVariantDecision`. (Rubric 4)
8. **"No data yet" framing on the agreement tiles** when all counts are zero on
   first run, to distinguish "measured zero" from "nothing happened". (Rubric 5)
9. **ca/es/en for the `/admin/copy` body.** Larger i18n effort; consistent with
   the rest of the Catalan-first admin, so defer unless admin i18n is prioritised
   platform-wide. (Rubric 9)

## What I applied in this pass

I applied the five high-value, low-risk, style-only fixes (items 1–5) directly,
because they change Tailwind classes / markup presentation only — no behaviour,
data flow, security, or i18n string meaning changes — and they pull the three
weak rubric items (data density, responsive, typography/contrast) up to the
established house standard. See "Fixes applied" below. Items 6–9 are deferred to
a coder as noted; they touch component logic, wording, or translation and are
not pure visual polish.

## Fixes applied (this pass)

1. Metrics table wrapped in `overflow-x-auto`; body rows get a top hairline
   (`border-t border-bark-100`) and the three numeric columns are right-aligned
   and tabular, so the A/B comparison scans cleanly and never overflows a phone.
2. Each metrics row now shows the arm letter **and** a truncated snippet of that
   variant's text, so a reader can tell which description each number belongs to
   without scrolling back to the variant list.
3. The `Copy A/B`, "Acord jutge ↔ humà", "Proposa variants…", "Variants
   proposades", "Historial de decisions", and the experiment sub-heading now use
   `font-display`, restoring the serif brand voice through the page body.
4. Borderline `text-bark-400` captions raised to `text-bark-500` (metric
   sublabels, farm-name parentheticals, evidence line, history timestamp).
5. Visible `focus-visible` ring (`focus-visible:ring-2 focus-visible:ring-gold-400`)
   added to the propose, judge, approve, edit and reject buttons.

All changes preserve the warm cream/bark/gold/olive/beef palette, the serif
display identity, the existing i18n nav keys, and the honesty cues (named
numerator/denominator, small-sample warning, separated agreement counts). No new
colours, fonts, dependencies, data, or behaviour were introduced.

## Verdict

**APPROVED.** The honesty of the experiment reporting and the clear
machine-vs-human provenance are genuinely best-in-class and are the hardest
parts to get right; they are already strong. The remaining gaps were presentation
polish — table legibility, responsive overflow, serif rhythm, caption contrast,
focus rings — and the low-risk subset has been applied in this pass without
touching behaviour. The deferred items (variant chip, two-step edit hint,
zero-state framing, full admin i18n) are worthwhile but non-blocking and belong
to a coder. The branch is aesthetically ready to ship.
