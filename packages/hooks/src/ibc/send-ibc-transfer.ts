import { ChainGetter, IQueriesStore } from "@keplr-wallet/stores";
import {
  useFeeConfig,
  useGasConfig,
  useMemoConfig,
  useSenderConfig,
} from "../tx";
import { useIBCAmountConfig } from "./amount";
import { useIBCChannelConfig } from "./channel";
import { useIBCRecipientConfig } from "./reciepient";

/**
 * useIBCTransferConfig returns the configs for IBC transfer.
 * The recipient config's chain id should be the destination chain id for IBC.
 * But, actually, the recipient config's chain id would be set as the sending chain id if the channel not set.
 * So, you should remember that the recipient config's chain id is equal to the sending chain id, if channel not set.
 * @param chainGetter
 * @param queriesStore
 * @param accountStore
 * @param chainId
 * @param sender
 * @param options
 */
export const useIBCTransferConfig = (
  chainGetter: ChainGetter,
  queriesStore: IQueriesStore,
  chainId: string,
  sender: string,
  initialGas: number,
  options: {
    allowHexAddressOnEthermint?: boolean;
    icns?: {
      chainId: string;
      resolverContractAddress: string;
    };
  } = {}
) => {
  const senderConfig = useSenderConfig(chainGetter, chainId, sender);

  const amountConfig = useIBCAmountConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig
  );

  const memoConfig = useMemoConfig(chainGetter, chainId);
  const gasConfig = useGasConfig(chainGetter, chainId, initialGas);
  const feeConfig = useFeeConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig
  );

  amountConfig.setFeeConfig(feeConfig);

  const channelConfig = useIBCChannelConfig();

  const recipientConfig = useIBCRecipientConfig(
    chainGetter,
    chainId,
    channelConfig,
    options
  );

  return {
    amountConfig,
    memoConfig,
    gasConfig,
    feeConfig,
    recipientConfig,
    channelConfig,
    senderConfig,
  };
};
