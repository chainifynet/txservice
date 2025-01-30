import { AppCtx } from "@chainifynet/common-libs-node";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { newErrWithCode } from "../../common/errs";
import { rdsConn } from "../../config/aws";
import { ToSignData, TxStatus, Utxo } from "../../types/types";
import { Connection } from "mysql2/promise";

const maxInputs = 200;

export async function runInDbTransaction<T>(appCtx: AppCtx, fn: (c: Connection) => T): Promise<T> {
  const conn = await rdsConn.getConnection();
  const start = Date.now();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    appCtx.log.info({ timeTakenMs: Date.now() - start }, "inTx time taken");
  }
}

export async function selectTopUnspentUtxos(appCtx: AppCtx, walletId: string): Promise<Utxo[]> {
  const res = await rdsConn.query<UtxoEntity[]>(
    "SELECT * FROM utxo WHERE spending_tx_id = ? AND wallet_id = ? ORDER BY amount DESC limit ?",
    ["unspent", walletId, maxInputs]
  );
  if (!res[0].length) {
    throw newErrWithCode(`no utxos found for amount`, 400);
  }
  return res[0].map(fromUtxoEntity);
}

export async function selectUtxosToSign(appCtx: AppCtx, txId: string): Promise<Utxo[]> {
  const res = await rdsConn.query<UtxoEntity[]>("SELECT * FROM utxo WHERE spending_tx_id = ?", [txId]);
  if (!res[0].length) {
    throw newErrWithCode(`no utxos found for tx: ${txId}`, 400);
  }
  return res[0].map(fromUtxoEntity);
}

export async function updateUtxosToSignWithConn(
  appCtx: AppCtx,
  conn: Connection,
  spendingTxId: string,
  toSign: ToSignData[]
): Promise<void> {
  // Get a connection from the pool
  // build query
  // let queryStr = "";
  // const params: any[] = [];
  // toSign.map((s) => {
  //   queryStr += "UPDATE utxo SET to_sign = ?, pub_key = ?, spending_tx_id = ?  WHERE `id` = ? AND spending_tx_id = ?; ";
  //   params.push(s.toSign, s.pubKeyHex, spendingTxId, s.utxoId, "unspent");
  // });
  // appCtx.log.info({ queryStr, params }, "updateUtxosToSign query");
  // let res;
  for (let i = 0; i < toSign.length; i++) {
    const s = toSign[i];
    const queryStr =
      "UPDATE utxo SET to_sign = ?, pub_key = ?, spending_tx_id = ?, spending_index = ? WHERE `id` = ? AND spending_tx_id = ?;";
    const params = [s.toSign, s.pubKeyHex, spendingTxId, i, s.utxoId, "unspent"];
    appCtx.log.info({ queryStr, params }, "updateUtxosToSign query");
    const [res] = await conn.execute(queryStr, params); // Destructuring to get result
    if (!res) {
      throw new Error(`failed to update utxo ${s.utxoId} to sign`);
    }
  }
}

export async function addSignature(appCtx: AppCtx, utxoId: string, signature: string) {
  const res = await rdsConn.execute<ResultSetHeader>("UPDATE utxo SET signature = ? WHERE `id` = ?;", [
    signature,
    utxoId,
  ]);
  appCtx.log.info({ rowsAffected: res[0].affectedRows }, "addSignature result");
}

export async function countUnsignedUtxosForTx(appCtx: AppCtx, txId: string): Promise<number> {
  const res = await rdsConn.query<Count[]>(
    "SELECT COUNT(*) as count FROM utxo WHERE spending_tx_id = ? AND signature IS NULL",
    [txId]
  );
  return Number(res[0][0].count);
}

export async function getUtxosForTx(appCtx: AppCtx, txId: string): Promise<Utxo[]> {
  const res = await rdsConn.query<UtxoEntity[]>("SELECT * FROM utxo WHERE spending_tx_id = ? ORDER BY spending_index", [
    txId,
  ]);
  return res[0].map(fromUtxoEntity);
}

export async function failSignature(appCtx: AppCtx, utxoId: string) {
  const res = await rdsConn.execute<ResultSetHeader>("UPDATE utxo SET `status` = ? WHERE `id` = ?;", [
    TxStatus.FAILED_SIGNED,
    utxoId,
  ]);
  appCtx.log.info({ rowsAffected: res[0].affectedRows }, "sign failed result");
}

interface UtxoEntity extends RowDataPacket {
  id: string;
  org_id: string;
  vault_id: string;
  wallet_id: string;
  address: string;
  amount: string;
  asset_id: string;
  tx_hash: string;
  index: number;
  block_no: number;
  block_hash: string;
  status: string;
  spending_tx_id: string;
  type: "DEPOSIT" | "CHANGE";
  pub_key?: string;
  to_sign?: string;
  signature?: string;
  created_at: Date;
  updated_at: Date;
}

interface Count extends RowDataPacket {
  count: number;
}

function fromUtxoEntity(e: UtxoEntity): Utxo {
  return {
    id: e.id,
    orgId: e.org_id,
    vaultId: e.vault_id,
    walletId: e.wallet_id,
    address: e.address,
    amount: e.amount,
    assetId: e.asset_id,
    txHash: e.tx_hash,
    index: e.index,
    blockNo: e.block_no,
    blockHash: e.block_hash,
    status: e.status,
    spendingTxId: e.spending_tx_id,
    type: e.type,
    pubKey: e.pub_key,
    toSign: e.to_sign,
    signature: e.signature,
    createdAt: e.created_at.toISOString(),
    updatedAt: e.updated_at.toISOString(),
  };
}
