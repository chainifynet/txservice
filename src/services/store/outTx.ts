import { OutTx, Tx } from "../../types/types";
import { AppCtx } from "@chainifynet/common-libs-node";
import { rdsConn } from "../../config/aws";

export async function createOutTxWithConn(
  appCtx: AppCtx,
  conn: import("mysql2/promise").Connection,
  outTx: OutTx
): Promise<void> {
  const sql = "INSERT INTO out_tx SET ?;";
  await conn.query(sql, toOutTxEntity(outTx));
}

export async function createOutTx(appCtx: AppCtx, outTx: OutTx): Promise<void> {
  return createOutTxWithConn(appCtx, rdsConn, outTx);
}

interface OutTxEntity {
  id?: number;
  tx_id: string;
  ts: Date;
  state: "INITIAL" | "COMPLETE";
  initiator: string;
  type: string;
  asset: string;
  amount_usd: number;
  src_org_id: string;
  src_vault_id: string;
  src_wallet_id: string;
  src_account_id: string;
  dst_org_id?: string;
  dst_vault_id?: string;
  dst_wallet_id?: string;
  dst_account_id?: string;
  dst_address: string;
  dst_whitelisted: boolean;
  updated_at?: Date;
}

function toOutTxEntity(outTx: OutTx) {
  const e: OutTxEntity = {
    tx_id: outTx.txId,
    ts: new Date(outTx.ts),
    state: outTx.state,
    initiator: outTx.initiator,
    type: outTx.type,
    asset: outTx.asset,
    amount_usd: outTx.amountUsd,
    src_org_id: outTx.srcOrgId,
    src_vault_id: outTx.srcVaultId,
    src_wallet_id: outTx.srcWalletId,
    src_account_id: outTx.srcAccountId,
    dst_address: outTx.dstAddress,
    dst_whitelisted: outTx.dstWhitelisted,
  };
  if (outTx.dstOrgId) {
    e.dst_org_id = outTx.dstOrgId;
    e.dst_vault_id = outTx.dstVaultId;
    e.dst_wallet_id = outTx.dstWalletId;
    e.dst_account_id = outTx.dstAccountId;
  }
  return e;
}

export function toOutTx(tx: Tx) {
  const outTx: OutTx = {
    txId: tx.txId,
    ts: tx.createdAt,
    state: "INITIAL",
    initiator: tx.initiator,
    type: tx.type,
    asset: tx.assetId,
    amountUsd: Math.round(Number(tx.amountUsd)),
    srcOrgId: tx.orgId,
    srcVaultId: tx.vaultId,
    srcWalletId: tx.walletId,
    srcAccountId: tx.accountId,
    dstAddress: tx.to,
    dstWhitelisted: false,
  };

  if (tx.dstVaultId) {
    outTx.dstOrgId = tx.orgId;
    outTx.dstVaultId = tx.dstVaultId;
    outTx.dstWalletId = tx.dstWalletId;
    outTx.dstAccountId = tx.dstAccountId;
  }
  return outTx;
}
