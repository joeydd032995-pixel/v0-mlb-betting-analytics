import { SignJWT, jwtVerify } from "jose"

const getSecret = () => {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set")
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
