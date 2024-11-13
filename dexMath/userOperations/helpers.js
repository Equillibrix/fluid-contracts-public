function _getUpdatedColReserves(newShares, totalOldShares, colReserves, mintOrBurn) {
    let updatedReserves = {};

    if (mintOrBurn) {
        // If minting, increase reserves proportionally to new shares
        updatedReserves.token0RealReserves = colReserves.token0RealReserves + (colReserves.token0RealReserves * newShares) / totalOldShares;
        updatedReserves.token1RealReserves = colReserves.token1RealReserves + (colReserves.token1RealReserves * newShares) / totalOldShares;
        updatedReserves.token0ImaginaryReserves = colReserves.token0ImaginaryReserves + (colReserves.token0ImaginaryReserves * newShares) / totalOldShares;
        updatedReserves.token1ImaginaryReserves = colReserves.token1ImaginaryReserves + (colReserves.token1ImaginaryReserves * newShares) / totalOldShares;
    } else {
        // If burning, decrease reserves proportionally to burned shares
        updatedReserves.token0RealReserves = colReserves.token0RealReserves - ((colReserves.token0RealReserves * newShares) / totalOldShares);
        updatedReserves.token1RealReserves = colReserves.token1RealReserves - ((colReserves.token1RealReserves * newShares) / totalOldShares);
        updatedReserves.token0ImaginaryReserves = colReserves.token0ImaginaryReserves - ((colReserves.token0ImaginaryReserves * newShares) / totalOldShares);
        updatedReserves.token1ImaginaryReserves = colReserves.token1ImaginaryReserves - ((colReserves.token1ImaginaryReserves * newShares) / totalOldShares);
    }

    return updatedReserves;
}

// ##################### DEPOSIT #####################

/**
 * Updates collateral reserves based on minting or burning of shares
 * @param {number} newShares The number of new shares being minted or burned
 * @param {number} totalOldShares The total number of shares before the operation
 * @param {Object} colReserves The current collateral reserves
 * @param {boolean} mintOrBurn True if minting shares, false if burning shares
 * @returns {Object} The updated collateral reserves after the operation
 */

function _getSwapAndDeposit(c, d, e, f, i) {
    const SIX_DECIMALS = 1000000; // 10^6

    // temp_ => B/i
    let temp = (c * d + d * f + e * i - c * i) / i;
    let temp2 = 4 * c * e;
    let amtToSwap = (Math.sqrt(temp2 + temp * temp) - temp) / 2;

    // Ensure the amount to swap is within reasonable bounds
    if (amtToSwap > ((c * (SIX_DECIMALS - 1)) / SIX_DECIMALS) || 
        amtToSwap < (c / SIX_DECIMALS)) {
        throw new Error("SwapAndDepositTooLowOrTooHigh");
    }

    // temp_ => amt0ToDeposit
    temp = c - amtToSwap;
    // temp2_ => amt1ToDeposit_
    temp2 = (d * amtToSwap) / (e + amtToSwap);

    // temp_ => shares1
    temp = (temp * (10 ** 18)) / (f + amtToSwap);
    // temp2_ => shares1
    temp2 = (temp2 * (10 ** 18)) / (i - temp2);

    // Return the smaller of temp and temp2
    return temp > temp2 ? temp2 : temp;
}

