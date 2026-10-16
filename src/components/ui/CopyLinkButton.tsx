"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

/**
 * Round 73 — «Скопировать ссылку» на карточку: адресная строка при открытой
 * карточке остаётся без id, поэтому ссылку вида `<страница>?open=<id>` (её
 * понимают /leads и /franchise) собираем здесь и кладём в буфер обмена.
 */
export default function CopyLinkButton({ path, id, className }: { path: string; id: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}?open=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers / blocked clipboard API: fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={className ?? "text-xs text-muted hover:text-ink-2"}
      title={t("copyLinkHint")}
    >
      {copied ? t("copyLinkDone") : t("copyLink")}
    </button>
  );
}
