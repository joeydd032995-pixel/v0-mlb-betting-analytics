import { type NextRequest, NextResponse } from "next/server"

// Stub — logs the contact request and returns 200.
// Replace with your CRM, email, or ticketing system integration.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      company?: string
      message?: string
    }
    console.log("[contact] Enterprise inquiry received from:", body.company ?? "unknown")
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
