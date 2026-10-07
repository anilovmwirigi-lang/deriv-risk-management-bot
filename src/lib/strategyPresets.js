const DEFAULT_PRESETS = {
  conservative: {
    label: 'Conservative',
    baseStake: 1,
    growthRate: 0.05,
    riskPercent: 1.5,
    profitTargetPercent: 15,
    lossLimitPercent: 8,
    stopLossPercent: 1.2,
    takeProfitPercent: 2,
    maxDrawdownPercent: 8
  },
  balanced: {
    label: 'Balanced',
    baseStake: 1,
    growthRate: 0.1,
    riskPercent: 2.5,
    profitTargetPercent: 20,
    lossLimitPercent: 10,
    stopLossPercent: 1.5,
    takeProfitPercent: 2.5,
    maxDrawdownPercent: 12
  },
  aggressive: {
    label: 'Aggressive',
    baseStake: 1,
    growthRate: 0.15,
    riskPercent: 4,
    profitTargetPercent: 25,
    lossLimitPercent: 12,
    stopLossPercent: 2,
    takeProfitPercent: 3.5,
    maxDrawdownPercent: 15
  },
  highVolatility: {
    label: 'High Volatility',
    baseStake: 1,
    growthRate: 0.2,
    riskPercent: 5,
    profitTargetPercent: 30,
    lossLimitPercent: 15,
    stopLossPercent: 2.5,
    takeProfitPercent: 4,
    maxDrawdownPercent: 18
  }
};

function getPreset(name = 'balanced') {
  const key = String(name).toLowerCase();
  return DEFAULT_PRESETS[key] ? { name: key, ...DEFAULT_PRESETS[key] } : null;
}

function getPresets() {
  return Object.entries(DEFAULT_PRESETS).reduce((acc, [name, details]) => {
    acc[name] = { name, ...details };
    return acc;
  }, {});
}

module.exports = { DEFAULT_PRESETS, getPreset, getPresets, presets: getPresets() };
