/**
 * Pollar Studio Storefront configuration. ROADMAP P9-05.
 */

export interface ProductItem {
  id: string;
  name: string;
  description: string;
  priceUsdc: string;
  resourceUrl: string;
  condition: Record<string, unknown>;
}

export interface StorefrontConfig {
  storeName: string;
  sellerAddress: string;
  deliveryKey: string;
  verifierHex: string;
  verifierUrl: string;
  products: ProductItem[];
}

export const defaultStorefrontConfig: StorefrontConfig = {
  storeName: "Pollar Partner Storefront",
  sellerAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  deliveryKey: "4444444444444444444444444444444444444444444444444444444444444444",
  verifierHex: "6666666666666666666666666666666666666666666666666666666666666666",
  verifierUrl: "https://verifier.pactwright.dev",
  products: [
    {
      id: "weather-realtime",
      name: "Global Real-time Weather Feed",
      description: "Low-latency atmospheric sensors API feed protected by pact escrow.",
      priceUsdc: "0.2500000",
      resourceUrl: "https://api.pactwright.dev/data/weather/realtime",
      condition: { type: "http-match", method: "GET" },
    },
    {
      id: "satellite-imagery-daily",
      name: "High-Resolution Satellite Orthomosaic",
      description: "Daily composite geospatial radar imagery for agricultural compute.",
      priceUsdc: "1.5000000",
      resourceUrl: "https://api.pactwright.dev/data/imagery/daily",
      condition: { type: "http-match", method: "GET" },
    },
  ],
};
