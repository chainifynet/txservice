import * as bitcoin from "bitcoinjs-lib";
import { bitcoinChainstackUrl, isTestnet } from "../../config/variables";

import { AppCtx } from "@chainifynet/common-libs-node";
import axios from "axios";
import { newErrWithCode } from "../../common/errs";
import { Address, ToSignData, Utxo } from "../../types/types";

const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export function generateAddress(xPubHex: string, yPubHex: string): string {
  const pubkeyHex = getCompressedPubKeyHex(xPubHex, yPubHex);
  const pubkey = Buffer.from(pubkeyHex, "hex");

  try {
    const { address } = bitcoin.payments.p2wpkh({ pubkey, network });
    return address;
  } catch (err) {
    throw new Error(`Failed to generate address: ${err.message}`);
  }
}

export async function estimateSmartFee(appCtx: AppCtx): Promise<{ feeRate: number; blocks: number }> {
  try {
    const resp = await axios.post(bitcoinChainstackUrl, {
      jsonrpc: "1.0",
      id: "cf-s",
      method: "estimatesmartfee",
      params: [3], // 3 blocks
    });
    const fee = resp.data.result;
    return {
      feeRate: Math.floor(fee.feerate * 1e5), // from BTC/kB to sat/B
      blocks: fee.blocks,
    };
  } catch (err) {
    appCtx.log.error(err, "failed to get bitcoin tx");
    throw newErrWithCode(`failed to get bitcoin tx`, 500);
  }
}

export async function getTx(appCtx: AppCtx, hash: string): Promise<BitcoinTransaction> {
  // const tx = await axios.get(`https://api.blockcypher.com/v1/btc/${isTestnet ? "test3" : "main"}/txs/${hash}?limit=5000`);
  try {
    const resp = await axios.post(bitcoinChainstackUrl, {
      jsonrpc: "1.0",
      id: "cf-s",
      method: "getrawtransaction",
      params: [hash, true],
    });
    return resp.data.result;
  } catch (err) {
    appCtx.log.error(err, "failed to get bitcoin tx");
    throw newErrWithCode(`failed to get bitcoin tx`, 500);
  }
}

export async function signTx(txHex: string, signData: ToSignData[]): Promise<{ txHash: string; signedTxHex: string }> {
  const psbt = bitcoin.Psbt.fromHex(txHex);
  const asyncSigners: bitcoin.SignerAsync[] = [];
  signData.forEach((data) => {
    const pubkey = Buffer.from(data.pubKeyHex, "hex");
    asyncSigners.push({
      publicKey: pubkey,
      sign: (hash: Buffer): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          if (data.toSign !== hash.toString("hex")) {
            reject(`toSign hash mismatch`);
          }
          // real signature
          resolve(Buffer.from(data.signature, "hex"));
        });
      },
    });
  });

  await Promise.all(asyncSigners.map((val, index) => psbt.signInputAsync(index, val)));
  psbt.finalizeAllInputs();
  const signedTx = psbt.extractTransaction();
  return {
    txHash: signedTx.getId(),
    signedTxHex: signedTx.toHex(),
  };
}

export async function buildTxForSigning(
  appCtx: AppCtx,
  utxos: Utxo[],
  fromAddresses: Record<string, Address>,
  toAddress: string,
  changeAddress: string,
  amount: string,
  fee: string
) {
  // Add inputs
  const psbt = new bitcoin.Psbt({ network });
  let totalIn = BigInt(0);

  const toSignData: ToSignData[] = [];
  const asyncSigners: any[] = [];
  utxos.forEach((utxo) => {
    const address = fromAddresses[utxo.address];
    const pubkeyHex = getCompressedPubKeyHex(address.pubKey.x, address.pubKey.y);
    const pubkey = Buffer.from(pubkeyHex, "hex");
    totalIn += BigInt(utxo.amount);
    psbt.addInput({
      hash: utxo.txHash,
      index: utxo.index,
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({ pubkey }).output,
        value: Number(utxo.amount), // TODO can I do big int?
      },
    });
    asyncSigners.push({
      publicKey: pubkey,
      sign: (hash: Buffer): Promise<Buffer> => {
        return new Promise((resolve) => {
          toSignData.push({
            utxoId: utxo.id,
            toSign: hash.toString("hex"),
            pubKeyHex: pubkeyHex,
          }); // keep the things to sign
          // fake signature done
          resolve(
            Buffer.from(
              "10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
              "hex"
            )
          );
        });
      },
    });
  });

  const change = totalIn - BigInt(amount) - BigInt(fee);
  if (change < 0) {
    throw newErrWithCode(`Insufficient funds change ${change}`, 400);
  }

  // Add outputs
  psbt.addOutput({
    address: toAddress,
    value: Number(amount),
  });
  if (change > 0) {
    psbt.addOutput({
      address: changeAddress,
      value: Number(change),
    });
  }

  const unsigenedTxHex = psbt.toHex();
  await Promise.all(asyncSigners.map((val, index) => psbt.signInputAsync(index, val)));

  return {
    unsigenedTxHex,
    toSignData,
  };
}

export async function broadcast(appCtx: AppCtx, assetId: string, signedTxHex: string) {
  try {
    const resp = await axios.post(bitcoinChainstackUrl, {
      jsonrpc: "1.0",
      id: "cf-s",
      method: "sendrawtransaction",
      params: [signedTxHex],
    });
    return resp.data.result;
  } catch (err) {
    appCtx.log.error(err, "failed to broadcast bitcoin tx");
    throw newErrWithCode(`failed to broadcast bitcoin tx`, 500);
  }
}

function getCompressedPubKeyHex(xPubHex: string, yPubHex: string): string {
  // Determine whether y is even or odd
  const yLastByte = parseInt(yPubHex.slice(-2), 16);
  const prefix = yLastByte % 2 === 0 ? "02" : "03";

  // Generate the compressed public key
  const compressedPublicKeyHex = prefix + xPubHex;
  return compressedPublicKeyHex;
}

interface Vin {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  txinwitness: string[];
  sequence: number;
}

interface Vout {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    desc: string;
    hex: string;
    address: string;
    type: string;
  };
}

interface BitcoinTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: Vin[];
  vout: Vout[];
  hex: string;
  blockhash: string;
  confirmations: number;
  time: number;
  blocktime: number;
}