function _depositAdjusted(token0AmtAdjusted, token1AmtAdjusted, slippage, dexFee, totalSupplyShares, colReserves) {
    let temp = 0;
    let temp2 = 0;
    let shares = 0;
    let sharesWithSlippage = 0;
    
    if (token0AmtAdjusted > 0 && token1AmtAdjusted > 0) {
        // mint shares in equal proportion
        // temp_ => expected shares from token0 deposit
        temp = (token0AmtAdjusted * 1e18) / colReserves.token0RealReserves;
        // temp2_ => expected shares from token1 deposit
        temp2 = (token1AmtAdjusted * 1e18) / colReserves.token1RealReserves;
        
        if (temp > temp2) {
            // use temp2_ shares
            shares = (temp2 * totalSupplyShares) / 1e18;
            // temp_ => token0 to swap
            temp = ((temp - temp2) * colReserves.token0RealReserves) / 1e18;
            temp2 = 0;
        } else if (temp2 > temp) {
            // use temp shares
            shares = (temp * totalSupplyShares) / 1e18;
            // temp2 => token1 to swap
            temp2 = ((temp2 - temp) * colReserves.token1RealReserves) / 1e18;
            temp = 0;
        } else {
            // if equal then throw error as swap will not be needed anymore which can create some issue, better to use depositPerfect in this case
            return (0, 0, false)
        }

        // User deposited in equal proportion here. Hence updating col reserves and the swap will happen on updated col reserves
        colReserves = _getUpdatedColReserves(shares, totalSupplyShares, colReserves, true);

        totalSupplyShares += shares;
    } else if (token0AmtAdjusted > 0) {
        temp = token0AmtAdjusted;
        temp2 = 0;
    } else if (token1AmtAdjusted > 0) {
        temp = 0;
        temp2 = token1AmtAdjusted;
    } else {
        // user sent both amounts as 0
        return (0, 0, false);
    }

    if (temp > 0) {
        // swap token0
        temp = _getSwapAndDeposit(
            temp, // token0 to divide and swap
            colReserves.token1ImaginaryReserves, // token1 imaginary reserves
            colReserves.token0ImaginaryReserves, // token0 imaginary reserves
            colReserves.token0RealReserves, // token0 real reserves
            colReserves.token1RealReserves // token1 real reserves
        );
    } else if (temp2 > 0) {
        // swap token1
        temp = _getSwapAndDeposit(
            temp2, // token1 to divide and swap
            colReserves.token0ImaginaryReserves, // token0 imaginary reserves
            colReserves.token1ImaginaryReserves, // token1 imaginary reserves
            colReserves.token1RealReserves, // token1 real reserves
            colReserves.token0RealReserves // token0 real reserves
        );
    } else {
        // maybe possible to happen due to some precision issue that both are 0
        return (0, 0, false);
    }

    // new shares minted from swap & deposit
    temp = (temp * totalSupplyShares) / 1e18;
    // adding fee in case of swap & deposit
    // 1 - fee. If fee is 1% then without fee will be 1e6 - 1e4
    // temp => withdraw fee
    temp = temp * (1 - dexFee);
    // final new shares to mint for user
    shares += temp;

    sharesWithSlippage = shares * (1 - slippage);

    shares = shares.toFixed(0);
    sharesWithSlippage = sharesWithSlippage.toFixed(0);

    return { shares, sharesWithSlippage, success: true };
}

// ##################### DEPOSIT END #####################

// ##################### WITHDRAW #####################

function _getWithdrawAndSwap(c_, d_, e_, f_, g_) {
    // Constants
    const SIX_DECIMALS = 1000000;

    // temp_ = B/2A = (d * e + 2 * c * d + c * f) / (2 * d)
    const temp = (d_ * e_ + 2 * c_ * d_ + c_ * f_) / (2 * d_);

    // temp2_ = (((c * f) / d) + c) * g
    const temp2 = (((c_ * f_) / d_) + c_) * g_;

    // tokenAxa = temp - sqrt((temp * temp) - temp2)
    const tokenAxa = temp - Math.sqrt((temp * temp) - temp2);

    // Ensure the amount to withdraw is within reasonable bounds
    if (tokenAxa > ((g_ * (SIX_DECIMALS - 1)) / SIX_DECIMALS) || 
        tokenAxa < (g_ / SIX_DECIMALS)) {
        throw new Error("WithdrawAndSwapTooLowOrTooHigh");
    }

    // shares_ = (tokenAxa * 1e18) / c
    const shares = (tokenAxa * 1e18) / c_;

    return shares;
}

