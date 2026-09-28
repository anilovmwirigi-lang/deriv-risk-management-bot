function calculateStake({ baseStake, growthRate, cycle }) {
  return Number((baseStake * Math.pow(1 + growthRate, cycle - 1)).toFixed(4));
}

function calculateProfitTarget({ stake, pct = 20 }) {
  return Number((stake * (pct / 100)).toFixed(4));
}

function calculateLossLimit({ stake, pct = 10 }) {
  return Number((stake * (pct / 100)).toFixed(4));
}

function calculateRiskPerTrade({ accountBalance, riskPercent = 2.5 }) {
  return Number((accountBalance * (riskPercent / 100)).toFixed(4));
}

module.exports = {
  calculateStake,
  calculateProfitTarget,
  calculateLossLimit,
  calculateRiskPerTrade
};
