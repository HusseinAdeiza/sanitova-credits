// Browser IDL for DeathClock.
//
// `deathclock.generated.json` is copied verbatim from target/idl/deathclock.json
// by `npm run sync-idl`; editing it by hand desynchronises the browser client
// from the on-chain program, so the shim below only re-exports it.
import generated from "./deathclock.generated.json";

export const deathclockIdl = generated as any;
