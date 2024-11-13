// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.21;

import { ErrorTypes } from "../errorTypes.sol";
import { Error as OracleError } from "../error.sol";
import { OracleUtils } from "../libraries/oracleUtils.sol";
import { IFluidOracle } from "../interfaces/iFluidOracle.sol";
import { IFluidDexT1 } from "../../protocols/dex/interfaces/iDexT1.sol";
import { DexSlotsLink } from "../../libraries/dexSlotsLink.sol";
import { IFluidLiquidity } from "../../liquidity/interfaces/iLiquidity.sol";
import { LiquiditySlotsLink } from "../../libraries/liquiditySlotsLink.sol";
import { LiquidityCalcs } from "../../libraries/liquidityCalcs.sol";

abstract contract Constants {
    address internal immutable _DEX_POOL;

    /// @dev external IFluidOracle used to convert token0 into token1 or the other way
    /// around depending on _QUOTE_IN_TOKEN0.
    IFluidOracle internal immutable _RESERVES_CONVERSION_ORACLE;
    bool internal immutable _RESERVES_CONVERSION_INVERT;

    /// @dev if true, convert all reserves token1 into token0. otherwise all token0 into token1.
    bool internal immutable _QUOTE_IN_TOKEN0;

    /// @dev if Dex is e.g. USDC / USDT a peg can be assumed instead of fetching the price
    /// at the Dex Oracle (which might not even be active in such a case). If so, this var
    /// defines the peg buffer to reduce collateral value (and increase debt value) by some
    /// defined percentage for safety handling of price ranges.
    /// in 1e4: 10000 = 1%, 1000000 = 100%
    uint256 internal immutable _RESERVES_PEG_BUFFER_PERCENT;

    uint8 internal constant _DEX_SHARES_DECIMALS = 18;
    uint8 internal constant _DEX_TOKENS_DECIMALS_PRECISION = 12;
    uint256 internal constant X128 = 0xffffffffffffffffffffffffffffffff;

    /// @dev internal immutables read from DEX at time of deployment
    IFluidLiquidity internal immutable _LIQUIDITY;

    bytes32 internal immutable _SUPPLY_TOKEN_0_SLOT;
    bytes32 internal immutable _SUPPLY_TOKEN_1_SLOT;
    bytes32 internal immutable _EXCHANGE_PRICE_TOKEN_0_SLOT;
    bytes32 internal immutable _EXCHANGE_PRICE_TOKEN_1_SLOT;

    uint256 internal immutable _TOKEN_0_NUMERATOR_PRECISION;
    uint256 internal immutable _TOKEN_0_DENOMINATOR_PRECISION;
    uint256 internal immutable _TOKEN_1_NUMERATOR_PRECISION;
    uint256 internal immutable _TOKEN_1_DENOMINATOR_PRECISION;

    uint256 internal immutable _RESERVES_SCALER;
}

abstract contract DexViews is Constants {
    function _getDexTotalSupplyShares() internal view returns (uint256 totalSupplyShares_) {
        return IFluidDexT1(_DEX_POOL).readFromStorage(bytes32(DexSlotsLink.DEX_TOTAL_SUPPLY_SHARES_SLOT)) & X128;
    }

    /// @dev Retrieves collateral amount from liquidity layer for a given token
    /// @param supplyTokenSlot_ The storage slot for the supply token data
    /// @param exchangePriceSlot_ The storage slot for the exchange price of the token
    /// @param isToken0_ Boolean indicating if the token is token0 (true) or token1 (false)
    /// @return tokenSupply_ The calculated liquidity collateral amount
    function _getLiquidityCollateral(
        bytes32 supplyTokenSlot_,
        bytes32 exchangePriceSlot_,
        bool isToken0_
    ) internal view returns (uint tokenSupply_) {
        uint tokenSupplyData_ = _LIQUIDITY.readFromStorage(supplyTokenSlot_);
        tokenSupply_ = (tokenSupplyData_ >> LiquiditySlotsLink.BITS_USER_SUPPLY_AMOUNT) & LiquidityCalcs.X64;
        tokenSupply_ =
            (tokenSupply_ >> LiquidityCalcs.DEFAULT_EXPONENT_SIZE) <<
            (tokenSupply_ & LiquidityCalcs.DEFAULT_EXPONENT_MASK);

        (uint256 exchangePrice_, ) = LiquidityCalcs.calcExchangePrices(_LIQUIDITY.readFromStorage(exchangePriceSlot_));

        if (tokenSupplyData_ & 1 == 1) {
            // supply with interest is on
            unchecked {
                tokenSupply_ = (tokenSupply_ * exchangePrice_) / LiquidityCalcs.EXCHANGE_PRICES_PRECISION;
            }
        }

        unchecked {
            tokenSupply_ = isToken0_
                ? ((tokenSupply_ * _TOKEN_0_NUMERATOR_PRECISION) / _TOKEN_0_DENOMINATOR_PRECISION)
                : ((tokenSupply_ * _TOKEN_1_NUMERATOR_PRECISION) / _TOKEN_1_DENOMINATOR_PRECISION);
        }
    }

    /// @notice Get the collateral reserves at the Dex
    function _getDexCollateralReserves() internal view returns (uint256 token0Reserves_, uint256 token1Reserves_) {
        // Note check if smart col is enabled is done already via checking if total supply shares == 0

        token0Reserves_ = _getLiquidityCollateral(_SUPPLY_TOKEN_0_SLOT, _EXCHANGE_PRICE_TOKEN_0_SLOT, true);
        token1Reserves_ = _getLiquidityCollateral(_SUPPLY_TOKEN_1_SLOT, _EXCHANGE_PRICE_TOKEN_1_SLOT, false);
    }
}

