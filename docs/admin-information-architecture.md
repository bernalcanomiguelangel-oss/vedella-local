# Admin information architecture

> Target design for the restored internal management panel. Grounded in the current
> admin (`src/app/admin/*`, `src/lib/admin/*`, `src/lib/auth.ts`) and the feedback
> prompt sections 3–17. No code changed to write this.

## 1. Shell

- **Layout:** left vertical navigation on desktop (replacing the current top horizontal
  nav in `src/app/admin/layout.tsx`); collapsible drawer on mobile.
- **Palette:** warm cream background, dark-brown primary, golden secondary, green for
  operational/positive states. (Current palette is pasture/beef; this is a restyle of the
  Tailwind theme, not just the admin.)
- **Type:** serif display for headings, humanist sans for body.
- **Labels:** canonical labels are Spanish (per prompt), each translated to ca/es/en via
  the existing i18n dictionaries (`src/lib/i18n/{ca,es,en}.json`). The admin currently
  ships Catalan-only hard-coded labels; these move into the dictionaries.
- **Session chip:** shows email + role (reuse `getCurrentUser`); `Cerrar sesión` reuses
  the `logout` server action in `src/lib/admin/session-actions.ts`.

## 2. Navigation (14 items)

| # | ES label | ca | en | Route | Platform admin | Farm manager |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Resumen | Resum | Overview | `/admin` | all | own farm |
| 2 | Métricas | Mètriques | Metrics | `/admin/metrics` | aggregate + per-farm | own farm only |
| 3 | Granjas | Granges | Farms | `/admin/farms` | all CRUD | own farm (read + limited edit) |
| 4 | Productos y packs | Productes i packs | Products & packs | `/admin/products` | all | own offers/packs |
| 5 | Lotes | Lots | Lots | `/admin/lots` | all | own lots |
| 6 | Ciclos | Cicles | Cycles | `/admin/cycles` | all CRUD | own participation (read) |
| 7 | Pedidos | Comandes | Orders | `/admin/orders` | all | own fulfilment groups |
| 8 | Incidencias | Incidències | Incidents | `/admin/incidents` | all | own-farm incidents |
| 9 | Textos web | Textos web | Website text | `/admin/website-text` | platform only | hidden |
| 10 | Usuarios y permisos | Usuaris i permisos | Users & permissions | `/admin/users` | platform only | hidden |
| 11 | Revisión | Revisió | Review | `/admin/review` | approve/reject | submit only |
| 12 | Registro de actividad | Registre d'activitat | Audit log | `/admin/audit` | all | own-farm entries |
| 13 | Ajustes | Ajustos | Settings | `/admin/settings` | platform only | hidden |
| 14 | Cerrar sesión | Tanca la sessió | Log out | action | yes | yes |

**Visibility rule:** nav rendering is cosmetic; every page re-authenticates server-side.
Items 9/10/13 call `requirePlatformAdmin`; the rest call `requireAdmin` and then scope
data with `visibleFarmScope(user)`. A `farm_manager` never receives another farm's rows.

## 3. Section specifications

### 3.1 Resumen (Overview)
Operational cards (counts) + four **action lists**, each linking to a pre-filtered view:
- **Needs review** → `/admin/review` (pending farms/products/offers/translations).
- **Needs farm response** → `/admin/orders?status=awaiting_farm_confirmation`.
- **Needs fulfilment action** → `/admin/orders?status=preparing,ready_for_pickup,out_for_delivery`.
- **Needs data correction** → offers/lots missing mandatory fields, offers without an
  eligible lot in the active cycle.
Every card and list row deep-links to a filtered record set (URL-encoded filters).

### 3.2 Métricas (Metrics)
KPI cards + multi-farm cards + charts + filter bar + channel attribution + drill-down.
Fully specified in `docs/analytics-dictionary.md`. Default view: current/latest cycle,
test data excluded, URL-encoded filter state, reset button.

### 3.3 Granjas (Farms)
List + detail. Actions: add/edit, submit for review, approve/reject (platform),
activate/deactivate, archive, assign manager. A **public-readiness panel** shows each gate
(approved? active? not test? has active offer with eligible lot in current cycle?) so an
operator can diagnose why a farm is not visible. Full farm fields per prompt section 6.

