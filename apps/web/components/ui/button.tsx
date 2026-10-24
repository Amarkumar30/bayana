import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-input px-4 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover",
        secondary: "bg-surface text-ink shadow-soft ring-1 ring-border hover:bg-surface-muted",
        ghost: "text-ink hover:bg-surface-muted",
        danger: "bg-danger text-white shadow-soft hover:opacity-90"
      },
      size: { md: "", sm: "min-h-11 px-3 text-sm sm:min-h-9", lg: "min-h-12 px-6 text-base", icon: "size-11 px-0" },
      block: { true: "w-full" }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean; loadingText?: string };

/** Four variants. `loading` disables the button, shows a spinner and announces busy state. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, asChild, loading, loadingText, disabled, children, ...props }, ref) => {
  const Component = asChild ? Slot : "button";
  if (asChild) return <Component ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>{children}</Component>;
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
Button.displayName = "Button";
