"use client";

import type { ButtonHTMLAttributes } from "react";

/** Consistent primary and secondary actions. Verification choices retain equal weight. */

type Variant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  const base =
    "ui-button inline-flex items-center justify-center gap-2 px-4 text-dense font-medium " +
    // u-press scales to 0.97 on :active. On a phone there is no hover, so the
    // press is the ONLY feedback between tapping and the page changing --
    // which on a weak connection can be a second or more of apparent nothing.
    "cursor-pointer u-press " +
    // Disabled is genuinely non-interactive, not merely faded: a control that
    // looks disabled and still fires is worse than one that looks enabled.
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

  const skin =
    variant === "primary"
      ? "bg-brand-primary text-brand-ink border border-brand-primary"
      : "bg-surface-raised text-ink border border-rule-strong hover:bg-surface";

  return (
    <button
      data-variant={variant}
      className={`${base} ${skin} ${className}`}
      style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
      {...rest}
    />
  );
}
