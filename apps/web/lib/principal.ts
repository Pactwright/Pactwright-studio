/**
 * Principal view queries and budget management. ROADMAP P7-11.
 */
import { db } from "@/lib/db";

export interface AgentInfo {
  address: string;
  principal: string;
  label: string | null;
}

export interface BudgetInfo {
  id: number;
  agent: string;
  amount: string;
  asset: string;
  status: string;
  gate: string;
  funding_tx: string | null;
}

export interface LivePactInfo {
  pact_id: string;
  buyer: string;
  seller: string;
  resource_url: string;
  cap: string;
  state: string;
  mode: string;
}

export interface PrincipalDashboardData {
  principal: string;
  allPrincipals: string[];
  agents: AgentInfo[];
  budgets: BudgetInfo[];
  livePacts: LivePactInfo[];
  metrics: {
    totalBudget: string;
    fundedBudget: string;
    activeAgentsCount: number;
    livePactsCount: number;
  };
}

export async function getPrincipalDashboardData(principalAddress?: string): Promise<PrincipalDashboardData | null> {
  const pool = db();

  // 1. Fetch distinct principals from agents table
  const principalsRes = await pool.query<{ principal: string }>(
    "SELECT DISTINCT principal FROM agents ORDER BY principal ASC"
  );

  if (principalsRes.rows.length === 0) {
    return null;
  }

  const allPrincipals = principalsRes.rows.map((r) => r.principal);
  const currentPrincipal = principalAddress && allPrincipals.includes(principalAddress)
    ? principalAddress
    : allPrincipals[0];

  // 2. Query agents for this principal
  const agentsRes = await pool.query<AgentInfo>(
    "SELECT address, principal, label FROM agents WHERE principal = $1 ORDER BY created_at ASC",
    [currentPrincipal]
  );
  const agents = agentsRes.rows;
  const agentAddresses = agents.map((a) => a.address);

  // 3. Query budgets for these agents
  let budgets: BudgetInfo[] = [];
  if (agentAddresses.length > 0) {
    const budgetsRes = await pool.query<BudgetInfo>(
      "SELECT id, agent, amount, asset, status, gate, funding_tx FROM budgets WHERE agent = ANY($1)",
      [agentAddresses]
    );
    budgets = budgetsRes.rows;
  }

  // 4. Query live pacts (state = 'funded' | 'paid' | 'allowed')
  let livePacts: LivePactInfo[] = [];
  if (agentAddresses.length > 0) {
    const pactsRes = await pool.query<LivePactInfo>(
      `SELECT pact_id, buyer, seller, resource_url, cap, state, mode
       FROM pacts
       WHERE buyer = ANY($1) AND state IN ('funded', 'paid', 'allowed')
       ORDER BY created_at DESC`,
      [agentAddresses]
    );
    livePacts = pactsRes.rows;
  }

  let totalBudgetNum = 0;
  let fundedBudgetNum = 0;

  for (const b of budgets) {
    const amountNum = Number(b.amount || 0);
    totalBudgetNum += amountNum;
    if (b.status === "funded") {
      fundedBudgetNum += amountNum;
    }
  }

  return {
    principal: currentPrincipal,
    allPrincipals,
    agents,
    budgets,
    livePacts,
    metrics: {
      totalBudget: totalBudgetNum.toFixed(7),
      fundedBudget: fundedBudgetNum.toFixed(7),
      activeAgentsCount: agents.length,
      livePactsCount: livePacts.length,
    },
  };
}
