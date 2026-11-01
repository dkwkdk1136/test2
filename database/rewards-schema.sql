CREATE TABLE IF NOT EXISTS match_rewards (
 match_id CHAR(36) NOT NULL,
 account_id INT UNSIGNED NOT NULL,
 policy_version INT UNSIGNED NOT NULL,
 mode VARCHAR(8) NOT NULL,
 outcome VARCHAR(12) NOT NULL,
 duration_seconds INT UNSIGNED NOT NULL,
 mech_type TINYINT UNSIGNED NOT NULL,
 xp INT UNSIGNED NOT NULL,
 points INT UNSIGNED NOT NULL,
 kills INT UNSIGNED NOT NULL,
 deaths INT UNSIGNED NOT NULL,
 eligible TINYINT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (match_id,account_id),
 INDEX rewards_account_time (account_id,created_at),
 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
