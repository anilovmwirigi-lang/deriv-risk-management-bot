module.exports = {
  botName: 'Primacy',
  market: 'deriv',
  baseStake: 1,
  growthRate: 0.10,
  riskPercent: 2.5,
  profitTargetPercent: 20,
  lossLimitPercent: 10,
  maxDrawdownPercent: 12,
  payoutMultiplier: 1.8,
  maxOpenTrades: 3,
  stopLossPercent: 1.5,
  takeProfitPercent: 2.5,
  cycleLimit: 30,
  strategy: {
    name: 'balanced-growth',
    mode: 'manual-risk-control'
  }
};