abstract contract DexSmartColPegOracleImpl is DexViews, OracleError {
    /// @param dexPool_ The address of the DEX pool
    /// @param reservesConversionOracle_ The oracle used to convert reserves. Set to address zero if not needed.
    /// @param quoteInToken0_ The asset to quote in. If true then quote in token0.
    ///                       Can be skipped if no reservesConversionOracle is configured.
    ///                       This should be set to the pegged to asset:
    ///                       E.g. for token0 = WSTETH, token1 = ETH, this should be set to false!
    ///                       if true -> this oracle outputs how much WSTETH one Dex col share is worth
    ///                       if false -> this oracle outputs how much ETH one Dex col share is worth
    /// @param reservesConversionInvert_ Whether to invert the reserves conversion. Can be skipped if no reservesConversionOracle is configured.
    /// @param reservesPegBufferPercent_ The percentage buffer for pegged reserves.
    constructor(
        address dexPool_,
        address reservesConversionOracle_,
        bool quoteInToken0_,
        bool reservesConversionInvert_,
        uint256 reservesPegBufferPercent_
    ) {
        if (dexPool_ == address(0) || reservesPegBufferPercent_ == 0) {
            revert FluidOracleError(ErrorTypes.DexSmartColOracle__InvalidParams);
        }

        _DEX_POOL = dexPool_;
        _QUOTE_IN_TOKEN0 = quoteInToken0_;
        _RESERVES_CONVERSION_ORACLE = IFluidOracle(reservesConversionOracle_);
        _RESERVES_CONVERSION_INVERT = reservesConversionInvert_;
        _RESERVES_PEG_BUFFER_PERCENT = reservesPegBufferPercent_;

        IFluidDexT1.ConstantViews memory constantsView_ = IFluidDexT1(dexPool_).constantsView();
        _LIQUIDITY = IFluidLiquidity(constantsView_.liquidity);
        _SUPPLY_TOKEN_0_SLOT = constantsView_.supplyToken0Slot;
        _SUPPLY_TOKEN_1_SLOT = constantsView_.supplyToken1Slot;
        _EXCHANGE_PRICE_TOKEN_0_SLOT = constantsView_.exchangePriceToken0Slot;
        _EXCHANGE_PRICE_TOKEN_1_SLOT = constantsView_.exchangePriceToken1Slot;

        IFluidDexT1.ConstantViews2 memory constantsView2_ = IFluidDexT1(dexPool_).constantsView2();
        _TOKEN_0_NUMERATOR_PRECISION = constantsView2_.token0NumeratorPrecision;
        _TOKEN_0_DENOMINATOR_PRECISION = constantsView2_.token0DenominatorPrecision;
        _TOKEN_1_NUMERATOR_PRECISION = constantsView2_.token1NumeratorPrecision;
        _TOKEN_1_DENOMINATOR_PRECISION = constantsView2_.token1DenominatorPrecision;

        _RESERVES_SCALER =
            10 ** (OracleUtils.RATE_OUTPUT_DECIMALS + _DEX_SHARES_DECIMALS - _DEX_TOKENS_DECIMALS_PRECISION);
    }

    /// @dev returns combined Dex col reserves in quote token, in 1e12
    function _getDexReservesCombinedViaPeg(bool isOperate_) private view returns (uint256 reserves_) {
        // reserves token amounts are adjusted to be 1e12
        (uint256 token0Reserves_, uint256 token1Reserves_) = _getDexCollateralReserves();
        if (address(_RESERVES_CONVERSION_ORACLE) == address(0)) {
            reserves_ = token0Reserves_ + token1Reserves_;
        } else {
            uint256 conversionPrice_ = isOperate_
                ? _RESERVES_CONVERSION_ORACLE.getExchangeRateOperate()
                : _RESERVES_CONVERSION_ORACLE.getExchangeRateLiquidate();

            if (_RESERVES_CONVERSION_INVERT) {
                conversionPrice_ = 1e54 / conversionPrice_;
            }

            if (_QUOTE_IN_TOKEN0) {
                reserves_ =
                    token0Reserves_ +
                    (token1Reserves_ * conversionPrice_) /
                    (10 ** OracleUtils.RATE_OUTPUT_DECIMALS);
            } else {
                reserves_ =
                    token1Reserves_ +
                    (token0Reserves_ * conversionPrice_) /
                    (10 ** OracleUtils.RATE_OUTPUT_DECIMALS);
            }
        }

        // reduce col value by peg buffer percent
        reserves_ = (reserves_ * (1e6 - _RESERVES_PEG_BUFFER_PERCENT)) / 1e6;
    }

    function _getDexSmartColExchangeRate(bool isOperate_) private view returns (uint256 rate_) {
        uint256 totalSupplyShares_ = _getDexTotalSupplyShares();

        if (totalSupplyShares_ == 0) {
            // should never happen after Dex is initialized. until then -> revert
            revert FluidOracleError(ErrorTypes.DexSmartColOracle__SmartColNotEnabled);
        }

        // here: all reserves_ are in either token0 or token1 in 1e12 decimals, and we have total shares.
        // so we know token0 or token1 per 1e18 share. => return price per 1 share (1e18), scaled to 1e27.
        // 1e12 * 10^(27 + 18 - 12) / 1e18 -> result in 1e27
        return (_getDexReservesCombinedViaPeg(isOperate_) * _RESERVES_SCALER) / totalSupplyShares_;
    }

    function _getDexSmartColOperate() internal view returns (uint256 rate_) {
        return _getDexSmartColExchangeRate(true);
    }

    function _getDexSmartColLiquidate() internal view returns (uint256 rate_) {
        return _getDexSmartColExchangeRate(false);
    }

    /// @dev Returns the configuration data of the DexSmartColOracle.
    ///
    /// @return dexPool_ The address of the Dex pool.
    /// @return reservesPegBufferPercent_ The percentage of the reserves peg buffer.
    /// @return liquidity_ The address of the liquidity contract.
    /// @return token0NumeratorPrecision_ The precision of the numerator for token0.
    /// @return token0DenominatorPrecision_ The precision of the denominator for token0.
    /// @return token1NumeratorPrecision_ The precision of the numerator for token1.
    /// @return token1DenominatorPrecision_ The precision of the denominator for token1.
    /// @return reservesConversionOracle_ The address of the reserves conversion oracle.
    /// @return reservesConversionInvert_ A boolean indicating if reserves conversion should be inverted.
    /// @return quoteInToken0_ A boolean indicating if the quote is in token0.
    function dexSmartColOracleData()
        public
        view
        returns (
            address dexPool_,
            uint256 reservesPegBufferPercent_,
            IFluidLiquidity liquidity_,
            uint256 token0NumeratorPrecision_,
            uint256 token0DenominatorPrecision_,
            uint256 token1NumeratorPrecision_,
            uint256 token1DenominatorPrecision_,
            IFluidOracle reservesConversionOracle_,
            bool reservesConversionInvert_,
            bool quoteInToken0_
        )
    {
        return (
            _DEX_POOL,
            _RESERVES_PEG_BUFFER_PERCENT,
            _LIQUIDITY,
            _TOKEN_0_NUMERATOR_PRECISION,
            _TOKEN_0_DENOMINATOR_PRECISION,
            _TOKEN_1_NUMERATOR_PRECISION,
            _TOKEN_1_DENOMINATOR_PRECISION,
            _RESERVES_CONVERSION_ORACLE,
            _RESERVES_CONVERSION_INVERT,
            _QUOTE_IN_TOKEN0
        );
    }

    /// @dev Returns the rates of shares (totalReserves/totalShares)
    function dexSmartColSharesRates() public view returns (uint256 operate_, uint256 liquidate_) {
        return (_getDexSmartColOperate(), _getDexSmartColLiquidate());
    }
}
