/**
 * Unit tests for pure role-scoping helpers. These enforce that a customer has no
 * admin access and a farm_manager is restricted to their own farm.
 */
import { describe, expect, it } from "vitest";
import {
  canActOnFarm,
  isAdminRole,
  visibleFarmScope,
} from "../../src/lib/admin/scope";

const admin = { role: "platform_admin" as const, farmId: null };
const managerA = { role: "farm_manager" as const, farmId: "farm-A" };
const customer = { role: "customer" as const, farmId: null };

describe("isAdminRole", () => {
  it("admins and managers are admin roles; customers are not", () => {
    expect(isAdminRole("platform_admin")).toBe(true);
    expect(isAdminRole("farm_manager")).toBe(true);
    expect(isAdminRole("customer")).toBe(false);
  });
});

describe("canActOnFarm", () => {
  it("platform_admin can act on any farm", () => {
    expect(canActOnFarm(admin, "farm-A")).toBe(true);
    expect(canActOnFarm(admin, "farm-B")).toBe(true);
    expect(canActOnFarm(admin, null)).toBe(true);
  });

  it("farm_manager can act only on their own farm", () => {
    expect(canActOnFarm(managerA, "farm-A")).toBe(true);
    expect(canActOnFarm(managerA, "farm-B")).toBe(false);
    expect(canActOnFarm(managerA, null)).toBe(false);
  });

  it("customer can never act on any farm", () => {
    expect(canActOnFarm(customer, "farm-A")).toBe(false);
    expect(canActOnFarm(customer, null)).toBe(false);
  });
});

describe("visibleFarmScope", () => {
  it("platform_admin sees all farms (null = unscoped)", () => {
    expect(visibleFarmScope(admin)).toBeNull();
  });
  it("farm_manager sees only their farm", () => {
    expect(visibleFarmScope(managerA)).toEqual(["farm-A"]);
  });
  it("customer sees none", () => {
    expect(visibleFarmScope(customer)).toEqual([]);
  });
});
