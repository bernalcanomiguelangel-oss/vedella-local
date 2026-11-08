/**
 * Receipt API (R26). Accepts an image/PDF upload (multipart/form-data) and
 * returns PRE-FILLED structured lot/product fields for a human review form.
 *
 * Hard guarantees: creates NO Farm/Lot/Product, approves/publishes NOTHING. The
 * uploaded file is treated strictly as untrusted data; any embedded instruction
 * cannot change state. Works with no API key via the MockAiProvider.
 */
import { NextResponse } from "next/server";
import { extractReceipt, isAcceptedReceiptMime } from "@/lib/ai/receipt";

// Upload size cap (bytes). Keep modest; receipts are small.
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_FORM" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, code: "NO_FILE" },
      { status: 400 },
    );
  }

  if (!isAcceptedReceiptMime(file.type)) {
    return NextResponse.json(
      { ok: false, code: "UNSUPPORTED_TYPE", type: file.type },
      { status: 415 },
    );
  }

  const arrayBuf = await file.arrayBuffer();
  if (arrayBuf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, code: "TOO_LARGE" },
      { status: 413 },
    );
  }
  const bytes = new Uint8Array(arrayBuf);

  // Optional OCR text the client may have supplied; UNTRUSTED.
  const text = typeof form.get("text") === "string"
    ? (form.get("text") as string)
    : undefined;

  const result = await extractReceipt({
    bytes,
    filename: file.name,
    mimeType: file.type,
    text,
  });

  return NextResponse.json({
    ok: result.ok,
    outcome: result.outcome,
    prefill: result.prefill,
    injectionSuspected: result.injectionSuspected,
    note: "Pre-filled fields for human review only. No record is created and nothing is approved.",
  });
}
