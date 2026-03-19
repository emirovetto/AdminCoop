"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
};

export function SubmitButton({
  idleLabel,
  pendingLabel = "Guardando...",
  className = "action-button",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
