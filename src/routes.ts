import * as Router from "koa-router";
import * as txController from "./controllers/transaction";
import * as feeController from "./controllers/fee";
import * as vaultController from "./controllers/vault";
import * as searchController from "./controllers/search";
import * as accountController from "./controllers/account";
import * as cosignerCBController from "./controllers/cosignerCallback";
import * as rateController from "./controllers/rate";
import * as reportController from "./controllers/report";
import * as metricsController from "./controllers/metrics";
import * as whTatum from "./controllers/webhookTatum";
import * as whMoralis from "./controllers/webhookMoralis";
import { healthCheck } from "./controllers/health";
import { userHeadersMiddleware } from "./middleware/middleware";

const router = new Router();
router.get("/health", healthCheck);

// Vaults
router.post("/vaults", userHeadersMiddleware, vaultController.createVault); // keygen cosigner job
router.get("/vaults", userHeadersMiddleware, vaultController.getVaults);
router.get("/vaults/:vaultId", userHeadersMiddleware, vaultController.getVault);
router.post("/vaults/:vaultId/retry", userHeadersMiddleware, vaultController.retryCreateVault); // to retry when keygen fails

// Accounts
router.post("/vaults/:vaultId/accounts", userHeadersMiddleware, accountController.createAccount);
router.get("/vaults/:vaultId/accounts", userHeadersMiddleware, accountController.getAccounts);
router.get("/vaults/:vaultId/accounts/:accountId", userHeadersMiddleware, accountController.getAccount);

// Wallets
router.post("/vaults/:vaultId/wallets", userHeadersMiddleware, vaultController.createWallet); // creates an address
router.get("/vaults/:vaultId/wallets", userHeadersMiddleware, vaultController.getWallets);
router.get("/vaults/:vaultId/wallets/:walletId", userHeadersMiddleware, vaultController.getWallet);
// create address for UTXO based wallets
router.post("/vaults/:vaultId/wallets/:walletId/addresses", userHeadersMiddleware, vaultController.createUTXOWalletAddress);
// TODO get all addresses for a wallet with pagination
// router.get("/vaults/:vaultId/wallets/:walletId/addresses", userHeadersMiddleware, vaultController.getWalletAddresses);

// TXs
router.post("/vaults/:vaultId/wallets/:walletId/send", userHeadersMiddleware, txController.send);
router.post("/vaults/:vaultId/wallets/:walletId/txs", userHeadersMiddleware, txController.createTx);
router.post("/vaults/:vaultId/wallets/:walletId/txs/:txId/sign", userHeadersMiddleware, txController.signTx); // sign cosigner job
router.post("/vaults/:vaultId/wallets/:walletId/txs/:txId/broadcast", userHeadersMiddleware, txController.broadcastTx);
// manual sweep or refuel
router.post("/vaults/:vaultId/wallets/:walletId/sweep", userHeadersMiddleware, txController.sweep);
router.post("/vaults/:vaultId/wallets/:walletId/refuel", userHeadersMiddleware, vaultController.refuel);

router.get("/vaults/:vaultId/wallets/:walletId/txs/:txId", userHeadersMiddleware, txController.getTx);
router.get("/vaults/:vaultId/wallets/:walletId/txs", userHeadersMiddleware, txController.getTxs);

router.get("/vaults/:vaultId/wallets/:walletId/txreport", userHeadersMiddleware, reportController.getWalletTxsReport);

// Utils
router.post("/estimatefee", userHeadersMiddleware, feeController.estimateFee);
router.get("/metrics", userHeadersMiddleware, metricsController.getMetrics);


// mainly for console-ui
router.get("/wallets", userHeadersMiddleware, vaultController.getAllWalletsByOrgId);
router.get("/gasstation/:assetId", userHeadersMiddleware, vaultController.getGasStation);
// console-ui only
router.get("/search", userHeadersMiddleware, searchController.search);
router.get("/gasstations", userHeadersMiddleware, vaultController.getGasStations);

// Job callback endpoints
router.post("/callback/keygen", cosignerCBController.keygenCallback);
router.post("/callback/sign", cosignerCBController.signCallback);

// Tatum & moralis webhooks (public)
router.post("/webhook", whTatum.tatumWebhook);
router.post("/webhook/moralis", whMoralis.moralisWebhook);

// internal accessible from `vt` domain
router.get("/internal/vault/:vaultId/wallets/:walletId", vaultController.internalGetWallet);
router.get("/internal/rate", rateController.price);

export const routes = router.routes();
export const allowedMethods = router.allowedMethods();
