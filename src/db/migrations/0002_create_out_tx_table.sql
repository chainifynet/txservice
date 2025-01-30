CREATE TABLE `out_tx`
(
    `id`              BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tx_id`           VARCHAR(255)        NOT NULL,
    `ts`              DATETIME(3)         NOT NULL,
    `state`           VARCHAR(255)        NOT NULL,
    `initiator`       VARCHAR(255)        NOT NULL,
    `type`            VARCHAR(255)        NOT NULL,
    `asset`           VARCHAR(255)        NOT NULL,
    `amount_usd`      BIGINT(20) UNSIGNED NOT NULL,
    `src_org_id`      VARCHAR(255)        NOT NULL,
    `src_vault_id`    VARCHAR(255)        NOT NULL,
    `src_wallet_id`   VARCHAR(255)        NOT NULL,
    `src_account_id`  VARCHAR(255)        NOT NULL,
    `dst_org_id`      VARCHAR(255)                 DEFAULT NULL,
    `dst_vault_id`    VARCHAR(255)                 DEFAULT NULL,
    `dst_wallet_id`   VARCHAR(255)                 DEFAULT NULL,
    `dst_account_id`  VARCHAR(255)                 DEFAULT NULL,
    `dst_address`     VARCHAR(255)        NOT NULL,
    `dst_whitelisted` TINYINT(1) UNSIGNED NOT NULL DEFAULT '0',
    `updated_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`tx_id`),
    UNIQUE KEY `u-id-idx` (`id`),
    KEY `src_org_id-ts-idx` (`src_org_id`, `ts`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;
