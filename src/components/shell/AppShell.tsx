"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/auth";
import T from "@/components/i18n/T";
import { signOut } from "@/app/login/actions";
import {
  IconHome,
  IconChart,
  IconFunnel,
  IconUsers,
  IconCalendar,
  IconBook,
  IconWallet,
  IconMail,
  IconBuilding,
} from "./icons";

const ROLE_LABEL_KEYS: Record<string, string> = {
  partner: "roleLabelPartner",
  staff: "roleLabelStaff",
  hq: "roleLabelHq",
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
  const items: NavItem[] = [{ href: "/", labelKey: "navHome", icon: <IconHome /> }];

  if (profile.role === "hq") {
    items.push({
      href: "/dashboard",
      labelKey: "headingNetworkSummary",
      icon: <IconChart />,
      matchPrefix: true,
    });
  } else if (profile.partner_id) {
    items.push({
      href: `/dashboard/${profile.partner_id}`,
      labelKey: "navMySummary",
      icon: <IconChart />,
      matchPrefix: true,
    });
  }

  items.push(
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
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = navItemsForProfile(profile);
  const roleLabelKey = ROLE_LABEL_KEYS[profile.role];

  return (
    <div className="flex min-h-screen bg-surface-2">
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col gap-1.5 border-r border-border bg-background px-3.5 py-5">
        <Link href="/" className="mb-4 flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-display text-[17px] leading-none text-white">
            Wi
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            WI Club CRM
          </span>
        </Link>

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
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-background px-6 py-4">
          <div>
            {backHref && (
              <Link href={backHref} className="text-sm text-muted hover:text-ink-2">
                ← {backLabel}
              </Link>
            )}
            <h1 className={`text-[22px] leading-tight tracking-tight text-foreground ${backHref ? "mt-1" : ""}`}>
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {headerExtra && <div className="flex items-center gap-2">{headerExtra}</div>}
        </header>
        <main className="flex flex-1 flex-col p-6">{children}</main>
      </div>
    </div>
  );
}