function _withdrawAdjusted(token0AmtAdjusted, token1AmtAdjusted, slippage, dexFee, totalSupplyShares, colReserves) {
    let temp = 0;
    let temp2 = 0;
    let shares = 0;
    let sharesWithSlippage = 0;
  
    if (token0AmtAdjusted > 0 && token1AmtAdjusted > 0) {
        // Calculate expected shares for each token
        temp = (token0AmtAdjusted * 1e18) / colReserves.token0RealReserves;
        temp2 = (token1AmtAdjusted * 1e18) / colReserves.token1RealReserves;
  
        if (temp > temp2) {
            shares = (temp2 * totalSupplyShares) / 1e18;
            temp = ((temp - temp2) * colReserves.token0RealReserves) / 1e18;
            temp2 = 0;
        } else if (temp2 > temp) {
            shares = (temp * totalSupplyShares) / 1e18;
            temp2 = ((temp2 - temp) * colReserves.token1RealReserves) / 1e18;
            temp = 0;
        } else {
            return (0, 0, false);
        }
  
        // Update reserves and total supply shares
        colReserves.token0RealReserves -= (colReserves.token0RealReserves * shares) / totalSupplyShares;
        colReserves.token1RealReserves -= (colReserves.token1RealReserves * shares) / totalSupplyShares;
        totalSupplyShares -= shares;
    } else if (token0AmtAdjusted > 0) {
        temp = token0AmtAdjusted;
        temp2 = 0;
    } else if (token1AmtAdjusted > 0) {
        temp = 0;
        temp2 = token1AmtAdjusted;
    } else {
        return (0, 0, false);
    }
  
    let token0ImaginaryReservesOutsideRange = colReserves.token0ImaginaryReserves - colReserves.token0RealReserves;
    let token1ImaginaryReservesOutsideRange = colReserves.token1ImaginaryReserves - colReserves.token1RealReserves;

    if (temp > 0) {
        temp = _getWithdrawAndSwap(
            colReserves.token0RealReserves,
            colReserves.token1RealReserves,
            token0ImaginaryReservesOutsideRange,
            token1ImaginaryReservesOutsideRange,
            temp
        );
    } else if (temp2 > 0) {
        temp = _getWithdrawAndSwap(
            colReserves.token1RealReserves,
            colReserves.token0RealReserves,
            token1ImaginaryReservesOutsideRange,
            token0ImaginaryReservesOutsideRange,
            temp2
        );
    } else {
        return (0, 0, false);
    }
  
    // Calculate shares to burn from withdraw & swap
    temp = (temp * totalSupplyShares) / 1e18;
    // Add fee
    temp = (temp * (1 + dexFee));
    // Update shares to burn for user
    shares += temp;
    sharesWithSlippage = shares * (1 + slippage);
    shares = shares.toFixed(0);
    sharesWithSlippage = sharesWithSlippage.toFixed(0);
    
    return { shares, sharesWithSlippage, success: true };
}

// ##################### WITHDRAW END #####################


// ##################### WITHDRAW PERFECT IN ONE TOKEN #####################

/**
 * Calculates the output amount for a given input amount and reserves
 * @param {BigInt} amountIn - The amount of input asset
 * @param {BigInt} iReserveIn - Imaginary token reserve of input amount
 * @param {BigInt} iReserveOut - Imaginary token reserve of output amount
 * @returns {BigInt} The calculated output amount
 */
function _getAmountOut(amountIn, iReserveIn, iReserveOut) {
    // Calculate numerator and denominator
    const numerator = amountIn * iReserveOut;
    const denominator = iReserveIn + amountIn;

    // Calculate and return the output amount
    // Note: Using BigInt division to mimic Solidity's behavior
    return numerator / denominator;
}

