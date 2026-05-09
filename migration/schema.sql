CREATE TABLE IF NOT EXISTS dash_apps (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  url VARCHAR(500) NOT NULL,
  icon VARCHAR(120) DEFAULT 'fas fa-cube',
  color VARCHAR(20) DEFAULT '#1976d2',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_icons (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  class VARCHAR(120) NOT NULL,
  unicode_value VARCHAR(30) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dash_icons_class (class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_users (
  username VARCHAR(80) NOT NULL,
  nama VARCHAR(160) DEFAULT '',
  pass_hash VARCHAR(80) NOT NULL,
  role ENUM('user','admin','master') NOT NULL DEFAULT 'user',
  group_name VARCHAR(120) NOT NULL DEFAULT 'default',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (username),
  KEY idx_dash_users_role (role),
  KEY idx_dash_users_group (group_name),
  KEY idx_dash_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_app_groups (
  group_name VARCHAR(120) NOT NULL,
  app_ids TEXT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_sessions (
  token VARCHAR(255) NOT NULL,
  username VARCHAR(80) NOT NULL,
  nama VARCHAR(160) DEFAULT '',
  role ENUM('user','admin','master') NOT NULL DEFAULT 'user',
  group_name VARCHAR(120) NOT NULL DEFAULT 'default',
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (token),
  KEY idx_dash_sessions_username (username),
  KEY idx_dash_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dash_migration_logs (
  id INT NOT NULL AUTO_INCREMENT,
  action VARCHAR(120) NOT NULL,
  detail LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
