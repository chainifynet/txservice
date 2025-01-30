export type MoralisWebhook = {
  confirmed: boolean;
  chainId: string;
  abi: any[];
  streamId: string;
  tag: string;
  retries: number;
  block: Block;
  logs: Log[];
  txs: Tx[];
  txsInternal: any[];
  erc20Transfers: Erc20Transfer[];
  erc20Approvals: any[];
  nftTokenApprovals: any[];
  nftApprovals: NftApprovals;
  nftTransfers: any[];
  nativeBalances: any[];
};

type Block = {
  number: string;
  hash: string;
  timestamp: string;
};

type Erc20Transfer = {
  transactionHash: string;
  logIndex: string;
  contract: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: string;
  valueWithDecimals: string;
};

type Log = {
  logIndex: string;
  transactionHash: string;
  address: string;
  data: string;
  topic0: string;
  topic1: string;
  topic2: string;
  topic3: null;
};

type NftApprovals = {
  ERC721: any[];
  ERC1155: any[];
};

type Tx = {
  hash: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  input: string;
  transactionIndex: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  type: string;
  v: string;
  r: string;
  s: string;
  receiptCumulativeGasUsed: string;
  receiptGasUsed: string;
  receiptContractAddress: null;
  receiptRoot: null;
  receiptStatus: string;
};
