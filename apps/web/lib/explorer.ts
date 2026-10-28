/** Stellar Expert links per network. ROADMAP S-08. */
export function txUrl(network: "testnet" | "pubnet", hash: string): string {
  const net = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}
