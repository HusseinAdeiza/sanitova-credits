use std::{env, fs, path::Path};

/// Decodes the base58-encoded INITIAL_OWNER pubkey from the build environment
/// into a byte array, because `Pubkey::from_str_const` was removed in
/// anchor-lang 0.32. Emits `initial_owner.rs`, consumed by the program.
fn main() {
    println!("cargo:rerun-if-env-changed=INITIAL_OWNER");

    let raw = env::var("INITIAL_OWNER").unwrap_or_else(|_| {
        println!("cargo:warn=INITIAL_OWNER not set; defaulting to 11111111111111111111111111111111 (testing only)");
        "11111111111111111111111111111111".to_string()
    });

    let bytes = decode_base58(&raw).unwrap_or_else(|e| panic!("INVALID_INITIAL_OWNER: {e}"));
    assert_eq!(bytes.len(), 32, "INITIAL_OWNER must decode to 32 bytes");

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("initial_owner.rs");
    let mut literal = String::from("pub const INITIAL_OWNER_BYTES: [u8; 32] = [");
    for (index, byte) in bytes.iter().enumerate() {
        if index > 0 {
            literal.push_str(", ");
        }
        literal.push_str(&byte.to_string());
    }
    literal.push_str("];\n");
    fs::write(dest, literal).unwrap();
}

fn decode_base58(input: &str) -> Result<Vec<u8>, String> {
    const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut bytes: Vec<u8> = Vec::with_capacity(input.len());
    for ch in input.bytes() {
        let value = ALPHABET
            .iter()
            .position(|c| *c == ch)
            .ok_or_else(|| format!("invalid base58 character: {ch}"))? as u32;
        let mut carry = value;
        for byte in bytes.iter_mut().rev() {
            carry += (*byte as u32) * 58;
            *byte = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            bytes.insert(0, (carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    while bytes.len() > 1 && bytes[0] == 0 {
        bytes.remove(0);
    }
    Ok(bytes)
}