### 3.4 Productos y packs (Products & packs)
Two tabs:
- **Definiciones** (ProductDefinition): canonical cut catalogue (not sellable). Platform
  manages; shared across farms.
- **Ofertas** (FarmProductOffer): farm-specific sellable rows referencing a definition.
  Farm manager edits only own-farm offers. The list groups by definition so an operator
  can see "Entrecot" across farms with each farm's distinct price/weight side by side,
  **without merging** the values.
- **Packs:** composition editor; single-farm packs accept only that farm's offers;
  multi-farm packs explicitly flagged with every participating farm identified; item-level
  farm + lot traceability; publish-gate requires all participating offers approved+active.

### 3.5 Lotes (Lots)
List + detail + create/edit. Enforces: offer belongs to farm; cutting≥slaughter;
packing≥cutting; expiry>packing; unique reference; units≥0; mandatory fields present
before approval/activation. Withdrawal action (phase 12 links to incidents). Test flag.

### 3.6 Ciclos (Cycles)
List + detail. Create/duplicate; add/remove participating farms; allocate capacity total
and per-farm; open/close/fulfil/cancel/archive; detect offers without an eligible lot;
block reservations after the close timestamp. All cycle facts DB-driven (no hard-coded
November 2026 / 37-50).

### 3.7 Pedidos (Orders)
Filterable list with explicit statuses (pending, confirmed, awaiting_farm_confirmation,
preparing, ready_for_pickup, out_for_delivery, fulfilled, cancelled, refunded). Order
detail shows the preserved offer/pack snapshot, price at reservation, expected weight,
delivery/pickup, cycle, attribution, farm, lot, test flag. Multi-farm orders split into
**farm-level fulfilment groups** so each farm sees only its slice.

### 3.8 Incidencias (Incidents)
List + detail. Links to farm/definition/offer/lot/pack/cycle/order/delivery/complaint.
Fields: reference, category, severity, description, linked records, reported date, owner,
status, corrective action, resolution, resolution date. A high-severity lot incident
offers "withdraw lot + list affected unfulfilled orders".

### 3.9 Textos web (Website text)
CMS for generic site copy only (ca/es/en), page+section key, draft + published states,
preview, char limits, last editor, last published. **Guardrail:** operational facts
(weights, prices, dates, capacity, farm, traceability) are **never** stored here; they
come from structured records.

### 3.10 Usuarios y permisos (Users & permissions)
Platform-only. Create users, assign role, assign farm to a `farm_manager`. New accounts
are **never** auto-admin. Reuses `User.role` + `User.farmId` (unique).

### 3.11 Revisión (Review)
Keeps the existing human-only approve/reject queue (`src/app/admin/review/page.tsx`,
`src/lib/admin/actions.ts`), extended to cover offers, packs, lots, cycles, and AI
translation/assistant outputs. AI never appears as an approver.

### 3.12 Registro de actividad (Audit log)
Browsable, filterable view over the existing `AdminAudit` (human actions) and `AiRun`
(AI runs) tables plus the new AI-assistant decision history. Read-only.

### 3.13 Ajustes (Settings)
Platform-only. Marketplace identity, languages, default currency/timezone, delivery zones,
order reference format, cycle defaults, notification toggles, feature flags, AI flags,
analytics consent + retention. **No secrets** are ever shown in the browser; AI keys stay
server-side in `.env` and are surfaced only as presence booleans (already the pattern in
`src/lib/ai/`).

## 4. Shared patterns to reuse
- Server actions in `src/lib/admin/*` with `requireAdmin`/`requirePlatformAdmin` at the
  top and an `AdminAudit` write on every state change (existing pattern in
  `src/lib/admin/actions.ts` + `audit.ts`).
- Data loaders scoped with `visibleFarmScope(user)` (existing pattern in
  `src/lib/admin/data.ts`).
- URL-encoded filters so every list is deep-linkable from Overview cards and metric
  drill-downs.
