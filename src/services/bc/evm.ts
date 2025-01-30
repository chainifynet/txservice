import { ethers } from "ethers";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Web3 = require("web3") as typeof import("web3").default;
import { Chain, Common } from "@ethereumjs/common";
import { TransactionFactory, TxData } from "@ethereumjs/tx";
import { infuraAPIKey, ethNetwork, bscNodeUrl, bscChainId } from "../../config/variables";
import { Asset, AssetType, TxSignedResult } from "../../types/types";
import { getABI } from "./abi/abi";
import { BuiltTx, EthLikeAccount, EthLikeTx } from "./types";
import { startTrace } from "@chainifynet/common-libs-node";
import { TransactionTypes } from "ethers/lib/utils";

enum EvmKind {
  ETH = "ETH",
  BNB = "BNB",
}

export class Evm implements EthLikeTx, EthLikeAccount {
  private provider: ethers.providers.JsonRpcProvider;

  private common: Common;

  private web3: import("web3").default;

  private evmKind: EvmKind;

  // constructor() {
  //   const { providerChain, chain } = getChain();
  //   this.provider = new ethers.providers.InfuraProvider(providerChain, infuraAPIKey);
  //   this.common = new Common({ chain });
  //   this.web3 = new Web3(`https://${providerChain}.infura.io/v3/${infuraAPIKey}`);
  // }

  public static newEth(): Evm {
    const eth = new Evm();

    const { providerChain, chain } = getEthChain();
    eth.provider = new ethers.providers.InfuraProvider(providerChain, infuraAPIKey);
    eth.common = new Common({ chain });
    eth.web3 = new Web3(`https://${providerChain}.infura.io/v3/${infuraAPIKey}`);
    eth.evmKind = EvmKind.ETH;

    return eth;
  }

  public static newBsc(): Evm {
    const bsc = new Evm();

    bsc.provider = new ethers.providers.JsonRpcProvider(bscNodeUrl);
    bsc.common = Common.custom({ chainId: bscChainId });
    bsc.web3 = new Web3(new Web3.providers.HttpProvider(bscNodeUrl));
    bsc.evmKind = EvmKind.BNB;

    return bsc;
  }

  generateAddress = async (xPubHex: string, yPubHex: string): Promise<string> => {
    const address = ethers.utils.computeAddress("0x04" + xPubHex + yPubHex);
    return address;
  };

  buildXRC20Tx = async (from: string, to: string, amount: string, asset: Asset): Promise<BuiltTx> => {
    const abi = getABI(asset);
    const contract = new this.web3.eth.Contract(abi, asset.contractAddress, { from });
    const transferCall = contract.methods.transfer(to, ethers.utils.hexlify(BigInt(amount)));

    const data = transferCall.encodeABI();
    const estimatedGas = await transferCall.estimateGas();

    return this.buildTx(from, asset.contractAddress, "0", data, estimatedGas);
  };

  buildTx = async (
    from: string,
    to: string,
    amount: string,
    data: string = null,
    estimatedGas: number = null
  ): Promise<BuiltTx> => {
    const traceName = data ? `EVM buildERC20Tx::triggerSmartContract` : `EVM buildTx::sendNative`;
    return startTrace(
      traceName,
      { "bc.from": from, "bc.to": to, "bc.amount": amount, "bc.chain": this.evmKind },
      async () => {
        const txData = {
          to,
          value: ethers.utils.hexlify(BigInt(amount)),
        } as TxData;
        if (data) {
          txData.data = data;
          // Add 30% to the estimated gas
          const gasLimit = Math.ceil(estimatedGas * 1.3);
          txData.gasLimit = ethers.utils.hexlify(gasLimit);
        } else {
          // hardcoded, gas for regular transfer is exactly 21k
          txData.gasLimit = ethers.utils.hexlify(21000);
        }
        return {
          unsignedTx: txData,
        };
      }
    );
  };

  /**
   * We need to do this outside the `buildTx` because with approvals it might take a while for a tx to get approved
   * so the gas price or the nonce need to be calculated closed to when we want to sing and broadcast the tx
   */
  prepareForSignature = async (from: string, unsignedTx: any): Promise<BuiltTx> => {
    const [feeData, nonce] = await Promise.all([
      this.getFeeMaxPriorityOrPrice(),
      this.provider.getTransactionCount(from),
    ]);
    const txData = {
      ...unsignedTx,
      ...feeData,
      nonce: ethers.utils.hexlify(nonce),
    } as TxData;
    const tx = TransactionFactory.fromTxData(txData, { common: this.common });
    return {
      unsignedTx: txData,
      toSign: tx.getMessageToSign().toString("hex"),
    };
  };

