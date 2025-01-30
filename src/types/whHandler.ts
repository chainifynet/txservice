import { TxStatus } from "./types";

export type Transfer = {
  txHash: string;
  status: TxStatus;
  assetId: string;
  amount: string;
  from: string;
  to: string;
  blockData: BlockData;
};

export type BlockData = {
  blockHash: string;
  blockNumber: number;
  fee: number | string;
  blockTimeStamp: number;
  txTimeStamp: number;
  result: string;
  confs: number;
};
