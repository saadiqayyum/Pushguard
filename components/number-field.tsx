"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// An optional whole number. Empty means "use the default", shown as the placeholder.
export function NumberField({
  id,
  label,
  value,
  placeholder,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null | undefined;
  placeholder: number;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className="font-mono"
        placeholder={placeholder.toLocaleString()}
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value === "" ? undefined : Math.floor(Number(event.target.value));
          onChange(next === undefined || Number.isNaN(next) ? undefined : next);
        }}
      />
    </div>
  );
}
