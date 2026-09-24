"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createTeamAccess,
  resetTeamAccessPassword,
  deleteTeamAccess,
  TEAM_ACCESS_TYPES,
  type TeamAccessType,
  type TeamAccount,
} from "@/app/partners/viewer-actions";
import type { ActionResult } from "@/app/partners/actions";
import { useLocale } from "@/components/i18n/LocaleProvider";

const initialState: ActionResult = { error: null };

const ACCESS_TYPE_LABEL_KEYS: Record<TeamAccessType, string> = {
  network_view: "accessTypeNetworkViewLabel",
  network_and_franchise_view: "accessTypeNetworkAndFranchiseViewLabel",
  franchise_edit: "accessTypeFranchiseEditLabel",
};

/**
 * "Мне нужно создать доступ для таргетолога для просмотра по городам без
 * прав на изменения в базе и в лидах" (Anastasiia, 15 сен 2026) — Round 18,
 * originally just the one "viewer" preset. Round 37 (24 сен 2026) added two
 * more presets when Anastasiia described the access the future «Франчайзи»
 * section needs: someone who sees the network AND the franchise pipeline
 * read-only, and "МПП" who works ONLY the franchise pipeline and should
 * never see any club's leads/members/payments. All three presets share
 * this one management screen — same account lifecycle (create/reset
 * password/revoke), just a different (role, franchise_access) pair
 * underneath (see viewer-actions.ts).
 */
export default function TeamAccessSection({ initialAccounts }: { initialAccounts: TeamAccount[] }) {
  const { locale, t } = useLocale();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showNew, setShowNew] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await createTeamAccess(formData);
    if (!result.error && result.tempPassword) {
      setCredentials({ email: result.resetEmail ?? "", password: result.tempPassword });
      setShowNew(false);
      const accessType = String(formData.get("access_type") || "") as TeamAccessType;
      setAccounts((prev) => [
        {
          id: crypto.randomUUID(),
          full_name: String(formData.get("full_name") || ""),
          email: result.resetEmail ?? null,
          created_at: new Date().toISOString(),
          role: accessType === "franchise_edit" ? "franchise" : "viewer",
          franchise_access: accessType === "network_view" ? "none" : accessType === "franchise_edit" ? "edit" : "view",
          access_type: accessType,
        },
        ...prev,
      ]);
    }
    return result;
  }, initialState);

  async function handleCopy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        t("clipboardCredentialsText", { email: credentials.email, password: credentials.password })
      );
      setCopied(true);
    } catch {
      // clipboard API unavailable — the text is still selectable by hand
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("headingTeamAccess")}</h3>
          <p className="text-xs text-muted">{t("teamAccessSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("btnAddViewer")}
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          {t("emptyNoViewers")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                <th className="px-4 py-3 font-medium">{t("fieldEmailForLogin")}</th>
                <th className="px-4 py-3 font-medium">{t("colAccessType")}</th>
                <th className="px-4 py-3 font-medium">{t("colAdded")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <TeamAccountRow
                  key={a.id}
                  account={a}
                  locale={locale}
                  onRemoved={() => setAccounts((prev) => prev.filter((x) => x.id !== a.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowNew(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <form action={formAction}>
              <h3 className="text-base font-semibold text-foreground">{t("headingAddViewer")}</h3>
              <div className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-2">{t("fieldViewerName")}</span>
                  <input
                    name="full_name"
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-2">{t("fieldEmailForLogin")}</span>
                  <input
                    name="email"
                    type="email"
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink-2">{t("fieldAccessType")}</span>
                  <select
                    name="access_type"
                    required
                    defaultValue={TEAM_ACCESS_TYPES[0]}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    {TEAM_ACCESS_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(ACCESS_TYPE_LABEL_KEYS[type])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {state.error && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
                  {state.error === "errCreateLoginFailed"
                    ? t("errCreateLoginFailed", { message: state.errorDetail ?? "" })
                    : t(state.error)}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  {pending ? "..." : t("btnCreate")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setCredentials(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground">{t("headingViewerCreated")}</h3>
            <p className="mt-2 text-sm text-ink-2">{t("clubCreatedSubtitle")}</p>
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <div>
                <span className="text-muted">{t("fieldEmailColon")}</span>
                <span className="font-medium text-ink-2">{credentials.email}</span>
              </div>
              <div>
                <span className="text-muted">{t("fieldPasswordColon")}</span>
                <span className="font-mono font-medium text-ink-2">{credentials.password}</span>
              </div>
            </div>
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
                onClick={() => setCredentials(null)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                {t("btnDone")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamAccountRow({
  account,
  locale,
  onRemoved,
}: {
  account: TeamAccount;
  locale: string;
  onRemoved: () => void;
}) {
  const { t } = useLocale();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetTeamAccessPassword(account.id);
      if (result.error || !result.tempPassword) {
        setError(result.error ?? "errCreateLoginFailed");
        return;
      }
      setResetResult({ email: result.resetEmail ?? account.email ?? "", password: result.tempPassword });
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTeamAccess(account.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onRemoved();
    });
  }

  async function handleCopy() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(
        t("clipboardCredentialsText", { email: resetResult.email, password: resetResult.password })
      );
      setCopied(true);
    } catch {
      // clipboard API unavailable
    }
  }

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3 font-medium text-foreground">{account.full_name ?? "—"}</td>
      <td className="px-4 py-3 text-muted">{account.email ?? "—"}</td>
      <td className="px-4 py-3 text-muted">
        {account.access_type ? t(ACCESS_TYPE_LABEL_KEYS[account.access_type]) : "—"}
      </td>
      <td className="px-4 py-3 text-muted">
        {new Date(account.created_at).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU")}
      </td>
      <td className="px-4 py-3">
        {resetResult ? (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-2 p-2 text-xs">
            <div>
              <span className="text-muted">{t("fieldPasswordColon")}</span>
              <span className="font-mono font-medium text-ink-2">{resetResult.password}</span>
            </div>
            <button type="button" onClick={handleCopy} className="self-start text-ink-2 underline">
              {copied ? t("btnCopied") : t("btnCopy")}
            </button>
          </div>
        ) : confirming ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted">{t("confirmDeleteViewer")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleDelete}
                className="rounded-lg border border-accent-strong px-2 py-1 text-xs font-medium text-accent-strong hover:bg-accent/10"
              >
                {t("btnDeleteViewerConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={handleReset}
              className="text-xs font-medium text-ink-2 underline hover:text-foreground"
            >
              {t("btnResetPassword")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-accent-strong underline"
            >
              {t("btnRevokeViewer")}
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-accent-strong">{t(error)}</p>}
      </td>
    </tr>
  );
}
