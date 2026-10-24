import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control = "block w-full min-h-11 rounded-input border border-input bg-surface px-3 text-base text-ink shadow-[inset_0_1px_1px_rgb(var(--shadow-color)/0.04)] placeholder:text-muted/80 transition-colors hover:border-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted aria-[invalid=true]:border-danger sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn(control, className)} {...props} />);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn(control, "min-h-24 py-2.5 leading-normal", className)} {...props} />);
Textarea.displayName = "Textarea";

/** Native select styled to match: keeps form submission, mobile pickers and screen-reader behaviour intact. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(control, "appearance-none pr-10", className)} {...props}>{children}</select>
    <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"><path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
  </div>
));
Select.displayName = "Select";

/** Native checkbox with a 44px hit area; works with `required`, `name` and FormData like the original markup. */
export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; hint?: ReactNode }>(({ className, label, hint, id, ...props }, ref) => {
  const generated = useId(); const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink", className)}>
      <input ref={ref} id={inputId} type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-[5px] border-input accent-[var(--primary)]" {...props} />
      <span>{label}{hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
});
Checkbox.displayName = "Checkbox";

type FieldProps = { label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; className?: string; children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode };
/** Label, control, hint and error wired together by id so every input has an accessible name and description. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId(); const hintId = hint ? `${id}-hint` : undefined; const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && <p id={hintId} className="text-xs text-muted">{hint}</p>}
      {error && <p id={errorId} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
