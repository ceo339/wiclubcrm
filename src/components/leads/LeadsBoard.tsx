"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { HIGH_VALUE_THRESHOLD, SOURCES, sourceColor, sourceLabel } from "@/lib/leads";
import { STALE_LEAD_DAYS } from "@/lib/dashboard";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Money from "@/components/currency/Money";
import type { Tables } from "@/types/database";
import type { Lead } from "./types";
import KanbanBoard from "./KanbanBoard";
import LeadsList from "./LeadsList";
import NewLeadModal from "./NewLeadModal";
import ImportModal from "./ImportModal";
import LeadDetailModal from "./LeadDetailModal";
import DuplicatesModal from "./DuplicatesModal";
import SourceDonut from "./SourceDonut";

function daysSince(dateStr: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

function LeadStat({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{caption}</div>
    </div>
  );
}

type SmartFilter = "stuck" | "week" | "highValue";

export default function LeadsBoard({
  initialLeads,
  isHq,
  canEdit,
  products,
  cohorts,
  partnerCountry,
}: {
  initialLeads: Lead[];
  isHq: boolean;
  canEdit: boolean;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  partnerCountry: string | null;
}) {
  const { locale, t } = useLocale();
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [smartFilters, setSmartFilters] = useState<Set<SmartFilter>>(new Set());
  const [showNewLead, setShowNewLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  // "?open=<id>" — how a link from outside this page (the home page's
  // "Мои задачи" widget) opens a specific lead's card directly, instead of
  // landing on the board and making you search for it.
  const searchParams = useSearchParams();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(() => searchParams.get("open"));
  const selectedLead = initialLeads.find((l) => l.id === selectedLeadId) ?? null;

  const now = useMemo(() => new Date(), []);

  // Top-of-page KPIs and the source donut deliberately look at every lead,
  // not just what's currently filtered/searched — same reasoning as the
  // prototype's own kInPipeline/dIfJoins/donut, which stayed put while the
  // board below them got filtered. "В воронке" = still open (not yet paid
  // or declined); a closed lead isn't "in the funnel" anymore either way.
  const pipelineLeads = useMemo(
    () => initialLeads.filter((l) => l.stage !== "paid" && l.stage !== "declined"),
    [initialLeads]
  );
  const pipelineValue = pipelineLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const newThisWeekCount = initialLeads.filter((l) => daysSince(l.added_date, now) <= 7).length;

  const sourceRows = SOURCES.map((s) => ({
    label: sourceLabel(s, locale),
    color: sourceColor(s),
    count: initialLeads.filter((l) => l.source === s).length,
  }));
  const otherSourceCount = initialLeads.filter((l) => !l.source || !(SOURCES as readonly string[]).includes(l.source)).length;
  if (otherSourceCount > 0) {
    sourceRows.push({ label: t("sourceUnknown"), color: sourceColor(null), count: otherSourceCount });
  }

  function toggleSmart(id: SmartFilter) {
    setSmartFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const smartCounts: Record<SmartFilter, number> = {
    stuck: initialLeads.filter(
      (l) => l.stage !== "paid" && l.stage !== "declined" && daysSince(l.updated_at, now) > STALE_LEAD_DAYS
    ).length,
    week: newThisWeekCount,
    highValue: initialLeads.filter((l) => (l.value ?? 0) >= HIGH_VALUE_THRESHOLD).length,
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialLeads.filter((lead) => {
      if (source !== "all" && lead.source !== source) return false;
      if (
        smartFilters.has("stuck") &&
        !(lead.stage !== "paid" && lead.stage !== "declined" && daysSince(lead.updated_at, now) > STALE_LEAD_DAYS)
      )
        return false;
      if (smartFilters.has("week") && daysSince(lead.added_date, now) > 7) return false;
      if (smartFilters.has("highValue") && (lead.value ?? 0) < HIGH_VALUE_THRESHOLD) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        (lead.phone ?? "").toLowerCase().includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialLeads, search, source, smartFilters, now]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LeadStat label={t("statLeadsPipeline")} value={String(pipelineLeads.length)} caption={t("deltaLeadsPipeline")} />
        <LeadStat
          label={t("statPipelineValue")}
          value={<Money amountEur={pipelineValue} />}
          caption={t("deltaPipelineValue")}
        />
        <LeadStat label={t("statNewThisWeek")} value={String(newThisWeekCount)} caption={t("deltaNewThisWeek")} />
      </div>

      <div className="rounded-xl border border-border bg-background p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">{t("headingLeadSources")}</h2>
        <div className="mt-4">
          <SourceDonut rows={sourceRows} emptyLabel={t("emptyNoLeadsForSources")} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["stuck", "chipStuck"],
            ["week", "chipNewWeek"],
            ["highValue", "chipHighValue"],
          ] as const
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            onClick={() => toggleSmart(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              smartFilters.has(id)
                ? "border-accent bg-accent text-white"
                : "border-border-strong bg-background text-ink-2 hover:bg-surface-2"
            }`}
          >
            {t(labelKey)} <span className="font-bold">{smartCounts[id]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchLeadsPlaceholder")}
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("allSources")}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s, locale)}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-surface-2 p-1 text-sm">
            <ViewTab active={view === "board"} onClick={() => setView("board")}>
              {t("viewKanban")}
            </ViewTab>
            <ViewTab active={view === "list"} onClick={() => setView("list")}>
              {t("viewList")}
            </ViewTab>
          </div>
          {canEdit && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
              >
                {t("btnImport")}
              </button>
              <button
                onClick={() => setShowNewLead(true)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                {t("btnAddLeadShort")}
              </button>
            </>
          )}
          {isHq && (
            <button
              onClick={() => setShowDuplicates(true)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("btnFindDuplicates")}
            </button>
          )}
        </div>
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("hqReadOnlyLeadsBanner")}
        </p>
      )}

      {view === "board" ? (
        <KanbanBoard
          leads={filtered}
          canEdit={canEdit}
          showPartner={isHq}
          onSelect={setSelectedLeadId}
        />
      ) : (
        <LeadsList
          leads={filtered}
          showPartner={isHq}
          onSelect={setSelectedLeadId}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          products={products}
          cohorts={cohorts}
          partnerCountry={partnerCountry}
          onClose={() => setShowNewLead(false)}
        />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} />}
      {selectedLead && (
        <LeadDetailModal
          key={selectedLead.id}
          lead={selectedLead}
          canEdit={canEdit}
          isHq={isHq}
          products={products}
          cohorts={cohorts}
          partnerCountry={partnerCountry}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
