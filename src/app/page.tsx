import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { sortOpenTasks, type OpenTask } from "@/lib/tasks";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import TasksWidget from "@/components/home/TasksWidget";
import T from "@/components/i18n/T";
import { signOut } from "./login/actions";

const ROLE_LABEL_KEYS: Record<string, string> = {
  partner: "roleLabelPartner",
  staff: "roleLabelStaff",
  hq: "roleLabelHq",
};

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);
  const roleLabelKey = ROLE_LABEL_KEYS[profile.role];

  // "Мои задачи" — every open (not done) task across a partner's leads and
  // members in one place; HQ gets the same list read-only across every
  // club (RLS decides which rows come back, this just renders them). Tasks
  // have no FK to leads/members (entity_id is generic), so names come from
  // two follow-up lookups rather than a join.
  const supabase = await createClient();
  const { data: rawTasks } = await supabase
    .from("tasks")
    .select("*, partners(name)")
    .eq("done", false);

  const leadIds = (rawTasks ?? []).filter((t) => t.entity_type === "lead").map((t) => t.entity_id);
  const memberIds = (rawTasks ?? []).filter((t) => t.entity_type === "member").map((t) => t.entity_id);
  const [{ data: leadsForTasks }, { data: membersForTasks }] = await Promise.all([
    leadIds.length ? supabase.from("leads").select("id, name").in("id", leadIds) : Promise.resolve({ data: [] }),
    memberIds.length
      ? supabase.from("members").select("id, name").in("id", memberIds)
      : Promise.resolve({ data: [] }),
  ]);
  const leadNameById = new Map((leadsForTasks ?? []).map((l) => [l.id, l.name]));
  const memberNameById = new Map((membersForTasks ?? []).map((m) => [m.id, m.name]));

  const openTasks: OpenTask[] = sortOpenTasks(
    (rawTasks ?? []).map((row) => {
      const entityType = row.entity_type as "lead" | "member";
      const entityName =
        (entityType === "lead" ? leadNameById.get(row.entity_id) : memberNameById.get(row.entity_id)) ??
        "—";
      return {
        id: row.id,
        text: row.text,
        dueDate: row.due_date,
        entityType,
        entityId: row.entity_id,
        entityName,
        partnerName: profile.role === "hq" ? (row.partners?.name ?? null) : null,
      };
    })
  );

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            <T k="appName" />
          </h1>
          <p className="text-sm text-muted">
            {profile.partner_name ?? <T k="noClubAttached" />} ·{" "}
            {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              <T k="signOut" />
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-6 p-8">
        {(profile.partner_id || profile.role === "hq") && (
          <TasksWidget
            tasks={openTasks}
            headingKey={profile.role === "hq" ? "headingNetworkTasks" : "headingMyTasks"}
            canEdit={!!profile.partner_id}
          />
        )}

        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profile.role === "hq" && (
            <NavCard href="/dashboard" icon={<IconChart />} titleKey="headingNetworkSummary" descKey="navNetworkSummaryDesc" />
          )}
          {profile.partner_id && (
            <NavCard href={`/dashboard/${profile.partner_id}`} icon={<IconChart />} titleKey="navMySummary" descKey="navMySummaryDesc" />
          )}
          <NavCard href="/leads" icon={<IconFunnel />} titleKey="navLeads" descKey="navLeadsDesc" />
          <NavCard href="/members" icon={<IconUsers />} titleKey="navMembers" descKey="navMembersDesc" />
          <NavCard href="/attendance" icon={<IconCalendar />} titleKey="navAttendance" descKey="navAttendanceDesc" />
          <NavCard href="/products" icon={<IconBook />} titleKey="navCourses" descKey="navCoursesDesc" />
          <NavCard href="/payments" icon={<IconWallet />} titleKey="navPayments" descKey="navPaymentsDesc" />
          <NavCard href="/email" icon={<IconMail />} titleKey="navEmail" descKey="navEmailDesc" />
          {profile.role === "hq" && (
            <NavCard href="/partners" icon={<IconBuilding />} titleKey="navPartners" descKey="navPartnersDesc" />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * A single home-screen nav tile: icon badge + title + one-line description.
 * Was a bare text link before — the icon badge is purely a visual anchor to
 * help scan a grid of ~8 destinations at a glance, it carries no meaning of
 * its own (unlike the AI-score/health-status badges rejected elsewhere in
 * this app), so there's nothing dishonest about it being simple line art
 * rather than data-driven.
 */
function NavCard({
  href,
  icon,
  titleKey,
  descKey,
}: {
  href: string;
  icon: ReactNode;
  titleKey: string;
  descKey: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-background p-5 text-left shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors group-hover:bg-accent group-hover:text-white">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground"><T k={titleKey} /></span>
        <span className="mt-1 text-xs text-muted"><T k={descKey} /></span>
      </span>
    </Link>
  );
}

function iconProps() {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
}

function IconChart() {
  return (
    <svg {...iconProps()}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

function IconFunnel() {
  return (
    <svg {...iconProps()}>
      <path d="M4 5h16l-6 7.5V18l-4 2v-7.5L4 5Z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 8.5a2.5 2.5 0 1 0 0-5" />
      <path d="M15 14c2.5.3 4.5 2.1 4.5 5" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="m8.5 14 2 2 4-4" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg {...iconProps()}>
      <path d="M5 4.5c2 0 5 .5 7 2 2-1.5 5-2 7-2v14c-2 0-5 .5-7 2-2-1.5-5-2-7-2Z" />
      <path d="M12 6.5V18.5" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M3.5 10.5h17" />
      <circle cx="16.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg {...iconProps()}>
      <rect x="5" y="3.5" width="9" height="17" rx="1" />
      <rect x="14" y="9" width="5" height="11.5" rx="1" />
      <path d="M7.5 7h1M10.5 7h1M7.5 10.5h1M10.5 10.5h1M7.5 14h1M10.5 14h1" />
    </svg>
  );
}
