import type { Metadata } from "next";
import { CurrencyProvider } from "@/components/currency/CurrencyProvider";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
/**
 * Brand fonts, self-hosted via Fontsource rather than next/font/google:
 * next/font/google fetches the font files from Google at *build* time, which
 * fails in any environment without outbound access to fonts.googleapis.com
 * (this one included) — Fontsource ships the same variable-font files as a
 * plain npm package, so the build never depends on that network call.
 * These are the actual fonts used by the original design prototype
 * (velora-final2.html), which match the WIClub brandbook's black/white/red
 * palette but chose Manrope + Lora over the brandbook's own Jost / Kazimir
 * Text spec — Kazimir Text is a paid Contrast Foundry face with no free web
 * license and no Cyrillic coverage at all, so the prototype substituted
 * Cyrillic-capable alternatives instead. See globals.css for where each is
 * wired up (--font-sans / --font-display).
 * - Manrope — body / nav / labels.
 * - Lora — headings, quotes, KPI figures (incl. italic, for the login page
 *   tagline).
 * Both imports include the cyrillic subset — almost every visible label in
 * this app is Russian/Bulgarian, not the Latin leftovers a latin-only
 * subset would cover.
 */
import "@fontsource-variable/manrope";
import "@fontsource-variable/lora";
import "@fontsource-variable/lora/wght-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WI Club CRM",
  description: "CRM франчайзинговой сети WI Club",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
