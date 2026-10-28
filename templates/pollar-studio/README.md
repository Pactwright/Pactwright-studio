# Pollar Studio Storefront Template

**Release v2 (ROADMAP P9-05).**

This template demonstrates building a commercial data/API storefront integrated with Pactwright autonomous payment pacts using the public SDK patterns only.

## Architecture & Features
- **Public SDK integration**: Uses public `extra.pactwright` specifications to protect catalog resources with on-chain Soroban escrow pacts without proprietary internal code.
- **Product catalog**: Typed configurations for resources, pricing in decimal USDC, and verifiable conditions (`http-match`, `hash-preimage`).
- **402 Payment Required**: Standard compliant x402 responses providing delivery keys, verifier declarations, and escrow terms.

## Usage
```ts
import { createStorefront, defaultStorefrontConfig } from "./src";

const storefront = createStorefront(defaultStorefrontConfig);

// 1. List catalog products
const catalog = storefront.getCatalog();

// 2. Generate 402 challenge when an unauthenticated agent requests a product
const response402 = storefront.create402Response("weather-realtime");
```
