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

  // deleteMany is atomic and avoids the findUnique + delete race condition.
  const { count } = await prisma.watchlistItem.deleteMany({
    where: { userId, gameId },
  })

  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}
