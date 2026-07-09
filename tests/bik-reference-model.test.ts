import { describe, expect, it } from "vitest";
import {
  computeBikReferenceMetrics,
  isBikDirectLanding,
  normalizeBikUrl,
  type BikReferenceEvent,
} from "../src/lib/bik-reference-model";

const baseTs = Date.parse("2026-07-09T09:00:00.000Z");

const pageview = (
  overrides: Partial<Extract<BikReferenceEvent, { eventType: "pageview" }>> = {}
): Extract<BikReferenceEvent, { eventType: "pageview" }> => ({
  eventType: "pageview",
  visitorId: "visitor-1",
  sessionId: "session-1",
  eventId: "event-1",
  url: "/haber",
  referrer: "",
  ts: baseTs,
  ...overrides,
});

const check = (
  overrides: Partial<Extract<BikReferenceEvent, { eventType: "check" }>> = {}
): Extract<BikReferenceEvent, { eventType: "check" }> => ({
  eventType: "check",
  eventId: "event-1",
  ts: baseTs + 2_000,
  activeSeconds: 2,
  ...overrides,
});

describe("BIK reference model", () => {
  it("counts the same event shape independently of the site", () => {
    const eventsForA = [pageview({ siteId: "site-a" }), check({ siteId: "site-a" })];
    const eventsForB = [pageview({ siteId: "site-b" }), check({ siteId: "site-b" })];

    expect(computeBikReferenceMetrics(eventsForA)).toMatchObject(
      computeBikReferenceMetrics(eventsForB)
    );
  });

  it("validates a pageview through the linked check active time", () => {
    const result = computeBikReferenceMetrics([
      pageview({ activeSeconds: 0 }),
      check({ activeSeconds: 2 }),
    ]);

    expect(result.daily_unique_visitors).toBe(1);
    expect(result.daily_pageviews).toBe(1);
    expect(result.daily_sessions).toBe(1);
    expect(result.daily_avg_time_on_site_seconds).toBe(2);
    expect(result.diagnostics.linkedChecks).toBe(1);
  });

  it("drops traffic at or below one active second", () => {
    const result = computeBikReferenceMetrics([
      pageview({ eventId: "short-1" }),
      check({ eventId: "short-1", activeSeconds: 1 }),
      pageview({
        eventId: "short-2",
        visitorId: "visitor-2",
        sessionId: "session-2",
        ts: baseTs + 10_000,
      }),
      check({
        eventId: "short-2",
        ts: baseTs + 11_000,
        activeSeconds: 0.8,
      }),
    ]);

    expect(result.daily_unique_visitors).toBe(0);
    expect(result.daily_pageviews).toBe(0);
    expect(result.diagnostics.shortActivePageviews).toBe(2);
  });

  it("dedupes duplicate pageviews in a short window", () => {
    const result = computeBikReferenceMetrics([
      pageview({ eventId: null, activeSeconds: 3 }),
      pageview({
        eventId: null,
        activeSeconds: 3,
        ts: baseTs + 500,
      }),
    ]);

    expect(result.daily_pageviews).toBe(1);
    expect(result.diagnostics.duplicatePageviews).toBe(1);
  });

  it("classifies BIK direct landings without site-specific campaign exceptions", () => {
    expect(isBikDirectLanding("", "/haber?pc_source=clickadu")).toBe(true);
    expect(isBikDirectLanding("https://www.google.com/search?q=x", "/")).toBe(true);
    expect(isBikDirectLanding("https://www.google.com/search?q=x", "/haber")).toBe(false);
    expect(isBikDirectLanding("https://example.com", "/")).toBe(false);
  });

  it("filters bot-marked pageviews", () => {
    const result = computeBikReferenceMetrics([
      pageview({ isBot: true }),
      check({ activeSeconds: 8 }),
    ]);

    expect(result.daily_pageviews).toBe(0);
    expect(result.diagnostics.botFilteredPageviews).toBe(1);
  });

  it("normalizes URLs like the official tracker before dedupe", () => {
    expect(normalizeBikUrl("https://example.com/index.html#top")).toBe("/");
    expect(normalizeBikUrl("https://example.com/haber?a=1#top")).toBe("/haber?a=1");
  });
});
