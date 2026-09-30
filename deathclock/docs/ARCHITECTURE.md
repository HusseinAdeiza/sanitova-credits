# DeathClock architecture

## Components

```mermaid
flowchart LR
  subgraph Client
    UI[Next.js App Router]
    Wallet[Phantom Wallet]
    Proof[Heartbeat proof adapter]
  end
  subgraph Chain
    RPC[Solana RPC]
    Program[Anchor program]
    Vault[Vault PDA]
    Treasury[Treasury PDA]
    Heirs[Heir accounts]
  end
  subgraph ZK
    Guest[RISC Zero guest]
    Host[Proof host/verifier]
  end
  UI --> Wallet
  UI --> RPC
  UI --> Proof
  Proof --> Host
  Host -. pinned receipt path .-> Guest
  RPC --> Program
  Program --> Vault
  Program --> Treasury
  Program --> Heirs
```

## State machine

```mermaid
stateDiagram-v2
  [*] --> Active: initialize_vault
  Active --> Active: deposit / heartbeat
  Active --> Missed: report_death after interval
  Missed --> Challenged: initiate_challenge
  Challenged --> Active: resolve_challenge(true) after window
  Challenged --> Active: emergency_recover by owner
  Challenged --> Release: resolve_challenge(false) after window
  Release --> Released: release_inheritance
  Released --> [*]
```

## Full user flow

```mermaid
sequenceDiagram
  participant D as David
  participant W as Phantom
  participant A as Anchor program
  participant V as Vault PDA
  participant H as Heirs
  D->>W: connect wallet
  D->>A: initialize_vault(heirs, shares, 30d, 48h)
  A->>V: initialize and store policy
  D->>A: deposit(10 SOL)
  A->>V: transfer lamports
  D->>A: heartbeat(mock proof, timestamp, nonce)
  Note over D,A: Production path: submit RISC Zero receipt
  A->>A: validate proof and state
  A->>A: last_heartbeat = now
  Note over A,H: If heartbeat expires, anyone may report death
  A->>A: Active → Missed
  A->>A: initiate_challenge → Challenged
  Note over A,H: 48-hour challenge period
  A->>A: resolve_challenge(false) → Release
  A->>V: preserve rent reserve
  A->>A: 0.5% fee
  A->>A: distribute 60/20/20 remainder
  A->>H: transfer lamports
  A->>A: state = Released
```

## Security boundaries

- The program validates owner signatures and PDA seeds for every owner-only action.
- `report_death`, `initiate_challenge`, `resolve_challenge`, and `release_inheritance` are permissionless after the state machine permits them.
- Treasury account input is checked against the canonical `[b"treasury"]` PDA and the supplied bump.
- The vault rent reserve is excluded from distributable value.
- The current mock heartbeat tag is not a cryptographic proof and must be replaced before mainnet or production claims.
