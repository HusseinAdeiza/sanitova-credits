use anchor_lang::prelude::*;
use anchor_lang::system_program;
use sha2::{Digest, Sha256};
use verifier_router::{cpi::accounts::Verify as RouterVerify, program::VerifierRouter, Seal};

declare_id!("C8unxtjoDZWy2GmwHUPuSve1BHT5TtRKpNaDofbMS5Vh");

pub const HEARTBEAT_PROOF_TAG: &[u8] = b"DEATHCLOCK_RISC0_V1";
/// Image ID of the pinned `deathclock-zk-guest` RISC Zero ELF, as emitted by
/// `risc0-build`. Regenerate with `cargo test -p deathclock-zk-methods` and
/// update these bytes whenever the guest source changes.
pub const HEARTBEAT_IMAGE_ID: [u8; 32] = [
    0x83, 0xa2, 0x6d, 0x8b, 0x1e, 0xc1, 0xbc, 0x42, 0xa8, 0xdc, 0x5a, 0xab, 0x70, 0xb9, 0xae, 0x89,
    0x10, 0x5a, 0x82, 0xa0, 0x65, 0xdd, 0x3f, 0x4a, 0x23, 0x65, 0xb6, 0xe1, 0x85, 0x2c, 0x94, 0xed,
];
pub const MAX_HEIRS: usize = 5;
pub const PROOF_MAX_AGE_SECONDS: i64 = 300;
pub const PROOF_MAX_FUTURE_SECONDS: i64 = 60;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum VaultState {
    Active,
    Missed,
    Challenged,
    Release,
    Released,
}

#[account]
#[derive(Debug)]
pub struct Vault {
    pub owner: Pubkey,
    pub heirs: Vec<Pubkey>,
    pub shares: Vec<u8>,
    pub heartbeat_interval: i64,
    pub challenge_period: i64,
    pub last_heartbeat: i64,
    pub death_reported_at: i64,
    pub challenge_started_at: i64,
    pub total_deposited: u64,
    pub state: VaultState,
    pub bump: u8,
}

impl Vault {
    pub const SPACE: usize = 300;

    pub fn require_active(&self) -> Result<()> {
        require!(self.state == VaultState::Active, DeathClockError::VaultNotActive);
        Ok(())
    }
}

#[error_code]
pub enum DeathClockError {
    #[msg("No heirs specified")]
    NoHeirs,
    #[msg("Heirs and shares length mismatch")]
    InvalidShares,
    #[msg("Shares must sum to 100")]
    SharesNotHundred,
    #[msg("A maximum of five heirs is supported")]
    TooManyHeirs,
    #[msg("Each heir must receive a non-zero share")]
    ZeroShare,
    #[msg("Heartbeat and challenge periods must be positive")]
    InvalidInterval,
    #[msg("Deposit amount must be positive")]
    ZeroAmount,
    #[msg("Vault is not active")]
    VaultNotActive,
    #[msg("Heartbeat interval expired")]
    HeartbeatExpired,
    #[msg("Invalid ZK proof")]
    InvalidProof,
    #[msg("Heartbeat not yet expired")]
    HeartbeatNotExpired,
    #[msg("Invalid state transition")]
    InvalidState,
    #[msg("Challenge period not expired")]
    ChallengeNotExpired,
    #[msg("Clock timestamp is not usable")]
    InvalidClock,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Payout account does not match the registered heir")]
    HeirAccountMismatch,
    #[msg("Payout account is not a safe system-owned recipient")]
    UnsafePayoutAccount,
}

#[event]
pub struct VaultInitialized {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub heirs: Vec<Pubkey>,
    pub shares: Vec<u8>,
    pub heartbeat_interval: i64,
    pub challenge_period: i64,
}

#[event]
pub struct DepositEvent {
    pub owner: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}

