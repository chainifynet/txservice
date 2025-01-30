import { newErrWithCode } from "../../common/errs";
import { cfTronSubscriptionUrl, tatumCallbackUrl } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";
import { isTRX } from "../../common/asset";

export const createAddressSubscription = async (
  appCtx: AppCtx,
  address: string,
  nativeAssetId: string
): Promise<string> => {
  return appCtx.API.post(cfTronSubscriptionUrl, {
    type: "ADDRESS_TRANSACTION",
    attr: {
      address,
      chain: toTatumChain(nativeAssetId),
      url: tatumCallbackUrl, // same as tatum
    },
  })
    .then((res) => res.data.id)
    .catch((e) => {
      if (e.response?.data?.error?.code === "SUBSCRIPTION_ALREADY_EXISTS") {
        // subscription already there
        appCtx.log.error(`cf subscription already exists for ${address} & ${nativeAssetId}`);
        return null;
      }
      appCtx.log.error(e, "error creating cf subscription");
      throw e;
    });
};

function toTatumChain(nativeAssetId: string): string {
  if (isTRX(nativeAssetId)) {
    return "TRON";
  } else {
    throw newErrWithCode(`unsupported subscription chain: ${nativeAssetId}`, 400);
  }
}
