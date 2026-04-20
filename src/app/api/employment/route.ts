import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  return proxyToBackend(request, { path: "/api/employment", method: "POST" });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
