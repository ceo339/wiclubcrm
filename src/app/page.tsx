import { redirect } from "next/navigation";
import Link from "next/link";
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

      <main className="flex flex-1 flex-col items-center gap-4 p-8">
        {(profile.partner_id || profile.role === "hq") && (
          <TasksWidget
            tasks={openTasks}
            headingKey={profile.role === "hq" ? "headingNetworkTasks" : "headingMyTasks"}
            canEdit={!!profile.partner_id}
          />
        )}
        {profile.role === "hq" && (
          <Link
            href="/dashboard"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="headingNetworkSummary" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navNetworkSummaryDesc" />
            </div>
          </Link>
        )}
        {profile.partner_id && (
          <Link
            href={`/dashboard/${profile.partner_id}`}
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="navMySummary" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navMySummaryDesc" />
            </div>
          </Link>
        )}
        <Link
          href="/leads"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navLeads" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navLeadsDesc" />
          </div>
        </Link>
        <Link
          href="/members"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navMembers" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navMembersDesc" />
          </div>
        </Link>
        <Link
          href="/attendance"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navAttendance" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navAttendanceDesc" />
          </div>
        </Link>
        <Link
          href="/products"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navCourses" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navCoursesDesc" />
          </div>
        </Link>
        <Link
          href="/payments"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navPayments" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navPaymentsDesc" />
          </div>
        </Link>
        {profile.role === "hq" && (
          <Link
            href="/partners"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="navPartners" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navPartnersDesc" />
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}
