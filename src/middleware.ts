import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOWED_HEADERS =
  "content-type, authorization, x-magon-client-key, x-admin-key, x-cron-secret, x-galiopay-token, x-galiopay-signature, x-galiopay-timestamp, x-galiopay-event-id";

function resolveOrigin(requestOrigin: string | null): string | null {
  const configured = (process.env.CORS_ORIGINS ?? "*").trim();
  if (configured === "" || configured === "*") return "*";
  if (!requestOrigin) return null;
  const allowlist = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(requestOrigin) ? requestOrigin : null;
}

function applyCors(response: NextResponse, allowOrigin: string | null): NextResponse {
  if (allowOrigin) {
    response.headers.set("access-control-allow-origin", allowOrigin);
    if (allowOrigin !== "*") response.headers.append("vary", "Origin");
  }
  response.headers.set("access-control-allow-methods", ALLOWED_METHODS);
  response.headers.set("access-control-allow-headers", ALLOWED_HEADERS);
  response.headers.set("access-control-max-age", "86400");
  return response;
}

export function middleware(request: NextRequest) {
  const allowOrigin = resolveOrigin(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), allowOrigin);
  }

  return applyCors(NextResponse.next(), allowOrigin);
}

export const config = {
  matcher: ["/api/:path*"],
};