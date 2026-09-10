import type { Metadata } from "next";
import { CurrencyProvider } from "@/components/currency/CurrencyProvider";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
/**
 * Brand fonts, self-hosted via Fontsource rather than next/font/google:
 * next/font/google fetches the font files from Google at *build* time, which
 * fails in any environment without outbound access to fonts.googleapis.com
 * (this one included) — Fontsource ships the same variable-font files as a
 * plain npm package, so the build never depends on that network call.
 * - Jost — brandbook's body/nav/labels font (WIClub_Brandbook.pdf).
 * - Playfair Display — stands in for the brandbook's Kazimir Text on
 *   headings/quotes, which is a paid Contrast Foundry face with no free web
 *   license and (worse for us) no Cyrillic coverage at all. See globals.css
 *   for where each is actually wired up (--font-sans / --font-display).
 * Both imports include the cyrillic subset — almost every visible label in
 * this app is Russian/Bulgarian, not the Latin leftovers a latin-only
 * subset would cover.
 */
import "@fontsource-variable/jost";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
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
