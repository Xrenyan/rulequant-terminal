import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  loading?: boolean;
};

const variants = {
  primary: "border-cyan-200/35 bg-cyan-300/16 text-cyan-50 hover:border-cyan-100/55 hover:bg-cyan-300/24",
  secondary: "border-white/10 bg-white/[0.055] text-slate-100 hover:border-white/16 hover:bg-white/[0.09]",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white",
  danger: "border-rose-300/28 bg-rose-400/10 text-rose-50 hover:border-rose-200/45 hover:bg-rose-400/18",
};

const sizes = {
  sm: "h-8 min-h-8 px-3 text-[12px]",
  md: "h-10 min-h-10 px-4 text-sm max-sm:h-9 max-sm:min-h-9 max-sm:px-3 max-sm:text-[13px]",
  icon: "h-9 w-9 min-w-9 p-0",
};

export function Button({ className, variant = "secondary", size = "md", loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-w-0 max-w-full shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0",
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
