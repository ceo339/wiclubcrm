"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { saveMetaConnection, disconnectMeta, syncMetaNow } from "@/app/ads/actions";

export type AdsRow = {
  partner_id: string;
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  currency: string | null;
};

export type AdsConnectionInfo = {
  ad_account_id: string;
  account_name: string | null;
  account_currency: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

type CrmLead = { campaign: string; date: string; paid: boolean };

type Preset = "7" | "30" | "month" | "prevMonth" | "all";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(p: Preset): { from: string | null; to: string | null } {
  const now = new Date();
  if (p === "all") return { from: null, to: null };
  if (p === "month") {
    return { from: isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: null };
  }
  if (p === "prevMonth") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: isoDay(from), to: isoDay(to) };
  }
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (Number(p) - 1));
  return { from: isoDay(from), to: null };
}

function inRange(date: string, r: { from: string | null; to: string | null }): boolean {
  if (r.from && date < r.from) return false;
  if (r.to && date > r.to) return false;
  return true;
}

type Totals = { spend: number; impressions: number; clicks: number; leads: number };
const zero = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, leads: 0 });
function add(t: Totals, r: AdsRow) {
  t.spend += r.spend;
  t.impressions += r.impressions;
  t.clicks += r.clicks;
  t.leads += r.leads;
}