function _withdrawPerfectInOneToken(shares, withdrawToken0Or1, decimals0Or1, slippage, dexFee, totalSupplyShares, colReserves) {
    let tokenAmount = 0;
    let tokenAmountWithSlippage = 0;

    if (colReserves.token0RealReserves === 0 || colReserves.token1RealReserves === 0) {
        return (0, 0, false);
    }

    const updatedReserves = _getUpdatedColReserves(shares, totalSupplyShares, colReserves, false);
    
    let token0Amount = colReserves.token0RealReserves - updatedReserves.token0RealReserves - 1;
    let token1Amount = colReserves.token1RealReserves - updatedReserves.token1RealReserves - 1;

    if (withdrawToken0Or1 == 0) {
        // Withdraw in token0
        tokenAmount = token0Amount;
        tokenAmount += _getAmountOut(token1Amount, updatedReserves.token1ImaginaryReserves, updatedReserves.token0ImaginaryReserves);
    } else if (withdrawToken0Or1 == 1) {
        // Withdraw in token1
        tokenAmount = token1Amount;
        tokenAmount += _getAmountOut(token0Amount, updatedReserves.token0ImaginaryReserves, updatedReserves.token1ImaginaryReserves);
    } else {
        return (0, 0, false);
    }

    tokenAmount = (tokenAmount * (1 - dexFee));
    tokenAmount = tokenAmount * 10 ** (decimals0Or1 - 12);
    tokenAmountWithSlippage = tokenAmount * (1 - slippage);
    tokenAmount = tokenAmount.toFixed(0);
    tokenAmountWithSlippage = tokenAmountWithSlippage.toFixed(0);

    return { tokenAmount, tokenAmountWithSlippage, success: true };
}

// ##################### WITHDRAW PERFECT IN ONE TOKEN END #####################

// ##################### BORROW #####################

function _getBorrowAndSwap(c, d, e, f, g) {
    // Calculate temp_ = B/2A
    const temp = (c * f + d * e + d * g) / (2 * d);

    // Calculate temp2_ = C / A
    const temp2 = (c * f * g) / d;

    // Calculate tokenAxa = (-B - (B^2 - 4AC)^0.5) / 2A
    const tokenAxa = temp - Math.sqrt((temp * temp) - temp2);

    // Rounding up borrow shares to mint for user
    const shares = ((tokenAxa + 1) * 1e18) / c;

    return shares;
}

function _getUpdateDebtReserves(shares, totalShares, debtReserves, mintOrBurn) {
    let updatedDebtReserves = {
        token0Debt: 0,
        token1Debt: 0,
        token0RealReserves: 0,
        token1RealReserves: 0,
        token0ImaginaryReserves: 0,
        token1ImaginaryReserves: 0
    };

    if (mintOrBurn) {
        updatedDebtReserves.token0Debt = debtReserves.token0Debt + (debtReserves.token0Debt * shares) / totalShares;
        updatedDebtReserves.token1Debt = debtReserves.token1Debt + (debtReserves.token1Debt * shares) / totalShares;
        updatedDebtReserves.token0RealReserves = debtReserves.token0RealReserves + (debtReserves.token0RealReserves * shares) / totalShares;
        updatedDebtReserves.token1RealReserves = debtReserves.token1RealReserves + (debtReserves.token1RealReserves * shares) / totalShares;
        updatedDebtReserves.token0ImaginaryReserves = debtReserves.token0ImaginaryReserves + (debtReserves.token0ImaginaryReserves * shares) / totalShares;
        updatedDebtReserves.token1ImaginaryReserves = debtReserves.token1ImaginaryReserves + (debtReserves.token1ImaginaryReserves * shares) / totalShares;
    } else {
        updatedDebtReserves.token0Debt = debtReserves.token0Debt - (debtReserves.token0Debt * shares) / totalShares;
        updatedDebtReserves.token1Debt = debtReserves.token1Debt - (debtReserves.token1Debt * shares) / totalShares;
        updatedDebtReserves.token0RealReserves = debtReserves.token0RealReserves - (debtReserves.token0RealReserves * shares) / totalShares;
        updatedDebtReserves.token1RealReserves = debtReserves.token1RealReserves - (debtReserves.token1RealReserves * shares) / totalShares;
        updatedDebtReserves.token0ImaginaryReserves = debtReserves.token0ImaginaryReserves - (debtReserves.token0ImaginaryReserves * shares) / totalShares;
        updatedDebtReserves.token1ImaginaryReserves = debtReserves.token1ImaginaryReserves - (debtReserves.token1ImaginaryReserves * shares) / totalShares;
    }

    return updatedDebtReserves;
}

