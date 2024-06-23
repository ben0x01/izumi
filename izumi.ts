import {
    Address,
    Transport,
    WalletClient,
    getContract,
    zeroAddress,
    Chain,
    Account,
    GetContractReturnType,
    PublicClient,
    formatUnits,
    encodeFunctionData,
} from 'viem';

import {IZUMI_ROUTER_ABI} from './abi/router';
import {IZUMI_QUOTER_ABI} from './abi/quoter'
import {IZUMI_CONTRACTS} from './constants';
import {TOKENS_PER_CHAIN} from './abi/tokens';
import {IAutoClass} from './autoclass';
import Decimal from 'decimal.js';


const SLIPPAGE = BigInt(2);

type Tokens = Partial<
    Record<
        'ETH' | 'USDC' | 'USDT',
        {
            address: Address;
            decimals: number;
            fee?: number;
        }
    >
>;

type NetworkNames = keyof typeof IZUMI_CONTRACTS;
type ChainNames = keyof typeof TOKENS_PER_CHAIN;
export class Izumi {
    mainAcc: IAutoClass;
    address: Address;
    walletClient: WalletClient<Transport, Chain, Account>;
    slippage: bigint;
    publicClient: PublicClient<Transport, Chain>;
    router: GetContractReturnType<
        typeof IZUMI_ROUTER_ABI,
        WalletClient<Transport, Chain, Account>
    >;
    quoter: GetContractReturnType<typeof IZUMI_QUOTER_ABI, WalletClient>;
    tokens: Tokens;

    constructor(
        mainAcc: IAutoClass,
        tokens: Tokens
    ) {
        this.tokens = tokens;

        this.mainAcc = mainAcc;
        this.slippage = 1n;
        this.publicClient = mainAcc.publicClient;

        this.address = mainAcc.metamaskAddress;
        this.walletClient = mainAcc.walletClient;

        const network: NetworkNames = this.publicClient.chain.name as NetworkNames;


        this.router = getContract({
            address: IZUMI_CONTRACTS[network].router as `0x${string}`,
            abi: IZUMI_ROUTER_ABI,
            client: this.walletClient
        });

        this.quoter = getContract({
            address: IZUMI_CONTRACTS[network].quoter as `0x${string}`,
            abi: IZUMI_QUOTER_ABI,
            client: this.walletClient,
        })
    }

    getPath(
        fromTokenAddress: Address,
        toTokenAddress: Address,
        fromTokenName: keyof Tokens,
        toTokenName: keyof Tokens): string | null {
        const poolFeeInfo = {
            'zkSync': {
                "USDC/ETH": 2000,
                "ETH/USDC": 2000,
                "USDC/USDT": 400,
                "USDT/USDC": 400
            },
            'Linea': {
                "USDC/ETH": 3000,
                "ETH/USDC": 3000,
                "USDC/USDT": 500,
                "USDT/USDC": 500
            },
            'Base': {
                "USDC.e/ETH": 3000,
                "ETH/USDC.e": 3000,
            },
            'Scroll': {
                "USDC/ETH": 3000,
                "ETH/USDC": 3000,
                "USDC/USDT": 500,
                "USDT/USDC": 500
            }
        }[this.publicClient.chain.name];

        if (!poolFeeInfo) {
            console.error('Unsupported network');
            return null;
        }

        const fromTokenHex = fromTokenAddress.slice(2).padStart(40, '0');
        const toTokenHex = toTokenAddress.slice(2).padStart(40, '0');

        if (!['USDT'].includes(fromTokenName) && !['USDT'].includes(toTokenName)) {
            const feeKey = `${fromTokenName}/${toTokenName}` as keyof typeof poolFeeInfo;
            const fee = poolFeeInfo[feeKey];
            if (fee === undefined) {
                console.error('Invalid token pair for fee information');
                return null;
            }
            const feeHex = fee.toString(16).padStart(6, '0');
            return `0x${fromTokenHex}${feeHex}${toTokenHex}`;
        } else {
            const middleTokenHex = TOKENS_PER_CHAIN[this.publicClient.chain.name as ChainNames]['USDC'];  //TOKENS_PER_CHAIN[this.publicClient.chain.name]['USDC'].slice(2).padStart(40, '0')
            const feeKey1 = `${fromTokenName}/USDC` as keyof typeof poolFeeInfo;
            const feeKey2 = `USDC/${toTokenName}` as keyof typeof poolFeeInfo;
            const fee1 = poolFeeInfo[feeKey1];
            const fee2 = poolFeeInfo[feeKey2];
            if (fee1 === undefined || fee2 === undefined) {
                console.error('Invalid token pair for fee information');
                return null;
            }
            const feeHex1 = fee1.toString(16).padStart(6, '0');
            const feeHex2 = fee2.toString(16).padStart(6, '0');
            return `0x${fromTokenHex}${feeHex1}${middleTokenHex}${feeHex2}${toTokenHex}`;
        }
    }

