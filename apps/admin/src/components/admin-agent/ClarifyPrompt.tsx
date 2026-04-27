import { Button } from "#/components/ui/button"

import { Tool, type ToolCallState } from "../ai-elements"

/**
 * Render the agent's `askClarification` tool call: a question plus
 * optional quick-reply chips that send the user's selection straight
 * back as the next message.
 *
 * Once the user has answered (we use `answered` to track this so the
 * chips can't be clicked twice), we collapse to a static state so the
 * conversation history reads cleanly.
 */
export function ClarifyPrompt({
  state,
  field,
  question,
  suggestions,
  answered,
  onAnswer,
}: {
  state: ToolCallState
  field: string
  question: string
  suggestions?: string[]
  answered: boolean
  onAnswer: (text: string) => void
}) {
  return (
    <Tool name={`askClarification · ${field}`} state={state}>
      <p className="text-sm text-foreground">{question}</p>
      {suggestions && suggestions.length > 0 && !answered ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              onClick={() => onAnswer(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      ) : null}
    </Tool>
  )
}
