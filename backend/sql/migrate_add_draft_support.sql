-- Migration: Add draft/finalize support to maintenance_records
-- Run this on existing databases that already have the maintenance tables.

-- Step 1: Add 'finalized' to status enum
ALTER TABLE maintenance_records
  MODIFY COLUMN status ENUM(
    'draft','finalized','submitted','peer_checked',
    'rii_approved','released','rejected','revoked'
  ) NOT NULL DEFAULT 'draft';

-- Step 2: Relax NOT NULL constraints for draft-compatible fields
ALTER TABLE maintenance_records
  MODIFY COLUMN record_id CHAR(66) DEFAULT NULL,
  MODIFY COLUMN root_record_id CHAR(66) DEFAULT NULL,
  MODIFY COLUMN aircraft_reg_no VARCHAR(30) DEFAULT NULL,
  MODIFY COLUMN aircraft_type VARCHAR(50) DEFAULT NULL,
  MODIFY COLUMN ata_code VARCHAR(30) DEFAULT NULL,
  MODIFY COLUMN work_type VARCHAR(50) DEFAULT NULL,
  MODIFY COLUMN performer_employee_no VARCHAR(50) DEFAULT NULL;

-- Step 3: Add draft tracking columns
-- Note: MySQL does not support ADD COLUMN IF NOT EXISTS.
-- If these columns already exist, skip this step.
ALTER TABLE maintenance_records
  ADD COLUMN finalized_at DATETIME DEFAULT NULL AFTER submitted_at,
  ADD COLUMN draft_saved_at DATETIME DEFAULT NULL AFTER finalized_at;

-- Step 4: Relax NOT NULL on payloads table
ALTER TABLE maintenance_record_payloads
  MODIFY COLUMN work_description TEXT DEFAULT NULL,
  MODIFY COLUMN raw_form_json JSON DEFAULT NULL;
