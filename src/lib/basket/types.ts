/**
 * Basket line types shared between the client basket store and the reserve API.
 * A line is a pack or a cut with a quantity. Each pack counts as one unit; a cut
 * line contributes its quantity to the unit count (see pricing.ts).
 */
export interface BasketItem {
  productId: string;
  kind: "pack" | "cut";
  name: string;
  unitPriceCents: number;
  farmSlug: string;
  farmName: string;
  /** Representative lot reference for traceability on the order snapshot. */
  lotReference: string | null;
  quantity: number;
}

export interface ReserveRequestBody {
  items: {
    productId: string;
    quantity: number;
  }[];
  customerName?: string;
  customerEmail?: string;
}
