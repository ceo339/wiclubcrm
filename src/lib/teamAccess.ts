/**
 * The three non-owner account "presets" the «Доступ команды» section on
 * `/partners` can create — round 37 (24 сен 2026), see
 * `src/app/partners/viewer-actions.ts` for the full reasoning behind each
 * preset's (role, franchise_access) pair.
 *
 * This lives in its own plain module, separate from `viewer-actions.ts`,
 * because that file has a `"use server"` directive — a server-actions file
 * may only export async functions
 * (https://nextjs.org/docs/messages/invalid-use-server-value). Exporting
 * this constant array straight from `viewer-actions.ts` built fine locally
 * (no compiler error, no runtime error in dev) but failed the production
 * build on Vercel at the page-data-collection step with "A "use server"
 * file can only export async functions, found object" — round 37's
 * follow-up fix, caught only once real deployment happened. Round 36 (and
 * every earlier round) never exported anything but async functions and
 * `export type` aliases (which TypeScript erases entirely, so they don't
 * count) from a "use server" file, so this particular restriction never
 * came up before.
 */
export const TEAM_ACCESS_TYPES = ["network_view", "network_and_franchise_view", "franchise_edit"] as const;
export type TeamAccessType = (typeof TEAM_ACCESS_TYPES)[number];