    async getMinAmountOut(path: string, amountInWei: bigint): Promise<bigint> {
        const minAmountOutArray = await this.quoter.read.swapAmount([amountInWei, path]) as [bigint];
        const minAmountOut = minAmountOutArray[0];
        const slippageAmount = (minAmountOut * SLIPPAGE) / BigInt(100);
        return minAmountOut - slippageAmount;
    }

    async swap(
        tokenIn: keyof Tokens,
        tokenOut: keyof Tokens,
        amount: bigint,
        helpDeposit: boolean = false
    ) {
        if (!this.tokens[tokenIn] || !this.tokens[tokenOut]) {
            console.log('Invalid token keys');
            return;
        }

        const fromTokenAddress = this.tokens[tokenIn]!.address as Address;
        const toTokenAddress = this.tokens[tokenOut]!.address as Address;
        const fee =
            (tokenIn === 'USDT' || tokenOut === 'USDT'
                ? this.tokens.USDT!.fee
                : this.tokens[tokenOut]!.fee) || 100;

        try {
            const path = await this.getPath(fromTokenAddress, toTokenAddress, tokenIn, tokenOut);
            if (!path) {
                console.error('Failed to get path');
                return;
            }

            if (path === zeroAddress) {
                console.log('poolAddress is zero');
                return;
            }

            const minAmountOut = await this.getMinAmountOut(path, amount);

            if (helpDeposit) {
                tokenOut = 'ETH';
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
            const amountIn = amount;
            const amountOutMinimum = minAmountOut;

            const swapData = encodeFunctionData({
                abi: this.router.abi,
                functionName: 'swapAmount',
                args: [
                    path,
                    this.address,
                    amountIn,
                    amountOutMinimum,
                    deadline
                ],
            });

            const transactionData = [swapData];

            if (tokenIn === 'ETH' || tokenOut === 'ETH') {
                const unwrapData = encodeFunctionData({
                    abi: this.router.abi,
                    functionName: tokenIn !== 'ETH' ? 'unwrapWETH9' : 'refundETH',
                    args: [amountOutMinimum, this.address],
                });
                transactionData.push(unwrapData);
            }

            const txParams = await this.mainAcc.walletClient.prepareTransactionRequest({   //переписать через simulate
                value: tokenIn === 'ETH' ? amount : 0n,
            });

            const hash = await this.router.write.multicall(transactionData, txParams);
            const result = await this.mainAcc.waitTransaction(hash, 'swap on Izumi');

            if (result) {
                const amountFormatted =
                    tokenIn === 'ETH'
                        ? amount
                        : new Decimal(formatUnits(amount, await this.mainAcc.getDecimals(fromTokenAddress)));
                await this.mainAcc.updateBd({
                    activityName: 'swapOnIzumi',
                    transactionData: {
                        hash: hash,
                        amount: amountFormatted,
                        method: 'multicall',
                        fee: result.effectiveGasPrice * result.gasUsed,
                        currency: tokenIn,
                    },
                });
            }
        } catch (error) {
            console.error(this.mainAcc.metamaskAddress, error);
        }
    }
}

export default Izumi;
