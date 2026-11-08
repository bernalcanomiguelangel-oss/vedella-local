"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/admin/session-actions";
import type { AdminNavLink } from "@/lib/admin/nav";

/**
 * Admin shell navigation. Left vertical rail on desktop, collapsible drawer on
 * mobile. Rendering is cosmetic only — server-side gating in each page still
 * authorises every request. The log-out entry submits the `logout` server
 * action rather than linking.
 */
export function AdminNav({
  links,
  sessionEmail,
  sessionRole,
  brand,
}: {
  links: AdminNavLink[];
  sessionEmail: string;
  sessionRole: string;
  brand: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = links.filter((l) => !l.isAction);
  const logoutLink = links.find((l) => l.isAction);

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const rail = (
    <nav className="flex h-full flex-col gap-1" aria-label="Admin">
      <ul className="flex flex-col gap-1" data-testid="admin-nav-list">
        {navLinks.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href ?? "#"}
              data-testid={`nav-${link.key}`}
              onClick={() => setOpen(false)}
              aria-current={
                link.href && isActive(link.href) ? "page" : undefined
              }
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                link.href && isActive(link.href)
                  ? "bg-bark-700 text-cream-50"
                  : "text-bark-800 hover:bg-bark-100"
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-bark-200 pt-3">
        <div className="px-3 pb-2 text-xs text-bark-500" data-testid="session-chip">
          <span className="block truncate font-semibold text-bark-800">
            {sessionEmail}
          </span>
          <span data-testid="current-role">{sessionRole}</span>
        </div>
        {logoutLink && (
          <form action={logout}>
            <button
              type="submit"
              data-testid="nav-logout"
              className="w-full rounded-lg bg-gold-200 px-3 py-2 text-sm font-semibold text-bark-900 transition hover:bg-gold-300"
            >
              {logoutLink.label}
            </button>
          </form>
        )}
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar with drawer toggle */}
      <div className="flex items-center justify-between border-b border-bark-200 bg-cream-50 px-4 py-3 md:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-display text-lg font-bold text-bark-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bark-700 text-cream-50">
            🐄
          </span>
          {brand}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="admin-drawer"
          data-testid="admin-nav-toggle"
          className="rounded-lg border border-bark-300 px-3 py-1 text-sm font-semibold text-bark-800"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          id="admin-drawer"
          className="border-b border-bark-200 bg-cream-50 px-4 py-4 md:hidden"
        >
          {rail}
        </div>
      )}

      {/* Desktop left rail */}
      <aside className="hidden w-64 shrink-0 border-r border-bark-200 bg-cream-50 md:flex md:flex-col">
        <Link
          href="/admin"
          className="flex items-center gap-2 border-b border-bark-200 px-4 py-4 font-display text-lg font-bold text-bark-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bark-700 text-cream-50">
            🐄
          </span>
          {brand}
        </Link>
        <div className="flex-1 overflow-y-auto p-3">{rail}</div>
      </aside>
    </>
  );
}
