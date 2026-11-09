"use client";

import { useRef, useState, useTransition } from "react";
import {
  mediaUploadAction,
  mediaApproveAction,
  mediaRejectAction,
} from "@/lib/admin/manage-actions";
import type { MediaTarget } from "@/lib/admin/manage";

/**
 * Farm image upload control. Reads the selected file in the browser, encodes it
 * as base64 and calls the server action, which re-authenticates, farm-scopes
 * the target, validates the UNTRUSTED file (extension + magic bytes + size),
 * writes it to the git-ignored uploads dir and stores the PATH to the pending*
 * field (public only after platform_admin approval, by default).
 *
 * Shows the current APPROVED image and any PENDING image with a badge. A
 * platform_admin sees approve/reject buttons for the pending media.
 */
export function ImageUploadControl({
  target,
  targetId,
  title,
  currentRef,
  pendingRef,
  isPlatform,
  onChanged,
}: {
  target: MediaTarget;
  targetId: string;
  title: string;
  currentRef: string | null;
  pendingRef: string | null;
  isPlatform: boolean;
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(currentRef);
  const [pendingImg, setPendingImg] = useState<string | null>(pendingRef);

  async function onFile(file: File) {
    const buf = await file.arrayBuffer();
    // Browser-side base64 of the raw bytes; the server never trusts the
    // client Content-Type and re-validates by magic bytes. We convert in chunks
    // (not byte-by-byte) to avoid O(n) string concatenation over a 5 MB buffer.
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000; // 32 KB per String.fromCharCode call (arg-count safe).
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const fileBase64 = btoa(binary);
    startTransition(async () => {
      const res = await mediaUploadAction({
        target,
        targetId,
        fileBase64,
        originalName: file.name,
      });
      if (res.ok) {
        if (res.pending) {
          setPendingImg(res.storedPath ?? null);
          setMsg("Enviada; serà pública quan la plataforma l'aprovi.");
        } else {
          setCurrent(res.storedPath ?? null);
          setPendingImg(null);
          setMsg("Imatge publicada.");
        }
        onChanged?.();
      } else {
        setMsg(res.message ?? "No s'ha pogut pujar la imatge.");
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function decide(approve: boolean) {
    startTransition(async () => {
      const res = approve
        ? await mediaApproveAction(target, targetId)
        : await mediaRejectAction(target, targetId);
      if (res.ok) {
        if (approve) {
          setCurrent(pendingImg ?? current);
        }
        setPendingImg(null);
        setMsg(approve ? "Imatge aprovada i publicada." : "Imatge pendent rebutjada.");
        onChanged?.();
      } else {
        setMsg(res.message ?? "Error");
      }
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-bark-300 p-3">
      <h4 className="text-sm font-semibold text-bark-800">{title}</h4>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {current && (
          <figure className="text-xs text-bark-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt="Imatge actual"
              className="h-20 w-28 rounded object-cover"
            />
            <figcaption>Imatge actual</figcaption>
          </figure>
        )}
        {pendingImg && (
          <figure className="text-xs text-gold-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImg}
              alt="Imatge pendent"
              className="h-20 w-28 rounded object-cover ring-2 ring-gold-400"
            />
            <figcaption className="mt-0.5 inline-block rounded-full bg-gold-100 px-2 py-0.5 text-gold-800">
              Pendent d&apos;aprovació
            </figcaption>
          </figure>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="text-xs"
          aria-label={title}
        />
        {isPlatform && pendingImg && (
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => decide(true)}
              disabled={pending}
              className="rounded bg-olive-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            >
              Aprova
            </button>
            <button
              type="button"
              onClick={() => decide(false)}
              disabled={pending}
              className="rounded bg-red-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            >
              Rebutja
            </button>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-bark-400">Només .jpg, .png o .webp (màx. 5 MB).</p>
      {!isPlatform && (
        <p className="text-xs text-bark-500">
          Les imatges s&apos;envien a revisió; es publiquen quan la plataforma les aprova.
        </p>
      )}
      {msg && <p className="mt-1 text-xs text-olive-700">{msg}</p>}
    </div>
  );
}
