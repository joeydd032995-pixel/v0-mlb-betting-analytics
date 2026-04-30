/**
 * /api/watchlist/[gameId]
 *
 * DELETE — remove a game from the authenticated user's watchlist
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { gameId } = await params

  const existing = await prisma.watchlistItem.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.watchlistItem.delete({
    where: { userId_gameId: { userId, gameId } },
  })

  return new NextResponse(null, { status: 204 })
}
