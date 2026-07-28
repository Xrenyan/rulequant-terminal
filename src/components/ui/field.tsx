"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const base = "rq-field min-w-0 w-full border px-3 text-sm outline-none transition";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10 max-sm:h-11", className)} {...props} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-28 py-3 leading-6", className)} {...props} />;
});

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

function optionLabel(children: ReactNode) {
  return Children.toArray(children).join("");
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  id,
  required,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const controlId = id ?? `rq-select-${generatedId.replaceAll(":", "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const [mobileSheet, setMobileSheet] = useState(false);
  const options = useMemo<SelectOption[]>(
    () => Children.toArray(children).flatMap((child) => {
      if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child) || child.type !== "option") return [];
      return [{
        value: String(child.props.value ?? optionLabel(child.props.children)),
        label: optionLabel(child.props.children),
        disabled: Boolean(child.props.disabled),
      }];
    }),
    [children],
  );
  const firstValue = options.find((option) => !option.disabled)?.value ?? "";
  const [internalValue, setInternalValue] = useState(() => String(defaultValue ?? firstValue));
  const selectedValue = value === undefined ? internalValue : String(value);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];

  const positionMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth < 640;
    setMobileSheet(isMobile);
    if (isMobile) {
      setMenuStyle(undefined);
      return;
    }
    const availableBelow = window.innerHeight - rect.bottom - 18;
    const availableAbove = rect.top - 18;
    const maxHeight = Math.max(180, Math.min(360, Math.max(availableBelow, availableAbove)));
    const opensAbove = availableBelow < 220 && availableAbove > availableBelow;
    setMenuStyle({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
      top: opensAbove ? undefined : rect.bottom + 8,
      bottom: opensAbove ? window.innerHeight - rect.top + 8 : undefined,
      width: Math.max(rect.width, 220),
      maxHeight,
    });
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, positionMenu]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    positionMenu();
    setOpen(true);
  };

  const choose = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    const target = { value: nextValue, name } as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  const move = (direction: 1 | -1) => {
    if (!options.length) return;
    const enabledOptions = options.filter((option) => !option.disabled);
    const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === selectedValue));
    choose(enabledOptions[(currentIndex + direction + enabledOptions.length) % enabledOptions.length].value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (open) move(event.key === "ArrowDown" ? 1 : -1);
      else {
        positionMenu();
        setOpen(true);
      }
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu();
    }
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("rq-select", open && "is-open")}>
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className={cn(base, "rq-select__trigger h-10 max-sm:h-11", className)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={props["aria-label"]}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label ?? "请选择"}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {name && <input type="hidden" name={name} value={selectedValue} required={required} />}
      {open && typeof document !== "undefined" && createPortal(
        <>
          <button className="rq-select__backdrop" type="button" aria-label="关闭选择菜单" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            className={cn("rq-select__menu rq-scrollbar", mobileSheet && "rq-select__menu--sheet")}
            role="listbox"
            aria-labelledby={controlId}
            style={menuStyle}
          >
            {mobileSheet && <div className="rq-select__sheet-head"><span>{props["aria-label"] ?? "请选择"}</span><i /></div>}
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                className={cn("rq-select__option", option.value === selectedValue && "is-selected")}
                disabled={option.disabled}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {option.value === selectedValue && <Check aria-hidden="true" size={15} />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("rq-label mb-1 block text-xs font-medium leading-5", className)} {...props} />;
}
