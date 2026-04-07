import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    plan: string | null
    subscriptionStatus: string | null
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string
      plan: string | null
      subscriptionStatus: string | null
      emailVerified: Date | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    plan: string | null
    subscriptionStatus: string | null
    emailVerified: Date | null
  }
}
