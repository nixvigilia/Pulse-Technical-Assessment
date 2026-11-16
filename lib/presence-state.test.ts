import { describe, expect, it } from "vitest";
import {
  canAcceptConnection,
  canEndCall,
  canReceiveRequest,
  canStartCall,
  PRESENCE_LABEL,
  PRESENCE_STATUS,
  presenceMarkerClass,
  presenceSwatchClass,
} from "./presence-state";

describe("canReceiveRequest", () => {
  it("allows only available", () => {
    expect(canReceiveRequest(PRESENCE_STATUS.available)).toBe(true);
    expect(canReceiveRequest(PRESENCE_STATUS.busy)).toBe(false);
    expect(canReceiveRequest(PRESENCE_STATUS.on_call)).toBe(false);
  });
});

describe("canAcceptConnection", () => {
  it("requires both available", () => {
    expect(
      canAcceptConnection(
        PRESENCE_STATUS.available,
        PRESENCE_STATUS.available,
      ),
    ).toBe(true);
    expect(
      canAcceptConnection(PRESENCE_STATUS.busy, PRESENCE_STATUS.available),
    ).toBe(false);
    expect(
      canAcceptConnection(PRESENCE_STATUS.on_call, PRESENCE_STATUS.available),
    ).toBe(false);
  });
});

describe("video presence transitions", () => {
  it("call-start requires both busy", () => {
    expect(canStartCall(PRESENCE_STATUS.busy, PRESENCE_STATUS.busy)).toBe(true);
    expect(
      canStartCall(PRESENCE_STATUS.available, PRESENCE_STATUS.available),
    ).toBe(false);
    expect(
      canStartCall(PRESENCE_STATUS.on_call, PRESENCE_STATUS.on_call),
    ).toBe(false);
  });

  it("call-end requires both on_call", () => {
    expect(canEndCall(PRESENCE_STATUS.on_call, PRESENCE_STATUS.on_call)).toBe(
      true,
    );
    expect(canEndCall(PRESENCE_STATUS.busy, PRESENCE_STATUS.busy)).toBe(false);
  });
});

describe("presence visuals", () => {
  it("uses green for available and rose for chat or video", () => {
    expect(presenceMarkerClass(PRESENCE_STATUS.available)).toContain(
      "available",
    );
    expect(presenceMarkerClass(PRESENCE_STATUS.busy)).toContain("unavailable");
    expect(presenceMarkerClass(PRESENCE_STATUS.on_call)).toContain(
      "unavailable",
    );
    expect(presenceSwatchClass(PRESENCE_STATUS.available)).toContain("primary");
    expect(presenceSwatchClass(PRESENCE_STATUS.busy)).toContain("tertiary");
    expect(presenceSwatchClass(PRESENCE_STATUS.on_call)).toContain("tertiary");
  });

  it("labels occupied peers as unavailable", () => {
    expect(PRESENCE_LABEL[PRESENCE_STATUS.available]).toBe("Available");
    expect(PRESENCE_LABEL[PRESENCE_STATUS.busy]).toBe(
      "Unavailable – Already in a conversation or video call.",
    );
    expect(PRESENCE_LABEL[PRESENCE_STATUS.on_call]).toBe(
      PRESENCE_LABEL[PRESENCE_STATUS.busy],
    );
  });
});