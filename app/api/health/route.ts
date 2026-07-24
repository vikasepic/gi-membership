import { NextResponse } from "next/server";

// Lightweight liveness check for Coolify / uptime monitors. No DB call — just
// confirms the process is serving.
export function GET() {
  return NextResponse.json({ ok: true, service: "gi-membership" });
}
