import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "cyan" | "violet" | "green" | "yellow" | "rose" | "slate";
};

const tones = {
  cyan: "rq-badge--cyan",
  violet: "rq-badge--violet",
  green: "rq-badge--green",
  yellow: "rq-badge--yellow",
  rose: "rq-badge--rose",
  slate: "rq-badge--slate",
};

export function Badge({ className, tone = "slate", ...props }: BadgeProps) {
  return <span className={cn("rq-badge inline-flex min-h-6 min-w-0 max-w-full items-center justify-center whitespace-normal break-words border px-2 py-1 text-center text-[12px] font-medium leading-4", tones[tone], className)} {...props} />;
}
