"use client";

type PrintButtonProps = {
  label?: string;
};

export function PrintButton({ label = "Imprimir" }: PrintButtonProps) {
  return (
    <button
      className="toolbar-button"
      onClick={() => window.print()}
      type="button"
    >
      {label}
    </button>
  );
}
