/** Stellar Expert links per network. ROADMAP S-08. */

export type Network = "testnet" | "pubnet";

export function getNetwork(): Network {
  const envNet = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase();
  return envNet === "pubnet" || envNet === "public" ? "pubnet" : "testnet";
}

export function txUrl(network: Network, hash: string): string {
  const net = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

export function accountUrl(network: Network, address: string): string {
  const net = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/account/${address}`;
}

export function contractUrl(network: Network, contractId: string): string {
  const net = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/contract/${contractId}`;
}
