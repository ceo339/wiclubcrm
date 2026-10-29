"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MoneyAmountField from "@/components/currency/MoneyAmountField";
import { amt } from "@/lib/finance/amt";
import { localOf } from "@/lib/currency";
import type { Cat, Exp, Prod } from "@/lib/finance/report";
import type { JournalPayment } from "@/lib/server/finance";
import { addExpense, updateExpense, deleteExpense, addCategory, renameCategory, archiveCategory } from "@/app/finance/actions";
import { A } from "./A";

const fmtDate = (d: string) => d.split("-").reverse().join(".");

export default function JournalTab({
  categories, products, expenses, payments, canManage, catFilter, period,
}: {
  categories: Cat[]; products: Prod[]; expenses: Exp[]; payments: JournalPayment[];
  canManage: boolean; catFilter: string | null; period: string;
}) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exp | null>(null);
  const [catId, setCatId] = useState<string>("");
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groups = useMemo(() => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort), [categories]);
  const leavesOf = (gid: string, includeAuto = false) =>
    categories.filter((c) => c.parent_id === gid && !c.archived && (includeAuto || !c.auto_kind)).sort((a, b) => a.sort - b.sort);
  const productName = (id: string | null) => (id ? (products.find((p) => p.id === id)?.name ?? "—") : t("finGeneral"));

  const activeCat = byId.get(editing?.category_id ?? catId);
  const catLabel = (c: Cat | undefined) => {
    if (!c) return "—";
    const g = c.parent_id ? byId.get(c.parent_id) : null;
    return g && g.name !== c.name ? `${g.name} · ${c.name}` : c.name;
  };

  type Entry =
    | { kind: "exp"; id: string; date: string; e: Exp }
    | { kind: "pay"; id: string; date: string; p: JournalPayment };
  const entries: Entry[] = [
    ...expenses.filter((e) => !catFilter || e.category_id === catFilter).map((e): Entry => ({ kind: "exp", id: e.id, date: e.date, e })),
    ...(catFilter ? [] : payments.map((p): Entry => ({ kind: "pay", id: p.id, date: p.paid_date, p }))),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      const r = editing ? await updateExpense(editing.id, fd) : await addExpense(fd);
      if (r.error) setError(r.error);
      else {
        setEditing(null);
        setCatId("");
        setFormKey((k) => k + 1); // чистая форма: сумма и комментарий не остаются от прошлой записи
      }
    });
  };
  const input = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("finJournalHint")}</p>

      {canManage && (
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
            <select
              name="category_id" required value={editing?.category_id ?? catId}
              onChange={(e) => setCatId(e.target.value)} disabled={!!editing} className={input}
            >
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
            <span className="font-medium text-ink-2">{t("finFieldProduct")}{activeCat?.per_product ? " *" : ""}</span>
            <select name="product_id" required={!!activeCat?.per_product} defaultValue={editing?.product_id ?? ""} className={input}>
              <option value="">{activeCat?.per_product ? "—" : t("finGeneral")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            {editing && (
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink-2">{t("cancel")}</button>
            )}
          </div>
        </form>
      )}
      {error && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}

      {catFilter && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {t("finFilteredBy")}: <b>{catLabel(byId.get(catFilter))}</b>
          <Link href={`/finance?tab=journal&month=${period}`} className="text-muted underline">{t("finResetFilter")}</Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finFieldDate")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("finFieldCategory")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("finFieldProduct")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("finFieldComment")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColAmount")}</th>
              {canManage && <th className="w-24" />}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">{t("finJournalEmpty")}</td></tr>
            )}
            {entries.map((en) => {
              if (en.kind === "pay") {
                const p = en.p;
                return (
                  <tr key={`p${en.id}`} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.paid_date)}</td>
                    <td className="px-3 py-2">
                      {t("finCoursePayment")}
                      <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">{t("finFromCrm")}</span>
                    </td>
                    <td className="px-3 py-2">{p.product ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{p.member ?? ""}{p.linked ? "" : ` · ${t("finNotLinked")}`}</td>
                    <td className="px-3 py-2 text-right"><A v={amt(p.amount, p.amount_local, p.local_currency)} signed /></td>
                    {canManage && <td />}
                  </tr>
                );
              }
              const e = en.e;
              const c = byId.get(e.category_id);
              const income = c?.kind === "income";
              const v = amt(income ? e.amount : -e.amount, e.amount_local === null ? null : income ? e.amount_local : -e.amount_local, e.local_currency);
              return (
                <tr key={`e${e.id}`} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2">{catLabel(c)}</td>
                  <td className="px-3 py-2">{productName(e.product_id)}</td>
                  <td className="px-3 py-2 text-muted">{e.comment ?? ""}</td>
                  <td className="px-3 py-2 text-right"><A v={v} signed /></td>
                  {canManage && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => { setEditing(e); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("edit")}</button>
                      <button
                        type="button" disabled={pending} className="ml-3 text-xs text-muted hover:text-accent-strong"
                        onClick={() => { if (confirm(t("finDeleteConfirm"))) start(async () => { const r = await deleteExpense(e.id); if (r.error) setError(r.error); }); }}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("finJournalFootnote")}</p>

      <CategoryManager categories={categories} canManage={canManage} />
    </div>
  );
}

export function CategoryManager({ categories, canManage }: { categories: Cat[]; canManage: boolean }) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [perProduct, setPerProduct] = useState(false);
  const groups = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r.error) setError(r.error); else after?.(); });
  };
  return (
    <details className="rounded-xl border border-border bg-background p-4 shadow-card">
      <summary className="cursor-pointer text-[15px] font-semibold text-foreground">{t("finCatsTitle")}</summary>
      <p className="mt-2 text-xs text-muted">{t("finCatsHint")}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="text-sm font-semibold text-foreground">{g.name}</div>
            <ul className="mt-1 space-y-1">
              {categories.filter((c) => c.parent_id === g.id).sort((a, b) => a.sort - b.sort).map((c) => {
                const own = c.partner_id !== null;
                return (
                  <li key={c.id} className={`flex items-center justify-between gap-2 text-sm ${c.archived ? "text-muted line-through" : "text-ink-2"}`}>
                    <span>
                      {c.name}
                      {c.auto_kind && <span className="ml-2 text-[10px] text-muted">{t("finAuto")}</span>}
                      {own && <span className="ml-2 text-[10px] text-muted">{t("finOwnCat")}</span>}
                    </span>
                    {own && canManage && (
                      <span className="whitespace-nowrap">
                        <button type="button" disabled={pending} className="text-xs text-muted hover:text-foreground" onClick={() => { const n = prompt(t("finRenamePrompt"), c.name); if (n !== null) run(() => renameCategory(c.id, n)); }}>{t("edit")}</button>
                        <button type="button" disabled={pending} className="ml-3 text-xs text-muted hover:text-accent-strong" onClick={() => run(() => archiveCategory(c.id, !c.archived))}>{c.archived ? t("finRestore") : t("finArchive")}</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {canManage && (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[2fr_1.5fr_auto_auto] md:items-end"
          onSubmit={(e) => { e.preventDefault(); run(() => addCategory(name, groupId, perProduct), () => { setName(""); setPerProduct(false); }); }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("finNewCatName")}
            <input value={name} onChange={(e) => setName(e.target.value)} required className="rounded-lg border border-border px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("finNewCatGroup")}
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required className="rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              <option value="">—</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" checked={perProduct} onChange={(e) => setPerProduct(e.target.checked)} /> {t("finPerProduct")}
          </label>
          <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">{t("finAddCat")}</button>
        </form>
      )}
      {error && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
    </details>
  );
}
