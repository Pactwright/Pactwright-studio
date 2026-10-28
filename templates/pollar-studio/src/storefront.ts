/**
 * Protected Pollar Storefront logic using public SDK patterns. ROADMAP P9-05.
 * Returns standard x402 responses with extra.pactwright.
 */
import type { StorefrontConfig, ProductItem } from "./config";

export interface PaymentRequiredPayload {
  status: 402;
  message: string;
  accepts: Array<{
    scheme: "pact" | "exact";
    amount: string;
    asset: "USDC";
    recipient: string;
    extra: {
      pactwright: {
        version: 2;
        mode: "escrow" | "exact-refund";
        condition: Record<string, unknown>;
        deliveryKey: string;
        verifier: string;
        verifierUrl: string;
        refundWindowLedgers: number;
      };
    };
  }>;
}

export class PollarStorefront {
  private config: StorefrontConfig;

  constructor(config: StorefrontConfig) {
    this.config = config;
  }

  public getCatalog(): ProductItem[] {
    return this.config.products;
  }

  public getProduct(productId: string): ProductItem | undefined {
    return this.config.products.find((p) => p.id === productId);
  }

  /**
   * Creates an HTTP 402 Payment Required response payload for a product.
   */
  public create402Response(productId: string): PaymentRequiredPayload {
    const product = this.getProduct(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found in storefront catalog.`);
    }

    return {
      status: 402,
      message: `Payment required to access ${product.name}`,
      accepts: [
        {
          scheme: "pact",
          amount: product.priceUsdc,
          asset: "USDC",
          recipient: this.config.sellerAddress,
          extra: {
            pactwright: {
              version: 2,
              mode: "escrow",
              condition: product.condition,
              deliveryKey: this.config.deliveryKey,
              verifier: this.config.verifierHex,
              verifierUrl: this.config.verifierUrl,
              refundWindowLedgers: 100,
            },
          },
        },
      ],
    };
  }
}

export function createStorefront(config: StorefrontConfig): PollarStorefront {
  return new PollarStorefront(config);
}
