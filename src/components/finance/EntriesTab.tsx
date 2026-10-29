"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MoneyAmountField from "@/components/currency/MoneyAmountField";
import { amt, sum, type Amt } from "@/lib/finance/amt";
import { localOf } from "@/lib/currency";
import { isWorkshopName, type Cat, type Exp, type Prod } from "@/lib/finance/report";
import type { JournalPayment } from "@/lib/server/finance";
import { addExpense, updateExpense, deleteExpense } from "@/app/finance/actions";
import { CategoryManager } from "./JournalTab";
import { A } from "./A";

const fmtDate = (d: string) => d.split("-").reverse().join(".");

/**
 * Round 112: журнал разделён на вкладки.
 *  • expense — «Расходы»: статьи сгруппированы как в план/факте (группа → статья → записи) с итогами;
 *  • income — «Доходы»: оплаты курсов из CRM и прочие доходы;
 *  • workshop — «Workshop»: доходы и расходы Workshop и тренингов;
 *  • investment — «Инвестиции»: стартовые вложения клуба.
 */
export type EntriesMode = "expense" | "income" | "workshop" | "investment";

export default function EntriesTab({
  mode, categories, products, expenses, payments = [], canManage, catFilter = null, period, summary, tab,
}: {
  mode: EntriesMode;
  categories: Cat[];
  products: Prod[];
  /** записи журнала, уже отобранные под вкладку и период */
  expenses: Exp[];
  /** оплаты из CRM (доходы / Workshop) */
  payments?: JournalPayment[];
  canManage: boolean;
  catFilter?: string | null;
  period: string;
  summary?: React.ReactNode;
  tab: string;
}) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exp | null>(null);
  const [catId, setCatId] = useState<string>("");
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groupOk = (g: Cat) => {
    if (mode === "income") return g.kind === "income";
    if (mode === "investment") return g.kind === "expense" && g.cash_group === "investment";
    return g.kind === "expense" && g.cash_group !== "investment";
  };
  const groups = useMemo(() => categories.filter((c) => !c.parent_id && groupOk(c)).sort((a, b) => a.sort - b.sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, mode]);
  const leavesOf = (gid: string) => categories.filter((c) => c.parent_id === gid && !c.archived && !c.auto_kind).sort((a, b) => a.sort - b.sort);
  const formProducts = mode === "workshop" ? products.filter((p) => isWorkshopName(p.name)) : products.filter((p) => !isWorkshopName(p.name));
  const productName = (id: string | null) => (id ? (products.find((p) => p.id === id)?.name ?? "—") : t("finGeneral"));
  const activeCat = byId.get(editing?.category_id ?? catId);
  const productRequired = mode === "workshop" || !!activeCat?.per_product;

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const r = editing ? await updateExpense(editing.id, fd) : await addExpense(fd);
      if (r.error) setError(r.error);
      else { setEditing(null); setCatId(""); setFormKey((k) => k + 1); }
    });
  };
  const remove = (e: Exp) => {
    if (confirm(t("finDeleteConfirm"))) start(async () => { const r = await deleteExpense(e.id); if (r.error) setError(r.error); });
  };
  const input = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";
  const v = (e: Exp): Amt => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd);
  const shown = expenses.filter((e) => !catFilter || e.category_id === catFilter);

  const actions = (e: Exp) => canManage ? (
    <td className="px-3 py-2 text-right whitespace-nowrap">
      <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => { setEditing(e); setCatId(e.category_id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("edit")}</button>
      <button type="button" disabled={pending} className="ml-3 text-xs text-muted hover:text-accent-strong" onClick={() => remove(e)}>{t("delete")}</button>
    </td>
  ) : null;

  const form = canManage && (
    <form
      key={`${editing?.id ?? "new"}-${formKey}`}
      action={submit}
      className="grid gap-3 rounded-xl border border-border bg-background p-4 shadow-card md:grid-cols-[1fr_1.6fr_1.2fr_1fr_1.6fr_auto] md:items-end"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("finFieldDate")}</span>
        <input name="date" type="date" required defaultValue={editing?.date ?? today} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("finFieldCategory")}</span>
        <select name="category_id" required value={editing?.category_id ?? catId} onChange={(e) => setCatId(e.target.value)} disabled={!!editing} className={input}>
          <option value="">—</option>
          {groups.map((g) => {
            const ls = leavesOf(g.id);
            return ls.length ? (
              <optgroup key={g.id} label={g.name}>
                {ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        {editing && <input type="hidden" name="category_id" value={editing.category_id} />}
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("finFieldProduct")}{productRequired ? " *" : ""}</span>
        <select name="product_id" required={productRequired} defaultValue={editing?.product_id ?? ""} className={input}>
          <option value="">{productRequired ? "—" : t("finGeneral")}</option>
          {formProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <MoneyAmountField
        key={`${editing?.id ?? "new-amount"}-${formKey}`}
        name="amount" label={t("finFieldAmount")} required
        defaultAmountEur={editing?.amount ?? 0}
        defaultLocal={editing ? localOf(editing.amount_local, editing.local_currency) : null}
      />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("finFieldComment")}</span>
        <input name="comment" defaultValue={editing?.comment ?? ""} className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
          {editing ? t("save") : t("finAdd")}
        </button>
        {editing && <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink-2">{t("cancel")}</button>}
      </div>
    </form>
  );

  const th = "px-3 py-2 font-medium";
  const headRow = (
    <tr className="text-[11px] uppercase tracking-wide text-muted">
      <th className={`${th} text-left`}>{t("finFieldDate")}</th>
      <th className={`${th} text-left`}>{t("finColItem")}</th>
      <th className={`${th} text-left`}>{t("finFieldProduct")}</th>
      <th className={`${th} text-left`}>{t("finFieldComment")}</th>
      <th className={`${th} text-right`}>{t("finColAmount")}</th>
      {canManage && <th className="w-24" />}
    </tr>
  );
  const cols = canManage ? 6 : 5;

  /** расходы / инвестиции / расходы Workshop: группа → статья → записи, с итогами */
  const grouped = (list: Exp[], title?: string) => {
    const total = sum(list.map(v));
    const allGroups = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>{headRow}</thead>
          <tbody>
            {title && <tr><td colSpan={cols} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</td></tr>}
            {list.length === 0 && <tr><td colSpan={cols} className="px-3 py-6 text-center text-muted">{t("finJournalEmpty")}</td></tr>}
            {allGroups.map((g) => {
              const leaves = categories.filter((c) => c.parent_id === g.id).sort((a, b) => a.sort - b.sort);
              const inGroup = list.filter((e) => leaves.some((l) => l.id === e.category_id));
              if (!inGroup.length) return null;
              return [
                <tr key={g.id} className="border-t border-border bg-surface-2/60 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>{g.name}</td>
                  <td className="px-3 py-2 text-right"><A v={sum(inGroup.map(v))} /></td>
                  {canManage && <td />}
                </tr>,
                ...leaves.flatMap((l) => {
                  const es = inGroup.filter((e) => e.category_id === l.id).sort((a, b) => b.date.localeCompare(a.date));
                  if (!es.length) return [];
                  const single = leaves.length === 1 && l.name === g.name;
                  return [
                    ...(single ? [] : [
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2 pl-7 font-medium text-ink-2" colSpan={4}>
                          <Link href={`/finance?tab=${tab}&month=${period}&cat=${l.id}`} className="underline-offset-2 hover:underline">{l.name}</Link>
                        </td>
                        <td className="px-3 py-2 text-right font-medium"><A v={sum(es.map(v))} /></td>
                        {canManage && <td />}
                      </tr>,
                    ]),
                    ...es.map((e) => (
                      <tr key={e.id} className="border-t border-border text-ink-2">
                        <td className={`px-3 py-1.5 whitespace-nowrap ${single ? "pl-7" : "pl-12"}`}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-1.5 text-muted">{l.name}</td>
                        <td className="px-3 py-1.5">{productName(e.product_id)}</td>
                        <td className="px-3 py-1.5 text-muted">{e.comment ?? ""}</td>
                        <td className="px-3 py-1.5 text-right"><A v={v(e)} /></td>
                        {actions(e)}
                      </tr>
                    )),
                  ];
                }),
              ];
            })}
            <tr className="border-t border-border bg-surface-2 font-semibold">
              <td className="px-3 py-2" colSpan={4}>{t("finTotalWord")}</td>
              <td className="px-3 py-2 text-right"><A v={total} /></td>
              {canManage && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  /** доходы: оплаты из CRM + прочие доходы, плоским списком */
  const incomeTable = (pays: JournalPayment[], other: Exp[], title?: string) => {
    type En = { id: string; date: string; pay?: JournalPayment; exp?: Exp };
    const rows: En[] = [
      ...pays.map((p) => ({ id: `p${p.id}`, date: p.paid_date, pay: p })),
      ...other.map((e) => ({ id: `e${e.id}`, date: e.date, exp: e })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const total = sum([...pays.map((p) => amt(p.amount, p.amount_local, p.local_currency)), ...other.map(v)]);
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>{headRow}</thead>
          <tbody>
            {title && <tr><td colSpan={cols} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</td></tr>}
            {rows.length === 0 && <tr><td colSpan={cols} className="px-3 py-6 text-center text-muted">{t("finJournalEmpty")}</td></tr>}
            {rows.map((r) => r.pay ? (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.pay.paid_date)}</td>
                <td className="px-3 py-2">
                  {t("finCoursePayment")}
                  <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">{t("finFromCrm")}</span>
                </td>
                <td className="px-3 py-2">{r.pay.product ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{r.pay.member ?? ""}{r.pay.linked ? "" : ` · ${t("finNotLinked")}`}</td>
                <td className="px-3 py-2 text-right"><A v={amt(r.pay.amount, r.pay.amount_local, r.pay.local_currency)} signed /></td>
                {canManage && <td />}
              </tr>
            ) : r.exp ? (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.exp.date)}</td>
                <td className="px-3 py-2">{byId.get(r.exp.category_id)?.name ?? "—"}</td>
                <td className="px-3 py-2">{productName(r.exp.product_id)}</td>
                <td className="px-3 py-2 text-muted">{r.exp.comment ?? ""}</td>
                <td className="px-3 py-2 text-right"><A v={v(r.exp)} signed /></td>
                {actions(r.exp)}
              </tr>
            ) : null)}
            <tr className="border-t border-border bg-surface-2 font-semibold">
              <td className="px-3 py-2" colSpan={4}>{t("finTotalWord")}</td>
              <td className="px-3 py-2 text-right"><A v={total} /></td>
              {canManage && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const isIncomeCat = (e: Exp) => byId.get(e.category_id)?.kind === "income";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t(`finHint_${mode}`)}</p>
      {summary}
      {form}
      {error && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
      {catFilter && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {t("finFilteredBy")}: <b>{byId.get(catFilter)?.name ?? "—"}</b>
          <Link href={`/finance?tab=${tab}&month=${period}`} className="text-muted underline">{t("finResetFilter")}</Link>
        </p>
      )}

      {mode === "income" && incomeTable(payments, shown.filter(isIncomeCat))}
      {mode === "expense" && grouped(shown.filter((e) => !isIncomeCat(e)))}
      {mode === "investment" && grouped(shown)}
      {mode === "workshop" && (
        <>
          {incomeTable(payments, shown.filter(isIncomeCat), t("finWsIncome"))}
          {grouped(shown.filter((e) => !isIncomeCat(e)), t("finWsExpenses"))}
        </>
      )}

      {mode === "expense" && <p className="text-xs text-muted">{t("finJournalFootnote")}</p>}
      {(mode === "expense" || mode === "investment") && <CategoryManager categories={categories} canManage={canManage} />}
    </div>
  );
}