  private getFeeMaxPriorityOrPrice = async (): Promise<
    { maxFeePerGas: string; maxPriorityFeePerGas: string; type: number } | { gasPrice: string }
  > => {
    const feeData = await this.provider.getFeeData();
    // maxFeePerGas is only for EIP1559 chains (ETH)
    if (this.evmKind === EvmKind.ETH) {
      return {
        maxFeePerGas: feeData.maxFeePerGas.toHexString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toHexString(),
        type: TransactionTypes.eip1559,
      };
    }
    return {
      gasPrice: feeData.gasPrice.toHexString(),
    };
  };

  private adjustV(v: string) {
    const chainId = this.common.chainId();
    // TODO this is for BSC, do appropriate for other chains EIP-155
    if (chainId === BigInt(97) || chainId === BigInt(56)) {
      if (BigInt(v) === BigInt(0)) {
        return ethers.utils.hexlify(chainId * BigInt(2) + BigInt(35));
      } else {
        return ethers.utils.hexlify(chainId * BigInt(2) + BigInt(36));
      }
    }
    return "0x" + v;
  }

  addSignature = async (unsignedTx: any, r: string, s: string, v: string): Promise<TxSignedResult> => {
    const txData = {
      ...unsignedTx,
      r: "0x" + r,
      s: "0x" + s,
      v: this.adjustV(v),
    } as TxData;
    const signed = TransactionFactory.fromTxData(txData, { common: this.common });
    return {
      signedTx: txData,
      txHex: ethers.utils.hexlify(signed.serialize()),
      txHash: ethers.utils.hexlify(signed.hash()),
    };
  };

  broadcastTx = async (txHex: string) => {
    return startTrace(`EVM broadcastTx`, { "bc.chain": this.evmKind }, async () => {
      const { hash } = await this.provider.sendTransaction(txHex);
      return hash;
    });
    // await this.provider.waitForTransaction(hash);
  };

  getXRC20Balance = async (address: string, asset: Asset): Promise<string> => {
    return startTrace(
      `EVM getXRC20Balance`,
      { "bc.address": address, "bc.contractAddress": asset.contractAddress, "bc.chain": this.evmKind },
      async () => {
        const abi = getABI(asset);
        const contract = new ethers.Contract(asset.contractAddress, abi, this.provider);
        const balance = await contract.balanceOf(address);
        return balance.toString();
      }
    );
  };

  getBalance = async (address: string): Promise<string> => {
    return startTrace(`EVM getNativeBalance`, { "bc.address": address, "bc.chain": this.evmKind }, async () => {
      return (await this.provider.getBalance(address)).toString();
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  estimateFee = async (asset: Asset, from: string, to: string, amount: string): Promise<string> => {
    switch (asset.assetType) {
      case AssetType.ERC20:
      case AssetType.BRC20: {
        // const abi = getABI(asset);
        // const contract = new this.web3.eth.Contract(abi, asset.contractAddress, { from });
        // I'm not completely sure about the gasAmount returned by this function -> ERC20 token transfer normally cost a bit less than 55k gas so hardcoding it for now
        // const gasAmount = await contract.methods.transfer(to, Web3.utils.toHex(amount)).estimateGas({ from });
        const { gasPrice } = await this.provider.getFeeData();
        return gasPrice.mul(55000).toString();
      }
      case AssetType.NATIVE: {
        const { gasPrice } = await this.provider.getFeeData();
        return gasPrice.mul(21000).toString();
      }
      default:
        throw new Error(`invalid asset type ${asset.assetType}`);
    }
  };

  isAddress = (address: string): boolean => {
    return ethers.utils.isAddress(address);
  };

  toCheckSumAddress = (address: string): string => {
    return ethers.utils.getAddress(address);
  };
}

function getEthChain(): { providerChain: string; chain: Chain } {
  switch (ethNetwork) {
    case "mainnet":
      return { providerChain: "mainnet", chain: Chain.Mainnet };
    case "goerli":
      return { providerChain: "goerli", chain: Chain.Goerli };
    default:
      throw new Error(`Unsupported eth network ${ethNetwork}`);
  }
}
