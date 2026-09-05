"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  readonly children: React.ReactNode;
  readonly pendingLabel?: string;
  readonly confirmMessage?: string;
  readonly className?: string;
};

export function ConfirmSubmitButton({
  children,
  pendingLabel = "Working...",
  confirmMessage,
  className = "h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60",
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!confirmMessage || pending) return;
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
