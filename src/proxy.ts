import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// First line of defense for owner pages. Anything that is not on the public
// list needs a valid Supabase session, or the visitor is sent to /login.
// Owner pages and route handlers also check the owner profile themselves,
// because a proxy check alone is not an authorization decision.
//
// Public paths: the sign-in page, the client signing pages (they check their
// own tokens), the logout route, and static assets.

// /api/agent/ checks its own API key on every request.
const PUBLIC_PREFIXES = ["/login", "/sign/", "/logout", "/api/agent/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    return new NextResponse("BuildPro CRM is not configured. See .env.example.", { status: 500 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
