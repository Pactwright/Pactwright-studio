import { describe, expect, it } from "vitest";
import {
  createStorefront,
  defaultStorefrontConfig,
} from "../../../../templates/pollar-studio/src";

describe("Pollar Studio Storefront Template (ROADMAP P9-05)", () => {
  const storefront = createStorefront(defaultStorefrontConfig);

  it("lists catalog products", () => {
    const catalog = storefront.getCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(2);
    expect(catalog[0].id).toBe("weather-realtime");
  });

  it("generates valid 402 Payment Required response for a catalog item", () => {
    const res = storefront.create402Response("weather-realtime");

    expect(res.status).toBe(402);
    expect(res.accepts).toHaveLength(1);

    const paymentOption = res.accepts[0];
    expect(paymentOption.scheme).toBe("pact");
    expect(paymentOption.amount).toBe("0.2500000");
    expect(paymentOption.asset).toBe("USDC");
    expect(paymentOption.recipient).toBe(defaultStorefrontConfig.sellerAddress);

    // Verify extra.pactwright payload
    const extra = paymentOption.extra.pactwright;
    expect(extra.version).toBe(2);
    expect(extra.mode).toBe("escrow");
    expect(extra.deliveryKey).toBe(defaultStorefrontConfig.deliveryKey);
    expect(extra.verifier).toBe(defaultStorefrontConfig.verifierHex);
    expect(extra.verifierUrl).toBe(defaultStorefrontConfig.verifierUrl);
    expect(extra.refundWindowLedgers).toBe(100);
  });

  it("throws when requesting payment challenge for an unknown product", () => {
    expect(() => storefront.create402Response("nonexistent")).toThrow(
      "Product nonexistent not found"
    );
  });
});
