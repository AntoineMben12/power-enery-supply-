CREATE DATABASE IF NOT EXISTS eneo_outage CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eneo_outage;

CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  user_role ENUM('client','subcontractor') NOT NULL,
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_app_users_role_name (user_role, full_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incidents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  district VARCHAR(180) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  radius_m INT UNSIGNED NOT NULL DEFAULT 500,
  estimated_area_m2 BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reports_count INT UNSIGNED NOT NULL DEFAULT 0,
  severity_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  status ENUM('pending_validation','validated','assigned','on_the_way','under_intervention','completed','verification_pending','closed','rejected','pending') NOT NULL DEFAULT 'pending',
  assignee VARCHAR(140) NULL,
  root_cause VARCHAR(180) NULL,
  resolution TEXT NULL,
  agency_report TEXT NULL,
  first_report_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_report_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_by VARCHAR(140) NULL,
  validated_at DATETIME NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_incident_status_updated (status, updated_at),
  INDEX idx_incident_cluster (last_report_at, latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NULL,
  reporter_name VARCHAR(120) NOT NULL DEFAULT 'Anonymous citizen',
  phone VARCHAR(40) NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NULL,
  district VARCHAR(180) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  status ENUM('new','clustered','validated','assigned','on_the_way','under_intervention','completed','closed','rejected') NOT NULL DEFAULT 'new',
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  photo_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_report_incident_created (incident_id, created_at),
  INDEX idx_report_geo_created (created_at, latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incident_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  author_role ENUM('client','agency','socadel') NOT NULL DEFAULT 'client',
  author_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_message_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_message_incident_created (incident_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incident_confirmations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  reporter_key CHAR(64) NOT NULL,
  confirmation_type ENUM('also_affected','restored') NOT NULL DEFAULT 'also_affected',
  comment VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_confirmation_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  UNIQUE KEY uq_confirmation_per_user (incident_id, reporter_key, confirmation_type),
  INDEX idx_confirmation_incident_type (incident_id, confirmation_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  contractor VARCHAR(140) NOT NULL,
  status ENUM('assigned','on_the_way','under_intervention','completed') NOT NULL DEFAULT 'assigned',
  assigned_by VARCHAR(140) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  departed_at DATETIME NULL,
  arrival_time DATETIME NULL,
  completion_time DATETIME NULL,
  root_cause VARCHAR(255) NULL,
  diagnosis TEXT NULL,
  equipment VARCHAR(160) NULL,
  replaced_components TEXT NULL,
  technical_comments TEXT NULL,
  photo_url VARCHAR(500) NULL,
  CONSTRAINT fk_work_request_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_work_request_incident (incident_id),
  INDEX idx_work_request_contractor_status (contractor, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agency_notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  agency VARCHAR(140) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  message VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_notification_agency_created (agency, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
  ('cluster_distance_m', '500'),
  ('cluster_window_minutes', '30'),
  ('cluster_max_radius_m', '2000'),
  ('min_reports_to_qualify', '1');

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(140) NOT NULL,
  action VARCHAR(80) NOT NULL,
  incident_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_audit_incident_created (incident_id, created_at)
) ENGINE=InnoDB;

-- Idempotent upgrades for databases created by the earlier prototype schema.
ALTER TABLE incidents
  MODIFY status ENUM('pending_validation','validated','assigned','on_the_way','under_intervention','completed','verification_pending','closed','rejected','pending') NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS severity_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_area_m2 BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_report_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_report_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS validated_by VARCHAR(140) NULL,
  ADD COLUMN IF NOT EXISTS validated_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS closed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL;

ALTER TABLE incident_messages
  MODIFY author_role ENUM('client','agency','socadel') NOT NULL DEFAULT 'client';

ALTER TABLE work_requests
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(140) NOT NULL DEFAULT 'legacy migration',
  ADD COLUMN IF NOT EXISTS assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS departed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS root_cause VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL;

