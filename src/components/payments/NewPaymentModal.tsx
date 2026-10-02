"use client";

import { useActionState, useMemo, useState } from "react";
import { createPayment, type ActionResult } from "@/app/payments/actions";
import { STATUSES, statusLabel, todayIso } from "@/lib/payments";
import { convertFromEur, convertToEur, currencySymbol, roundMoney } from "@/lib/currency";
import { useCurrency } from "@/components/currency/CurrencyProvider";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { MemberOption } from "./types";

const initialState: ActionResult = { error: null };
const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

/**
 * Round 53 — two steps instead of one long list: pick the participant, then
 * the поток she's paying for (each of her existing потоки, with what's still
 * left to pay), or «Новый поток» — course + start date — which creates the
 * enrollment on save. A second payment for the same поток is simply a
 * «доплата»: the поток's status follows the sum (частично → оплачено).
 */
export default function NewPaymentModal({
  members,
  products,
  cohorts,
  onClose,
}: {
  members: MemberOption[];
  products: { id: string; name: string; price: number }[];
  cohorts: { product_id: string; start_date: string }[];
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const { currency, rates } = useCurrency();
  const [memberId, setMemberId] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [newProductId, setNewProductId] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [amount, setAmount] = useState("");

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of members) if (!m.enrollmentId) seen.set(m.memberId, m.label);
    return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [members]);
  const potoki = members.filter((m) => m.enrollmentId && m.memberId === memberId);
  const isNew = targetKey === "new";
  const productCohorts = cohorts.filter((c) => c.product_id === newProductId);

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await createPayment(formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  const setAmountEur = (eur: number | null | undefined) => {
    if (eur != null) setAmount(String(roundMoney(convertFromEur(eur, currency, rates), currency)));
  };

  function pickMember(id: string) {
    setMemberId(id);
    const first = members.find((m) => m.enrollmentId && m.memberId === id);
    pickTarget(first ? first.key : "new");
  }
  function pickTarget(key: string) {
    setTargetKey(key);
    if (key === "new") return;
    setAmountEur(members.find((m) => m.key === key)?.defaultAmount);
  }
  function pickProduct(id: string) {
    setNewProductId(id);
    setNewStartDate("");
    setAmountEur(products.find((p) => p.id === id)?.price);
  }

  const submitTarget = isNew ? `member:${memberId}` : targetKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={formAction}>
          <h3 className="text-base font-semibold text-foreground">{t("headingNewPayment")}</h3>
          <input type="hidden" name="target" value={memberId ? submitTarget : ""} />
          {isNew && <input type="hidden" name="new_product_id" value={newProductId} />}
          {isNew && <input type="hidden" name="new_start_date" value={newStartDate} />}

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colMember")}</span>
              <select value={memberId} onChange={(e) => pickMember(e.target.value)} required className={inputCls}>
                <option value="">{t("optionSelectMember")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {people.length === 0 && <span className="text-xs text-muted">{t("emptyAddMemberFirst")}</span>}
            </label>

            {memberId && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("fieldPaymentCohort")}</span>
                <select value={targetKey} onChange={(e) => pickTarget(e.target.value)} className={inputCls}>
                  {potoki.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label.split(" — ").slice(1).join(" — ") || t("optionCourseNotChosen")}
                      {o.remaining ? ` · ${t("labelRemainingShort")} ${roundMoney(convertFromEur(o.remaining, currency, rates), currency)} ${currencySymbol(currency)}` : ""}
                    </option>
                  ))}
                  <option value="new">+ {t("optionNewCohort")}</option>
                </select>
              </label>
            )}

            {memberId && isNew && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-2">{t("fieldCourse")}</span>
                  <select value={newProductId} onChange={(e) => pickProduct(e.target.value)} required className={inputCls}>
                    <option value="">—</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-2">{t("fieldCohortStart")}</span>
                  {productCohorts.length > 0 ? (
                    <select value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} required className={inputCls}>
                      <option value="">—</option>
                      {productCohorts.map((c) => (
                        <option key={c.start_date} value={c.start_date}>
                          {c.start_date.split("-").reverse().join(".")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className={inputCls} />
                  )}
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">
                {t("fieldAmount")} ({currencySymbol(currency)})
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className={inputCls}
              />
              <input type="hidden" name="amount" value={String(convertToEur(parseFloat(amount) || 0, currency, rates))} />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colStatus")}</span>
              <select name="status" defaultValue="paid" className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {statusLabel(s.id, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colDate")}</span>
              <input name="paid_date" type="date" defaultValue={todayIso()} required className={inputCls} />
            </label>
          </div>

          {state.error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(state.error)}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || !memberId}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "..." : t("add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
