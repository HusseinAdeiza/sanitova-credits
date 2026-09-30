const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sanitova',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

async function seed() {
  const pool = new Pool(config);
  
  try {
    // Check if already seeded
    const { rows } = await pool.query("SELECT COUNT(*) FROM users WHERE email = 'alice@sanitova.com'");
    if (Number(rows[0].count) === 0) {

    console.log('🌱 Seeding demo data...');

    // Generate password hash dynamically (bcryptjs produces different output each time,
    // but compare() works against any valid hash of the same password)
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('demo123', 12);

    // Roles and users
    await pool.query(`
      INSERT INTO roles (name, description) VALUES
        ('issuer', 'Enterprise that creates and issues compliance assets'),
        ('holder', 'Entity that holds and manages compliance assets'),
        ('inspector', 'Authorized party that verifies and updates asset status'),
        ('regulator', 'Observer/regulator with read-only audit access')
    ON CONFLICT (name) DO NOTHING;
    `);

    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, organization, created_at) VALUES
        ($1, $2, 'Alice Muster', (SELECT id FROM roles WHERE name = 'issuer'), 'Sanitova EHS Ltd', NOW()),
        ($3, $2, 'Bob Builder', (SELECT id FROM roles WHERE name = 'holder'), 'CleanWater Industries', NOW()),
        ($4, $2, 'Clara Inspect', (SELECT id FROM roles WHERE name = 'inspector'), 'Canton Health Authority', NOW()),
        ($5, $2, 'David Regulator', (SELECT id FROM roles WHERE name = 'regulator'), 'Canton Environmental Agency', NOW())
      ON CONFLICT (email) DO NOTHING`,
      ['alice@sanitova.com', passwordHash, 'bob@sanitova.com', 'clara@sanitova.com', 'david@sanitova.com']
    );

    // Compliance assets
    await pool.query(`
      INSERT INTO compliance_assets
        (asset_type, title, description, issuer_id, current_holder_id, status, location, metadata, issued_at, created_at)
      VALUES
        (
          'Sanitation Inspection Certificate',
          'Q3 2026 Sanitation Compliance - Facility A',
          'Verified sanitation inspection for Water Treatment Plant Alpha, covering waste management, water quality parameters, and hygiene protocols.',
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          'verified',
          'Zurich, Switzerland',
          '{"inspection_date": "2026-08-15", "inspector_id": "usr_clara", "facility_type": "water_treatment", "next_due": "2027-02-15", "standards_applied": ["WHO-GWQS-2025", "Canton-EHS-2026"]}'::jsonb,
          NOW(), NOW()
        ),
        (
          'WASH Facility Verification',
          'WASH Compliance - Community Health Center B',
          'Water, Sanitation, and Hygiene facility verification for rural health center serving 2,500 residents.',
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          (SELECT id FROM users WHERE email = 'bob@sanitova.com'),
          'pending_review',
          'Geneva, Switzerland',
          '{"inspection_date": "2026-09-01", "inspector_id": "usr_clara", "facility_type": "health_center", "population_served": 2500, "water_source": "groundwater", "lat": 46.2044, "lng": 6.1424, "standards_applied": ["WHO-WASH-2025", "SDG-6"]}'::jsonb,
          NOW(), NOW()
        ),
        (
          'Waste Compliance Certificate',
          'Industrial Waste Management Compliance - Site C',
          'Hazardous waste handling and disposal compliance certificate for industrial manufacturing site.',
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          'verified',
          'Basel, Switzerland',
          '{"inspection_date": "2026-07-20", "inspector_id": "usr_clara", "waste_types": ["hazardous", "chemical"], "disposal_method": "approved_incineration", "tonnage": 42.5, "next_inspection": "2027-01-20", "standards_applied": ["BURG-2025", "EU-BAT-2024"]}'::jsonb,
          NOW(), NOW()
        ),
        (
          'Environmental Health Audit Asset',
          'Annual Environmental Audit - Facility D',
          'Comprehensive annual environmental health audit covering air quality, noise levels, waste management, and employee safety protocols.',
          (SELECT id FROM users WHERE email = 'alice@sanitova.com'),
          (SELECT id FROM users WHERE email = 'bob@sanitova.com'),
          'in_review',
          'Bern, Switzerland',
          '{"audit_date": "2026-09-10", "audit_type": "annual", "scope": "full_facility", "findings_count": 3, "critical_findings": 0, "auditor_id": "usr_clara", "next_audit": "2027-09-10", "standards_applied": ["ISO-14001", "Canton-EHS-2026"]}'::jsonb,
          NOW(), NOW()
        )
      ON CONFLICT DO NOTHING;
    `);

    }

    // Asset events / audit trail
    await pool.query(`
      WITH asset_ids AS (
        SELECT id, title FROM compliance_assets
      ),
      user_ids AS (
        SELECT id, email FROM users
      )
      INSERT INTO asset_events (asset_id, event_type, event_description, actor_id, actor_role, metadata, created_at)
      SELECT
        ai.id,
        evt.event_type,
        evt.event_description,
        ui.id,
        evt.actor_role,
        evt.metadata::jsonb,
        evt.created_at
      FROM (VALUES
        ('Q3 2026 Sanitation Compliance - Facility A', 'created', 'Asset created by issuer', 'alice@sanitova.com', 'issuer', '{"note": "Initial issuance of sanitation certificate"}', NOW()),
        ('Q3 2026 Sanitation Compliance - Facility A', 'status_changed', 'Status changed to verified after inspection', 'clara@sanitova.com', 'inspector', '{"previous_status": "pending_review", "new_status": "verified", "inspection_score": 94, "notes": "All parameters within acceptable ranges"}', NOW()),
        ('WASH Compliance - Community Health Center B', 'created', 'Asset created by issuer', 'alice@sanitova.com', 'issuer', '{"note": "WASH facility verification initiated"}', NOW()),
        ('WASH Compliance - Community Health Center B', 'status_changed', 'Status changed to pending_review', 'clara@sanitova.com', 'inspector', '{"previous_status": "created", "new_status": "pending_review", "findings": "2 minor issues identified"}', NOW()),
        ('Industrial Waste Management Compliance - Site C', 'created', 'Asset created by issuer', 'alice@sanitova.com', 'issuer', '{"note": "Waste compliance certificate issued"}', NOW()),
        ('Industrial Waste Management Compliance - Site C', 'status_changed', 'Status changed to verified', 'clara@sanitova.com', 'inspector', '{"previous_status": "pending_review", "new_status": "verified", "disposal_certification": "approved"}', NOW()),
        ('Industrial Waste Management Compliance - Site C', 'transferred', 'Asset transferred to CleanWater Industries', 'alice@sanitova.com', 'issuer', '{"from": "usr_alice", "to": "usr_bob", "reason": "operational_handoff"}', NOW()),
        ('Annual Environmental Audit - Facility D', 'created', 'Asset created by issuer', 'alice@sanitova.com', 'issuer', '{"note": "Annual environmental audit initiated"}', NOW()),
        ('Annual Environmental Audit - Facility D', 'status_changed', 'Status changed to in_review', 'clara@sanitova.com', 'inspector', '{"previous_status": "created", "new_status": "in_review", "audit_in_progress": true}', NOW()),
        ('Q3 2026 Sanitation Compliance - Facility A', 'transferred', 'Asset transferred to CleanWater Industries', 'alice@sanitova.com', 'issuer', '{"from": "usr_alice", "to": "usr_bob", "reason": "facility_relocation"}', NOW())
      ) AS evt(asset_title, event_type, event_description, actor_email, actor_role, metadata, created_at)
      JOIN asset_ids ai ON ai.title = evt.asset_title
      JOIN user_ids ui ON ui.email = evt.actor_email
      WHERE NOT EXISTS (
        SELECT 1 FROM asset_events existing
        WHERE existing.asset_id = ai.id AND existing.event_type = evt.event_type
          AND existing.actor_id = ui.id AND existing.metadata = evt.metadata::jsonb
      )
    `);

    // Asset status history
    await pool.query(`
      WITH asset_ids AS (
        SELECT id, title FROM compliance_assets
      ),
      user_ids AS (
        SELECT id, email FROM users
      )
      INSERT INTO asset_status_history (asset_id, status, changed_by, changed_at, metadata)
      SELECT
        ai.id,
        hist.status,
        ui.id,
        hist.changed_at,
        hist.metadata::jsonb
      FROM (VALUES
        ('Q3 2026 Sanitation Compliance - Facility A', 'created', 'alice@sanitova.com', NOW(), '{"note": "Initial creation"}'),
        ('Q3 2026 Sanitation Compliance - Facility A', 'pending_review', 'alice@sanitova.com', NOW(), '{"note": "Submitted for inspection"}'),
        ('Q3 2026 Sanitation Compliance - Facility A', 'verified', 'clara@sanitova.com', NOW(), '{"score": 94, "inspector": "Clara Inspect"}'),
        ('WASH Compliance - Community Health Center B', 'created', 'alice@sanitova.com', NOW(), '{"note": "Initial creation"}'),
        ('WASH Compliance - Community Health Center B', 'pending_review', 'clara@sanitova.com', NOW(), '{"note": "Under review with minor findings"}'),
        ('Industrial Waste Management Compliance - Site C', 'created', 'alice@sanitova.com', NOW(), '{"note": "Initial creation"}'),
        ('Industrial Waste Management Compliance - Site C', 'pending_review', 'alice@sanitova.com', NOW(), '{"note": "Submitted for review"}'),
        ('Industrial Waste Management Compliance - Site C', 'verified', 'clara@sanitova.com', NOW(), '{"note": "All waste protocols compliant"}'),
        ('Annual Environmental Audit - Facility D', 'created', 'alice@sanitova.com', NOW(), '{"note": "Audit initiated"}'),
        ('Annual Environmental Audit - Facility D', 'in_review', 'clara@sanitova.com', NOW(), '{"note": "Audit in progress"}')
      ) AS hist(asset_title, status, changed_by_email, changed_at, metadata)
      JOIN asset_ids ai ON ai.title = hist.asset_title
      JOIN user_ids ui ON ui.email = hist.changed_by_email
      WHERE NOT EXISTS (
        SELECT 1 FROM asset_status_history existing
        WHERE existing.asset_id = ai.id AND existing.status = hist.status
          AND existing.changed_by = ui.id AND existing.metadata = hist.metadata::jsonb
      )
    `);

    console.log('✅ Demo data seeded successfully!');
    console.log('\n📋 Demo accounts (password: demo123 for all):');
    console.log('  Issuer:     alice@sanitova.com');
    console.log('  Holder:    bob@sanitova.com');
    console.log('  Inspector: clara@sanitova.com');
    console.log('  Regulator: david@sanitova.com');
  } finally {
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