#[event]
pub struct HeartbeatEvent {
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DeathReported {
    pub reported_at: i64,
}

#[event]
pub struct ChallengeInitiated {
    pub started_at: i64,
}

#[event]
pub struct ChallengeResolved {
    pub is_alive: bool,
    pub resolved_at: i64,
}

#[event]
pub struct InheritanceReleased {
    pub fee: u64,
    pub distributable: u64,
}

#[event]
pub struct InheritancePayment {
    pub heir: Pubkey,
    pub share: u8,
    pub amount: u64,
}

#[event]
pub struct EmergencyRecovery {
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Vault::SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.owner.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Heartbeat<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub router: Program<'info, VerifierRouter>,
    /// CHECK: RISC Zero verifier router PDA; checked by the router program during CPI.
    pub router_state: UncheckedAccount<'info>,
    /// CHECK: RISC Zero verifier entry PDA for the proof selector; checked by the router program during CPI.
    pub verifier_entry: UncheckedAccount<'info>,
    /// CHECK: RISC Zero verifier program; checked by the router program during CPI.
    pub verifier_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultAction<'info> {
    #[account(mut, seeds = [b"vault", vault.owner.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct EmergencyRecover<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct ReleaseInheritance<'info> {
    #[account(mut, seeds = [b"vault", vault.owner.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    /// CHECK: validated against the canonical treasury PDA before the signed transfer.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

fn now() -> Result<i64> {
    let timestamp = Clock::get()?.unix_timestamp;
    require!(timestamp > 0, DeathClockError::InvalidClock);
    Ok(timestamp)
}

fn validate_heirs(heirs: &[Pubkey], shares: &[u8]) -> Result<()> {
    require!(!heirs.is_empty(), DeathClockError::NoHeirs);
    require!(heirs.len() <= MAX_HEIRS, DeathClockError::TooManyHeirs);
    require!(heirs.len() == shares.len(), DeathClockError::InvalidShares);
    require!(
        shares.iter().try_fold(0u8, |total, share| total.checked_add(*share))
            == Some(100),
        DeathClockError::SharesNotHundred
    );
    require!(shares.iter().all(|share| *share > 0), DeathClockError::ZeroShare);
    Ok(())
}

fn validate_heartbeat_journal(
    journal_outputs: &[u8],
    owner: &Pubkey,
    current_time: i64,
) -> Result<()> {
    require!(
        journal_outputs.len() == 64,
        DeathClockError::InvalidProof
    );
    let mut commitment = [0u8; 32];
    commitment.copy_from_slice(&journal_outputs[..32]);
    let timestamp = i64::from_le_bytes(
        journal_outputs[32..40]
            .try_into()
            .map_err(|_| error!(DeathClockError::InvalidProof))?,
    );
    let nonce = &journal_outputs[40..64];
    let mut hasher = Sha256::new();
    hasher.update(owner.as_ref());
    hasher.update(timestamp.to_le_bytes());
    hasher.update(nonce);
    let expected: [u8; 32] = hasher.finalize().into();
    require!(commitment == expected, DeathClockError::InvalidProof);

    let age = current_time
        .checked_sub(timestamp)
        .ok_or(DeathClockError::InvalidClock)?;
    require!(age <= PROOF_MAX_AGE_SECONDS, DeathClockError::InvalidProof);
    require!(age >= -PROOF_MAX_FUTURE_SECONDS, DeathClockError::InvalidProof);
    Ok(())
}

fn verify_risc0_receipt(
    ctx: &Context<Heartbeat>,
    seal: &Seal,
    image_id: [u8; 32],
    journal_digest: [u8; 32],
) -> Result<()> {
    let cpi_accounts = RouterVerify {
        router: ctx.accounts.router_state.to_account_info(),
        verifier_entry: ctx.accounts.verifier_entry.to_account_info(),
        verifier_program: ctx.accounts.verifier_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    verifier_router::cpi::verify(
        CpiContext::new(ctx.accounts.router.to_account_info(), cpi_accounts),
        seal.clone(),
        image_id,
        journal_digest,
    )
    .map_err(|_| error!(DeathClockError::InvalidProof))
}

#[program]
pub mod deathclock {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        heirs: Vec<Pubkey>,
        shares: Vec<u8>,
        heartbeat_interval: i64,
        challenge_period: i64,
    ) -> Result<()> {
        validate_heirs(&heirs, &shares)?;
        require!(heartbeat_interval > 0, DeathClockError::InvalidInterval);
        require!(challenge_period > 0, DeathClockError::InvalidInterval);

        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.heirs = heirs.clone();
        vault.shares = shares.clone();
        vault.heartbeat_interval = heartbeat_interval;
        vault.challenge_period = challenge_period;
        vault.last_heartbeat = now()?;
        vault.death_reported_at = 0;
        vault.challenge_started_at = 0;
        vault.total_deposited = 0;
        vault.state = VaultState::Active;
        vault.bump = ctx.bumps.vault;

        emit!(VaultInitialized {
            owner: vault.owner,
            vault: vault.key(),
            heirs,
            shares,
            heartbeat_interval,
            challenge_period,
        });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, DeathClockError::ZeroAmount);
        let vault = &mut ctx.accounts.vault;
        vault.require_active()?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: vault.to_account_info(),
                },
            ),
            amount,
        )?;

        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(DeathClockError::ArithmeticOverflow)?;

        emit!(DepositEvent {
            owner: vault.owner,
            amount,
            total_deposited: vault.total_deposited,
        });
        Ok(())
    }

    pub fn heartbeat(
        ctx: Context<Heartbeat>,
        seal: Seal,
        journal_outputs: Vec<u8>,
    ) -> Result<()> {
        let timestamp = now()?;
        validate_heartbeat_journal(&journal_outputs, &ctx.accounts.owner.key(), timestamp)?;
        let journal_digest: [u8; 32] = Sha256::digest(journal_outputs.as_slice()).into();
        verify_risc0_receipt(&ctx, &seal, HEARTBEAT_IMAGE_ID, journal_digest)?;

        let vault = &mut ctx.accounts.vault;
        vault.require_active()?;
        vault.last_heartbeat = timestamp;
        vault.death_reported_at = 0;
        vault.challenge_started_at = 0;
        emit!(HeartbeatEvent {
            owner: vault.owner,
            timestamp,
        });
        Ok(())
    }

    pub fn report_death(ctx: Context<VaultAction>) -> Result<()> {
        let timestamp = now()?;
        let vault = &mut ctx.accounts.vault;
        vault.require_active()?;

        let elapsed = timestamp
            .checked_sub(vault.last_heartbeat)
            .ok_or(DeathClockError::InvalidClock)?;
        require!(
            elapsed > vault.heartbeat_interval,
            DeathClockError::HeartbeatNotExpired
        );

        vault.state = VaultState::Missed;
        vault.death_reported_at = timestamp;
        emit!(DeathReported {
            reported_at: timestamp,
        });
        Ok(())
    }

    pub fn initiate_challenge(ctx: Context<VaultAction>) -> Result<()> {
        require!(
            ctx.accounts.vault.state == VaultState::Missed,
            DeathClockError::InvalidState
        );
        let timestamp = now()?;
        let vault = &mut ctx.accounts.vault;
        vault.state = VaultState::Challenged;
        vault.challenge_started_at = timestamp;
        emit!(ChallengeInitiated { started_at: timestamp });
        Ok(())
    }

    pub fn resolve_challenge(ctx: Context<VaultAction>, is_alive: bool) -> Result<()> {
        let timestamp = now()?;
        let vault = &mut ctx.accounts.vault;
        require!(
            vault.state == VaultState::Challenged,
            DeathClockError::InvalidState
        );
        let elapsed = timestamp
            .checked_sub(vault.challenge_started_at)
            .ok_or(DeathClockError::InvalidClock)?;
        require!(
            elapsed > vault.challenge_period,
            DeathClockError::ChallengeNotExpired
        );

        if is_alive {
            vault.state = VaultState::Active;
            vault.last_heartbeat = timestamp;
            vault.death_reported_at = 0;
            vault.challenge_started_at = 0;
        } else {
            vault.state = VaultState::Release;
        }

        emit!(ChallengeResolved {
            is_alive,
            resolved_at: timestamp,
        });
        Ok(())
    }

    pub fn release_inheritance<'info>(
        ctx: Context<'_, '_, '_, 'info, ReleaseInheritance<'info>>,
        treasury_bump: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.vault.state == VaultState::Release,
            DeathClockError::InvalidState
        );
        require!(
            ctx.remaining_accounts.len() == ctx.accounts.vault.heirs.len(),
            DeathClockError::InvalidShares
        );
        let expected_treasury = Pubkey::create_program_address(
            &[b"treasury", &[treasury_bump]],
            ctx.program_id,
        )
        .map_err(|_| error!(DeathClockError::InvalidState))?;
        require_keys_eq!(
            ctx.accounts.treasury.key(),
            expected_treasury,
            DeathClockError::InvalidState
        );

        let rent_reserve = Rent::get()?.minimum_balance(8 + Vault::SPACE);
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        let distributable = vault_balance
            .checked_sub(rent_reserve)
            .ok_or(DeathClockError::ArithmeticOverflow)?;
        let fee = distributable
            .checked_mul(5)
            .ok_or(DeathClockError::ArithmeticOverflow)?
            / 1_000;
        let payout_total = distributable
            .checked_sub(fee)
            .ok_or(DeathClockError::ArithmeticOverflow)?;

        let vault_info = ctx.accounts.vault.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();
        **vault_info.try_borrow_mut_lamports()? = vault_info.lamports()
            .checked_sub(fee)
            .ok_or(DeathClockError::ArithmeticOverflow)?;
        **treasury_info.try_borrow_mut_lamports()? = treasury_info.lamports()
            .checked_add(fee)
            .ok_or(DeathClockError::ArithmeticOverflow)?;

        let heirs = ctx.accounts.vault.heirs.clone();
        let shares = ctx.accounts.vault.shares.clone();
        let mut remainder = payout_total;
        for index in 0..heirs.len() {
            let amount = if index + 1 == heirs.len() {
                remainder
            } else {
                payout_total
                    .checked_mul(shares[index] as u64)
                    .ok_or(DeathClockError::ArithmeticOverflow)?
                    / 100
            };
            remainder = remainder
                .checked_sub(amount)
                .ok_or(DeathClockError::ArithmeticOverflow)?;
            // The caller chooses remaining_accounts, so each one must be bound to
            // the heir recorded in the vault. Without this check any account can
            // be named here and the payout is redirectable: release_inheritance
            // takes no Signer, so whoever calls it decides who gets paid.
            let heir_info = ctx.remaining_accounts[index].clone();
            require_keys_eq!(
                heir_info.key(),
                heirs[index],
                DeathClockError::HeirAccountMismatch
            );
            // Crediting lamports to an account owned by a program can corrupt
            // that program's invariants (a token account's balance lives in its
            // data, not in its lamports), so only plain system-owned accounts
            // with no data are accepted as recipients.
            require!(
                *heir_info.owner == system_program::ID,
                DeathClockError::UnsafePayoutAccount
            );
            require!(
                heir_info.data_len() == 0,
                DeathClockError::UnsafePayoutAccount
            );
            **vault_info.try_borrow_mut_lamports()? -= amount;
            **heir_info.try_borrow_mut_lamports()? += amount;
            emit!(InheritancePayment {
                heir: heirs[index],
                share: shares[index],
                amount,
            });
        }

        ctx.accounts.vault.state = VaultState::Released;
        emit!(InheritanceReleased { fee, distributable });
        Ok(())
    }

    pub fn emergency_recover(ctx: Context<EmergencyRecover>) -> Result<()> {
        let timestamp = now()?;
        let vault = &mut ctx.accounts.vault;
        require!(
            matches!(vault.state, VaultState::Missed | VaultState::Challenged),
            DeathClockError::InvalidState
        );
        vault.state = VaultState::Active;
        vault.last_heartbeat = timestamp;
        vault.death_reported_at = 0;
        vault.challenge_started_at = 0;
        emit!(EmergencyRecovery {
            owner: vault.owner,
            timestamp,
        });
        Ok(())
    }
}
