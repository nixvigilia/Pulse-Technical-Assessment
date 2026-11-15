import { describe, expect, it } from "vitest";
import {
  canAcceptConnection,
  canEndCall,
  canReceiveRequest,
  canStartCall,
  PRESENCE_STATUS,
  presenceMarkerClass,
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

describe("presenceMarkerClass", () => {
  it("maps each status to a dot modifier", () => {
    expect(presenceMarkerClass(PRESENCE_STATUS.available)).toContain(
      "available",
    );
    expect(presenceMarkerClass(PRESENCE_STATUS.busy)).toContain("busy");
    expect(presenceMarkerClass(PRESENCE_STATUS.on_call)).toContain("on-call");
  });
});