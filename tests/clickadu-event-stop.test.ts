import { describe, expect, it } from "vitest";
import { normalizeClickaduEventStopRule } from "../src/lib/clickadu-event-stop";

describe("ClickAdu event stop rules", () => {
  it("normalizes a valid stop rule", () => {
    const rule = normalizeClickaduEventStopRule({
      campaignId: "4007493",
      siteKey: "gercekfethiye",
      websiteId: "66b31527-c90e-41ec-9a67-6d003aeee99e",
      pc_cat: "GERFET31",
      stopTarget: "500",
      cleanUnique: 349,
      targetUrl: "https://www.gercekfethiye.com/haber/125186/?ec=GERFET31",
    });

    expect(rule).toMatchObject({
      campaignId: "4007493",
      siteKey: "gercekfethiye",
      websiteId: "66b31527-c90e-41ec-9a67-6d003aeee99e",
      trackingCode: "GERFET31",
      stopTarget: 500,
      baselineClean: 349,
      status: "active",
    });
  });

  it("rejects incomplete rules", () => {
    expect(normalizeClickaduEventStopRule({ campaignId: "4007493", stopTarget: 500 })).toBeNull();
    expect(normalizeClickaduEventStopRule({ campaignId: "1", trackingCode: "GERFET31", stopTarget: 500 })).toBeNull();
    expect(normalizeClickaduEventStopRule({ campaignId: "4007493", trackingCode: "GERFET31", stopTarget: 0 })).toBeNull();
  });
});
