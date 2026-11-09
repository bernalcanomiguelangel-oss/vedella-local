# Aesthetic review: Vedella Local public marketplace

## Purpose

This is the "aesthetic inspector" deliverable. It is a written heuristic rubric
that benchmarks the public marketplace against well established best in class
ecommerce and marketplace practices, scores the current UI, and lists concrete
fixes. There is no live network at build time, so competitors cannot be browsed
directly. Instead the benchmark is encoded as a grounded rubric distilled from
patterns common to strong food and artisan marketplaces (think curated local
food boxes, specialty butchers, and farm to table storefronts): large edge to
edge imagery, uniform product cards, visible trust and provenance cues, generous
whitespace, a strict spacing scale, and accessible contrast.

Scope reviewed: the public pages only (homepage, farm page, product and offer
cards, basket). The admin panel and AI layer are out of scope and untouched.

## How to read the scores

Each rubric item is scored 1 to 5 for the state BEFORE this pass:

- 1 missing or actively hurting the experience
- 2 weak, obvious gaps
- 3 acceptable but generic
- 4 good, minor polish left
- 5 strong, matches best in class

## The rubric and current state scores

### 1. Clear visual hierarchy. Before: 3

The hero and section headings read in the right order, but every heading used
the same sans weight, so the serif brand voice present in the admin shell did
not carry to the storefront. Product names, prices, and traceability competed at
similar visual weight inside a card.

Fixes: apply the brand serif (`font-display`) to the hero title and the main
section headings on the homepage and farm page so the display face anchors the
hierarchy. Give each product card a dominant image, then name, then price, then
supporting facts.

### 2. Generous whitespace. Before: 4

Spacing was already calm (consistent `max-w-6xl` gutters, `py` rhythm on
sections). Cards were slightly dense once traceability moved inside them.

Fixes: keep the existing section padding; let the new media box add breathing
room at the top of each card rather than compressing the facts.

### 3. High quality imagery with consistent aspect ratios. Before: 1

This was the biggest gap. Farm cards used a flat gradient block, the farm header
was a flat gradient, and product cards had no imagery at all. Uploaded photos
existed in the data model (approved hero, gallery, and per offer images) but were
never shown, so the storefront looked like a wireframe next to any real food
marketplace.

Fixes: render the approved hero on the farm card (16:9) and farm header (full
bleed behind a scrim), render the approved per offer image on each product card
(4:3 `object-cover`), and add a farm gallery grid (4:3). Every surface keeps the
existing CSS gradient as a graceful fallback, because seeded farms ship with no
uploads and the demo must still look finished offline.

### 4. Strong product cards. Before: 3

Cards had a good price pill, clear facts table, and the new per product
traceability chip, but no image and no hover affordance, so they felt flat.

Fixes: add the consistent 4:3 media box at the top, a tasteful gradient plus
emoji placeholder when no photo exists, and a subtle shadow lift on hover.

### 5. Trust and traceability cues. Before: 4

Strong already. Per product Granja to Lot to Tall to Paquet chains live inside
each card (FEAT-003), approved certifications show on the farm page, and lot
codes are monospaced. This is a genuine differentiator versus generic stores.

Fixes: none needed for this pass. Imagery now reinforces trust by pairing a real
photo with the provenance chip.

### 6. Responsive and mobile first layout. Before: 4

Grids already collapse sensibly (`sm:grid-cols-2 lg:grid-cols-3`) and the admin
nav has a mobile drawer. The public pages stack cleanly on narrow screens.

Fixes: keep the responsive grids; the new media boxes use aspect ratio utilities
so they scale with the column width rather than a fixed pixel height.

### 7. Accessible contrast and focus states. Before: 2

Cream text sat directly on a mid green gradient in the farm header, which is
borderline, and would fail outright over a bright uploaded photo. Card links and
the back link had hover styles but no visible keyboard focus ring.

Fixes: put a dark scrim behind header text whenever a hero photo is shown so
contrast stays safe over any image, add a visible `focus-visible` ring to the
farm card link and the back link, and give informative images meaningful alt
text while marking gradient and emoji layers decorative (`aria-hidden`).

### 8. Consistent spacing scale. Before: 4

The codebase already leans on a consistent Tailwind scale (`p-5`, `gap-6`,
`rounded-2xl`, `ring-1`). No rogue magic numbers were found on the public pages.

Fixes: reuse the same rounding and ring tokens on the new media boxes and gallery
so they visually belong to the existing card system.

### 9. Typographic rhythm. Before: 3

Body copy was consistent, but headings never used the serif display face that
defines the brand in the admin area, so the storefront voice was generic.

Fixes: route the hero and section headings through `font-display`, matching the
established identity without introducing any new font or color.

## Score summary

| Rubric item | Before | After (this pass) |
| --- | --- | --- |
| 1 Visual hierarchy | 3 | 4 |
| 2 Whitespace | 4 | 4 |
| 3 Imagery and aspect ratios | 1 | 4 |
| 4 Product cards | 3 | 4 |
| 5 Trust and traceability | 4 | 5 |
| 6 Responsive, mobile first | 4 | 4 |
| 7 Contrast and focus | 2 | 4 |
| 8 Spacing scale | 4 | 4 |
| 9 Typographic rhythm | 3 | 4 |

## Fixes applied in this pass

These are the high value, best effort to impact fixes implemented now:

1. Farm card shows the approved hero image in a fixed 16:9 box, falling back to
   the pasture gradient when there is no upload. Hover and keyboard focus both
   lift the card and show a visible ring.
2. Farm page header features the approved hero full bleed behind a dark scrim
   that guarantees text contrast, falling back to the gradient when absent.
3. Farm gallery section renders approved gallery photos in a responsive 4:3
   grid, and is omitted entirely when there are no approved photos.
4. Product and offer cards (cuts and packs) show the approved image in a
   consistent 4:3 `object-cover` box, with a tasteful gradient plus emoji
   placeholder fallback and a subtle hover shadow.
5. Brand serif (`font-display`) applied to the hero title and the main homepage
   and farm page section headings, restoring the identity already used in admin.
6. Accessibility: informative images carry meaningful alt text (farm or product
   name); decorative gradient, scrim, and emoji layers are marked `aria-hidden`;
   visible focus rings added to the farm card link and the back link.
7. A pure, unit tested helper (`src/lib/image-display.ts`) centralises the
   fallback rule so the UI only ever renders a safe local `/uploads/...` image
   and never a remote or malformed path, keeping the app offline safe.

All fixes preserve the warm cream, bark, gold, olive and pasture palette, the
serif display identity, and the ca, es, en language switching. No new brand
colors, fonts, or heavy dependencies were introduced.

## Fixes deferred

These are lower priority or larger than this pass and are recorded for later:

1. A dedicated product or offer detail page. Today cuts and packs render as cards
   only; a full detail route with a larger gallery would help conversion but is a
   new page and new tests.
2. `next/image` optimization (responsive `srcset`, blur placeholders). Deferred
   to avoid remote loader configuration and keep the build fully offline. Plain
   `<img>` with `loading="lazy"` and `object-cover` is sufficient for local
   uploads.
3. Skeleton loading states for images. Low impact while images are local and
   served instantly from the static uploads directory.
4. Richer empty states and per farm color accents. Nice to have, not blocking.
