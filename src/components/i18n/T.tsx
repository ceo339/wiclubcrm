"use client";

import { useLocale } from "./LocaleProvider";

/**
 * Leaf translation component — embeddable inside Server Component JSX
 * exactly like <Money>, since it renders only a text node. Use this for
 * JSX children; use useT() instead inside a Client Component for a plain
 * string value (placeholder, aria-label, title, a confirm() message).
 */
export default function T({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const { t } = useLocale();
  return <>{t(k, vars)}</>;
}
