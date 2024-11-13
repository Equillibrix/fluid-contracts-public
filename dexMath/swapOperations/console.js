const { swapInAdjusted, swapOutAdjusted, swapIn, swapOut } = require("./main");
const helpers = require("./helpers");

let fee = 100;

// Define the collateral reserve object
const colReservesOne = {
  token0RealReserves: 20000000006000000,
  token1RealReserves: 20000000000500000,
  token0ImaginaryReserves: 389736659726997981,
  token1ImaginaryReserves: 389736659619871949,
};

// Define the collateral reserve object
const reservesEmpty = {
  token0RealReserves: 0,
  token1RealReserves: 0,
  token0ImaginaryReserves: 0,
  token1ImaginaryReserves: 0,
};

// Define the debt reserve object
const debtReservesOne = {
  token0RealReserves: 9486832995556050,
  token1RealReserves: 9486832993079885,
  token0ImaginaryReserves: 184868330099560759,
  token1ImaginaryReserves: 184868330048879109,
};

const limitsTight = {
  withdrawableToken0: {
    available: 456740438880263,
    expandsTo: 711907234052361388866,
    expandDuration: 600,
  },
  withdrawableToken1: {
    available: 825179383432029,
    expandsTo: 711907234052361388866,
    expandDuration: 600,
  },
  borrowableToken0: {
    available: 941825058374170,
    expandsTo: 711907234052361388866,
    expandDuration: 600,
  },
  borrowableToken1: {
    available: 941825058374170,
    expandsTo: 711907234052361388866,
    expandDuration: 600,
  },
};

const limitsOk = {
  withdrawableToken0: {
    available: 3424233287977651508309,
    expandsTo: 3424233287977651508309,
    expandDuration: 0,
  },
  withdrawableToken1: {
    available: 2694722397017898779126,
    expandsTo: 2711907234052361388866,
    expandDuration: 22,
  },
  borrowableToken0: {
    available: 2132761927364044176263,
    expandsTo: 2132761927364044176263,
    expandDuration: 0,
  },
  borrowableToken1: {
    available: 1725411806284169057582,
    expandsTo: 1887127019149919004603,
    expandDuration: 308,
  },
};

const limitsWide = {
  withdrawableToken0: {
    available: 342423328797765150830999,
    expandsTo: 342423328797765150830999,
    expandDuration: 0,
  },
  withdrawableToken1: {
    available: 342423328797765150830999,
    expandsTo: 342423328797765150830999,
    expandDuration: 22,
  },
  borrowableToken0: {
    available: 342423328797765150830999,
    expandsTo: 342423328797765150830999,
    expandDuration: 0,
  },
  borrowableToken1: {
    available: 342423328797765150830999,
    expandsTo: 342423328797765150830999,
    expandDuration: 308,
  },
};

const outDecimals = 18;
const syncTime = Date.now() / 1000;

