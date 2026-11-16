import { describe, expect, it } from "vitest";
import { computeActivityCounts } from "./activity";
import { PRESENCE_STATUS } from "./presence-state";

describe("computeActivityCounts", () => {
  it("counts everyone not in chat or video as available", () => {
    const counts = computeActivityCounts([
      PRESENCE_STATUS.available,
      PRESENCE_STATUS.busy,
      PRESENCE_STATUS.pending_accept,
      PRESENCE_STATUS.searching,
    ]);
    expect(counts.online).toBe(4);
    expect(counts.available).toBe(3);
  });
});