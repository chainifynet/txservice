CREATE TABLE utxo (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  `org_id` VARCHAR(255) NOT NULL,
  `vault_id` VARCHAR(255) NOT NULL,
  `wallet_id` VARCHAR(255) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(16,0) NOT NULL,
  `asset_id` VARCHAR(255) NOT NULL,
  `tx_hash` VARCHAR(255) NOT NULL,
  `index` INT NOT NULL,
  `block_no` INT NOT NULL,
  `block_hash` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `spending_tx_id` VARCHAR(255) NOT NULL DEFAULT 'unspent', -- for the index to be functional
  `spending_index` INT,
  `pub_key` VARCHAR(255),
  `to_sign` VARCHAR(255),
  `signature` VARCHAR(255),
  `created_at` TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tx_hash`, `index`),
  UNIQUE KEY `id-uindex` (`id`),
  KEY `spending_tx_id-wallet_id-amount-index` (`spending_tx_id`, `wallet_id`, `amount`)
);

