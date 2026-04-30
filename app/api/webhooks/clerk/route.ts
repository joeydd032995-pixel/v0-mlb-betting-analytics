/**
 * POST /api/webhooks/clerk
 *
 * Receives Clerk user lifecycle events and keeps the local `users` table in sync.
 * Requires CLERK_WEBHOOK_SECRET set in Vercel env vars and Clerk dashboard.
 *
 * Events handled:
 *   user.created  → INSERT into users
 *   user.updated  → UPDATE users
 *   user.deleted  → DELETE users (cascades to bets, bankroll, watchlist, etc.)
 */

import { NextResponse } from "next/server"
import { Webhook } from "svix"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type ClerkUserPayload = {
  id: string
  email_addresses: Array<{ email_address: string; id: string }>
  primary_email_address_id: string
  first_name: string | null
  last_name: string | null
  image_url: string
}

function primaryEmail(payload: ClerkUserPayload): string {
  return (
    payload.email_addresses.find(
      (e) => e.id === payload.primary_email_address_id
    )?.email_address ?? payload.email_addresses[0]?.email_address ?? ""
  )
}

function displayName(payload: ClerkUserPayload): string | null {
  const parts = [payload.first_name, payload.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : null
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const payload = await request.text()
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  }

  let event: { type: string; data: ClerkUserPayload }
  try {
    event = new Webhook(secret).verify(payload, headers) as typeof event
  } catch (err) {
    console.error("[clerk-webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const { type, data } = event

  try {
    if (type === "user.created") {
      await prisma.user.create({
        data: {
          id: data.id,
          email: primaryEmail(data),
          name: displayName(data),
          imageUrl: data.image_url || null,
        },
      })
      console.log(`[clerk-webhook] Created user ${data.id}`)
    } else if (type === "user.updated") {
      await prisma.user.update({
        where: { id: data.id },
        data: {
          email: primaryEmail(data),
          name: displayName(data),
          imageUrl: data.image_url || null,
        },
      })
      console.log(`[clerk-webhook] Updated user ${data.id}`)
    } else if (type === "user.deleted") {
      // onDelete: Cascade propagates to bets, bankroll, watchlist, transactions, backtest runs
      await prisma.user.delete({ where: { id: data.id } })
      console.log(`[clerk-webhook] Deleted user ${data.id}`)
    }
  } catch (err) {
    console.error(`[clerk-webhook] DB error for ${type}:`, err)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
