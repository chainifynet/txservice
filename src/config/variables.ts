export const logLevel = process.env.LOG_LEVEL;
export const loggerName = process.env.LOGGER_NAME;
export const serviceDomain = process.env.SERVICE_DOMAIN;
export const serviceName = process.env.SERVICE_NAME;
export const appPort = Number(process.env.APP_PORT);
export const appHost = process.env.HOST || "localhost";

export const awsRegion = process.env.AWS_REGION;
// tron public node
export const tronGridUrl = process.env.TRON_GRID_URL;
export const tronGridApiKey = process.env.TRON_GRID_API_KEY;
export const tatumUrl = process.env.TATUM_URL;
export const tatumUrlUS = process.env.TATUM_URL_US;
export const tatumUrlV4 = process.env.TATUM_URL_V4;
export const cfTronSubscriptionUrl = process.env.CF_TRON_SUBSCRIPTION_URL;
export const bitcoinChainstackUrl = process.env.BITCOIN_CHAINSTACK_URL;

export const tatumCallbackUrl = process.env.TATUM_CALLBACK_URL;
export const addTatumSubsOnWalletCreation = Boolean(process.env.CREATE_TATUM_SUBSCRIPTION_ON_CREATE_WALLET);
export const addChSubsOnWalletCreation = Boolean(process.env.CREATE_CH_SUBSCRIPTION_ON_CREATE_WALLET);
export const tatumAPIKey = process.env.TATUM_API_KEY;
export const tatumAPIKeyUS = process.env.TATUM_API_KEY_US;
export const tatumAPIKeyV4 = process.env.TATUM_API_KEY_V4;

export const tatumAPIKeyTestnet = process.env.TATUM_API_KEY_TESTNET;
export const tatumHmacSecret = process.env.TATUM_HMAC_SECRET;
export const moralisAPIKey = process.env.MORALIS_API_KEY;
export const addMoralisSubsOnWalletCreation = Boolean(process.env.CREATE_MORALIS_SUBSCRIPTION_ON_CREATE_WALLET);
export const chBitcoinSubscriptionUrl = process.env.CH_SUBSCRIPTION_URL;
export const chApiKey = process.env.CH_API_KEY;
export const chApiSecret = process.env.CH_API_SECRET;

export const coingeckoUrl = process.env.COINGECKO_URL;

// ddb
export const vaultTable = process.env.DDB_VAULT_TABLE;
export const walletTable = process.env.DDB_WALLET_TABLE;
export const txTable = process.env.DDB_TX_TABLE;
export const providerSubscriptionTable = process.env.DDB_PROVIDER_SUBSCRIPTION_TABLE;
export const accountTable = process.env.DDB_ACCOUNT_TABLE;
export const metricsTable = process.env.DDB_METRICS_TABLE;
export const addressTable = process.env.DDB_ADDRESS_TABLE;
export const assetTable = process.env.DDB_ASSET_TABLE;
// sqs
export const jobQueue = process.env.SQS_JOB_QUEUE;
export const watchQueueUrl = process.env.SQS_WATCH_QUEUE_URL;

export const txExpirationInSeconds = Number(process.env.TX_EXPIRATION_IN_SECS);
export const trc20TxFeeLimit = Number(process.env.TRC_20_FEE_LIMIT) || 50_000_000; // 50 TRX

// other microservices
export const sweepManagerUrl = process.env.SWEEP_MANAGER_URL;
export const userServiceUrl = process.env.USER_SERVICE_URL;

export const isTestnet = process.env.TESTNET === "true";
export const ethNetwork = process.env.ETH_NETWORK || "mainnet";
export const infuraAPIKey = process.env.INFURA_API_KEY;
export const bscNodeUrl = process.env.BSC_NODE_URL;
export const bscChainId = Number(process.env.BSC_CHAIN_ID);

export const rds = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  name: process.env.DB_NAME,
  user: process.env.DB_USER,
  pass: process.env.DB_PASS,
};

