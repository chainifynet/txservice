export const enum Err {
  WALLET_ALREADY_EXISTS = "WALLET_ALREADY_EXISTS",
  NOT_ENOUGHT_UTXOS_FOR_AMOUNT = "NOT_ENOUGHT_UTXOS_FOR_AMOUNT",

  // related to webhook
  TX_ALREADY_EXISTS = "TX_ALREADY_EXISTS",
  FOUND_MULTIPLE_TXS = "FOUND_MULTIPLE_TXS",
  FOUND_MULTIPLE_WALLETS = "FOUND_MULTIPLE_WALLETS",
  UNKNOWN_ASSET = "UNKNOWN_ASSET",

  // related to plan
  MAX_VAULT_COUNT_REACHED = "MAX_VAULT_COUNT_REACHED",
  MAX_ACCOUNT_COUNT_REACHED = "MAX_ACCOUNT_COUNT_REACHED",
}

export const newErrWithCode = (message: string, status = 500, code: Err = null) => {
  if (code) {
    return Object.assign(new Error(message), { status: status, error: { code } });
  }
  return Object.assign(new Error(message), { status: status });
};

/**
 * Non-HTTP error
 */
export const newErr = (message: string, code?: Err) => {
  if (code) {
    return Object.assign(new Error(message), { code });
  }
  return Object.assign(new Error(message));
};
