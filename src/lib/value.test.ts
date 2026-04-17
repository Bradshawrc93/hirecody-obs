import { describe, it, expect } from "vitest";
import { valueDelivered, costPerHelpfulInteraction } from "./value";

describe("valueDelivered", () => {
  it("sums helpful_interactions × est_deflected_cost across apps", () => {
    const result = valueDelivered([
      {
        app_slug: "chatbot",
        display_name: "Chatbot",
        helpful_interactions: 120,
        est_deflected_cost: 14.65,
      },
      {
        app_slug: "forge",
        display_name: "Forge",
        helpful_interactions: 40,
        est_deflected_cost: 50,
      },
    ]);
    expect(result.total_usd).toBeCloseTo(120 * 14.65 + 40 * 50, 5);
    expect(result.total_helpful_interactions).toBe(160);
    expect(result.breakdown).toHaveLength(2);
  });

  it("excludes apps with null est_deflected_cost from total and breakdown", () => {
    const result = valueDelivered([
      {
        app_slug: "chatbot",
        display_name: "Chatbot",
        helpful_interactions: 100,
        est_deflected_cost: 10,
      },
      {
        app_slug: "new-app",
        display_name: "New",
        helpful_interactions: 99,
        est_deflected_cost: null,
      },
    ]);
    expect(result.total_usd).toBe(1000);
    expect(result.breakdown.map((b) => b.app_slug)).toEqual(["chatbot"]);
    expect(result.total_helpful_interactions).toBe(100);
  });

  it("returns zeros for an empty portfolio", () => {
    expect(valueDelivered([])).toEqual({
      total_usd: 0,
      total_helpful_interactions: 0,
      breakdown: [],
    });
  });

  it("returns 0 value for apps with 0 helpful interactions but keeps them visible", () => {
    const result = valueDelivered([
      {
        app_slug: "chatbot",
        display_name: "Chatbot",
        helpful_interactions: 0,
        est_deflected_cost: 14.65,
      },
    ]);
    expect(result.total_usd).toBe(0);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].value_usd).toBe(0);
  });
});

describe("costPerHelpfulInteraction", () => {
  it("returns spend / helpful_interactions", () => {
    expect(costPerHelpfulInteraction(100, 50)).toBe(2);
  });

  it("returns null when there are no helpful interactions", () => {
    expect(costPerHelpfulInteraction(100, 0)).toBeNull();
    expect(costPerHelpfulInteraction(0, 0)).toBeNull();
  });

  it("returns 0 when spend is 0 and there is feedback", () => {
    expect(costPerHelpfulInteraction(0, 10)).toBe(0);
  });
});
