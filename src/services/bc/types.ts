import { Asset, TxSignedResult } from "../../types/types";

export interface EthLikeTx {
  buildTx: (from: string, to: string, amount: string, data: string) => Promise<BuiltTx>;
  buildXRC20Tx: (from: string, to: string, amount: string, asset: Asset) => Promise<BuiltTx>;
  prepareForSignature: (from: any, unsignedTx: any) => Promise<any>;
  addSignature: (unsignedTx: any, r: string, s: string, v: string) => Promise<TxSignedResult>;
  broadcastTx: (signedTx: any) => Promise<string>;
  estimateFee: (asset: Asset, from: string, to: string, amount: string) => Promise<string>;
}

export interface EthLikeAccount {
  getXRC20Balance: (address: string, asset: Asset) => Promise<string>;
  getBalance: (address: string) => Promise<string>;
  generateAddress: (xPubHex: string, yPubHex: string) => Promise<string>;
  isAddress: (address: string) => boolean;
}

export type BuiltTx = {
  unsignedTx: any;
  toSign?: string;
  txHash?: string;
};
