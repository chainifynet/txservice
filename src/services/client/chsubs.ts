import { chApiKey, chApiSecret, chBitcoinSubscriptionUrl } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";
import * as userClient from "./user";
import { newErrWithCode } from "../../common/errs";

/**
 * Adds the address to the subscription corresponding to the orgId in CH
 * @returns The address
 */
export const createAddressSubscription = async (
  appCtx: AppCtx,
  orgId: string,
  address: string
): Promise<{ subId: string; address: string }> => {
  const id = await getSubscription(appCtx, orgId);
  const addr = await appCtx.API.post(
    `${chBitcoinSubscriptionUrl}/v1/subscriptions/${id}/addresses`,
    {
      address: address,
    },
    {
      headers: {
        "Api-Key": chApiKey,
        "Api-Secret": chApiSecret,
        "Content-Type": "application/json",
      },
      external: true,
    }
  )
    .then((res) => res.data.address)
    .catch((e) => {
      // TODO! return something meaningful if already exists
      // if (e.response?.data?.error?.code === "SUBSCRIPTION_ALREADY_EXISTS") {
      //   // subscription already there
      //   appCtx.log.error(`ch subscription already exists for ${address}`);
      //   return null;
      // }
      appCtx.log.error(e, "error creating ch subscription");
      throw e;
    });
  return { subId: id, address: addr };
};

async function getSubscription(appCtx: AppCtx, orgId: string): Promise<string> {
  const org = await userClient.getOrg(appCtx, orgId);
  if (!org?.chSubId) {
    throw newErrWithCode(`unsupported subscription orgId: ${orgId}`, 400);
  }
  return org.chSubId;
}

