import { describe, expect, it } from "vitest";
import {
  buildPageviewKey,
  isDirectLanding,
  isValidEngagement,
  sessionize,
} from "../src/lib/bik-rules";

describe("BIK rules", () => {
  it("sessionizes by inactivity timeout", () => {
    const now = Date.now();
    const fresh = sessionize(now - 5 * 60_000, now, 30, 2);
    expect(fresh.isNew).toBe(false);
    expect(fresh.index).toBe(2);

    const stale = sessionize(now - 31 * 60_000, now, 30, 2);
    expect(stale.isNew).toBe(true);
    expect(stale.index).toBe(3);
  });

  it("classifies direct traffic", () => {
    expect(isDirectLanding("", "/haberler")).toBe(true);
    expect(isDirectLanding("", "/?utm_source=twitter")).toBe(false);
    expect(isDirectLanding("https://www.google.com", "/")).toBe(true);
  });

  it("filters sessions below 1 second", () => {
    expect(isValidEngagement(999)).toBe(false);
    expect(isValidEngagement(1000)).toBe(true);
  });

  it("builds stable pageview keys", () => {
    const key1 = buildPageviewKey("v1", "s1", "/a?b=1", 123);
    const key2 = buildPageviewKey("v1", "s1", "/a?b=1", 123);
    const key3 = buildPageviewKey("v1", "s1", "/a?b=1", 124);
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
