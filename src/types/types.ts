import Logger = require("bunyan");

export const enum VaultStatus {
  NEW = "NEW",
  KEYGEN_IN_PROGRESS = "KEYGEN_IN_PROGRESS",
  KEYGEN_FAILED = "KEYGEN_FAILED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export type Vault = {
  orgId: string;
  vaultId: string;
  name: string;
  threshold: number;
  partyCount: number;
  pubKey?: PubKey;
  chainCode?: string;
  /** The cosigner key id */
  keyId?: string;
  keygenJobId?: string;
  status: VaultStatus;
  createdAt: string;
  updatedAt: string;
  externalId?: string;
  /** Will try to initialize the wallet once vault created */
  initWallet?: InitWalletOpts;
  lastIndex?: number;
};

export type Account = {
  orgId: string;
  vaultId: string;
  accountId: string;
  name: string;
  path: string;
  pubKey?: PubKey;
  /** The cosigner key id, same as vault's */
  keyId?: string;
  createdAt: string;
  updatedAt: string;
  externalId?: string;
};

export type PubKey = {
  x: string;
  y: string;
  type?: string;
  curve?: string;
};

export type InitWalletOpts = {
  status?: InitWalletStatus;
  walletId?: string;
  webhookUrl: string;
  assetId: string;
  sweepTo: {
    vaultId: string;
    walletId: string;
  };
};