function testSwapIn() {
  console.log(swapInAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapInAdjusted(true, 1e15, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapInAdjusted(true, 1e15, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));

  console.log(swapInAdjusted(false, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapInAdjusted(false, 1e15, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapInAdjusted(false, 1e15, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));
}

function testExpandLimits() {
  // half expanded
  let limit = helpers.getExpandedLimit(syncTime - 300, limitsTight.withdrawableToken0);
  console.log(limit, "half expanded");
  // 3/4 expanded
  limit = helpers.getExpandedLimit(syncTime - 450, limitsTight.withdrawableToken0);
  console.log(limit, "3/4 expanded");
  // fully expanded
  limit = helpers.getExpandedLimit(syncTime - 10000, limitsTight.withdrawableToken0);
  console.log(limit, "fully expanded");
}

function testSwapInWithLimits() {
  console.log("\n LIMITS SHOULD HIT ---------------------------------");
  console.log(swapInAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsTight, syncTime));

  console.log("\n LIMITS SHOULD NOT HIT ---------------------------------");
  console.log(swapInAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log("\n EXPANDED LIMITS SHOULD NOT HIT ---------------------------------");
  console.log(swapInAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsTight, syncTime - 1000));

  console.log("\n PRICE DIFF SHOULD HIT ---------------------------------");
  console.log(swapInAdjusted(true, 15e15, colReservesOne, debtReservesOne, outDecimals, limitsWide, syncTime));
}

function testSwapOutWithLimits() {
  console.log("\n LIMITS SHOULD HIT ---------------------------------");
  console.log(swapOutAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsTight, syncTime));

  console.log("\n LIMITS SHOULD NOT HIT ---------------------------------");
  console.log(swapOutAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log("\n EXPANDED LIMITS SHOULD NOT HIT ---------------------------------");
  console.log(swapOutAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsTight, syncTime - 1000));

  console.log("\n PRICE DIFF SHOULD HIT ---------------------------------");
  console.log(swapOutAdjusted(true, 15e15, colReservesOne, debtReservesOne, outDecimals, limitsWide, syncTime));
}

function testSwapOut() {
  console.log(swapOutAdjusted(true, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapOutAdjusted(true, 1e15, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapOutAdjusted(true, 1e15, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));

  console.log(swapOutAdjusted(false, 1e15, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapOutAdjusted(false, 1e15, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));

  console.log(swapOutAdjusted(false, 1e15, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));
}

function testSwapInOut() {
  let amountIn = 1e15;
  let amountOut = swapInAdjusted(true, amountIn, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(true, amountOut, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));

  amountIn = 1e15;
  amountOut = swapInAdjusted(false, amountIn, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(false, amountOut, colReservesOne, debtReservesOne, outDecimals, limitsOk, syncTime));
}

function testSwapInOutDebtEmpty() {
  let amountIn = 1e15;
  let amountOut = swapInAdjusted(true, amountIn, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(true, amountOut, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));

  amountIn = 1e15;
  amountOut = swapInAdjusted(false, amountIn, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(false, amountOut, reservesEmpty, debtReservesOne, outDecimals, limitsOk, syncTime));
}

function testSwapInOutColEmpty() {
  let amountIn = 1e15;
  let amountOut = swapInAdjusted(true, amountIn, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(true, amountOut, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));

  amountIn = 1e15;
  amountOut = swapInAdjusted(false, amountIn, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime);
  console.log(amountIn);
  console.log(swapOutAdjusted(false, amountOut, colReservesOne, reservesEmpty, outDecimals, limitsOk, syncTime));
}

function testSwapInCompareEstimateIn() {
  // values as fetched from resolver
  const colReserves = {
    token0RealReserves: 2169934539358,
    token1RealReserves: 19563846299171,
    token0ImaginaryReserves: 62490032619260838,
    token1ImaginaryReserves: 73741038977020279,
  };
  const debtReserves = {
    token0Debt: 16590678644536,
    token1Debt: 2559733858855,
    token0RealReserves: 2169108220421,
    token1RealReserves: 19572550738602,
    token0ImaginaryReserves: 62511862774117387,
    token1ImaginaryReserves: 73766803277429176,
  };

  // adjusting in amount for fee, here it was configured as 0.01% (100)
  const inAmtAfterFee = (1000000000000 * (1000000 - 100)) / 1000000;
  const expectedAmountIn = inAmtAfterFee * 1e6;

  const expectedAmountOut = 1179917402129152800;
  // see https://dashboard.tenderly.co/InstaDApp/fluid/simulator/5e5bf655-98ef-4edc-9590-ed4da467ac79
  // for resolver estimateSwapIn result at very similar reserves values (hardcoded reserves above taken some blocks before).
  // resolver says estimateSwapIn result should be 1179917367073000000
  // we get 								                       1179917402129152800

  let amountIn = inAmtAfterFee;
  let amountOut = swapInAdjusted(true, amountIn, colReserves, debtReserves, outDecimals, limitsOk, syncTime);
  console.log(`Expected amount out: ${expectedAmountOut}`);
  console.log(`Got                : ${amountOut * 1e6}`);
  console.log(`Expected amount in: ${expectedAmountIn}`);
  console.log(`Got               : ${amountIn * 1e6}`);

  if (amountOut * 1e6 !== expectedAmountOut) {
    throw new Error(`Expected amount out: ${expectedAmountOut}, But got: ${amountOut * 1e6}`);
  }
  if (amountIn * 1e6 !== expectedAmountIn) {
    throw new Error(`Expected amount in: ${expectedAmountIn}, But got: ${amountIn * 1e6}`);
  }
}

testSwapIn();
testSwapOut();
testSwapInOut();
testSwapInOutDebtEmpty();
testSwapInOutColEmpty();
testSwapInCompareEstimateIn();
testSwapInWithLimits();
testSwapOutWithLimits();
testExpandLimits();

// run with:
// npx hardhat run dexMath/swapOperations/console.js
