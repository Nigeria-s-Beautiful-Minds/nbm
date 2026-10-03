import { withAuth } from "next-auth/middleware";

// A first, coarse gate: account and staff pages need a session. The real checks (role,
// suspension, ownership) happen on the server for every page and action; see lib/viewer.ts.
// The matcher is deliberately narrow so large media uploads never pass through middleware.
export default withAuth({ callbacks: { authorized: ({ token }) => Boolean(token) } });

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"]
};
