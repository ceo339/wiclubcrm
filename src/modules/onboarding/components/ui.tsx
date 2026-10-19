"use client";

import type { ReactNode } from "react";
import type { ItemStatus, Owner } from "../types";

/** Мелкие общие элементы раздела. Цвета и тени только из темы CRM. */

export const OWNER_KEY: Record<Owner, string> = {
  curator: "onbOwnerCurator",
  marketing: "onbOwnerMarketing",
  finance: "onbOwnerFinance",
};

const OWNER_DOT: Record<Owner, string> = {
  curator: "bg-foreground",
  marketing: "bg-accent",
  finance: "bg-muted",
};

export const STATUS_KEY: Record<ItemStatus, string> = {
  todo: "onbStTodo",
  progress: "onbStProgress",
  done: "onbStDone",
  moved: "onbStMoved",
};

/** dd.mm.yyyy → без года, если год текущий. */
export function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return withYear || y !== String(new Date().getFullYear()) ? `${d}.${m}.${y}` : `${d}.${m}`;
}

export function isOverdue(due: string | null, done: boolean): boolean {
  if (!due || done) return false;
  return due < new Date().toISOString().slice(0, 10);
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-border bg-background shadow-card ${className}`}>{children}</div>;
}

export function Chip({ tone = "plain", children }: { tone?: "plain" | "red" | "dark" | "line"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-accent-soft text-accent-strong"
      : tone === "dark"
        ? "bg-foreground text-white"
        : tone === "line"
          ? "border border-border-strong bg-background text-ink-2"
          : "bg-surface-2 text-ink-2";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>{children}</span>;
}

export function OwnerChip({ owner, label }: { owner: Owner; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <i className={`h-2 w-2 shrink-0 rounded-full ${OWNER_DOT[owner]}`} />
      {label}
    </span>
  );
}

export function AssigneeChip({ kind, label }: { kind: "partner" | "hq"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <i className={`h-2 w-2 shrink-0 rounded-full ${kind === "partner" ? "bg-accent" : "bg-foreground"}`} />
      {label}
    </span>
  );
}

export function Bar({ pct, dark = false, className = "" }: { pct: number; dark?: boolean; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <i className={`block h-full rounded-full ${dark ? "bg-foreground" : "bg-accent"}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Ring({ pct, label }: { pct: number; label?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg width="104" height="104" className="-rotate-90">
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <b className="absolute inset-0 grid place-items-center font-display text-[26px]">{label ?? `${pct}%`}</b>
    </div>
  );
}

/** Кружок статуса: пустой, наполовину, черный с галочкой, пунктир «перенесено». */
export function StatusDot({ status, size = 24 }: { status: ItemStatus; size?: number }) {
  const base = "grid place-items-center rounded-full border-[1.6px]";
  const cls =
    status === "done"
      ? "border-foreground bg-foreground"
      : status === "progress"
        ? "border-foreground"
        : status === "moved"
          ? "border-dashed border-muted bg-background"
          : "border-border-strong bg-background";
  return (
    <span
      className={`${base} ${cls}`}
      style={{
        width: size,
        height: size,
        background: status === "progress" ? "conic-gradient(var(--foreground) 0 50%, var(--background) 50% 100%)" : undefined,
      }}
    >
      {status === "done" && (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="white" strokeWidth="3">
          <path d="M5 12l5 5 9-10" />
        </svg>
      )}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h4>;
}

export const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-border-strong focus:outline-none";
export const btnCls = "rounded-lg border border-border-strong bg-background px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-50";
export const btnPriCls = "rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50";
export const chipBtnCls = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${on ? "border-foreground bg-foreground text-white" : "border-border bg-background text-ink-2 hover:bg-surface-2"}`;
