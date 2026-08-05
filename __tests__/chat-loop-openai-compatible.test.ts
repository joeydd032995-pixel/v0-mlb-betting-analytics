import { describe, it, expect, vi, beforeEach } from "vitest"

const runTool = vi.fn()
vi.mock("@/lib/ai/chat-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/chat-tools")>()
  return { ...actual, runTool: (...args: unknown[]) => runTool(...(args as [string, unknown])) }
})

import { runOpenAICompatibleChatLoop } from "@/lib/ai/chat-loop-openai-compatible"

describe("runOpenAICompatibleChatLoop", () => {
  beforeEach(() => {
    runTool.mockReset()
  })

  it("executes a tool call then returns the final text reply", async () => {
    runTool.mockResolvedValue({ starters: [] })

    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "get_todays_starters", arguments: "{}" } },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Here are tonight's starters.", tool_calls: undefined } }],
      })

    const client = { chat: { completions: { create } } } as unknown as import("openai").default

    const result = await runOpenAICompatibleChatLoop(client, "llama-3.3-70b-versatile", [
      { role: "user", content: "who's pitching tonight?" },
    ], { userId: "user_test", tier: "FREE" })

    expect(runTool).toHaveBeenCalledWith("get_todays_starters", {}, { userId: "user_test", tier: "FREE" })
    expect(result.reply).toBe("Here are tonight's starters.")
    expect(result.toolCalls).toEqual([{ name: "get_todays_starters", input: {} }])
    expect(create).toHaveBeenCalledTimes(2)

    // Second call's message list must include the assistant tool_calls turn
    // and a role:"tool" result keyed by tool_call_id.
    const secondCallArgs = create.mock.calls[1][0]
    const toolResultMessage = secondCallArgs.messages.find((m: { role: string }) => m.role === "tool")
    expect(toolResultMessage).toMatchObject({ role: "tool", tool_call_id: "call_1" })
  })

  it("returns the direct reply immediately when no tool call is made", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "A balk is...", tool_calls: undefined } }],
    })
    const client = { chat: { completions: { create } } } as unknown as import("openai").default

    const result = await runOpenAICompatibleChatLoop(client, "llama-3.3-70b-versatile", [
      { role: "user", content: "what's a balk?" },
    ], { userId: "user_test", tier: "FREE" })

    expect(result.reply).toBe("A balk is...")
    expect(result.toolCalls).toEqual([])
    expect(create).toHaveBeenCalledTimes(1)
    expect(runTool).not.toHaveBeenCalled()
  })
})
