import { advancePaise, blocksChoiceLabel, sessionTotalPaise } from "@bayana/shared";

// Pure helpers for the "How long?" step of an hourly service (sessions.test.mjs). One booking is one continuous range of
// consecutive sessions from the chosen start; never sessions on different days or with gaps between them.

type SessionService = { duration_minutes: number | null; min_blocks: number | null; max_blocks: number | null; price_paise: string | number; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number };

/** Whether the customer chooses a length at all: only when the service allows more than one. */
export const offersLength = (service: Pick<SessionService, "min_blocks" | "max_blocks">) => (service.max_blocks ?? 1) > (service.min_blocks ?? 1);

/** The lengths a customer may choose from a start: the service's minimum up to what is actually free from there. */
export function blockChoices(service: Pick<SessionService, "duration_minutes" | "min_blocks" | "max_blocks">, freeFromStart: number) {
  const min = service.min_blocks ?? 1, max = Math.min(service.max_blocks ?? 1, freeFromStart);
  return max < min ? [] : Array.from({ length: max - min + 1 }, (_, index) => ({ blocks: min + index, label: blocksChoiceLabel(min + index, service.duration_minutes ?? 0) }));
}

/** What a booking of `blocks` sessions costs: total = price per session x sessions (integer paise) and the advance by the service's rule. */
export function sessionQuote(service: Pick<SessionService, "price_paise" | "advance_type" | "advance_value">, blocks: number) {
  const total = sessionTotalPaise(Number(service.price_paise), blocks);
  return { total, advance: advancePaise(total, service.advance_type, service.advance_value) };
}

/** The end of a range of `blocks` sessions from `startsAt` (what the server will compute; shown before the hold). */
export const rangeEnd = (startsAt: string, blocks: number, minutes: number) => new Date(new Date(startsAt).getTime() + blocks * minutes * 60_000).toISOString();
