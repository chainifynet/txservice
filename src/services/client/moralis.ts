import Moralis from "moralis";
import { moralisAPIKey } from "../../config/variables";
import { AppCtx } from "@chainifynet/common-libs-node";
import * as userClient from "./user";
import { newErrWithCode } from "../../common/errs";

Moralis.start({
  apiKey: moralisAPIKey,
});

/**
 * Creates the address subscription in moralis on the stream corresponding to the orgId and returns the subscription id
 * @returns The subscription id
 */
export const createAddressSubscription = async (appCtx: AppCtx, orgId: string, address: string): Promise<string> => {
  const id = await getStream(appCtx, orgId);
  await Moralis.Streams.addAddress({ address, id });
  return id;
};

async function getStream(appCtx: AppCtx, orgId: string): Promise<string> {
  const org = await userClient.getOrg(appCtx, orgId);
  if (!org?.moralisStreamId) {
    throw newErrWithCode(`unsupported stream orgId: ${orgId}`, 400);
  }
  return org.moralisStreamId;
}
export const validateWebhookSignature = (body: any, signature: string): boolean => {
  return Moralis.Streams.verifySignature({
    body,
    signature,
  });
};
