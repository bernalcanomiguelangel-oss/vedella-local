"use client";

import { useEffect, useState } from "react";

/**
 * Client countdown to the reservation-close timestamp (FEAT-007). The target is
 * the REAL `closeAt` ISO string passed from the server (ReservationCycle), never
 * a hard-coded value. When the timestamp passes, it shows the closed label so a
 * visitor sees reservations are closed (the server also blocks reservations
 * after close in reserve.ts).
 */
function diffParts(targetMs: number, nowMs: number) {
  const total = Math.max(0, targetMs - nowMs);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return { total, days, hours, minutes, seconds };
}

export function CycleCountdown({
  closeAtIso,
  labels,
}: {
  closeAtIso: string;
  labels: { closesIn: string; closed: string; days: string; hours: string; minutes: string; seconds: string };
}) {
  const target = new Date(closeAtIso).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { total, days, hours, minutes, seconds } = diffParts(target, now);

  if (total <= 0) {
    return (
      <span
        data-testid="cycle-countdown-closed"
        className="rounded-full bg-beef-100 px-3 py-1 text-sm font-semibold text-beef-800"
      >
        {labels.closed}
      </span>
    );
  }

  return (
    <span
      data-testid="cycle-countdown"
      className="inline-flex items-center gap-2 text-sm font-semibold"
    >
      <span className="text-cream-100/80">{labels.closesIn}</span>
      <span className="font-mono">
        {days}
        {labels.days} {String(hours).padStart(2, "0")}
        {labels.hours} {String(minutes).padStart(2, "0")}
        {labels.minutes} {String(seconds).padStart(2, "0")}
        {labels.seconds}
      </span>
    </span>
  );
}
