import { newErrWithCode } from "../../common/errs";
import { txExpirationInSeconds, trc20TxFeeLimit, tronGridUrl, tronGridApiKey } from "../../config/variables";
import { startTrace } from "@chainifynet/common-libs-node";
import { BuiltTx, EthLikeAccount, EthLikeTx } from "./types";
import { Asset, AssetType, TxSignedResult } from "../../types/types";

import * as TronWeb from "tronweb";

function newTronWeb(address?: string) {
  const tronWeb = new TronWeb({
    fullHost: tronGridUrl,
    headers: {
      "TRON-PRO-API-KEY": tronGridApiKey,
    },
    // addressStartIndex: 0,
    // autoRetry: true,
    // autoRetryAttempts: 5,
  });
  if (address) {
    tronWeb.setAddress(address);
  }
  return tronWeb;
}

const tronWeb = newTronWeb();

export class Tron implements EthLikeAccount, EthLikeTx {
  generateAddress = async (xPubHex: string, yPubHex: string): Promise<string> => {
    if (xPubHex?.length !== 64 || yPubHex?.length !== 64) {
      throw newErrWithCode("xPubHex and yPubHex must be 64 characters long", 409);
    }
    const pubKeyHex = "04" + xPubHex + yPubHex;
    const pub = tronWeb.utils.code.hexStr2byteArray(pubKeyHex);
    const addressBytes = tronWeb.utils.crypto.computeAddress(pub);
    const address = tronWeb.utils.crypto.getBase58CheckAddress(addressBytes);
    if (!tronWeb.utils.crypto.isAddressValid(address)) {
      throw newErrWithCode("failed to generate address", 500);
    }
    return address;
  };

  getBalance = async (address: string): Promise<string> => {
    return startTrace(`Tron getNativeBalance`, { "bc.address": address }, async () => {
      const balance = await tronWeb.trx.getBalance(address);
      return balance?.toString() || "0";
    });
  };

  getXRC20Balance = async (address: string, asset: Asset): Promise<string> => {
    return startTrace(
      `Tron getTRC20Balance`,
      { "bc.address": address, "bc.contractAddress": asset.contractAddress },
      async () => {
        const tronWebInstance = newTronWeb(address);
        const contract = await tronWebInstance.contract().at(asset.contractAddress);
        const balance = await contract.balanceOf(address).call();
        return balance?.toString() || "0";
      }
    );
  };

  buildTx = async (from: string, to: string, amount: string): Promise<BuiltTx> => {
    return startTrace(`Tron buildTx::sendTrx`, { "bc.from": from, "bc.to": to, "bc.amount": amount }, async () => {
      const transaction = await tronWeb.transactionBuilder.sendTrx(to, amount, from);
      const tx = await tronWeb.transactionBuilder.extendExpiration(transaction, txExpirationInSeconds);
      return {
        unsignedTx: tx,
        toSign: tx.txID,
        txHash: tx.txID,
      };
    });
  };

  /**
   * TODO for now I'm not using this one but it might be needed, since the expiration might not be enough
   */
  prepareForSignature = async (from: string, unsignedTx: any): Promise<BuiltTx> => {
    const tx = await tronWeb.transactionBuilder.extendExpiration(unsignedTx, txExpirationInSeconds);
    return {
      unsignedTx: tx,
      toSign: tx.txID,
      txHash: tx.txID,
    };
  };

  buildXRC20Tx = async (from: string, to: string, amount: string, asset: Asset): Promise<BuiltTx> => {
    const tronWebInstance = newTronWeb(from);
    const parameter = [
      { type: "address", value: to },
      { type: "uint256", value: amount },
    ];
    const options = {
      feeLimit: trc20TxFeeLimit,
      callValue: 0,
      // tokenValue:10,
      // tokenId:1000001
    };
    return startTrace(
      `Tron buildXRC20Tx::triggerSmartContract`,
      {
        "bc.from": from,
        "bc.to": to,
        "bc.amount": amount,
        "bc.contractAddress": asset.contractAddress,
      },
      async () => {
        const res = await tronWebInstance.transactionBuilder.triggerSmartContract(
          asset.contractAddress,
          "transfer(address,uint256)",
          options,
          parameter,
          from
        );
        if (!res.result) {
          throw newErrWithCode(JSON.stringify(res, null, 2), 500);
        }
        const tx = await tronWebInstance.transactionBuilder.extendExpiration(res.transaction, txExpirationInSeconds);
        return {
          unsignedTx: tx,
          toSign: tx.txID,
          txHash: tx.txID,
        };
      }
    );
  };

  addSignature = async (unsignedTx: any, r: string, s: string, v: string): Promise<TxSignedResult> => {
    const signature = r + s + v;
    unsignedTx.signature = [signature];
    return {
      signedTx: unsignedTx,
      txHash: unsignedTx.txID,
    };
  };

  broadcastTx = async (signedTxData: any) => {
    return startTrace(`Tron broadcastTx`, undefined, async () => {
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTxData);
      if (broadcast.message) {
        throw newErrWithCode(Buffer.from(broadcast.message, "hex").toString(), 500);
      }
      return broadcast;
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  estimateFee = async (asset: Asset, from: string, to: string, amount: string): Promise<string> => {
    if (asset.assetType === AssetType.NATIVE) {
      // Normally around 269 bandwith points are required for a transaction, and we are provided with 600 per day
      // One byte requires one Bandwidth Point so
      // check number of bytes
      // check how much bandwidth I have
      // if I have bandwidht then return 0
      // if I don't have bandwidth then for the remaining bytes calculate the fee: Required TRX is the number of bytes * 10 SUN
      return "0";
    }
    // TODO! implement properly, for now only harcoded 
    return "10000000";
  };

  isAddress = (address: string): boolean => {
    return tronWeb.isAddress(address);
  };
}
