const { calculateStake } = require('./riskManager');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildExecutionPlan({
  stake,
  cycle,
  entryPrice,
  stopLossPercent,
  takeProfitPercent,
  payoutMultiplier,
  riskPerTrade,
  profitTarget,
  lossLimit,
  maxDrawdownPercent,
  growthRate
}) {
  const adjustedStake = calculateStake({
    baseStake: stake,
    growthRate,
    cycle
  });

  const stopLossPrice = Number((entryPrice * (1 - stopLossPercent / 100)).toFixed(4));
  const takeProfitPrice = Number((entryPrice * (1 + takeProfitPercent / 100)).toFixed(4));

  const risk = Number(Math.abs(entryPrice - stopLossPrice).toFixed(4));
  const reward = Number(Math.abs(takeProfitPrice - entryPrice).toFixed(4));
  const riskReward = risk > 0 ? reward / risk : 0;

  const maxDrawdown = Number((adjustedStake * (maxDrawdownPercent / 100)).toFixed(4));
  const execution = {
    cycle,
    stake: adjustedStake,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    risk,
    reward,
    riskReward,
    payoutMultiplier,
    profitTarget,
    lossLimit,
    maxDrawdown,
    riskPerTrade,
    safe: riskPerTrade <= maxDrawdown
  };

  return {
    ...execution,
    riskPerTrade: Number(riskPerTrade.toFixed(4)),
    profitTarget: Number(profitTarget.toFixed(4)),
    lossLimit: Number(lossLimit.toFixed(4)),
    maxDrawdown: Number(maxDrawdown.toFixed(4))
  };
}

module.exports = {
  buildExecutionPlan,
  clamp
};
