import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-white/[0.075] bg-white/[0.035] shadow-[0_14px_38px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
