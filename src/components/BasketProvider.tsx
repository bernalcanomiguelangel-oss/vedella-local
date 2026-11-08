"use client";

/**
 * Client-side basket store. Persists to localStorage so the basket survives
 * navigation and reloads. Pricing is never computed here beyond simple line
 * arithmetic for display — the authoritative totals come from pricing.ts via the
 * basket page, and the reserve API recomputes everything server-side from the DB
 * (the client never sets prices that the server trusts).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BasketItem } from "@/lib/basket/types";

const STORAGE_KEY = "vedella.basket.v1";

interface BasketContextValue {
  items: BasketItem[];
  add: (item: Omit<BasketItem, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  unitCount: number;
  hydrated: boolean;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BasketItem[];
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      // Corrupt storage: start empty.
    }
    setHydrated(true);
  }, []);

  // Persist on change (after hydration so we don't clobber stored state).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore quota/availability errors.
    }
  }, [items, hydrated]);

  const value = useMemo<BasketContextValue>(() => {
    const unitCount = items.reduce((sum, i) => sum + i.quantity, 0);
    return {
      items,
      unitCount,
      hydrated,
      add(item, quantity = 1) {
        setItems((prev) => {
          const existing = prev.find((p) => p.productId === item.productId);
          if (existing) {
            return prev.map((p) =>
              p.productId === item.productId
                ? { ...p, quantity: p.quantity + quantity }
                : p,
            );
          }
          return [...prev, { ...item, quantity }];
        });
      },
      setQuantity(productId, quantity) {
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((p) => p.productId !== productId)
            : prev.map((p) =>
                p.productId === productId ? { ...p, quantity } : p,
              ),
        );
      },
      remove(productId) {
        setItems((prev) => prev.filter((p) => p.productId !== productId));
      },
      clear() {
        setItems([]);
      },
    };
  }, [items, hydrated]);

  return (
    <BasketContext.Provider value={value}>{children}</BasketContext.Provider>
  );
}

export function useBasket(): BasketContextValue {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error("useBasket must be used within a BasketProvider");
  return ctx;
}
