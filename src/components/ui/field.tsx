import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base = "min-w-0 w-full rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-xl transition placeholder:text-slate-600 focus:border-cyan-200/45 focus:bg-white/[0.075] focus:ring-2 focus:ring-cyan-300/10";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10", className)} {...props} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-28 py-3 leading-6", className)} {...props} />;
});

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, "h-10 truncate", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-slate-400", className)} {...props} />;
}
