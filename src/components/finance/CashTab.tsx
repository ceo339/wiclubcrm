"use client";

import { useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MoneyAmountField from "@/components/currency/MoneyAmountField";
import { localOf } from "@/lib/currency";
import { monthLabel } from "@/lib/dashboard";
import { scale, type Amt } from "@/lib/finance/amt";
import type { CashMonth } from "@/lib/finance/report";
import type { Settings } from "@/lib/finance/report";
import { saveOpening } from "@/app/finance/actions";
import { A, useAmtNumber } from "./A";

const neg = (a: Amt) => scale(a, -1);

function Cell({ v, bold, balance }: { v: Amt; bold?: boolean; balance?: boolean }) {
  const n = useAmtNumber(v);
  return (
    <td className={`px-3 py-2 text-right ${bold ? "font-semibold" : ""} ${balance && n < 0 ? "text-accent-strong" : ""}`}>
      <A v={v} />
    </td>
  );
}

export default function CashTab({
  months, hasOpening, settings, canManage, firstMonth,
}: {
  months: CashMonth[]; hasOpening: boolean; settings: Settings; canManage: boolean; firstMonth: string;
}) {
  const { locale, t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const head = (label: string) => (
    <tr><td colSpan={months.length + 1} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</td></tr>
  );
  const line = (label: React.ReactNode, pick: (m: CashMonth) => Amt, opts?: { out?: boolean; bold?: boolean; balance?: boolean; hint?: string }) => (
    <tr className={`border-t border-border ${opts?.bold ? "bg-surface-2" : ""}`}>
      <td className={`px-3 py-2 text-left ${opts?.bold ? "font-semibold" : ""}`}>
        {label}
        {opts?.hint && <div className="text-[11px] font-normal text-muted">{opts.hint}</div>}
      </td>
      {months.map((m) => <Cell key={m.month} v={opts?.out ? neg(pick(m)) : pick(m)} bold={opts?.bold} balance={opts?.balance} />)}
    </tr>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("finCashHint")}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finColItem")}</th>
              {months.map((m) => <th key={m.month} className="px-3 py-2 text-right font-medium">{monthLabel(m.month, locale).split(" ")[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {head(t("finCashIn"))}
            {line(<>{t("finCashClients")}<span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">{t("finFromCrm")}</span></>, (m) => m.receipts, { hint: t("finCashClientsHint") })}
            {line(t("finOtherIncome"), (m) => m.otherIncome)}
            {head(t("finCashOut"))}
            {line(t("finCashOperating"), (m) => m.operating, { out: true })}
            {line(t("finCashAcquiring"), (m) => m.acquiring, { out: true })}
            {line(t("finCashUk"), (m) => m.ukPayment, { out: true, hint: t("finCashUkHint") })}
            {line(t("finCashTax"), (m) => m.tax, { out: true })}
            {line(t("finCashInvest"), (m) => m.investment, { out: true })}
            {line(t("finCashNet"), (m) => m.net, { bold: true, balance: true })}
            {line(t("finCashClosing"), (m) => m.closing, { bold: true, balance: true, hint: t("finCashClosingHint") })}
          </tbody>
        </table>
      </div>
      {!hasOpening && <p className="text-sm text-muted">{t("finNoOpening")}</p>}

      {canManage && (
        <div className="rounded-xl border border-border bg-background p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-semibold text-foreground">{t("finOpeningTitle")}</div>
            {!editing && <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">{hasOpening ? t("edit") : t("finOpeningSet")}</button>}
          </div>
          {!editing && settings && (
            <p className="mt-1 text-sm text-ink-2">
              <A v={{ eur: settings.opening_balance, loc: settings.opening_balance_local ?? 0, cur: settings.opening_balance_local === null ? null : settings.local_currency, ok: settings.opening_balance_local !== null }} />{" · "}
              {monthLabel(settings.opening_month.slice(0, 7), locale)}
            </p>
          )}
          {editing && (
            <form
              className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
              action={(fd) => { setError(null); start(async () => { const r = await saveOpening(fd); if (r.error) setError(r.error); else setEditing(false); }); }}
            >
              <MoneyAmountField
                name="opening_balance" label={t("finOpeningBalance")} required
                defaultAmountEur={settings?.opening_balance ?? 0}
                defaultLocal={settings ? localOf(settings.opening_balance_local, settings.local_currency) : null}
              />
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("finOpeningMonth")}</span>
                <input name="opening_month" type="month" required defaultValue={(settings?.opening_month ?? `${firstMonth}-01`).slice(0, 7)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">{t("save")}</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink-2">{t("cancel")}</button>
              </div>
            </form>
          )}
          <p className="mt-2 text-xs text-muted">{t("finOpeningHint")}</p>
          {error && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
        </div>
      )}
    </div>
  );
}
