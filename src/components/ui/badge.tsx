import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "cyan" | "violet" | "green" | "yellow" | "rose" | "slate";
};

const tones = {
  cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  violet: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  green: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  yellow: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  rose: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  slate: "border-white/10 bg-white/[0.06] text-slate-300",
};

export function Badge({ className, tone = "slate", ...props }: BadgeProps) {
  return <span className={cn("inline-flex min-h-6 min-w-0 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border px-2 py-1 text-[12px] font-medium leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]", tones[tone], className)} {...props} />;
}
