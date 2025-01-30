import { Asset, AssetType } from "../../../types/types";
import { ERC20ABI } from "./erc20.abi";

export const getABI = (asset: Asset): any => {
  switch (asset.assetType) {
    // TODO improve adding any
    case AssetType.ERC20:
    case AssetType.BRC20:
      // generic erc20 token abi
      return ERC20ABI;
    default:
      throw new Error(`no ABI for ${asset.assetType}`);
  }
};
