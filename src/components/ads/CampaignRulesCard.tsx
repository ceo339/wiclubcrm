"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { saveCampaignRule, deleteCampaignRule, applyCampaignRule, type RuleActionResult } from "@/app/ads/actions";

export type CampaignRuleRow = {
  id: string;
  campaign_name: string;
  product_id: string;
  cohort_start_date: string | null;
};

type ProductOpt = { id: string; name: string };
type CohortOpt = { product_id: string; start_date: string };

function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Round 76 — правила «кампания → продукт + поток» на странице «Реклама». */
export default function CampaignRulesCard({
  rules,
  products,
  cohorts,
  campaignNames,
  canManage,
}: {
  rules: CampaignRuleRow[];
  products: ProductOpt[];
  cohorts: CohortOpt[];
  campaignNames: string[];
  canManage: boolean;
}) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [cohort, setCohort] = useState("");

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const cohortOptions = useMemo(
    () => cohorts.filter((c) => c.product_id === productId).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [cohorts, productId]
  );

  const run = (fn: () => Promise<RuleActionResult>, after?: (r: RuleActionResult) => void) => {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else after?.(r);
    });
  };

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-card">
      <div className="text-[15px] font-semibold text-foreground">{t("adsRulesTitle")}</div>
      <p className="mt-1 text-sm text-muted">{t("adsRulesHint")}</p>

      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("adsRulesEmpty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{r.campaign_name}</div>
                <div className="text-xs text-muted">
                  {productName(r.product_id)}
                  {r.cohort_start_date ? ` · ${t("adsRuleCohort")} ${dmy(r.cohort_start_date)}` : ""}
                </div>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    title={t("adsRuleApplyHint")}
                    onClick={() =>
                      run(
                        () => applyCampaignRule(r.id),
                        (res) => setInfo(`${t("adsRuleApplied")}: ${res.updated ?? 0}`)
                      )
                    }
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                  >
                    {t("adsRuleApply")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(t("adsRuleDeleteConfirm"))) run(() => deleteCampaignRule(r.id));
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-accent-strong disabled:opacity-50"
                  >
                    {t("adsRuleDelete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {rules.length > 0 && canManage && <p className="mt-2 text-xs text-muted">{t("adsRuleApplyHint")}</p>}

      {canManage && (
        <form
          className="mt-4 grid gap-3 md:grid-cols-[2fr_1.5fr_1fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("campaign_name", campaign);
            fd.set("product_id", productId);
            fd.set("cohort_start_date", cohort);
            run(() => saveCampaignRule(fd), () => {
              setCampaign("");
              setProductId("");
              setCohort("");
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("adsRuleCampaign")}
            <input
              list="ads-rule-campaigns"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            />
            <datalist id="ads-rule-campaigns">
              {campaignNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("adsRuleProduct")}
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setCohort("");
              }}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t("adsRulePickProduct")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("adsRuleCohort")}
            <select
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              disabled={!productId}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">{t("adsRuleNoCohort")}</option>
              {cohortOptions.map((c) => (
                <option key={c.start_date} value={c.start_date}>
                  {dmy(c.start_date)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {t("adsRuleSave")}
          </button>
        </form>
      )}

      {info && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground">{info}</p>}
      {error && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
    </div>
  );
}
