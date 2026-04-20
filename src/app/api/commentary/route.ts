// Streaming proxy from Next.js to the FastAPI backend.
// The default rewrite can abort long-lived streams, so we forward manually.
import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const url = `${BACKEND_URL}/api/commentary`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: request.body,
    cache: "no-store",
    // @ts-expect-error duplex is required in Node fetch for streaming bodies
    duplex: "half",
  });

  const resHeaders = new Headers();
  resHeaders.set("content-type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
  resHeaders.set("cache-control", "no-cache, no-transform");
  resHeaders.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
