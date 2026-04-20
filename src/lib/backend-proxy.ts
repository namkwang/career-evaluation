// Manual proxy from Next.js route handlers to the FastAPI backend.
// The default `next.config.ts` rewrite closes long-lived requests / streaming
// responses prematurely in Next.js 16 (ECONNRESET / "socket hang up" on the
// proxy layer). Use this helper for any endpoint whose total latency can
// exceed a few seconds or that streams chunks back.
import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

type ProxyOpts = {
  /** path on the backend, e.g. "/api/merge" */
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
};

export async function proxyToBackend(
  request: NextRequest,
  { path, method }: ProxyOpts
): Promise<Response> {
  const url = `${BACKEND_URL}${path}${request.nextUrl.search || ""}`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const body = method === "GET" || method === "DELETE" ? undefined : request.body;

  const upstream = await fetch(url, {
    method,
    headers,
    body,
    cache: "no-store",
    // @ts-expect-error duplex is required in Node fetch for streaming bodies
    duplex: body ? "half" : undefined,
  });

  const resHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) resHeaders.set("content-type", ct);
  resHeaders.set("cache-control", "no-cache, no-transform");
  resHeaders.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}
