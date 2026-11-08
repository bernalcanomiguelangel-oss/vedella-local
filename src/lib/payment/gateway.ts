/**
 * Payment seam for Vedella Local.
 *
 * Vedella Local is reservation-only: there is NO live payment. Payment is
 * collected on delivery / on the spot (product steering). This module defines a
 * clean, isolated interface so a real provider (Stripe, Redsys, …) can be added
 * later WITHOUT refactoring the reservation flow — a new class implementing
 * `PaymentGateway` is dropped in and selected by configuration.
 *
 * The only implementation shipped today is `PayOnDeliveryGateway`, which charges
 * nothing and returns a reservation intent describing the pay-on-delivery terms.
 */

export interface ReservationIntentInput {
  /** Internal order id the intent is attached to. */
  orderId: string;
  /** Total amount that will be collected on delivery, in integer cents. */
  amountCents: number;
  /** ISO currency code. Vedella operates in euros. */
  currency?: string;
  /** Human-readable description shown to the customer. */
  description?: string;
}

export interface ReservationIntent {
  /** Provider that produced this intent. */
  provider: string;
  /** Opaque intent id. For pay-on-delivery it mirrors the order id. */
  intentId: string;
  /** Amount to be collected later, in integer cents. */
  amountCents: number;
  currency: string;
  /**
   * Payment status. Pay-on-delivery never charges online, so the money is due
   * at hand-off: the status is always `pending_on_delivery`, never `paid`.
   */
  status: "pending_on_delivery";
  /** Whether any online charge happened. Always false for pay-on-delivery. */
  charged: boolean;
  description: string;
}

/**
 * The seam. A real gateway would implement the same method and, for example,
 * create a Stripe PaymentIntent. Keeping the surface tiny makes swapping trivial.
 */
export interface PaymentGateway {
  readonly name: string;
  /**
   * Create a reservation intent for an order. Implementations MUST NOT mutate
   * prices — amounts are computed deterministically upstream (pricing.ts).
   */
  createReservation(input: ReservationIntentInput): Promise<ReservationIntent>;
}

/**
 * The no-charge, pay-on-delivery implementation. Deterministic and offline:
 * it records the amount due and returns immediately without contacting anyone.
 */
export class PayOnDeliveryGateway implements PaymentGateway {
  readonly name = "pay_on_delivery";

  async createReservation(
    input: ReservationIntentInput,
  ): Promise<ReservationIntent> {
    return {
      provider: this.name,
      intentId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency ?? "EUR",
      status: "pending_on_delivery",
      charged: false,
      description:
        input.description ?? "Reserva ara, paga a l'entrega",
    };
  }
}

/**
 * Factory. Today it always returns the pay-on-delivery gateway. When a real
 * provider is added, select it here by configuration — callers never change.
 */
export function getPaymentGateway(): PaymentGateway {
  return new PayOnDeliveryGateway();
}
