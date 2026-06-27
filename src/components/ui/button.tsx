import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

const variants = {
  primary: "border-cyan-200/45 bg-cyan-300/18 text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.14)] hover:bg-cyan-300/28",
  secondary: "border-white/12 bg-white/[0.07] text-white hover:bg-white/[0.11]",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/[0.07] hover:text-white",
  danger: "border-rose-300/35 bg-rose-400/12 text-rose-50 hover:bg-rose-400/22",
};

const sizes = {
  sm: "h-8 min-h-8 px-3 text-[12px]",
  md: "h-10 min-h-10 px-4 text-sm",
  icon: "h-9 w-9 min-w-9 p-0",
};

export function Button({ className, variant = "secondary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
