import { SignJWT, jwtVerify } from "jose"

const getSecret = () => {
  const secret = process.env.NEXTAUTH_SECRET

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must be set in production")
    }
    // Dev fallback — log a warning so it's obvious the env var is missing
    console.warn(
      "[tokens] NEXTAUTH_SECRET is not set. Using an insecure dev fallback.\n" +
        "  Add NEXTAUTH_SECRET=<random_string> to .env.local to silence this."
    )
    return new TextEncoder().encode("dev-insecure-secret-set-nextauth-secret")
  }

  return new TextEncoder().encode(secret)
}

export interface VerificationTokenPayload {
  sub: string  // userId
  email: string
  type: "email-verification"
}

export async function signVerificationToken(
  userId: string,
  email: string
): Promise<string> {
  return new SignJWT({ email, type: "email-verification" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret())
}

export async function verifyEmailToken(
  token: string
): Promise<VerificationTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret())

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.type !== "email-verification"
  ) {
    throw new Error("Invalid token payload")
  }

  return {
    sub: payload.sub,
    email: payload.email as string,
    type: "email-verification",
  }
}
