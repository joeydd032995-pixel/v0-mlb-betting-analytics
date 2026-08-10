// POST /api/contact — enterprise inquiry stub. Logs the request and returns
// 200; no CRM/email/ticketing system is wired up yet. Replace the console.log
// below with a real integration when one exists.

import { type NextRequest, NextResponse } from "next/server"
import { sanitizeForLog } from "@/lib/utils/log"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      company?: string
      message?: string
    }
    console.log("[contact] Enterprise inquiry received from:", sanitizeForLog(body.company ?? "unknown"))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
