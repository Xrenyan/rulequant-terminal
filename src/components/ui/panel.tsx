import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-white/[0.085] bg-[#0c1118]/80 shadow-[0_16px_44px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