export const enum InitWalletStatus {
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export const enum AssetType {
  TRC20 = "TRC20",
  ERC20 = "ERC20",
  BRC20 = "BRC20",
  NATIVE = "NATIVE",
}

export const enum ChainType {
  UTXO = "UTXO",
  ACCOUNT = "ACCOUNT",
}

export type Wallet = {
  orgId: string;
  vaultId: string;
  accountId?: string;
  walletId: string;
  name: string;
  balance: string;
  balanceV2?: {
    /** the balance as it appears on the blockchain == balance */
    total: string;
    /** Funds available for transfer. Equals the blockchain balance minus any locked amounts */
    available: string;
    /** Funds in outgoing transactions that are not yet published to the network */
    locked: string;
    /** The cumulative balance of all transactions pending to be cleared */
    pending: string;
    // TODO for approvals and stuff like that
    // frozen: string;
    version: number;
  };
  address: string;
  addressChecksum?: string;
  /** for now it will be the same as it's vault (or account) */
  pubKey?: {
    x: string;
    y: string;
  };
  signJobId?: string;
  assetId: string;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
  webhookTypes?: WebhookType[];
  sweepTo?: {
    vaultId: string;
    walletId: string;
  }; // For automatic sweeping funds to another wallet of the same asset on the same org
  lastDepositIndex?: number; // for UTXO
  lastChangeIndex?: number; // for UTXO
};

export type Address = {
  orgId: string;
  vaultId: string;
  walletId: string;
  addressId: string;
  assetId: string;
  name: string;
  path: string;
  pubKey: PubKey;
  address: string;
  createdAt: string;
  updatedAt: string;
  externalId?: string;
  isChange?: boolean;
  isChangeForTxId?: string;
};

export enum TxStatus {
  INITIAL = "INITIAL", // Status for all new transactions
  NEEDS_APPROVAL = "NEEDS_APPROVAL",
  NEW = "NEW",
  SIGN_IN_PROGRESS = "SIGN_IN_PROGRESS",
  SIGNED = "SIGNED",
  FAILED_SIGNED = "FAILED_SIGNED",
  BROADCASTED = "BROADCASTED",
  FAILED_BROADCAST = "FAILED_BROADCAST",
  FAILED = "FAILED",
  UNCONFIRMED = "UNCONFIRMED",
  CONFIRMED = "CONFIRMED",
  COMPLETE = "COMPLETE", // Final
  BLOCKED = "BLOCKED", // Final
  REJECTED = "REJECTED", // Final
}

export const enum TxType {
  USER_SEND = "USER_SEND",
  USER = "USER",
  SWEEP = "SWEEP",
  REFUEL = "REFUEL",
  RECEIVE = "RECEIVE", // generic receive
  FEE_FOR_TOKEN_SEND = "FEE_FOR_TOKEN_SEND",
}

export type Tx = {
  orgId: string;
  vaultId: string;
  walletId: string;
  accountId?: string; // currently a wallet might not belong to an account
  txId: string;
  /** in ETH we only know this after signing */
  txHash?: string;
  status: TxStatus;
  /** the built blockchain tx */
  tx: any;
  /** currently used for ETH */
  signedTxHex?: string;
  /** The message to sign by the cosigners: normally txHash */
  toSign?: string;
  direction: "IN" | "OUT";
  from: string;
  to: string;
  amount: string;
  amountUsd?: string;
  assetId: string;
  note?: string;
  externalId?: string;
  signature?: {
    r: string;
    s: string;
    v: string; // recovery
    sig: string; // r+s
    m: string;
  };
  createdAt: string;
  updatedAt: string;
  blockData?: BlockData;
  minerFee?: string | number; // same as blockData.fee
  minerFeeUsd?: string;
  type: TxType;
  GSI1PK?: string;
  isDust?: boolean;
  initiator: string;
  // within org destination
  dstVaultId?: string;
  dstWalletId?: string;
  dstAccountId?: string;
  policyExecutionId?: string; // KSUID of PolicyExecution evaluated this tx
};

export type BlockData = {
  fee: number | string;
  blockNumber: number;
  blockTimeStamp: number;
  txTimeStamp: number;
  result: string;
  confs: number;
};

export interface SqsJobParams {
  /** big integer hex encoded  */
  toSign: string;
  keyId: string;
  hdPath?: number[];
  hdChainCode?: string;
}

export type SqsJobRequest = {
  jobId: string;
  type: JobType;
  cosigners: string[];
  metadata: {
    orgId: string;
    vaultId: string;
    walletId?: string;
    txId?: string;
    utxoId?: string;
  };
  params?: SqsJobParams;
};

export const enum JobType {
  KeygenInit = "keygeninit",
  Keygen = "keygen",
  SignInit = "signinit",
  Sign = "sign",
}

export const enum JobStatus {
  Started = "started",
  Finished = "finished",
  Failed = "failed",
}

export type Asset = {
  assetId: string;
  symbol: string;
  decimals: number;
  assetType: AssetType;
  nativeAsset: string; // if asset is native then this is equal to assetId
  contractAddress?: string; // tokens only
  testnet?: string;
  dust?: string;
  chainType?: ChainType;
};

export type ReqCtx = {
  orgId: string;
  userId: string;
  log: Logger;
};

export type KeygenJobResult = {
  orgId: string;
  vaultId: string;
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  keygenResult: KeygenResult;
};

export type KeygenResult = {
  keyId: string;
  type: string;
  curve: string;
  x: string;
  y: string;
};

export type SignJobResult = {
  orgId: string;
  vaultId: string;
  walletId: string;
  txId: string;
  utxoId?: string;
  jobId: string;
  jobType: JobType;
  status: JobStatus;
  signResult: SignResult;
};

export type SignResult = {
  signature: string;
  signatureRecovery: string;
  r: string;
  s: string;
  m: string;
};

export type TatumWebhook = {
  address: string;
  amount: string;
  asset: string;
  blockNumber: string;
  txId: string;
  type: string;
  subscriptionType: string;
};

export enum WebhookType {
  TX_IN = "TX_IN",
  TX_OUT = "TX_OUT",
}

export const enum SubscriptionProvider {
  TATUM = "TATUM",
  TATUM_US = "TATUM_US",
  TATUM_US1 = "TATUM_US1",
  CHAINIFY_TRON = "CHAINIFY_TRON",
  CH = "CH",
  MORALIS = "MORALIS",
}

export type TxSignedResult = {
  signedTx: any;
  txHash?: string;
  txHex?: string;
};

export type OutTx = {
  id?: number;
  txId: string;
  ts: string;
  state: "INITIAL" | "COMPLETE";
  initiator: string;
  type: TxType;
  asset: string;
  amountUsd: number;
  srcOrgId: string;
  srcVaultId: string;
  srcWalletId: string;
  srcAccountId: string;
  dstOrgId?: string;
  dstVaultId?: string;
  dstWalletId?: string;
  dstAccountId?: string;
  dstAddress: string;
  dstWhitelisted: boolean;
  updatedAt?: string;
};

export type Utxo = {
  id: string;
  orgId: string;
  vaultId: string;
  walletId: string;
  address: string;
  amount: string;
  assetId: string;
  txHash: string;
  index: number;
  createdAt: string;
  updatedAt: string;
  blockNo: number;
  blockHash: string;
  status: string;
  spendingTxId: string;
  type: "DEPOSIT" | "CHANGE";
  pubKey?: string;
  toSign?: string;
  signature?: string;
};

export type CreateTxRequest = {
  vaultId: string;
  walletId: string;
  toAddress: string;
  assetId: string;
  amount: string;
  type: TxType;
  note?: string;
  externalId?: string;
};

export type ToSignData = {
  utxoId: string;
  toSign: string;
  pubKeyHex: string;
  signature?: string;
};

// =====
// webhooks
//=======
export type ParsedTx = {
  txHash: string;
  status: TxStatus;
  createdAt: string;
  assetId: string;
  updatedAt: string;
  direction: "IN" | "OUT";
  amount: number | string;
  from: string;
  to: string;
  blockData: BlockData;
};
