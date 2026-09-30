"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { getCandidateBilling, saveCandidateBilling, type BillingDetails } from "@/app/franchise/payments/actions";

const inputCls =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

const EMPTY: BillingDetails = {
  billing_name: null,
  billing_address: null,
  agreement_number: null,
  agreement_date: null,
  email: null,
  phone: null,
};

/**
 * Round 49: «Реквизиты для инвойса» — what the generated invoice prints in
 * the Franchisee block and the agreement line. Name in Latin letters as in
 * the contract (the card's own name is often just a Cyrillic first name).
 */
export default function BillingDetailsSection({ candidateId, canEdit }: { candidateId: string; canEdit: boolean }) {
  const { t } = useLocale();
  const [data, setData] = useState<BillingDetails | null>(null);
  const [cardName, setCardName] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BillingDetails>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function load() {
    getCandidateBilling(candidateId).then((c) => {
      if (!c) return;
      const { id: _id, name, ...rest } = c;
      setCardName(name);
      setData(rest);
    });
  }
  useEffect(load, [candidateId]);

  if (!data) return null;
  const incomplete = !data.billing_name || !data.billing_address || !data.agreement_number || !data.email;

  function save() {
    setError(null);
    start(async () => {
      const r = await saveCandidateBilling(candidateId, form);
      if (r.error) setError(r.error);
      else {
        setEditing(false);
        load();
      }
    });
  }

  const field = (key: keyof BillingDetails, label: string, type = "text", placeholder?: string) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className={inputCls}
      />
    </label>
  );

  return (
    <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink-2">{t("fpBillingHeading")}</span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setForm(data);
              setEditing(true);
            }}
            className="text-accent hover:underline"
          >
            {t("edit")}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {field("billing_name", t("fpBillingName"), "text", "Rodina Alona")}
            {field("agreement_number", t("fpBillingAgreementNo"), "text", "FLA-002")}
            {field("agreement_date", t("fpBillingAgreementDate"), "date")}
            {field("email", t("fFieldEmail"), "email")}
            {field("phone", t("fFieldPhone"))}
          </div>
          {field("billing_address", t("fpBillingAddress"), "text", "27 Davit Mamuladze St., Apt. 11, Batumi, Georgia")}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
            >
              {t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-2 text-xs text-muted hover:text-ink-2">
              {t("cancel")}
            </button>
          </div>
          {error && <p className="text-accent-strong">{t(error)}</p>}
        </div>
      ) : (
        <div className="mt-1 space-y-0.5 text-ink-2">
          <div>
            <b>{data.billing_name || cardName}</b>
            {data.billing_address && <span className="text-muted"> · {data.billing_address}</span>}
          </div>
          <div className="text-muted">
            {[data.email, data.phone].filter(Boolean).join(" · ") || "—"}
            {data.agreement_number &&
              ` · ${t("fpBillingAgreementShort", {
                no: data.agreement_number,
                date: data.agreement_date ? data.agreement_date.split("-").reverse().join(".") : "—",
              })}`}
          </div>
          {incomplete && <div className="text-warn">{t("fpBillingIncomplete")}</div>}
        </div>
      )}
    </div>
  );
}
