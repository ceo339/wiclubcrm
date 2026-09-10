import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import { signOut } from "./login/actions";

const ROLE_LABEL_KEYS: Record<string, string> = {
  partner: "roleLabelPartner",
  staff: "roleLabelStaff",
  hq: "roleLabelHq",
};

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);
  const roleLabelKey = ROLE_LABEL_KEYS[profile.role];

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            <T k="appName" />
          </h1>
          <p className="text-sm text-muted">
            {profile.partner_name ?? <T k="noClubAttached" />} ·{" "}
            {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              <T k="signOut" />
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-4 p-8">
        {profile.role === "hq" && (
          <Link
            href="/dashboard"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="headingNetworkSummary" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navNetworkSummaryDesc" />
            </div>
          </Link>
        )}
        {profile.partner_id && (
          <Link
            href={`/dashboard/${profile.partner_id}`}
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="navMySummary" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navMySummaryDesc" />
            </div>
          </Link>
        )}
        <Link
          href="/leads"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navLeads" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navLeadsDesc" />
          </div>
        </Link>
        <Link
          href="/members"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navMembers" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navMembersDesc" />
          </div>
        </Link>
        <Link
          href="/attendance"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navAttendance" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navAttendanceDesc" />
          </div>
        </Link>
        <Link
          href="/products"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navCourses" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navCoursesDesc" />
          </div>
        </Link>
        <Link
          href="/payments"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground"><T k="navPayments" /></div>
          <div className="mt-1 text-xs text-muted">
            <T k="navPaymentsDesc" />
          </div>
        </Link>
        {profile.role === "hq" && (
          <Link
            href="/partners"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground"><T k="navPartners" /></div>
            <div className="mt-1 text-xs text-muted">
              <T k="navPartnersDesc" />
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}
