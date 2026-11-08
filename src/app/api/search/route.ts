/**
 * Search API. Returns only publicly offered farms/products (approved+active,
 * non-withdrawn in-stock lots). Query text is treated as untrusted data.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { search } from "@/lib/catalog";

const QuerySchema = z.object({
  q: z.string().max(100).default(""),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ farms: [], products: [] }, { status: 400 });
  }
  const results = await search(parsed.data.q);
  return NextResponse.json(results);
}
