/**
 * In-memory user store (Map-based mock database).
 *
 * PRODUCTION SWAP → Prisma:
 * 1. `npm install prisma @prisma/client`
 * 2. `npx prisma init` → add DATABASE_URL to .env.local
 * 3. Copy the schema from the plan (User model) into prisma/schema.prisma
 * 4. `npx prisma migrate dev`
 * 5. Replace the exports below with the standard Prisma singleton:
 *
 *    import { PrismaClient } from "@prisma/client"
 *    const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
 *    export const db = globalForPrisma.prisma ?? new PrismaClient()
 *    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
 *
 * NOTE: This Map resets on every server restart — data is ephemeral.
 * It is suitable for development and demo purposes only.
 */

export interface StoredUser {
  id: string
  name: string | null
  email: string
  emailVerified: Date | null
  hashedPassword: string | null
  image: string | null
  plan: string | null // "free" | "pro" | "enterprise"
  subscriptionStatus: string | null // "active" | "canceled" | "past_due"
  stripeCustomerId: string | null
  stripeSubId: string | null
  hearAboutUs: string | null
  role: string | null
  createdAt: Date
  updatedAt: Date
}

type CreateUserInput = Omit<StoredUser, "id" | "createdAt" | "updatedAt">
type UpdateUserInput = Partial<Omit<StoredUser, "id" | "createdAt" | "updatedAt">>

// Global singleton so the Map survives HMR in Next.js dev mode
const globalForDb = globalThis as unknown as {
  __userStore: Map<string, StoredUser>
}

const users: Map<string, StoredUser> =
  globalForDb.__userStore ?? new Map<string, StoredUser>()

if (process.env.NODE_ENV !== "production") {
  globalForDb.__userStore = users
}

export const db = {
  users,

  findByEmail(email: string): StoredUser | null {
    for (const user of users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return user
    }
    return null
  },

  findById(id: string): StoredUser | null {
    return users.get(id) ?? null
  },

  create(data: CreateUserInput): StoredUser {
    const id = crypto.randomUUID()
    const now = new Date()
    const user: StoredUser = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }
    users.set(id, user)
    return user
  },

  update(id: string, data: UpdateUserInput): StoredUser | null {
    const existing = users.get(id)
    if (!existing) return null
    const updated: StoredUser = { ...existing, ...data, updatedAt: new Date() }
    users.set(id, updated)
    return updated
  },

  findByStripeCustomerId(customerId: string): StoredUser | null {
    for (const user of users.values()) {
      if (user.stripeCustomerId === customerId) return user
    }
    return null
  },
}
