# Security Policy

Pactwright Studio provides explorer and Merkle proof verification for Pactwright escrow settlements on Stellar. Please report any potential vulnerabilities privately.

## Reporting a Vulnerability

- **Do not** open a public issue for a vulnerability.
- Report vulnerabilities privately through GitHub's Security Advisories:
  <https://github.com/Pactwright/Pactwright-studio/security/advisories/new>
- If you cannot use GitHub Security Advisories, contact the core team directly at `security@pactwright.org`.
- Include in your report:
  - Affected components (web explorer, indexer, anchorer, or API routes).
  - Step-by-step reproduction instructions.
  - Potential security and cryptographic impact.

We acknowledge reports within 72 hours and provide status updates as triage proceeds.

## Audit Status Disclaimer

> **Pre-release / Testnet Only**: Pactwright Studio and its backend indexer/anchorer are operating on Stellar testnet. Cryptographic proof verification and indexer services have not yet undergone external security auditing.

## PR Security Policy

All pull requests are automatically screened by `.github/workflows/pr-malware-guard.yml` against Trojan Source attacks, malicious script injections, and unapproved binary additions.
