/**
 * Auth configuration — NextAuth v5 (Auth.js)
 *
 * Choice rationale: NextAuth v5 is chosen over a custom JWT approach because:
 * - SessionProvider + useSession() cover client-side auth with zero extra code
 * - The server-side auth() helper works in Server Components, API routes, and middleware
 * - JWT session strategy means no database session table is required
 * - Google OAuth is supported with a single provider entry
 * - Fewer moving parts than rolling a custom solution
 *
 * Session strategy: "jwt" — tokens are stored in a signed HttpOnly cookie.
 * No database session records are written.
 */

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"
import { comparePassword } from "@/lib/utils/password"
import { loginSchema } from "@/lib/validations/auth"

const providers = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials)
      if (!parsed.success) return null

      const { email, password } = parsed.data
      const user = db.findByEmail(email)
      if (!user || !user.hashedPassword) return null

      const valid = await comparePassword(password, user.hashedPassword)
      if (!valid) return null

      if (!user.emailVerified) return null

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
      }
    },
  }),

  // Google provider — only registered when credentials are configured
  ...(process.env.GOOGLE_CLIENT_ID
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : []),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // On initial sign-in, persist user fields into the JWT
      if (user) {
        token.id = user.id!
        token.plan = (user as { plan?: string | null }).plan ?? null
        token.subscriptionStatus =
          (user as { subscriptionStatus?: string | null }).subscriptionStatus ??
          null
        // emailVerified not on NextAuth User type; fetch from store
        const stored = db.findById(user.id!)
        token.emailVerified = stored?.emailVerified ?? null
      }

      // Handle session updates (e.g. after plan selection)
      if (trigger === "update" && session) {
        const s = session as {
          plan?: string | null
          subscriptionStatus?: string | null
        }
        if (s.plan !== undefined) token.plan = s.plan
        if (s.subscriptionStatus !== undefined)
          token.subscriptionStatus = s.subscriptionStatus
      }

      // Sync plan/subscriptionStatus from DB on every token refresh
      if (token.id) {
        const stored = db.findById(token.id)
        if (stored) {
          token.plan = stored.plan
          token.subscriptionStatus = stored.subscriptionStatus
          token.emailVerified = stored.emailVerified
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id = token.id
      session.user.plan = token.plan
      session.user.subscriptionStatus = token.subscriptionStatus
      session.user.emailVerified = token.emailVerified
      return session
    },

    async signIn({ user, account }) {
      // OAuth sign-ins: auto-create user in DB if first time
      if (account?.provider === "google" && user.email) {
        let existing = db.findByEmail(user.email)
        if (!existing) {
          existing = db.create({
            name: user.name ?? null,
            email: user.email,
            emailVerified: new Date(), // Google emails are pre-verified
            hashedPassword: null,
            image: user.image ?? null,
            plan: null,
            subscriptionStatus: null,
            stripeCustomerId: null,
            stripeSubId: null,
            hearAboutUs: null,
            role: null,
          })
        }
        user.id = existing.id
        ;(user as { plan?: string | null }).plan = existing.plan
        ;(user as { subscriptionStatus?: string | null }).subscriptionStatus =
          existing.subscriptionStatus
      }
      return true
    },
  },
})