export default function AdsBoard({
  rows,
  crmLeads,
  connection,
  hasClub,
  canManage,
}: {
  rows: AdsRow[];
  crmLeads: CrmLead[];
  connection: AdsConnectionInfo | null;
  hasClub: boolean;
  canManage: boolean;
}) {
  const { locale, t } = useLocale();
  const [preset, setPreset] = useState<Preset>("30");
  const [campaign, setCampaign] = useState<string>("all");
  const range = presetRange(preset);

  const currencies = useMemo(() => Array.from(new Set(rows.map((r) => r.currency).filter(Boolean))), [rows]);
  const currency = (currencies[0] as string | undefined) ?? connection?.account_currency ?? "USD";
  const mixedCurrency = currencies.length > 1;

  const money = (v: number) =>
    new Intl.NumberFormat(locale === "bg" ? "bg-BG" : "ru-RU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  const int = (v: number) => new Intl.NumberFormat(locale === "bg" ? "bg-BG" : "ru-RU").format(v);
  const dayLabel = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });

  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.campaign_id, r.campaign_name ?? r.campaign_id);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = rows.filter((r) => inRange(r.date, range) && (campaign === "all" || r.campaign_id === campaign));
  const campaignName = campaign === "all" ? null : (campaigns.find((c) => c.id === campaign)?.name ?? null);
  const crmFiltered = crmLeads.filter(
    (l) => inRange(l.date, range) && (campaignName === null || l.campaign === campaignName)
  );
  // Only count CRM leads whose campaign actually appears in Meta data, so
  // organic/landing-page UTMs don't inflate the ad totals.
  const knownNames = new Set(campaigns.map((c) => c.name));
  const crmMatched = crmFiltered.filter((l) => knownNames.has(l.campaign));

  const totals = zero();
  for (const r of filtered) add(totals, r);
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
  const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const crmPaid = crmMatched.filter((l) => l.paid).length;

  const byDay = useMemo(() => {
    const m = new Map<string, Totals>();
    for (const r of filtered) {
      const d = m.get(r.date) ?? zero();
      add(d, r);
      m.set(r.date, d);
    }
    return Array.from(m, ([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const byCampaign = useMemo(() => {
    const m = new Map<string, Totals & { name: string }>();
    for (const r of filtered) {
      const c = m.get(r.campaign_id) ?? { ...zero(), name: r.campaign_name ?? r.campaign_id };
      add(c, r);
      m.set(r.campaign_id, c);
    }
    return Array.from(m.values())
      .map((c) => {
        const crm = crmFiltered.filter((l) => l.campaign === c.name);
        return { ...c, crmLeads: crm.length, crmPaid: crm.filter((l) => l.paid).length };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [filtered, crmFiltered]);

  const presets: { id: Preset; key: string }[] = [
    { id: "7", key: "adsPreset7" },
    { id: "30", key: "adsPreset30" },
    { id: "month", key: "adsPresetMonth" },
    { id: "prevMonth", key: "adsPresetPrevMonth" },
    { id: "all", key: "adsPresetAll" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ConnectionCard connection={connection} hasClub={hasClub} canManage={canManage} />

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    preset === p.id ? "bg-surface-2 text-foreground" : "text-muted hover:text-ink-2"
                  }`}
                >
                  {t(p.key)}
                </button>
              ))}
            </div>
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="max-w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="all">{t("adsAllCampaigns")}</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {mixedCurrency && <span className="text-xs text-warn">{t("adsMixedCurrency")}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label={t("adsSpend")} value={money(totals.spend)} />
            <Tile label={t("adsImpressions")} value={int(totals.impressions)} />
            <Tile label={t("adsClicks")} value={int(totals.clicks)} hint={ctr !== null ? `CTR ${ctr.toFixed(2)}%` : undefined} />
            <Tile label={t("adsLeadsMeta")} value={int(totals.leads)} hint={cpl !== null ? `${t("adsCpl")}: ${money(cpl)}` : undefined} />
            <Tile label={t("adsLeadsCrm")} value={int(crmMatched.length)} hint={t("adsLeadsCrmHint")} />
            <Tile
              label={t("adsPaidCrm")}
              value={int(crmPaid)}
              hint={crmPaid > 0 ? `${t("adsCostPerPaid")}: ${money(totals.spend / crmPaid)}` : undefined}
            />
          </div>

          <Section title={t("adsByDay")}>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">{t("adsColDate")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsSpend")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsLeadsMeta")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsCpl")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsColChange")}</th>
                </tr>
              </thead>
              <tbody>
                {byDay
                  .map((d, i) => {
                    const prev = i > 0 ? byDay[i - 1] : null;
                    const dCpl = d.leads > 0 ? d.spend / d.leads : null;
                    const pCpl = prev && prev.leads > 0 ? prev.spend / prev.leads : null;
                    const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±");
                    let change: string = t("adsFirstDay");
                    if (prev) {
                      const parts = [
                        `${t("adsSpendShort")} ${sign(d.spend - prev.spend)}${Math.abs(d.spend - prev.spend).toFixed(2)}`,
                        `${t("adsLeadsShort")} ${sign(d.leads - prev.leads)}${Math.abs(d.leads - prev.leads)}`,
                      ];
                      if (dCpl !== null && pCpl !== null) {
                        parts.push(`${t("adsCplShort")} ${sign(dCpl - pCpl)}${money(Math.abs(dCpl - pCpl))}`);
                      }
                      change = parts.join(", ");
                    }
                    return (
                      <tr key={d.date} className="border-t border-border">
                        <td className="px-4 py-2 whitespace-nowrap">{dayLabel(d.date)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{money(d.spend)}</td>
                        <td className="px-4 py-2">{d.leads}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{dCpl !== null ? money(dCpl) : "—"}</td>
                        <td className="px-4 py-2 text-ink-2">{change}</td>
                      </tr>
                    );
                  })
                  .reverse()}
              </tbody>
            </table>
          </Section>

          <Section title={t("adsByCampaign")}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">{t("adsColCampaign")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsSpend")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsImpressions")}</th>
                  <th className="px-4 py-2 font-medium">CTR</th>
                  <th className="px-4 py-2 font-medium">{t("adsLeadsMeta")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsCpl")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsLeadsCrm")}</th>
                  <th className="px-4 py-2 font-medium">{t("adsPaidCrm")}</th>
                </tr>
              </thead>
              <tbody>
                {byCampaign.map((c) => (
                  <tr key={c.name} className="border-t border-border">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{money(c.spend)}</td>
                    <td className="px-4 py-2">{int(c.impressions)}</td>
                    <td className="px-4 py-2">
                      {c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2">{c.leads}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{c.leads > 0 ? money(c.spend / c.leads) : "—"}</td>
                    <td className="px-4 py-2">{c.crmLeads}</td>
                    <td className="px-4 py-2">{c.crmPaid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}

      {rows.length === 0 && connection && (
        <p className="rounded-xl border border-border bg-background p-5 text-sm text-muted shadow-card">
          {t("adsNoDataYet")}
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 font-display text-[26px] leading-[1.05] tracking-[-0.02em] text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-card">
      <div className="border-b border-border px-4 py-3 text-[15px] font-semibold text-foreground">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function ConnectionCard({
  connection,
  hasClub,
  canManage,
}: {
  connection: AdsConnectionInfo | null;
  hasClub: boolean;
  canManage: boolean;
}) {
  const { locale, t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!hasClub) {
    return (
      <p className="rounded-xl border border-border bg-background p-4 text-sm text-muted shadow-card">
        {t("adsPickClubHint")}
      </p>
    );
  }

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else setEditing(false);
    });
  };

  const showForm = canManage && (!connection || editing);

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-foreground">{t("adsConnTitle")}</div>
          {connection ? (
            <div className="mt-1 text-sm text-ink-2">
              {connection.account_name} · act_{connection.ad_account_id} · {connection.account_currency}
              <div className="mt-0.5 text-xs text-muted">
                {connection.last_sync_at
                  ? `${t("adsLastSync")}: ${new Date(connection.last_sync_at).toLocaleString(locale === "bg" ? "bg-BG" : "ru-RU")}`
                  : t("adsNeverSynced")}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted">{t(canManage ? "adsNotConnected" : "adsNotConnectedView")}</div>
          )}
        </div>
        {connection && !editing && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(syncMetaNow)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              {pending ? t("adsSyncing") : t("adsSyncNow")}
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
                >
                  {t("adsReplaceToken")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(t("adsDisconnectConfirm"))) run(disconnectMeta);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-accent-strong disabled:opacity-50"
                >
                  {t("adsDisconnect")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {connection?.last_sync_error && !editing && (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">
          {t("adsSyncErrorPrefix")}: {t(connection.last_sync_error)}
        </p>
      )}

      {showForm && (
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => saveMetaConnection(fd));
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("adsFieldAccountId")}
            <input
              name="ad_account_id"
              required
              defaultValue={connection ? `act_${connection.ad_account_id}` : ""}
              placeholder="act_123456789"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("adsFieldToken")}
            <input
              name="access_token"
              type="password"
              required
              autoComplete="off"
              placeholder="EAA…"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
            >
              {pending ? t("adsConnecting") : t("adsConnect")}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink-2"
              >
                {t("cancel")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted md:col-span-3">{t("adsTokenHint")}</p>
        </form>
      )}

      {error && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
    </div>
  );
}
