"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createViewerAccess,
  resetViewerPassword,
  deleteViewerAccess,
  type ViewerAccount,
} from "@/app/partners/viewer-actions";
import type { ActionResult } from "@/app/partners/actions";
import { useLocale } from "@/components/i18n/LocaleProvider";

const initialState: ActionResult = { error: null };

/**
 * "Мне нужно создать доступ для таргетолога для просмотра по городам без
 * прав на изменения в базе и в лидах" (Anastasiia, 15 сен 2026) — Round 18.
 * A viewer account sees every club on every board (same as hq — she chose
 * "все города сразу" when asked) but can never create/edit/delete
 * anything and has no access to this Партнёры page itself (enforced both
 * by can_view_network() vs is_hq() in RLS, and by this page redirecting
 * anyone who isn't role==="hq" — see partners/page.tsx).
 */
export default function ViewerAccessSection({ initialViewers }: { initialViewers: ViewerAccount[] }) {
  const { locale, t } = useLocale();
  const [viewers, setViewers] = useState(initialViewers);
  const [showNew, setShowNew] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await createViewerAccess(formData);
    if (!result.error && result.tempPassword) {
      setCredentials({ email: result.resetEmail ?? "", password: result.tempPassword });
      setShowNew(false);
      setViewers((prev) => [
        { id: crypto.randomUUID(), full_name: String(formData.get("full_name") || ""), email: result.resetEmail ?? null, created_at: new Date().toISOString() },
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
          <h3 className="text-sm font-semibold text-foreground">{t("headingViewerAccess")}</h3>
          <p className="text-xs text-muted">{t("viewerAccessSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("btnAddViewer")}
        </button>
      </div>

      {viewers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          {t("emptyNoViewers")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                <th className="px-4 py-3 font-medium">{t("fieldEmailForLogin")}</th>
                <th className="px-4 py-3 font-medium">{t("colAdded")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {viewers.map((v) => (
                <ViewerRow key={v.id} viewer={v} locale={locale} onRemoved={() => setViewers((prev) => prev.filter((x) => x.id !== v.id))} />
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

function ViewerRow({
  viewer,
  locale,
  onRemoved,
}: {
  viewer: ViewerAccount;
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
      const result = await resetViewerPassword(viewer.id);
      if (result.error || !result.tempPassword) {
        setError(result.error ?? "errCreateLoginFailed");
        return;
      }
      setResetResult({ email: result.resetEmail ?? viewer.email ?? "", password: result.tempPassword });
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteViewerAccess(viewer.id);
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
      <td className="px-4 py-3 font-medium text-foreground">{viewer.full_name ?? "—"}</td>
      <td className="px-4 py-3 text-muted">{viewer.email ?? "—"}</td>
      <td className="px-4 py-3 text-muted">
        {new Date(viewer.created_at).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU")}
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
