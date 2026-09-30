//! RISC Zero method artifacts for the DeathClock heartbeat guest.
//!
//! The generated ELF and image ID are pinned by `risc0-build` in build.rs.

include!(concat!(env!("OUT_DIR"), "/methods.rs"));
