# Token-account payout: why this is not merged

An SPL token payout path was written and then deliberately reverted. It compiled,
and it was still wrong. This note exists so the next attempt starts from the
finding rather than repeating the mistake.

## What was built

`token_accounts.rs` deriving every destination from seeds:

    mint()          -> [b"mint"]
    vault_token()   -> [b"vault-token", vault]
    heir_token()    -> [b"heir-token", mint, heir]

and `release_inheritance` signing each transfer with the vault PDA's seeds, so
the vault's token account is the authority and the destinations are derived
rather than named.

## Why it was reverted

**`deposit` still moved lamports.** The migration changed the payout path but
not the funding path, so nothing ever minted tokens. `release_inheritance` would
have read a token balance of 0 and distributed nothing, while the 5% fee still
decremented the vault PDA's lamports. The vault would have been marked
`Released` with the estate intact and the heirs paid nothing.

That is worse than the lamport version it replaced, and it compiles. A green
build said nothing about whether the path worked.

The same trap applies to `balance()`: a token account's lamport balance is
rent-exempt minimum, not its token amount. Reading lamports would make
`payout_total` equal the rent and quietly pay out the wrong number.

## What has to be true before this ships

1. `deposit` wraps lamports into tokens: transfer to a program-owned temporary
   account, `initialize_account`, `mint_to` the vault token account. The wrap
   must be atomic or a crash strands funds.
2. There is a mint to begin with. A PDA-derived mint needs a `create_mint`
   instruction gated to the authority, or a fixed mint address.
3. An end-to-end test: deposit, drive the state machine, release, assert each
   heir's token balance. Not a compile check.
4. A migration story for vaults funded under the lamport scheme, including any
   already on devnet.

## The Anchor 0.32 SPL API, as actually verified here

Written from memory, these were all wrong:

| Guessed | Actual |
|---|---|
| `CreateAccount::new(..).lamports().space().owner()` (0.31 builder) | `create_account(ctx, lamports, space, &owner)` |
| `InitializeAccount { owner }` | `InitializeAccount { authority, rent }` |
| `mint: &Pubkey` in helpers | `mint: AccountInfo` |

`InitializeAccount` needs `rent`; omitting it is a compile error, not a default.

## The current shipping state

The deployed and committed payout path is the lamport version with the
`HeirAccountMismatch` and `UnsafePayoutAccount` guards from commit 92a60e4. It is
imperfect -- funds are pushed straight into heir wallets, so an heir cannot
refuse and cannot redirect -- but the money can only go to registered heirs.

The token path is the better design. It is not the deployed one.
