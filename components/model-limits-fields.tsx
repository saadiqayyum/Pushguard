"use client";

import { NumberField } from "@/components/number-field";
import { AI_LIMITS } from "@/lib/ai-budget";

export type ModelLimits = {
  maxOutputTokens?: number | null;
  thinkingBudget?: number | null;
  timeoutMs?: number | null;
  maxInputTokens?: number | null;
};

// Per-call limits shared by the key form and the rule form. A rule also caps
// the input tokens of one run; a key does not.
export function ModelLimitsFields({
  prefix,
  value,
  withInput = false,
  onChange,
}: {
  prefix: string;
  value: ModelLimits;
  withInput?: boolean;
  onChange: (next: ModelLimits) => void;
}) {
  const field = (key: keyof ModelLimits, label: string, limit: keyof typeof AI_LIMITS, min: number) => (
    <NumberField
      id={`${prefix}-${key}`}
      label={label}
      value={value[key]}
      placeholder={AI_LIMITS[limit].default}
      min={min}
      max={AI_LIMITS[limit].ceiling}
      onChange={(next) => onChange({ ...value, [key]: next })}
    />
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("maxOutputTokens", "Max output tokens", "maxOutputTokens", 256)}
      {field("thinkingBudget", "Thinking budget", "thinkingBudget", 0)}
      {field("timeoutMs", "Timeout (ms)", "timeoutMs", 5_000)}
      {withInput && field("maxInputTokens", "Max input tokens per run", "maxInputTokensPerRun", 1_000)}
    </div>
  );
}
