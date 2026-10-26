// Run with: pnpm.cmd --filter @bayana/web test:unit. The "How long?" choices for an hourly service of several sessions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockChoices, offersLength, rangeEnd, sessionQuote } from "./sessions.ts";

const service = { duration_minutes: 60, min_blocks: 1, max_blocks: 4, price_paise: "150000", advance_type: "PERCENT", advance_value: 30 };

describe("How long? choices", () => {
  it("offers the service's minimum up to what is actually free from the start, labelled sessions and hours", () => {
    assert.deepEqual(blockChoices(service, 4).map(choice => choice.label), ["1 session, 1 hour", "2 sessions, 2 hours", "3 sessions, 3 hours", "4 sessions, 4 hours"]);
    assert.deepEqual(blockChoices(service, 2).map(choice => choice.blocks), [1, 2]);
    assert.deepEqual(blockChoices({ ...service, duration_minutes: 90, min_blocks: 2, max_blocks: 3 }, 12).map(choice => choice.label), ["2 sessions, 3 hours", "3 sessions, 4 hours 30 min"]);
  });
  it("never offers more than the service maximum, and nothing when fewer than the minimum are free", () => {
    assert.deepEqual(blockChoices(service, 12).map(choice => choice.blocks), [1, 2, 3, 4]);
    assert.deepEqual(blockChoices({ ...service, min_blocks: 3 }, 2), []);
  });
  it("is hidden for one-session services (today's flow) and for a fixed number of sessions", () => {
    assert.equal(offersLength({ min_blocks: 1, max_blocks: 1 }), false);
    assert.equal(offersLength({ min_blocks: null, max_blocks: null }), false);
    assert.equal(offersLength({ min_blocks: 2, max_blocks: 2 }), false);
    assert.equal(offersLength({ min_blocks: 1, max_blocks: 4 }), true);
  });
  it("prices sessions x price in integer paise with the advance from the service rule, never above the total", () => {
    assert.deepEqual(sessionQuote(service, 3), { total: 450_000, advance: 135_000 });
    assert.deepEqual(sessionQuote({ price_paise: "99999", advance_type: "PERCENT", advance_value: 33 }, 3), { total: 299_997, advance: 98_999 });
    assert.deepEqual(sessionQuote({ price_paise: 150_000, advance_type: "FIXED", advance_value: 150_000 }, 2), { total: 300_000, advance: 150_000 });
    assert.throws(() => sessionQuote(service, 13));
  });
  it("the range end is start plus sessions x length", () => {
    assert.equal(rangeEnd("2026-11-12T08:30:00.000Z", 3, 60), "2026-11-12T11:30:00.000Z");
  });
});
