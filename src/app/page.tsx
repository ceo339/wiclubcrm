import { redirect } from "next/navigation";
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
import AppShell from "@/components/shell/AppShell";

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
    <AppShell
      profile={profile}
      title={<T k="headingHome" />}
      subtitle={
        <>
          {profile.partner_name ?? <T k="noClubAttached" />} ·{" "}
          {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
        </>
      }
      headerExtra={
        <>
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {(profile.partner_id || profile.role === "hq") && (
        <TasksWidget
          tasks={openTasks}
          headingKey={profile.role === "hq" ? "headingNetworkTasks" : "headingMyTasks"}
          canEdit={!!profile.partner_id}
        />
      )}
    </AppShell>
  );
}
