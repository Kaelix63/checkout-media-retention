import assert from "node:assert/strict";
import { test } from "node:test";
import { objectKey, shouldSweep } from "../src/retention.ts";

test("expired checkout is deleted while receipt and fulfillment survive", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const checkout = objectKey({ orderId: "poster-42", stage: "checkout", text: "draft", createdAt: "2026-09-17T10:00:00Z" });
  assert.equal(checkout, "checkout/2026-09-17/poster-42.json");
  assert.equal(shouldSweep(checkout, now), true);
  assert.equal(shouldSweep("checkout/2026-09-20/poster-42.json", now), false);
  assert.equal(shouldSweep("receipt/2026-09-17/poster-42.json", now), false);
  assert.equal(shouldSweep("fulfilled/2026-09-17/poster-42.json", now), false);
  assert.equal(shouldSweep("customer_update/2026-09-17/poster-42.json", now), false);
});