function _borrowAdjusted(token0AmtAdjusted, token1AmtAdjusted, slippage, dexFee, totalBorrowShares, debtReserves) {
    let temp;
    let temp2;
    let shares = 0;
    let sharesWithSlippage = 0;
  
    if (token0AmtAdjusted > 0 && token1AmtAdjusted > 0) {
        // Mint shares in equal proportion
        temp = (token0AmtAdjusted * 1e18) / debtReserves.token0Debt;
        temp2 = (token1AmtAdjusted * 1e18) / debtReserves.token1Debt;
        if (temp > temp2) {
            shares = (temp2 * totalBorrowShares) / 1e18;
            temp = ((temp - temp2) * debtReserves.token0Debt) / 1e18;
            temp2 = 0;
        } else if (temp2 > temp) {
            shares = (temp * totalBorrowShares) / 1e18;
            temp2 = ((temp2 - temp) * debtReserves.token1Debt) / 1e18;
            temp = 0;
        } else {
            return (0, 0, false);
        }

        // User borrowed in equal proportion here. Hence updating col reserves and the swap will happen on updated col reserves
        debtReserves = _getUpdateDebtReserves(shares, totalBorrowShares, debtReserves, true);
        totalBorrowShares += shares;
    } else if (token0AmtAdjusted > 0) {
        temp = token0AmtAdjusted;
        temp2 = 0;
    } else if (token1AmtAdjusted > 0) {
        temp = 0;
        temp2 = token1AmtAdjusted;
    } else {
        return (0, 0, false);
    }

    if (temp > 0) {
        // Swap into token0
        temp = _getBorrowAndSwap(
            debtReserves.token0Debt,
            debtReserves.token1Debt,
            debtReserves.token0ImaginaryReserves,
            debtReserves.token1ImaginaryReserves,
            temp
        );
    } else if (temp2 > 0) {
        // Swap into token1
        temp = _getBorrowAndSwap(
            debtReserves.token1Debt,
            debtReserves.token0Debt,
            debtReserves.token1ImaginaryReserves,
            debtReserves.token0ImaginaryReserves,
            temp2
        );
    } else {
        return (0, 0, false);
    }

    // New shares to mint from borrow & swap
    temp = (temp * totalBorrowShares) / 1e18;
    // Adding fee in case of borrow & swap
    temp = (temp * (1 + dexFee));
    // Final new shares to mint for user
    shares += temp;

    sharesWithSlippage = shares * (1 + slippage);
    shares = shares.toFixed(0);
    sharesWithSlippage = sharesWithSlippage.toFixed(0);
  
    return { shares, sharesWithSlippage, success: true };
}

// ##################### BORROW END #####################

// ##################### PAYBACK #####################

function _getSwapAndPayback(c, d, e, f, g) {
    // Calculate temp_ as B/A
    let temp = (c * f + d * e - f * g - d * g) / d;

    // Calculate temp2_ as -AC / A^2
    let temp2 = 4 * e * g;

    // Calculate the amount to swap
    let amtToSwap = (Math.sqrt(temp2 + (temp * temp)) - temp) / 2;

    // Calculate amt0ToPayback
    let amt0ToPayback = g - amtToSwap;

    // Calculate amt1ToPayback
    let amt1ToPayback = (f * amtToSwap) / (e + amtToSwap);

    // Calculate shares0
    let shares0 = (amt0ToPayback * 1e18) / (c - amtToSwap);

    // Calculate shares1
    let shares1 = (amt1ToPayback * 1e18) / (d + amt1ToPayback);

    // Return the lower of shares0 and shares1
    return Math.min(shares0, shares1);
}

