import { cva } from "class-variance-authority";

/**
 * A choice the customer taps to select (a day, a time, a number of days, a service card), shown as pressed or not. chip: a
 * compact button in a grid or strip; card: a full-width card with a thicker ring when selected. Pair with aria-pressed or
 * role="radio" and aria-checked so the state is not shown by colour alone.
 */
export const choiceVariants = cva("rounded-input ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55", {
  variants: {
    kind: { chip: "", card: "rounded-card bg-surface text-left transition-shadow hover:ring-primary" },
    selected: { true: "", false: "" }
  },
  compoundVariants: [
    { kind: "chip", selected: true, className: "bg-primary text-primary-foreground ring-primary" },
    { kind: "chip", selected: false, className: "bg-surface text-ink ring-border hover:ring-primary" },
    { kind: "card", selected: true, className: "ring-2 ring-primary" },
    { kind: "card", selected: false, className: "ring-border" }
  ],
  defaultVariants: { kind: "chip", selected: false }
});
