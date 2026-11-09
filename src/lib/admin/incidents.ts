/**
 * Incident logic (FEAT-006, docs/admin-information-architecture.md §3.8).
 *
 * An Incident is an operational issue log that LINKS to structured records
 * (farm/definition/offer/lot/pack/cycle/order) by id — it never stores free
 * operational facts of its own. Incidents are farm-scoped: a farm_manager sees
 * and acts on only their own farm's incidents; a platform_admin sees all.
 *
 * A high-severity (high|critical) incident linked to a LOT exposes a
 * "withdraw lot + list affected unfulfilled orders" action: withdrawing the lot
 * flips Lot.isWithdrawn and the helper lists orders still in flight that carry
 * an item from that lot so an operator can follow up. This module is pure logic
 * over a PrismaClient; thin server-action wrappers live in incident-actions.
 */
import type { PrismaClient } from "@prisma/client";
import type { ScopedUser } from "./scope";
import { canActOnFarm, visibleFarmScope } from "./scope";

export const INCIDENT_CATEGORIES = [
  "delivery",
  "complaint",
  "quality",
  "lot",
  "logistics",
  "other",
] as const;

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_STATUSES = ["open", "investigating", "resolved", "closed"] as const;

/** Severities that unlock the lot-withdrawal remediation path. */
export function isHighSeverity(severity: string): boolean {
  return severity === "high" || severity === "critical";
}

export interface IncidentResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
}

export interface CreateIncidentInput {
  reference: string;
  category: string;
  severity: string;
  description: string;
  ownerUserId?: string | null;
  farmId?: string | null;
  productDefinitionId?: string | null;
  farmProductOfferId?: string | null;
  lotId?: string | null;
  packId?: string | null;
  cycleId?: string | null;
  orderId?: string | null;
  isTest?: boolean;
}

/** Build a scope-aware Prisma `where` for Incident listing. A farm_manager is
 * narrowed to their own farmId; a platform_admin is unfiltered. */
export function incidentScopeWhere(user: ScopedUser) {
  const scope = visibleFarmScope(user);
  if (scope === null) return {};
  if (scope.length === 0) return { farmId: "__none__" };
  return { farmId: { in: scope } };
}

/**
 * Create an incident. A farm_manager may only file an incident against their
 * own farm (the farmId link must be in scope). A platform_admin may file
 * against any farm or none.
 */
export async function createIncident(
  prisma: PrismaClient,
  user: ScopedUser,
  input: CreateIncidentInput,
): Promise<IncidentResult> {
  const reference = (input.reference ?? "").trim();
  if (!reference) return { ok: false, code: "BAD_REFERENCE", message: "Reference is required." };
  if (!INCIDENT_CATEGORIES.includes(input.category as (typeof INCIDENT_CATEGORIES)[number])) {
    return { ok: false, code: "BAD_CATEGORY", message: "Unknown category." };
  }
  if (!INCIDENT_SEVERITIES.includes(input.severity as (typeof INCIDENT_SEVERITIES)[number])) {
    return { ok: false, code: "BAD_SEVERITY", message: "Unknown severity." };
  }

  // Farm scope: a manager can only file against their own farm.
  if (input.farmId && !canActOnFarm(user, input.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
  }
  // A farm_manager must scope their incident to a farm (their own).
  if (user.role === "farm_manager" && !input.farmId) {
    return { ok: false, code: "FARM_REQUIRED", message: "Link the incident to your farm." };
  }

  const existing = await prisma.incident.findUnique({ where: { reference } });
  if (existing) return { ok: false, code: "DUPLICATE_REFERENCE", message: "Reference already used." };

  const row = await prisma.incident.create({
    data: {
      reference,
      category: input.category,
      severity: input.severity,
      description: (input.description ?? "").trim(),
      ownerUserId: input.ownerUserId ?? null,
      farmId: input.farmId ?? null,
      productDefinitionId: input.productDefinitionId ?? null,
      farmProductOfferId: input.farmProductOfferId ?? null,
      lotId: input.lotId ?? null,
      packId: input.packId ?? null,
      cycleId: input.cycleId ?? null,
      orderId: input.orderId ?? null,
      isTest: input.isTest ?? false,
    },
  });
  return { ok: true, id: row.id };
}

export interface UpdateIncidentInput {
  status?: string;
  correctiveAction?: string | null;
  resolution?: string | null;
}

/** Update an incident's workflow fields, re-checking farm scope. */
export async function updateIncident(
  prisma: PrismaClient,
  user: ScopedUser,
  incidentId: string,
  input: UpdateIncidentInput,
): Promise<IncidentResult> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, code: "NOT_FOUND", message: "Incident not found." };
  if (!canActOnFarm(user, incident.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
  }
  if (input.status && !INCIDENT_STATUSES.includes(input.status as (typeof INCIDENT_STATUSES)[number])) {
    return { ok: false, code: "BAD_STATUS", message: "Unknown status." };
  }

  const resolving = input.status === "resolved" || input.status === "closed";
  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: input.status ?? incident.status,
      correctiveAction: input.correctiveAction ?? incident.correctiveAction,
      resolution: input.resolution ?? incident.resolution,
      resolvedAt: resolving ? incident.resolvedAt ?? new Date() : incident.resolvedAt,
    },
  });
  return { ok: true, id: incidentId };
}

