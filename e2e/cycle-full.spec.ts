import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * No-oversell flow (review issue #12): drive the active reservation cycle down
 * to zero free places and assert the next reservation is rejected with
 * CYCLE_FULL. The cycle is squeezed to a small number of free places first (so
 * we stay well under the public endpoint's per-client rate limit) and a usable
 * product is resolved from the seeded catalog.
 */
test("a reservation is rejected with CYCLE_FULL once the cycle is drained", async ({
  request,
}) => {
  const prisma = new PrismaClient();
  let productId: string;
  const FREE = 2;
  try {
    // Tighten the active cycle to a tiny, known number of free places.
    const cycle = await prisma.reservationCycle.findFirstOrThrow({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    await prisma.reservationCycle.update({
      where: { id: cycle.id },
      data: { totalPlaces: Math.max(cycle.totalPlaces, FREE), freePlaces: FREE },
    });

    // A publicly offered cut (approved+active farm, usable lot).
    const product = await prisma.product.findFirstOrThrow({
      where: {
        kind: "cut",
        isApproved: true,
        isActive: true,
        isTest: false,
        name: "Entrecot",
        farm: { isApproved: true, isActive: true, isTest: false },
      },
    });
    productId = product.id;
  } finally {
    await prisma.$disconnect();
  }

  const body = { items: [{ productId, quantity: 1 }] };

  // Consume exactly FREE places — each must succeed (201).
  for (let i = 0; i < FREE; i++) {
    const res = await request.post("/api/reserve", { data: body });
    expect(res.status()).toBe(201);
  }

  // The next attempt finds no free places and is rejected with CYCLE_FULL (409).
  const full = await request.post("/api/reserve", { data: body });
  expect(full.status()).toBe(409);
  const json = await full.json();
  expect(json.code).toBe("CYCLE_FULL");
});