function _paybackAdjusted(token0AmtAdjusted, token1AmtAdjusted, slippage, dexFee, totalBorrowShares, debtReserves) {
    let temp;
    let temp2;
    let shares = 0;
    let sharesWithSlippage = 0;

    if (token0AmtAdjusted > 0 && token1AmtAdjusted > 0) {
        // Calculate expected shares from token0 and token1 payback
        temp = (token0AmtAdjusted * 1e18) / debtReserves.token0Debt;
        temp2 = (token1AmtAdjusted * 1e18) / debtReserves.token1Debt;

        if (temp > temp2) {
            shares = (temp2 * totalBorrowShares) / 1e18;
            temp = token0AmtAdjusted - (temp2 * token0AmtAdjusted) / temp;
            temp2 = 0;
        } else if (temp2 > temp) {
            shares = (temp * totalBorrowShares) / 1e18;
            temp2 = token1AmtAdjusted - (temp * token1AmtAdjusted) / temp2;
            temp = 0;
        } else {
            return (0, 0, false);
        }

        // Update debt reserves
        debtReserves = _getUpdateDebtReserves(shares, totalBorrowShares, debtReserves, false);
        totalBorrowShares -= shares;
    } else if (token0AmtAdjusted > 0) {
        temp = token0AmtAdjusted;
        temp2 = 0;
    } else if (token1AmtAdjusted > 0) {
        temp = 0;
        temp2 = token1AmtAdjusted;
    } else {
        return (0, 0, false);
    }

    if (temp > 0) {
        temp = _getSwapAndPayback(debtReserves.token0Debt, debtReserves.token1Debt, debtReserves.token0ImaginaryReserves, debtReserves.token1ImaginaryReserves, temp);
    } else if (temp2 > 0) {
        temp = _getSwapAndPayback(debtReserves.token1Debt, debtReserves.token0Debt, debtReserves.token1ImaginaryReserves, debtReserves.token0ImaginaryReserves, temp2);
    } else {
        return (0, 0, false);
    }

    // Calculate new shares to burn
    temp = (temp * totalBorrowShares) / 1e18;
    temp = temp * (1 - dexFee);
    shares += temp;

    sharesWithSlippage = shares * (1 - slippage);
    shares = shares.toFixed(0);
    sharesWithSlippage = sharesWithSlippage.toFixed(0);

    return { shares, sharesWithSlippage, success: true };
}

// ##################### PAYBACK END #####################

// ##################### PAYBACK PERFECT IN ONE TOKEN #####################

function _getSwapAndPaybackOneTokenPerfectShares(a, b, c, d, i, j) {
    // Calculate reserves outside range
    const l = a - i;
    const m = b - j;

    // Calculate new K or final K
    const w = a * b;

    // Calculate final reserves
    const z = w / l;
    const y = w / m;
    const v = z - m - d;
    const x = (v * y) / (m + v);

    // Calculate amount to payback
    const tokenAmt = c - x;

    return tokenAmt;
}

function _paybackPerfectInOneToken(shares, paybackToken0Or1, decimals0Or1, slippage, dexFee, totalBorrowShares, debtReserves) {
    let tokenAmount = 0;
    let tokenAmountWithSlippage = 0;

    let token0CurrentDebt = debtReserves.token0Debt;
    let token1CurrentDebt = debtReserves.token1Debt;

    // Removing debt liquidity in equal proportion
    debtReserves = _getUpdateDebtReserves(shares, totalBorrowShares, debtReserves, false);

    if (paybackToken0Or1 == 0) {
        // entire payback is in token0
        tokenAmount = _getSwapAndPaybackOneTokenPerfectShares(
            debtReserves.token0ImaginaryReserves,
            debtReserves.token1ImaginaryReserves,
            token0CurrentDebt,
            token1CurrentDebt,
            debtReserves.token0RealReserves,
            debtReserves.token1RealReserves
        );
    } else if (paybackToken0Or1 == 1) {
        // entire payback is in token1
        tokenAmount = _getSwapAndPaybackOneTokenPerfectShares(
            debtReserves.token1ImaginaryReserves,
            debtReserves.token0ImaginaryReserves,
            token1CurrentDebt,
            token0CurrentDebt,
            debtReserves.token1RealReserves,
            debtReserves.token0RealReserves
        );
    } else {
        return (0, 0, false);
    }

    tokenAmount = tokenAmount * 10 ** (decimals0Or1 - 12);

    // adding fee on paying back in 1 token
    tokenAmount = tokenAmount * (1 + dexFee);
    tokenAmountWithSlippage = tokenAmount * (1 + slippage);

    tokenAmount = tokenAmount.toFixed(0);
    tokenAmountWithSlippage = tokenAmountWithSlippage.toFixed(0);

    return { tokenAmount, tokenAmountWithSlippage, success: true };
}

