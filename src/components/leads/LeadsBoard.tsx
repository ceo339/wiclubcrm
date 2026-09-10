"use client";

import { useMemo, useState } from "react";
import { SOURCES, sourceLabel } from "@/lib/leads";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Tables } from "@/types/database";
import type { Lead } from "./types";
import KanbanBoard from "./KanbanBoard";
import LeadsList from "./LeadsList";
import NewLeadModal from "./NewLeadModal";
import ImportModal from "./ImportModal";
import LeadDetailModal from "./LeadDetailModal";

export default function LeadsBoard({
  initialLeads,
  isHq,
  canEdit,
  products,
  cohorts,
}: {
  initialLeads: Lead[];
  isHq: boolean;
  canEdit: boolean;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
}) {
  const { locale, t } = useLocale();
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [showNewLead, setShowNewLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = initialLeads.find((l) => l.id === selectedLeadId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialLeads.filter((lead) => {
      if (source !== "all" && lead.source !== source) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        (lead.phone ?? "").toLowerCase().includes(q) ||
        (lead.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialLeads, search, source]);

  return (
    <div className="flex flex-1 flex-col gap-4">
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
          onClose={() => setShowNewLead(false)}
        />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {selectedLead && (
        <LeadDetailModal
          key={selectedLead.id}
          lead={selectedLead}
          canEdit={canEdit}
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
