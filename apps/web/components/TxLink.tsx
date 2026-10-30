import { txUrl, accountUrl, contractUrl, getNetwork, type Network } from "@/lib/explorer";

export interface TxLinkProps {
  hash: string;
  network?: Network;
  truncate?: boolean;
}

/** Stellar Expert transaction link for the configured network. ROADMAP S-08. */
export function TxLink({ hash, network, truncate = true }: TxLinkProps) {
  const net = network ?? getNetwork();
  const url = txUrl(net, hash);
  const display = truncate && hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mono"
      title={hash}
    >
      <code>{display}</code>
    </a>
  );
}

/** Stellar Expert account link for the configured network. ROADMAP S-08. */
export function AccountLink({
  address,
  network,
  truncate = true,
}: {
  address: string;
  network?: Network;
  truncate?: boolean;
}) {
  const net = network ?? getNetwork();
  const url = accountUrl(net, address);
  const display = truncate && address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mono"
      title={address}
    >
      <code>{display}</code>
    </a>
  );
}

/** Stellar Expert contract link for the configured network. ROADMAP S-08. */
export function ContractLink({
  contractId,
  network,
  truncate = true,
}: {
  contractId: string;
  network?: Network;
  truncate?: boolean;
}) {
  const net = network ?? getNetwork();
  const url = contractUrl(net, contractId);
  const display = truncate && contractId.length > 12 ? `${contractId.slice(0, 4)}…${contractId.slice(-4)}` : contractId;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mono"
      title={contractId}
    >
      <code>{display}</code>
    </a>
  );
}
