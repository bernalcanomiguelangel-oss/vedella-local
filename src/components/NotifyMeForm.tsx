"use client";

/**
 * Notify-me / interested-list capture form (FEAT-005, decision 5). Submits an
 * opt-in email to the `notifyMeAction` server action (which Zod-validates the
 * email server-side). Keeps a tiny client state just to show success/error.
 */
import { useState } from "react";
import { notifyMeAction } from "@/lib/analytics-actions";

export function NotifyMeForm({
  locale,
  farmId,
  strings,
}: {
  locale: string;
  farmId?: string;
  strings: {
    placeholder: string;
    button: string;
    success: string;
    error: string;
  };
}) {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    const res = await notifyMeAction(formData);
    setPending(false);
    setState(res.ok ? "ok" : "error");
  }

  if (state === "ok") {
    return (
      <p
        data-testid="notify-success"
        className="rounded-lg bg-pasture-100 px-3 py-2 text-sm font-medium text-pasture-800"
      >
        {strings.success}
      </p>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="locale" value={locale} />
      {farmId && <input type="hidden" name="farmId" value={farmId} />}
      <input
        type="email"
        name="email"
        required
        placeholder={strings.placeholder}
        data-testid="notify-email"
        className="flex-1 rounded-lg border border-pasture-200 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700 disabled:opacity-60"
      >
        {strings.button}
      </button>
      {state === "error" && (
        <p
          data-testid="notify-error"
          className="text-sm font-medium text-beef-700"
        >
          {strings.error}
        </p>
      )}
    </form>
  );
}
