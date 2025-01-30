import { AppCtx } from "@chainifynet/common-libs-node";
import { isBNB, isBTC, isETH, isTRX } from "../common/asset";
import { newErrWithCode } from "../common/errs";
import {
  addChSubsOnWalletCreation,
  addMoralisSubsOnWalletCreation,
  addTatumSubsOnWalletCreation,
  cfTronSubscriptionUrl,
  tatumAPIKey,
  tatumAPIKeyUS,
  tatumUrl,
  tatumUrlUS,
} from "../config/variables";
import { Asset, SubscriptionProvider } from "../types/types";
import * as cfSubscriptionClient from "./client/cfsubscription";
import * as chSubscriptionClient from "./client/chsubs";
import * as moralisClient from "./client/moralis";
import * as tatumClient from "./client/tatum";
import * as subscriptionStore from "./store/providerSubscriptions";

export async function createAddressSubscription(
  appCtx: AppCtx,
  orgId: string,
  address: string,
  asset: Asset
): Promise<void> {
  if (isTRX(asset.nativeAsset)) {
    if (addTatumSubsOnWalletCreation) {
      await createTatumAddressSubscription(appCtx, address, asset);
    }
  } else if (isETH(asset.nativeAsset) || isBNB(asset.nativeAsset)) {
    if (addMoralisSubsOnWalletCreation) {
      await createMoralisAddressSubscription(appCtx, orgId, address, asset);
    }
  } else if (isBTC(asset.nativeAsset)) {
    // if (addTatumSubsOnWalletCreation) {
    //   await createTatumAddressSubscriptionV4(appCtx, address, asset);
    // }
    if (addChSubsOnWalletCreation) {
      await createChAddressSubscription(appCtx, orgId, address, asset);
    }
  } else {
    throw newErrWithCode(`${asset.nativeAsset} not supported for subscription`, 404);
  }
}

async function createTatumAddressSubscription(appCtx: AppCtx, address: string, asset: Asset): Promise<void> {
  if (!(await subscriptionStore.createSubscription(address, asset.nativeAsset))) {
    appCtx.log.info(`address ${address} already has a subscription for ${asset.nativeAsset}`);
    return;
  }

  const providers = [];
  const asyncSubCalls = [];
  if (cfTronSubscriptionUrl) {
    providers.push(SubscriptionProvider.CHAINIFY_TRON);
    asyncSubCalls.push(cfSubscriptionClient.createAddressSubscription(appCtx, address, asset.nativeAsset));
  }
  if (tatumAPIKey) {
    providers.push(SubscriptionProvider.TATUM);
    asyncSubCalls.push(
      tatumClient.createAddressSubscription(appCtx, address, asset.nativeAsset, tatumAPIKey, tatumUrl)
    );
  }
  if (tatumAPIKeyUS) {
    providers.push(SubscriptionProvider.TATUM_US1);
    asyncSubCalls.push(
      tatumClient.createAddressSubscription(appCtx, address, asset.nativeAsset, tatumAPIKeyUS, tatumUrlUS)
    );
  }
  const res = await Promise.allSettled(asyncSubCalls);
  const subscriptions = [];
  for (let i = 0; i < res.length; i++) {
    const each = res[i];
    const provider = providers[i];
    if (each.status === "fulfilled") {
      subscriptions.push({ id: each.value, provider });
    } else {
      appCtx.log.error(each.reason, `${provider} failed to create subscription for ${address} ${asset.nativeAsset}`);
    }
  }
  if (!subscriptions?.length) {
    throw newErrWithCode(`failed to create any subscription for ${address} ${asset.nativeAsset}`, 500);
  }
  await subscriptionStore.updateSubscription(address, subscriptions);
}

async function createMoralisAddressSubscription(
  appCtx: AppCtx,
  orgId: string,
  address: string,
  asset: Asset
): Promise<void> {
  if (!(await subscriptionStore.createSubscription(address, asset.nativeAsset))) {
    appCtx.log.info(`address ${address} already has a subscription for ${asset.nativeAsset}`);
    return;
  }
  const streamId = await moralisClient.createAddressSubscription(appCtx, orgId, address);
  await subscriptionStore.updateSubscription(address, [
    { id: address, provider: SubscriptionProvider.MORALIS, streamId },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createTatumAddressSubscriptionV4(appCtx: AppCtx, address: string, asset: Asset): Promise<void> {
  if (!(await subscriptionStore.createSubscription(address, asset.nativeAsset))) {
    appCtx.log.info(`address ${address} already has a subscription for ${asset.nativeAsset}`);
    return;
  }
  const id = await tatumClient.createAddressSubscriptionV4(appCtx, address, asset.nativeAsset);
  await subscriptionStore.updateSubscription(address, [{ id, provider: SubscriptionProvider.TATUM }]);
}

async function createChAddressSubscription(appCtx: AppCtx, orgId: string, address: string, asset: Asset) {
  if (!(await subscriptionStore.createSubscription(address, asset.nativeAsset))) {
    appCtx.log.info(`address ${address} already has a subscription for ${asset.nativeAsset}`);
    return;
  }
  const resp = await chSubscriptionClient.createAddressSubscription(appCtx, orgId, address);
  await subscriptionStore.updateSubscription(address, [{ id: resp.subId, provider: SubscriptionProvider.CH }]);
}
