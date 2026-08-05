// Zod schemas for the AI chat assistant's per-user provider API keys.
//
// This lives outside app/actions.ts deliberately: that file has a top-level
// "use server" directive, and Next.js's Server Actions constraint requires
// every export from a "use server" file to be an async function — exporting
// a plain Zod object (as a previous revision did, to make it unit-testable)
// breaks the *entire* actions module at evaluation time in production
// ("A 'use server' file can only export async functions, found object."),
// which took down every page that imports it. Keeping the schemas here
// keeps them importable by both app/actions.ts and their unit tests without
// that constraint ever applying.
import { z } from "zod"

export const ChatProviderSchema = z.enum(["anthropic", "groq", "openrouter"])
export type ChatProvider = z.infer<typeof ChatProviderSchema>

export const SetChatApiKeySchema = z.object({
  provider: ChatProviderSchema,
  // Strip ALL whitespace (not just edges) before the length check — a key
  // pasted with embedded newlines (e.g. from a UI that hard-wraps long
  // strings) would otherwise be stored corrupted. API keys never legitimately
  // contain whitespace, so this is a defense-in-depth mirror of the same
  // sanitization in chat-api-key-form.tsx, applied here so any other caller
  // of this action gets it too.
  apiKey: z
    .string()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(z.string().min(20).max(200)), // loose bound covering all three providers' key formats
})

export const ClearChatApiKeySchema = z.object({
  provider: ChatProviderSchema,
})
