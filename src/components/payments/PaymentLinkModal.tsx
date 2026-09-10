"use client";

import { useActionState, useMemo, useState } from "react";
import { createPaymentLink, type PaymentLinkResult } from "@/app/payments/actions";
import { useT } from "@/components/i18n/LocaleProvider";
import type { MemberOption } from "./types";

const initialState: PaymentLinkResult = { error: null };

export default function PaymentLinkModal({
  members,
  onClose,
}: {
  members: MemberOption[];
  onClose: () => void;
}) {
  const t = useT();
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [state, formAction, pending] = useActionState(async (_prev: PaymentLinkResult, formData: FormData) => {
    const result = await createPaymentLink(formData);
    if (!result.error && result.url) setLink(result.url);
    return result;
  }, initialState);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId) ?? null,
    [members, memberId]
  );

  function handleMemberChange(id: string) {
    setMemberId(id);
    const member = members.find((m) => m.id === id);
    if (member?.product_price != null) setAmount(String(member.product_price));
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // clipboard API unavailable — the link is still selectable by hand
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={link ? undefined : onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {link ? (
          <>
            <h3 className="text-base font-semibold text-foreground">{t("headingLinkReady")}</h3>
            <p className="mt-2 text-sm text-ink-2">{t("linkReadySubtitle")}</p>
            <div className="mt-4 break-all rounded-lg bg-surface-2 p-3 text-xs text-ink-2">{link}</div>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              {copied ? t("btnCopied") : t("btnCopy")}
            </button>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                {t("btnDone")}
              </button>
            </div>
          </>
        ) : (
          <form action={formAction}>
            <h3 className="text-base font-semibold text-foreground">{t("headingPaymentLink")}</h3>
            <p className="mt-1 text-xs text-muted">{t("paymentLinkSubtitle")}</p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("colMember")}</span>
                <select
                  name="member_id"
                  value={memberId}
                  onChange={(e) => handleMemberChange(e.target.value)}
                  required
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  <option value="">{t("optionSelectMember")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.product_name ? ` — ${m.product_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedMember?.product_name && (
                <p className="text-xs text-muted">{t("coursePrefix", { name: selectedMember.product_name })}</p>
              )}

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("fieldValueEur")}</span>
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
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
                disabled={pending || members.length === 0}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "..." : t("btnCreateLink")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
