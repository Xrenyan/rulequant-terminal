import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  loading?: boolean;
};

const variants = {
  primary: "rq-button--primary",
  secondary: "rq-button--secondary",
  ghost: "rq-button--ghost",
  danger: "rq-button--danger",
};

const sizes = {
  sm: "h-9 min-h-9 px-3 text-[13px] max-sm:h-11 max-sm:min-h-11",
  md: "h-10 min-h-10 px-4 text-sm max-sm:h-11 max-sm:min-h-11 max-sm:px-3 max-sm:text-[13px]",
  icon: "h-10 w-10 min-w-10 p-0 max-sm:h-11 max-sm:w-11 max-sm:min-w-11",
};

export function Button({ className, variant = "secondary", size = "md", loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "rq-button inline-flex min-w-0 max-w-full shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap border font-medium leading-none transition duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 [&>svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