// ##################### PAYBACK PERFECT IN ONE TOKEN END #####################


// ##################### DEPOSIT OR WITHDRAW PERFECT #####################

function _depositOrWithdrawPerfect(token0Amt, token1Amt, token0Decimals, token1Decimals, slippage, totalSupplyShares, colReserves) {

    if ((token0Amt > 0 && token1Amt > 0) || (token0Amt == 0 && token1Amt == 0)) {
        return (0, 0, false);
    }

    let token0AmtAdjusted = 0;
    let token1AmtAdjusted = 0;
    let shares = 0;

    if (token0Amt > 0) {
        token0AmtAdjusted = token0Amt * 10 ** (12 - token0Decimals);
        token1AmtAdjusted = token0AmtAdjusted * colReserves.token1RealReserves / colReserves.token0RealReserves;
        shares = token0AmtAdjusted * totalSupplyShares / colReserves.token0RealReserves;
    } else {
        token1AmtAdjusted = token1Amt * 10 ** (12 - token1Decimals);
        token0AmtAdjusted = token1AmtAdjusted * colReserves.token0RealReserves / colReserves.token1RealReserves;
        shares = token1AmtAdjusted * totalSupplyShares / colReserves.token1RealReserves;
    }

    token0Amt = token0AmtAdjusted * 10 ** (token0Decimals - 12);
    token1Amt = token1AmtAdjusted * 10 ** (token1Decimals - 12);

    return {
        shares,
        token0Amt,
        token1Amt
    }

}

// ##################### DEPOSIT OR WITHDRAW PERFECT END #####################

// ##################### BORROW OR PAYBACK PERFECT #####################

function _borrowOrPaybackPerfect(token0Amt, token1Amt, token0Decimals, token1Decimals, totalBorrowShares, debtReserves) {
    if ((token0Amt > 0 && token1Amt > 0) || (token0Amt == 0 && token1Amt == 0)) {
        return (0, 0, false);
    }

    let token0AmtAdjusted = 0;
    let token1AmtAdjusted = 0;
    let shares = 0;

    if (token0Amt > 0) {
        token0AmtAdjusted = token0Amt * 10 ** (12 - token0Decimals);
        token1AmtAdjusted = token0AmtAdjusted * debtReserves.token1Debt / debtReserves.token0Debt;
        shares = token0AmtAdjusted * totalBorrowShares / debtReserves.token0Debt;
    } else {
        token1AmtAdjusted = token1Amt * 10 ** (12 - token1Decimals);
        token0AmtAdjusted = token1AmtAdjusted * debtReserves.token0Debt / debtReserves.token1Debt;
        shares = token1AmtAdjusted * totalBorrowShares / debtReserves.token1Debt;
    }

    token0Amt = token0AmtAdjusted * 10 ** (token0Decimals - 12);
    token1Amt = token1AmtAdjusted * 10 ** (token1Decimals - 12);

    return {
        shares,
        token0Amt,
        token1Amt
    }
}

// ##################### BORROW OR PAYBACK PERFECT END #####################

module.exports = {
    _depositAdjusted,
    _withdrawAdjusted,
    _withdrawPerfectInOneToken,
    _borrowAdjusted,
    _paybackAdjusted,
    _paybackPerfectInOneToken,
    _depositOrWithdrawPerfect,
    _borrowOrPaybackPerfect
};
