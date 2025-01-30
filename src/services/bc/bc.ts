import { getAssetData, isBNB, isETH, isTRX } from "../../common/asset";
import { newErrWithCode } from "../../common/errs";
import { Asset, AssetType, TxSignedResult, Wallet } from "../../types/types";
import { Evm } from "./evm";
import { Tron } from "./tron";

const eth = Evm.newEth();
const bsc = Evm.newBsc();
const tron = new Tron();

export const generateAddress = async (asset: Asset, x: string, y: string) => {
  const client = getBlockchainClient(asset);
  return client.generateAddress(x, y);
};

export const buildTx = async (asset: Asset, from: string, to: string, amount: string) => {
  const client = getBlockchainClient(asset);
  switch (asset.assetType) {
    case AssetType.NATIVE:
      return client.buildTx(from, to, amount);
    case AssetType.TRC20:
    case AssetType.ERC20:
    case AssetType.BRC20:
      return client.buildXRC20Tx(from, to, amount, asset);
    default:
      throw new Error(`unsupported asset type ${asset.assetType}`);
  }
};

export const prepareForSignature = async (asset: Asset, from: any, unsignedTx: any) => {
  const client = getBlockchainClient(asset);
  return client.prepareForSignature(from, unsignedTx);
};

export const addSignature = async (
  asset: Asset,
  unsignedTx: any,
  r: string,
  s: string,
  v: string
): Promise<TxSignedResult> => {
  const client = getBlockchainClient(asset);
  return client.addSignature(unsignedTx, r, s, v);
};

/**
 * @param signedTx The signed tx hex or the signed tx object
 * @returns
 */
export const broadcast = async (asset: Asset, signedTx: any) => {
  const client = getBlockchainClient(asset);
  return client.broadcastTx(signedTx);
};

export const getBalance = async (asset: Asset, address: string) => {
  const client = getBlockchainClient(asset);
  switch (asset.assetType) {
    case AssetType.NATIVE:
      return client.getBalance(address);
    case AssetType.TRC20:
    case AssetType.ERC20:
    case AssetType.BRC20:
      return client.getXRC20Balance(address, asset);
    default:
      throw new Error(`unsupported asset type ${asset.assetType}`);
  }
};

export const validateBalanceBeforeSend = async (fromWallet: Wallet, to: string, amount: string) => {
  const asset = getAssetData(fromWallet.assetId);
  const nativeAsset = getAssetData(asset.nativeAsset);
  const client = getBlockchainClient(asset);

  let nativeBalance = fromWallet.balance;
  if (asset.assetType !== AssetType.NATIVE) {
    nativeBalance = await getBalance(nativeAsset, fromWallet.address);
  }

  const fee = await client.estimateFee(asset, fromWallet.address, to, amount);
  switch (asset.assetType) {
    case AssetType.TRC20:
    case AssetType.ERC20:
    case AssetType.BRC20:
      // check both the native balance for the fee and the amount
      if (BigInt(nativeBalance) < BigInt(fee)) {
        throw newErrWithCode(
          `not enough ${nativeAsset.assetId} to send ${asset.assetType} token (fee is ${fee} ${nativeAsset.assetId})`,
          400
        );
      }
      if (BigInt(fromWallet.balance) < BigInt(amount)) {
        throw newErrWithCode(
          `not enough ${asset.assetId} to send, balance: ${fromWallet.balance}, amount: ${amount}`,
          400
        );
      }
      break;
    case AssetType.NATIVE:
      if (BigInt(nativeBalance) < BigInt(amount) + BigInt(fee)) {
        throw newErrWithCode(
          `not enough ${asset.assetId} to send, balance: ${nativeBalance}, amount: ${amount}, fee: ${fee}`,
          400
        );
      }
      break;
    default:
      throw new Error(`unsupported asset type ${asset.assetType}`);
  }
};

/**
 * Get address as checksum or lowercase if ETH, otherwise returns the address as is
 * @param assetId
 * @param address
 * @param checksum Only used for ETH (default: false)
 */
export function getAddress(asset: Asset, address: string, checksum = false) {
  if (isETH(asset.nativeAsset)) {
    return checksum ? eth.toCheckSumAddress(address) : address.toLowerCase();
  } else if (isBNB(asset.nativeAsset)) {
    return checksum ? bsc.toCheckSumAddress(address) : address.toLowerCase();
  }
  return address;
}

// TODO only used by validator for now maybe move or find a better place
export const isAddress = (address: string) => {
  return eth.isAddress(address) || tron.isAddress(address);
};

function getBlockchainClient(asset: Asset) {
  if (isETH(asset.nativeAsset)) {
    return eth;
  } else if (isTRX(asset.nativeAsset)) {
    return tron;
  } else if (isBNB(asset.nativeAsset)) {
    return bsc;
  } else {
    throw new Error(`unsupported blockchain ${asset.nativeAsset}`);
  }
}
