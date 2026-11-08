"use client";

/**
 * Client button that adds a pack or cut to the basket. Shows a brief "added"
 * confirmation. The basket only stores a display price; the server recomputes
 * authoritative prices at reservation time.
 */
import { useState } from "react";
import { useBasket } from "@/components/BasketProvider";
import type { BasketItem } from "@/lib/basket/types";

export function AddToBasketButton({
  item,
  label,
  addedLabel,
}: {
  item: Omit<BasketItem, "quantity">;
  label: string;
  addedLabel: string;
}) {
  const { add } = useBasket();
  const [added, setAdded] = useState(false);

  function onClick() {
    add(item, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold transition ${
        added
          ? "bg-pasture-600 text-cream-50"
          : "bg-beef-600 text-cream-50 hover:bg-beef-700"
      }`}
    >
      {added ? `✓ ${addedLabel}` : label}
    </button>
  );
}
