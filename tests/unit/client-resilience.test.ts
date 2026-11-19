import { describe, expect, it, vi } from "vitest";
import { routeFromHash } from "@/hooks/use-hash-route";
import { createSafeSessionStorage } from "@/store/auth";

describe("safe demo session storage", () => {
  it("keeps valid persisted users and ignores malformed data", () => {
    const raw = JSON.stringify({
      state: {
        user: { name: "Judge", email: "judge@example.test", role: "coach", kind: "judge", signedInAt: "2026-11-19T00:00:00.000Z" },
      },
    });
    const getItem = vi.fn((_name: string) => raw);
    const storage = createSafeSessionStorage(() => ({ getItem, setItem: vi.fn(), removeItem: vi.fn() }));

    expect(storage.getItem("seriesight-auth")).toBe(raw);
    getItem.mockReturnValue("not-json");
    expect(storage.getItem("seriesight-auth")).toBeNull();
  });

  it("does not throw when browser storage is blocked", () => {
    const storage = createSafeSessionStorage(() => {
      throw new Error("Storage access denied");
    });

    expect(storage.getItem("seriesight-auth")).toBeNull();
    expect(() => storage.setItem("seriesight-auth", "{}" )).not.toThrow();
    expect(() => storage.removeItem("seriesight-auth")).not.toThrow();
  });
});

describe("hash route resolution", () => {
  it("keeps direct workspace links and ignores query/hash suffixes", () => {
    expect(routeFromHash("#/draft/session-123?tab=events")).toBe("draft");
    expect(routeFromHash("#scouting/opponent-NVX")).toBe("scouting");
  });

  it("falls back to the public landing page for unknown routes", () => {
    expect(routeFromHash("#/not-a-route")).toBe("home");
    expect(routeFromHash("")).toBe("home");
  });
});