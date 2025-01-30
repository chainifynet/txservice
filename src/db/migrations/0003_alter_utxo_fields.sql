ALTER TABLE `utxo`
    MODIFY COLUMN `block_no` INT;

ALTER TABLE `utxo`
    MODIFY COLUMN `block_hash` VARCHAR(255);
