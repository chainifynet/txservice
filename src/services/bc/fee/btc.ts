import { AppCtx } from "@chainifynet/common-libs-node";
import { bitcoinChainstackUrl } from "../../../config/variables";
import { newErrWithCode } from "../../../common/errs";
import * as Big from "big.js";

/**
 * Queries the bitcoin node for a `estimatesmartfee` on 3 blocks
 * @returns feeRate in sat/B and blocks
 */
export async function estimateSmartFee(appCtx: AppCtx): Promise<{ feeRate: number; blocks: number }> {
  try {
    const resp = await appCtx.API.post(
      bitcoinChainstackUrl,
      {
        jsonrpc: "1.0",
        id: "cf-s",
        method: "estimatesmartfee",
        params: [3, "ECONOMICAL"], // 3 blocks
      },
      { external: true }
    );
    const fee = resp.data.result;
    return {
      feeRate: Math.floor(Big(fee.feerate).times(1e5).toNumber()), // from BTC/kB to sat/B
      blocks: fee.blocks,
    };
  } catch (err) {
    appCtx.log.error(err, "failed to get bitcoin tx");
    throw newErrWithCode(`failed to get bitcoin tx`, 500);
  }
}

/**
 * Estimates the fee for a segwit transaction
 * @param numInputs The number of inputs
 * @param outputAddresses The number of outputs (we will consider them 68 bytes each) or an array of addresses
 * @param providedFeeRate The fee rate in sat/B
 * @returns
 */
function calculateSegwitTxFee(numInputs: number, outputAddresses: string[] | number, providedFeeRate = 10): number {
  const feeRate = Math.max(providedFeeRate, 1); // min 1 sat/B
  const inputSize = 68; // size of a segwit input
  const witnessSize = 1; // size of the witness data
  const overhead = 10; // fixed overhead for the transaction
  const outputSizeTotal = estimateOutputSize(outputAddresses);
  const inputSizeTotal = numInputs * (inputSize + witnessSize);
  const txSize = overhead + inputSizeTotal + outputSizeTotal;
  const fee = txSize * feeRate; // fee rate of 10 satoshis per byte
  return fee;
}

export const calculateSegwitTxFeeByInputCount =
  (outputAddresses: string[] | number, providedFeeRate = 10) =>
    (numInputs: number): number =>
      calculateSegwitTxFee(numInputs, outputAddresses, providedFeeRate);

function estimateOutputSize(outAddresses: string[] | number) {
  if (Array.isArray(outAddresses)) {
    return outAddresses.reduce((total, address) => {
      const addressSize = Buffer.from(address, "ascii").length;
      const scriptPubKeySize = addressSize + 2; // 2 bytes for the scriptPubKey prefix
      return total + scriptPubKeySize;
    }, 0);
  }
  return outAddresses * (68 + 2); // as if they are segwit outputs 68 bytes each and 2 bytes for the scriptPubKey prefix
}