/** The set of order statuses considered "unfulfilled" (still in flight). */
export const UNFULFILLED_ORDER_STATUSES = [
  "reserved",
  "confirmed",
  "awaiting_farm_confirmation",
  "fulfilling",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
] as const;

export interface AffectedOrderRow {
  orderId: string;
  status: string;
  itemName: string;
  quantity: number;
}

/**
 * List orders that are still unfulfilled AND carry an item from the given lot.
 * Items snapshot a lot reference at reservation time, so we match on the lot's
 * reference against OrderItem.lotReferenceSnapshot. Returns an empty list when
 * no in-flight order is affected.
 */
export async function listAffectedUnfulfilledOrders(
  prisma: PrismaClient,
  lotId: string,
): Promise<AffectedOrderRow[]> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return [];

  const items = await prisma.orderItem.findMany({
    where: {
      lotReferenceSnapshot: lot.reference,
      order: { status: { in: [...UNFULFILLED_ORDER_STATUSES] } },
    },
    include: { order: true },
  });

  return items.map((it) => ({
    orderId: it.orderId,
    status: it.order.status,
    itemName: it.nameSnapshot,
    quantity: it.quantity,
  }));
}

export interface WithdrawResult extends IncidentResult {
  affectedOrders?: AffectedOrderRow[];
}

/**
 * High-severity lot remediation: withdraw the lot linked to a high/critical
 * incident and return the affected unfulfilled orders. Scope is enforced
 * against the incident's farm. The incident must be high severity and linked to
 * a lot; otherwise the action is refused.
 */
export async function withdrawLotForIncident(
  prisma: PrismaClient,
  user: ScopedUser,
  incidentId: string,
): Promise<WithdrawResult> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, code: "NOT_FOUND", message: "Incident not found." };
  if (!canActOnFarm(user, incident.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
  }
  if (!incident.lotId) {
    return { ok: false, code: "NO_LOT", message: "Incident is not linked to a lot." };
  }
  if (!isHighSeverity(incident.severity)) {
    return { ok: false, code: "NOT_HIGH_SEVERITY", message: "Lot withdrawal needs a high-severity incident." };
  }

  await prisma.lot.update({
    where: { id: incident.lotId },
    data: { isWithdrawn: true },
  });

  const affectedOrders = await listAffectedUnfulfilledOrders(prisma, incident.lotId);
  return { ok: true, id: incidentId, affectedOrders };
}

export interface IncidentListRow {
  id: string;
  reference: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  farmId: string | null;
  lotId: string | null;
  canWithdrawLot: boolean;
  reportedAt: Date;
}

/** List incidents visible to this user, newest first. */
export async function listIncidents(
  prisma: PrismaClient,
  user: ScopedUser,
): Promise<IncidentListRow[]> {
  const rows = await prisma.incident.findMany({
    where: incidentScopeWhere(user),
    orderBy: { reportedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    category: r.category,
    severity: r.severity,
    status: r.status,
    description: r.description,
    farmId: r.farmId,
    lotId: r.lotId,
    canWithdrawLot: Boolean(r.lotId) && isHighSeverity(r.severity),
    reportedAt: r.reportedAt,
  }));
}
