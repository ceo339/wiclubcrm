import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and redirects
 * signed-out users away from protected routes. Called from middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: this call refreshes the session cookie — do not remove it,
  // and do not run other code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next");
  // /api/* is never a signed-in browser page — it's server-to-server
  // webhooks (Stripe, Resend, and now the landing-page lead intake route)
  // that authenticate themselves their own way (Stripe's signature header,
  // the intake route's own per-club key) and always use the service_role
  // admin client, not the visitor's session. Redirecting them to /login
  // would silently swallow every webhook call — found 12 сен 2026 while
  // wiring up the intake route, since none of these routes were ever
  // actually exercised through this proxy before.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isAuthRoute && !isPublicAsset && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
