"use server";

/**
 * Dev session actions: a login/role selector that signs in as one of the seeded
 * users. No external auth provider is wired (per the brief). The session is just
 * the chosen User.id in an httpOnly cookie; all gating is enforced server-side
 * by src/lib/auth.ts whenever an admin page or action runs.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

/** Sign in as the seeded user with the given id (from the dev selector). */
export async function loginAs(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/admin/login?error=unknown-user");
  }
  cookies().set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Dev session; no https assumption in local dev.
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/admin/login");
}
