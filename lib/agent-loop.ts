import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages"
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"
import type { StructuredToolInterface } from "@langchain/core/tools"
import type { ZodType } from "zod"
import { meteredInvoke, type Spend } from "@/lib/ai-call"

// Hard stop on model turns, whatever the tool budget says.
export const MAX_AGENT_STEPS = 60

// Structured output as a response format, never as a forced tool call: forcing
// pins tool_choice, which Anthropic drops while thinking is on.
export const STRUCTURED = { method: "jsonSchema", includeRaw: true } as const

// A tool loop we own rather than createReactAgent, so every turn is metered and
// the verdict comes back through jsonSchema rather than a forced tool call.
export async function runAgent<T>(input: {
  llm: BaseChatModel
  tools: StructuredToolInterface[]
  system: string
  user: string
  schema: ZodType<T>
  schemaName: string
  spend: Spend
  maxSteps: number
  deadline?: AbortSignal
}): Promise<T> {
  const { llm, tools, spend, deadline } = input
  const byName = new Map(tools.map((t) => [t.name, t]))
  const messages: BaseMessage[] = [new SystemMessage(input.system), new HumanMessage(input.user)]
  const bound = llm.bindTools!(tools)

  for (let step = 0; step < Math.min(input.maxSteps, MAX_AGENT_STEPS); step++) {
    const reply = await meteredInvoke(
      spend,
      messages,
      async (signal) => {
        const raw = (await bound.invoke(messages, { signal })) as AIMessage
        return { raw, value: raw }
      },
      deadline,
    )
    messages.push(reply)
    const calls = reply.tool_calls ?? []
    if (calls.length === 0) break
    for (const call of calls) {
      const found = byName.get(call.name)
      const content = found ? String(await found.invoke(call.args)) : `No tool named ${call.name}.`
      messages.push(new ToolMessage({ content, tool_call_id: call.id ?? call.name }))
    }
  }

  messages.push(new HumanMessage("Report your verdict now, in the required format."))
  const structured = llm.withStructuredOutput(input.schema as ZodType<Record<string, unknown>>, {
    name: input.schemaName,
    ...STRUCTURED,
  })
  return meteredInvoke(
    spend,
    messages,
    async (signal) => {
      const { raw, parsed } = await structured.invoke(messages, { signal })
      return { raw: raw as AIMessage, value: input.schema.parse(parsed) }
    },
    deadline,
  )
}
