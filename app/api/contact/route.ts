import { type NextRequest, NextResponse } from "next/server"

// Stub — logs the contact request and returns 200.
// Replace with your CRM, email, or ticketing system integration.
export async function POST(request: NextRequest) {
  // Guard against oversized payloads (e.g. accidental large uploads)
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 8_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  try {
    const raw = await request.json()
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const body = raw as Record<string, unknown>

    // Validate field types; reject unexpected non-string values
    const name    = typeof body.name    === "string" ? body.name.slice(0, 200)    : undefined
    const company = typeof body.company === "string" ? body.company.slice(0, 200) : undefined
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : undefined

    console.log("[contact] Enterprise inquiry received:", { name, company, message })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
