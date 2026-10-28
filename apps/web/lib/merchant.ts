/**
 * Merchant dashboard queries and metrics. ROADMAP P7-10.
 */
import { db } from "@/lib/db";

export interface SellerInfo {
  address: string;
  name: string;
  delivery_key: string;
  refund_vault: string | null;
}

export interface RouteInfo {
  id: number;
  seller: string;
  resource_url: string;
  mode: string;
  price: string;
  verify_min_amount: string | null;
  silence: string | null;
  refund_window_ledgers: number;
}

export interface MerchantMetrics {
  totalRevenue: string;
  totalPacts: number;
  settledPacts: number;
  refundedPacts: number;
  disputeCount: number;
  refundRate: number;
  disputeRate: number;
}

export interface MerchantDashboardData {
  seller: SellerInfo;
  allSellers: SellerInfo[];
  metrics: MerchantMetrics;
  routes: RouteInfo[];
}

export async function getMerchantDashboardData(sellerAddress?: string): Promise<MerchantDashboardData | null> {
  const pool = db();

  // 1. Fetch all sellers
  const sellersRes = await pool.query<SellerInfo>(
    "SELECT address, name, delivery_key, refund_vault FROM sellers ORDER BY created_at ASC"
  );

  if (sellersRes.rows.length === 0) {
    return null;
  }

  const allSellers = sellersRes.rows;
  const currentSeller = sellerAddress
    ? allSellers.find((s) => s.address === sellerAddress) ?? allSellers[0]
    : allSellers[0];

  // 2. Query routes
  const routesRes = await pool.query<RouteInfo>(
    "SELECT id, seller, resource_url, mode, price, verify_min_amount, silence, refund_window_ledgers FROM routes WHERE seller = $1",
    [currentSeller.address]
  );

  // 3. Query pacts and metrics for this seller
  const pactsRes = await pool.query<{
    pact_id: string;
    state: string;
    to_seller: string;
    to_buyer: string;
    cap: string;
  }>(
    "SELECT pact_id, state, to_seller, to_buyer, cap FROM pacts WHERE seller = $1",
    [currentSeller.address]
  );

  const pacts = pactsRes.rows;
  const totalPacts = pacts.length;
  let totalRevenueNum = 0;
  let settledPacts = 0;
  let refundedPacts = 0;
  let disputeCount = 0;

  for (const p of pacts) {
    totalRevenueNum += Number(p.to_seller || 0);
    if (p.state === "settled" || p.state === "paid" || p.state === "released") {
      settledPacts++;
    }
    if (p.state === "refunded") {
      refundedPacts++;
    }
    if (p.state === "denied") {
      disputeCount++;
    }
  }

  const refundRate = totalPacts > 0 ? (refundedPacts / totalPacts) * 100 : 0;
  const disputeRate = totalPacts > 0 ? (disputeCount / totalPacts) * 100 : 0;

  return {
    seller: currentSeller,
    allSellers,
    routes: routesRes.rows,
    metrics: {
      totalRevenue: totalRevenueNum.toFixed(7),
      totalPacts,
      settledPacts,
      refundedPacts,
      disputeCount,
      refundRate: Math.round(refundRate * 10) / 10,
      disputeRate: Math.round(disputeRate * 10) / 10,
    },
  };
}
