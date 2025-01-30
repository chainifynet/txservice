import { AppCtx } from "@chainifynet/common-libs-node";
import * as TronWeb from "tronweb";
import { newErrWithCode } from "../../../common/errs";
import { tronGridUrl, tronGridApiKey } from "../../../config/variables";

/**
 * just one address to calculate energy fees
 * @warning DO NOT USE FOR ANYTHING MEANINGFUL!!
 */
const placeholderTo = "TMftLJBaSN3ytsfEQuBhhMwTZq1bNb67qC";

function newTronWeb(address?: string) {
  const tronWeb = new TronWeb({
    fullHost: tronGridUrl,
    headers: {
      "TRON-PRO-API-KEY": tronGridApiKey,
    },
  });
  if (address) {
    tronWeb.setAddress(address);
  }
  return tronWeb;
}

const tronWeb = newTronWeb();

export async function estimateTrc20Fee(
  appCtx: AppCtx,
  { from, contractAddress, to = placeholderTo, amount = "1" }: EstimateTRC20FeeParams
) {
  try {
    // Get the energy price in SUN
    const energyPrice = await getEnergyPrice();

    const parameter = [
      { type: "address", value: to },
      { type: "uint256", value: amount },
    ];
    const options = {
      feeLimit: 20_000_000,
      callValue: 0,
      // tokenValue:10,
      // tokenId:1000001
    };

    const estimate = await tronWeb.transactionBuilder.triggerConstantContract(
      contractAddress,
      "transfer(address,uint256)",
      options,
      parameter,
      from
    );
    if (!estimate.result) {
      throw newErrWithCode(JSON.stringify(estimate, null, 2), 500);
    }
    const transferEnergy = Number(estimate.energy_used);

    // Get account resources
    const accountResources = await tronWeb.trx.getAccountResources(from);
    const availableEnergy = Math.max(0, (accountResources.EnergyLimit || 0) - (accountResources.EnergyUsed || 0));

    // Calculate the fees in TRX (if any)
    let feeTrx = 0;
    if (transferEnergy > availableEnergy) {
      feeTrx = (transferEnergy - availableEnergy) * energyPrice;
    }
    return feeTrx;
  } catch (error) {
    appCtx.log.error(error, "error while estimating fee");
    throw newErrWithCode("error while estimating fee", 500);
  }
}

export async function estimateTrxFee(appCtx: AppCtx, { from, to = placeholderTo, amount = "1" }: EstimateTRXFeeParams) {
  try {
    // Get bandwidth and energy information for the sender's address
    const availableBandwidth = await tronWeb.trx.getBandwidth(from);
    const transferTx = await tronWeb.transactionBuilder.sendTrx(to, amount, from);
    const sizeInBytes = transferTx.raw_data_hex.length;

    let feeTrx = 0;
    if (sizeInBytes > availableBandwidth) {
      const bwPrice = await getBandwidthPrice();
      feeTrx = (sizeInBytes - availableBandwidth) * bwPrice;
    }
    return feeTrx;
  } catch (error) {
    appCtx.log.error(error, "error while estimating fee");
    throw newErrWithCode("error while estimating fee", 500);
  }
}

async function getBandwidthPrice() {
  // as per https://developers.tron.network/docs/resource-model#bandwidth
  return 1000;
}

async function getEnergyPrice() {
  const chainParameters = (await tronWeb.trx.getChainParameters()) as ChainParam[];
  const energyPriceParam = chainParameters.find((param) => param.key === "getEnergyFee");
  return energyPriceParam.value;
}

interface ChainParam {
  key: string;
  value: number;
}

interface EstimateTRC20FeeParams {
  from: string;
  contractAddress: string;
  to?: string;
  amount?: string;
}

interface EstimateTRXFeeParams {
  from: string;
  to?: string;
  amount?: string;
}
