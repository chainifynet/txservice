import { AppCtx } from "@chainifynet/common-libs-node";
import { newErrWithCode } from "../../../common/errs";
import { ethNetwork, infuraAPIKey } from "../../../config/variables";
import { Asset, AssetType } from "../../../types/types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Web3 = require("web3") as typeof import("web3").default;

const { providerChain } = getChain();
const web3 = new Web3(`https://${providerChain}.infura.io/v3/${infuraAPIKey}`);
const historicalBlocks = 4;

export async function getFeeEstimate(appCtx: AppCtx, asset: Asset) {
  const { average } = await getGasPrice(appCtx);
  if (asset.assetType === AssetType.ERC20) {
    return Math.floor(average * 55000);
  }
  return Math.floor(average * 21000);
}

/**
 * https://docs.alchemy.com/docs/how-to-build-a-gas-fee-estimator-using-eip-1559
 */
async function getGasPrice(appCtx: AppCtx) {
  try {
    const feeHistory = await web3.eth.getFeeHistory(historicalBlocks, "pending", [1, 50, 99]);
    const block = await web3.eth.getBlock("pending");

    const blocks = formatFeeHistory(feeHistory, false);

    const slow = avg(blocks.map((b) => b.priorityFeePerGas[0]));
    const average = avg(blocks.map((b) => b.priorityFeePerGas[1]));
    const fast = avg(blocks.map((b) => b.priorityFeePerGas[2]));

    const baseFeePerGas = Number(block.baseFeePerGas);
    return {
      slow: slow + baseFeePerGas,
      average: average + baseFeePerGas,
      fast: fast + baseFeePerGas,
    };
  } catch (err) {
    appCtx.log.error(err, "error getting fee estimate");
    throw newErrWithCode("error getting fee estimate", 500);
  }
}

function formatFeeHistory(result: FeeHistoryResult, includePending: boolean) {
  let blockNum = web3.utils.toDecimal(result.oldestBlock);
  const oldestBlock = blockNum;
  let index = 0;
  const blocks = [];
  while (blockNum < oldestBlock + historicalBlocks) {
    blocks.push({
      number: blockNum,
      baseFeePerGas: Number(result.baseFeePerGas[index]),
      gasUsedRatio: Number(result.gasUsedRatio[index]),
      priorityFeePerGas: result.reward[index].map((x) => Number(x)),
    });
    blockNum += 1;
    index += 1;
  }
  if (includePending) {
    blocks.push({
      number: "pending",
      baseFeePerGas: Number(result.baseFeePerGas[historicalBlocks]),
      gasUsedRatio: NaN,
      priorityFeePerGas: [] as number[],
    });
  }
  return blocks;
}

function getChain(): { providerChain: string } {
  switch (ethNetwork) {
    case "mainnet":
      return { providerChain: "mainnet" };
    case "goerli":
      return { providerChain: "goerli" };
    default:
      throw new Error(`Unsupported eth network ${ethNetwork}`);
  }
}

function avg(arr: number[]) {
  const sum = arr.reduce((a, v) => a + v);
  return Math.round(sum / arr.length);
}

interface FeeHistoryResult {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  oldestBlock: number;
  reward: string[][];
}
