# DeathClock demo guide

## The story

David is 45. He has accumulated 500,000 SOL and wants his wife and two children to inherit it without a lawyer, a custodian, or a single missed password reset. He deposits SOL into a DeathClock vault, names the three beneficiaries, and sends a heartbeat every month.

## Local judge demo

### 1. Start the chain

Build the program and start the local validator using the commands in the root `README.md`. The program is injected at genesis so the demo does not depend on a devnet deployment.

### 2. Show the product surface

Run `cd app && npm run dev` and open the local URL. The landing page is intentionally editorial: explain the 48-hour challenge window before explaining any technical detail.

### 3. Connect Phantom

Switch Phantom to the local validator if your Phantom build supports a local RPC, or use the UI against devnet for a deployed program. The local integration suite is the authoritative transaction demo for this repository.

### 4. Create the estate

Use the 60/20/20 fixture:

- Heir 1: 60%
- Heir 2: 20%
- Heir 3: 20%
- Heartbeat interval: 30 days in production; shortened in the local test fixture
- Challenge period: 48 hours in production; shortened in the local test fixture

The `DeathClock` integration test creates a fresh owner, derives the vault PDA, initializes the account, and asserts the stored state.

### 5. Deposit and heartbeat

The full lifecycle test deposits 10 SOL, submits a fresh timestamp envelope, waits past the fixture heartbeat interval, and submits the heartbeat. The ZK adapter test separately verifies that the owner secret and timestamp produce the expected commitment and that malformed proof tags fail.

### 6. Miss the heartbeat

After the interval, anyone can call `report_death`; the state moves from `Active` to `Missed`. `initiate_challenge` starts the challenge timer. Explain that this is the safety valve: a false report does not immediately transfer funds.

### 7. Resolve the challenge

After the challenge period, `resolve_challenge(false)` moves the vault to `Release`. `release_inheritance` preserves the rent reserve, sends 0.5% to the canonical treasury PDA, distributes the remainder by shares, and transitions to `Released`.

## Verified local result

```text
DeathClock
  ✔ initializes a 60/20/20 vault and emits its configuration
  ✔ rejects malformed heir shares
  ✔ runs the full inheritance lifecycle and distributes every lamport
  ✔ rejects an invalid heartbeat proof
  ✔ allows owner emergency recovery after a false report
  ✔ rejects release before the challenge period expires

6 passing
```

## Devnet recording checklist

Record the following transaction signatures in a private, ignored JSON artifact; never commit wallet secrets:

1. `initialize_vault`
2. `deposit`
3. `heartbeat`
4. `report_death`
5. `initiate_challenge`
6. `resolve_challenge(false)`
7. `release_inheritance`

A three-minute cut can use the local validator for the state transition and a devnet transaction for the final Explorer link. Label the mock proof clearly in the narration.
