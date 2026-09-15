"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Profile } from "@/lib/auth";
import { isNetworkRole } from "@/lib/role";
import T from "@/components/i18n/T";
import { useT } from "@/components/i18n/LocaleProvider";
import { signOut } from "@/app/login/actions";
import CityScopeSwitcher from "./CityScopeSwitcher";
import {
  IconHome,
  IconFunnel,
  IconUsers,
  IconContact,
  IconCalendar,
  IconBook,
  IconWallet,
  IconMail,
  IconBuilding,
  IconMenu,
} from "./icons";

const ROLE_LABEL_KEYS: Record<string, string> = {
  partner: "roleLabelPartner",
  staff: "roleLabelStaff",
  hq: "roleLabelHq",
  viewer: "roleLabelViewer",
};

type NavItem = {
  href: string;
  labelKey: string;
  icon: ReactNode;
  /** Also highlight this item for any sub-route (e.g. a single attendance
   * cohort or club dashboard), not just an exact pathname match. */
  matchPrefix?: boolean;
};

function navItemsForProfile(profile: Profile): NavItem[] {
  // Главная now covers what used to be a separate "Сводка"/"Моя сводка"
  // nav entry — HQ's network dashboard and a partner's own club dashboard
  // both render on "/" itself (see src/app/page.tsx), so there's nothing
  // left for a second nav item to point to.
  const items: NavItem[] = [{ href: "/", labelKey: "navHome", icon: <IconHome /> }];

  items.push(
    { href: "/contacts", labelKey: "navContacts", icon: <IconContact /> },
    { href: "/leads", labelKey: "navLeads", icon: <IconFunnel /> },
    { href: "/members", labelKey: "navMembers", icon: <IconUsers /> },
    { href: "/attendance", labelKey: "navAttendance", icon: <IconCalendar />, matchPrefix: true },
    { href: "/products", labelKey: "navCourses", icon: <IconBook /> },
    { href: "/payments", labelKey: "navPayments", icon: <IconWallet /> },
    { href: "/email", labelKey: "navEmail", icon: <IconMail /> }
  );

  if (profile.role === "hq") {
    items.push({ href: "/partners", labelKey: "navPartners", icon: <IconBuilding /> });
  }

  return items;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Persistent left-sidebar app shell, matching the design prototype's
 * layout (velora-final2.html: <aside class="side"> + <div class="main">)
 * instead of this app's earlier home-page-of-cards + separate full-width
 * page pattern. Every existing route keeps its own URL and per-page data
 * fetching — this only replaces each page's repeated header/nav markup, so
 * it's a client component each page.tsx renders explicitly (not a
 * layout.tsx route-tree change), letting per-page currency/locale scope
 * (which genuinely varies — see headerExtra) stay exactly where it was.
 *
 * The prototype's demo-only "My club / Head office" workspace switcher
 * (a single login previewing both roles) isn't reproduced here — every
 * real login has one fixed role, so a toggle that didn't actually switch
 * anything would be a fake control. The role is shown as a plain label
 * instead, same as before this redesign.
 */
export default function AppShell({
  profile,
  title,
  subtitle,
  backHref,
  backLabel,
  headerExtra,
  clubs,
  activeClubId,
  children,
}: {
  profile: Profile;
  title: ReactNode;
  subtitle?: ReactNode;
  /** For drill-down pages that aren't their own sidebar destination (e.g. a
   * single attendance cohort) — a small "← label" line above the title,
   * standing in for the breadcrumb the persistent nav makes unnecessary
   * everywhere else. */
  backHref?: string;
  backLabel?: ReactNode;
  headerExtra?: ReactNode;
  /** Round 18 city switcher — the full club list and the currently chosen
   * one (from the hqCityFilter cookie, see src/lib/viewScope.ts). Only
   * rendered for hq/viewer accounts; a page that doesn't pass `clubs`
   * (e.g. a partner's own pages, which never show this) simply shows
   * nothing extra here. */
  clubs?: { id: string; name: string }[];
  activeClubId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const items = navItemsForProfile(profile);
  const roleLabelKey = ROLE_LABEL_KEYS[profile.role];
  // Round 19 mobile pass ("Нужно сделать оптимизацию под мобильный
  // телефон", Anastasiia, 15 сен 2026) — the sidebar used to be a fixed
  // 248px column with no way to hide it, which on a ~390px phone left less
  // than half the screen for the page itself. Below the md breakpoint it's
  // now an off-canvas drawer, toggled by the hamburger button in the header.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Closing on every route change means a tapped nav link doesn't leave the
  // drawer (and its backdrop) covering the page it just navigated to.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Stop the page behind the drawer from scrolling while it's open — only
  // matters on mobile, where the drawer overlays the content instead of
  // sitting beside it.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen bg-surface-2">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border bg-background px-3.5 py-5 shadow-xl transition-transform duration-200 ease-out md:sticky md:top-0 md:z-auto md:translate-x-0 md:shadow-none ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2.5 px-1.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-display text-[17px] leading-none text-white">
              Wi
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              WI Club CRM
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="shrink-0 rounded-md p-1 text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink-2 md:hidden"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors before:absolute before:top-[9px] before:bottom-[9px] before:left-[-14px] before:w-[3px] before:rounded-r-sm before:content-[''] ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-strong before:bg-accent"
                    : "text-ink-2 before:bg-transparent hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
                <T k={item.labelKey} />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12.5px] font-bold tracking-wide text-ink-2">
            {initials(profile.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-foreground">
              {profile.full_name ?? <T k="appName" />}
            </div>
            <div className="truncate text-xs text-muted">
              {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink-2"
            >
              <T k="signOut" />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* "лиды в моб версии исправить нужно" (Anastasiia, 15 сен 2026) —
            this header used to scroll away with the page like any other
            in-flow element, which on a phone (one screenful is a fraction of
            a page like "Лиды") meant the hamburger button disappeared the
            moment you scrolled past the very top, with no way back to the
            nav short of scrolling all the way back up. `sticky top-0`
            keeps it pinned through the scroll, on every breakpoint. */}
        <header className="sticky top-0 z-30 flex flex-wrap items-start justify-between gap-2 border-b border-border bg-background px-4 py-3.5 md:px-6 md:py-4">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden"
              aria-label={t("navOpenMenu")}
            >
              <IconMenu />
            </button>
            <div className="min-w-0">
              {backHref && (
                <Link href={backHref} className="text-sm text-muted hover:text-ink-2">
                  ← {backLabel}
                </Link>
              )}
              <h1
                className={`text-lg leading-tight tracking-tight text-foreground sm:text-[22px] ${backHref ? "mt-1" : ""}`}
              >
                {title}
              </h1>
              {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isNetworkRole(profile.role) && clubs && clubs.length > 0 && (
              <CityScopeSwitcher clubs={clubs} activeClubId={activeClubId ?? null} />
            )}
            {headerExtra}
          </div>
        </header>
        <main className="flex flex-1 flex-col p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
