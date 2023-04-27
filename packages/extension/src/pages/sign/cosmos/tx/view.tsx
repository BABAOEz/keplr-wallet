import React, { FunctionComponent, useEffect, useState } from "react";
import { SignInteractionStore } from "@keplr-wallet/stores";
import { Box } from "../../../../components/box";
import { Column, Columns } from "../../../../components/column";
import { XAxis } from "../../../../components/axis";
import { H5 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";
import { ViewDataButton } from "../../components/view-data-button";
import { MessageItem } from "../../components/message-item";
import { Stack } from "../../../../components/stack";
import { MemoInput } from "../../../../components/input/memo-input";
import { FeeControl } from "../../../../components/input/fee-control";
import { observer } from "mobx-react-lite";
import {
  useFeeConfig,
  useMemoConfig,
  useSenderConfig,
  useSignDocAmountConfig,
  useSignDocHelper,
  useTxConfigsValidate,
  useZeroAllowedGasConfig,
} from "@keplr-wallet/hooks";
import { useStore } from "../../../../stores";
import { unescapeHTML } from "@keplr-wallet/common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { BackButton } from "../../../../layouts/header/components";
import { HeaderLayout } from "../../../../layouts/header";
import { useInteractionInfo } from "../../../../hooks";
import { defaultRegistry } from "../../components/messages/registry";

/**
 * 서명을 처리할때 웹페이지에서 연속적으로 서명을 요청했을 수 있고
 * 그러면 서명할 데이터에 대해서 FIFO 순으로 순차적으로 UI에서 표시하고 처리해준다.
 * 하지만 문제는 tx관련된 hook들은 구현의 간단함을 위해서 한 컴포넌트 라이프사이클에서
 * 하나의 tx에 대해서만 처리하고 이후 다른 tx가 필요하다고 다시 초기화하거나 할 수 없도록 되어있다.
 * 이 문제 때문에 각 서명 데이터에 대해서 처리되고 나면 그 컴포넌트는 unmount되고
 * 같은 컴포넌트가 새롭게 mount되어야 한다.
 * 그렇기 때문에 처리 로직이 완전히 이 컴포넌트로 분리되어있고
 * 이 컴포넌트를 호출하는 쪽에서 "key" prop을 통해서 위의 요구사항을 꼭 만족시켜야한다.
 * 또한 prop으로 받는 "interactionData"는 절대로 불변해야한다.
 */
export const CosmosTxView: FunctionComponent<{
  interactionData: NonNullable<SignInteractionStore["waitingData"]>;
}> = observer(({ interactionData }) => {
  const { chainStore, queriesStore, signInteractionStore } = useStore();

  const [isViewData, setIsViewData] = useState(false);

  const chainId = interactionData.data.chainId;
  const signer = interactionData.data.signer;

  const senderConfig = useSenderConfig(chainStore, chainId, signer);
  // There are services that sometimes use invalid tx to sign arbitrary data on the sign page.
  // In this case, there is no obligation to deal with it, but 0 gas is favorably allowed.
  const gasConfig = useZeroAllowedGasConfig(chainStore, chainId, 0);
  const amountConfig = useSignDocAmountConfig(chainStore, chainId);
  const feeConfig = useFeeConfig(
    chainStore,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig
  );
  const memoConfig = useMemoConfig(chainStore, chainId);

  const signDocHelper = useSignDocHelper(feeConfig, memoConfig);
  amountConfig.setSignDocHelper(signDocHelper);

  useEffect(() => {
    const data = interactionData;
    if (data.data.chainId !== data.data.signDocWrapper.chainId) {
      // Validate the requested chain id and the chain id in the sign doc are same.
      throw new Error("Chain id unmatched");
    }
    signDocHelper.setSignDocWrapper(data.data.signDocWrapper);
    gasConfig.setValue(data.data.signDocWrapper.gas);
    let memo = data.data.signDocWrapper.memo;
    if (data.data.signDocWrapper.mode === "amino") {
      // For amino-json sign doc, the memo is escaped by default behavior of golang's json marshaller.
      // For normal users, show the escaped characters with unescaped form.
      // Make sure that the actual sign doc's memo should be escaped.
      // In this logic, memo should be escaped from account store or background's request signing function.
      memo = unescapeHTML(memo);
    }
    memoConfig.setValue(memo);
    if (
      data.data.signOptions.preferNoSetFee &&
      data.data.signDocWrapper.fees[0]
    ) {
      feeConfig.setFee(
        data.data.signDocWrapper.fees.map((fee) => {
          const currency = chainStore
            .getChain(data.data.chainId)
            .forceFindCurrency(fee.denom);
          return new CoinPretty(currency, new Int(fee.amount));
        })
      );
    }
    amountConfig.setDisableBalanceCheck(
      !!data.data.signOptions.disableBalanceCheck
    );
    feeConfig.setDisableBalanceCheck(
      !!data.data.signOptions.disableBalanceCheck
    );
    // TODO
    // if (
    //   data.data.signDocWrapper.granter &&
    //   data.data.signDocWrapper.granter !== data.data.signer
    // ) {
    //   feeConfig.setDisableBalanceCheck(true);
    // }
  }, [
    amountConfig,
    chainStore,
    feeConfig,
    gasConfig,
    interactionData,
    memoConfig,
    signDocHelper,
  ]);

  const msgs = signDocHelper.signDocWrapper
    ? signDocHelper.signDocWrapper.mode === "amino"
      ? signDocHelper.signDocWrapper.aminoSignDoc.msgs
      : signDocHelper.signDocWrapper.protoSignDoc.txMsgs
    : [];

  const txConfigsValidate = useTxConfigsValidate({
    senderConfig,
    gasConfig,
    amountConfig,
    feeConfig,
    memoConfig,
  });

  const preferNoSetFee = (() => {
    // 자동으로 fee를 다뤄줄 수 있는건 fee가 하나인 경우이다.
    // fee가 여러개인 경우는 일반적인 경우가 아니기 때문에
    // 케플러에서 처리해줄 수 없다. 그러므로 옵션을 무시하고 fee 설정을 각 웹사이트에 맡긴다.
    if (interactionData.data.signDocWrapper.fees.length >= 2) {
      return true;
    }

    return interactionData.data.signOptions.preferNoSetFee;
  })();

  const interactionInfo = useInteractionInfo();

  return (
    <HeaderLayout
      title="Confirm Transaction"
      fixedHeight={true}
      left={<BackButton />}
      bottomButton={{
        text: "Approve",
        color: "primary",
        size: "large",
        disabled:
          txConfigsValidate.interactionBlocked || !signDocHelper.signDocWrapper,
        isLoading: signInteractionStore.isObsoleteInteraction(
          interactionData.id
        ),
        onClick: async () => {
          if (signDocHelper.signDocWrapper) {
            await signInteractionStore.approveWithProceedNext(
              interactionData.id,
              signDocHelper.signDocWrapper,
              (proceedNext) => {
                if (!proceedNext) {
                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }
            );
          }
        },
      }}
    >
      <Box
        height="100%"
        padding="0.75rem"
        paddingBottom="0"
        style={{
          overflow: "scroll",
        }}
      >
        <Box marginBottom="0.5rem">
          <Columns sum={1} alignY="center">
            <XAxis>
              <H5
                style={{
                  color: ColorPalette["blue-400"],
                  marginRight: "0.25rem",
                }}
              >
                {msgs.length}
              </H5>
              <H5
                style={{
                  color: ColorPalette["gray-50"],
                }}
              >
                Messages
              </H5>
            </XAxis>
            <Column weight={1} />
            <ViewDataButton
              isViewData={isViewData}
              setIsViewData={setIsViewData}
            />
          </Columns>
        </Box>

        <Box
          borderRadius="0.375rem"
          backgroundColor={ColorPalette["gray-600"]}
          style={{
            flex: !isViewData ? "0 1 auto" : 1,
            overflow: "scroll",
          }}
        >
          <Box>
            {isViewData ? (
              <Box
                as={"pre"}
                padding="1rem"
                // Remove normalized style of pre tag
                margin="0"
                style={{
                  width: "fit-content",
                }}
              >
                {JSON.stringify(signDocHelper.signDocJson, null, 2)}
              </Box>
            ) : (
              <Box
                style={{
                  width: "fit-content",
                  minWidth: "100%",
                }}
              >
                {msgs.map((msg, i) => {
                  const r = defaultRegistry.render(msg);

                  return (
                    <MessageItem
                      key={i}
                      icon={r.icon}
                      title={r.title}
                      content={r.content}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>

        {!isViewData ? <div style={{ flex: 1 }} /> : null}
        <Box height="0" minHeight="1rem" />

        <Stack gutter="0.75rem">
          <MemoInput memoConfig={memoConfig} />
          <FeeControl
            feeConfig={feeConfig}
            senderConfig={senderConfig}
            gasConfig={gasConfig}
            disableAutomaticFeeSet={preferNoSetFee}
          />
        </Stack>
      </Box>
    </HeaderLayout>
  );
});
