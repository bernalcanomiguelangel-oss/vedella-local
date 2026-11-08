/**
 * Minimal fixture builders for integration tests. Kept tiny and explicit so each
 * test controls exactly the records it needs.
 */
import type { PrismaClient } from "@prisma/client";

const DAY = 24 * 60 * 60 * 1000;

export function validLotDates(baseDaysAgo = 10) {
  const now = Date.now();
  return {
    slaughterDate: new Date(now - (baseDaysAgo + 5) * DAY),
    cuttingDate: new Date(now - (baseDaysAgo + 3) * DAY),
    packingDate: new Date(now - (baseDaysAgo + 2) * DAY),
    expiryDate: new Date(now + 30 * DAY),
  };
}

export async function makeFarm(
  db: PrismaClient,
  overrides: Partial<{
    slug: string;
    name: string;
    isApproved: boolean;
    isActive: boolean;
    isTest: boolean;
  }> = {},
) {
  return db.farm.create({
    data: {
      slug: overrides.slug ?? `farm-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides.name ?? "Test Farm",
      town: "Vic",
      comarca: "Osona",
      breed: "Bruna dels Pirineus",
      foundedYear: 1990,
      animalCount: 40,
      story: "A test farm.",
      lifecycle: "active",
      isApproved: overrides.isApproved ?? true,
      isActive: overrides.isActive ?? true,
      isTest: overrides.isTest ?? false,
    },
  });
}

export async function makeProduct(
  db: PrismaClient,
  farmId: string,
  overrides: Partial<{
    kind: string;
    name: string;
    basePriceCents: number;
    isApproved: boolean;
    isActive: boolean;
    isTest: boolean;
  }> = {},
) {
  return db.product.create({
    data: {
      farmId,
      kind: overrides.kind ?? "cut",
      name: overrides.name ?? "Entrecot",
      description: "A test cut.",
      basePriceCents: overrides.basePriceCents ?? 1438,
      weight: "300 g",
      lifecycle: "active",
      isApproved: overrides.isApproved ?? true,
      isActive: overrides.isActive ?? true,
      isTest: overrides.isTest ?? false,
    },
  });
}

export async function makeLot(
  db: PrismaClient,
  farmId: string,
  productId: string,
  overrides: Partial<{
    reference: string;
    units: number;
    isWithdrawn: boolean;
    isTest: boolean;
  }> = {},
) {
  return db.lot.create({
    data: {
      farmId,
      productId,
      reference:
        overrides.reference ?? `REF-${Math.random().toString(36).slice(2, 10)}`,
      units: overrides.units ?? 20,
      isWithdrawn: overrides.isWithdrawn ?? false,
      isTest: overrides.isTest ?? false,
      ...validLotDates(),
    },
  });
}

export async function makeCycle(
  db: PrismaClient,
  overrides: Partial<{
    totalPlaces: number;
    freePlaces: number;
    isActive: boolean;
  }> = {},
) {
  const now = Date.now();
  return db.reservationCycle.create({
    data: {
      name: "Test cycle",
      zone: "Osona",
      closeDate: new Date(now + 20 * DAY),
      deliveryDate: new Date(now + 30 * DAY),
      totalPlaces: overrides.totalPlaces ?? 50,
      freePlaces: overrides.freePlaces ?? 37,
      transportNote: "Refrigerated.",
      isActive: overrides.isActive ?? true,
    },
  });
}
