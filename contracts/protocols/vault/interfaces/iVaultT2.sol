//SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import { IFluidVault } from "./iVault.sol";

interface IFluidVaultT2 is IFluidVault {
    function operate(
        uint nftId_,
        int newColToken0_,
        int newColToken1_,
        int colSharesMinMax_,
        int newDebt_,
        address to_
    )
        external
        payable
        returns (
            uint256, // nftId_
            int256, // final supply amount. if - then withdraw
            int256 // final borrow amount. if - then payback
        );

    function operatePerfect(
        uint nftId_,
        int perfectColShares_,
        int colToken0MinMax_,
        int colToken1MinMax_,
        int newDebt_,
        address to_
    )
        external
        payable
        returns (
            uint256, // nftId_
            int256[] memory r_
        );

    function liquidate(
        uint256 debtAmt_,
        uint256 colPerUnitDebt_, // col per unit is w.r.t debt shares and not token0/1 debt amount
        uint256 token0ColAmtPerUnitShares_, // in 1e18
        uint256 token1ColAmtPerUnitShares_, // in 1e18
        address to_,
        bool absorb_
    ) external payable returns (uint256 actualDebt_, uint256 actualColShares_, uint256 token0Col_, uint256 token1Col_);

    function liquidatePerfect(
        uint256 debtAmt_,
        uint256 colPerUnitDebt_, // col per unit is w.r.t debt shares and not token0/1 debt amount
        uint256 token0ColAmtPerUnitShares_, // in 1e18
        uint256 token1ColAmtPerUnitShares_, // in 1e18
        address to_,
        bool absorb_
    ) external payable returns (uint256 actualDebt_, uint256 actualColShares_, uint256 token0Col_, uint256 token1Col_);
}
