const { DualSideExecutor } = require('./dualSideExecutor');

class StrategyRunner {
  constructor(config = {}) {
    this.config = {
      initialStake: 1,
      growthRate: 0.10,
      riskPercent: 2.5,
      profitTargetPercent: 20,
      lossLimitPercent: 10,
      maxDrawdownPercent: 12,
      hedgeMode: false,
      autoExecuteFavoredSide: true,
      stopLossPercent: 1.5,
      takeProfitPercent: 2.5,
      payoutMultiplier: 1.8,
      symbol: 'R_100',
      ...config
    };
    this.executor = new DualSideExecutor();
  }

  validateRiskProfile({ accountBalance = 1000, cycle = 1 } = {}) {
    const riskPerTrade = accountBalance * (this.config.riskPercent / 100);
    const maxDrawdown = accountBalance * (this.config.maxDrawdownPercent / 100);
    const lossLimit = accountBalance * (this.config.lossLimitPercent / 100);
    const safe = riskPerTrade <= maxDrawdown && lossLimit > 0;

    return {
      cycle,
      accountBalance,
      riskPerTrade: Number(riskPerTrade.toFixed(4)),
      maxDrawdown: Number(maxDrawdown.toFixed(4)),
      lossLimit: Number(lossLimit.toFixed(4)),
      safe,
      status: safe ? 'within_limits' : 'risk_limit_exceeded'
    };
  }

  buildDecision({ cycle = 1, currentPrice = 1.1, accountBalance = 1000 }) {
    const result = this.executor.generateDualPlans(cycle, currentPrice, accountBalance, {
      stake: this.config.initialStake,
      profitTargetPercent: this.config.profitTargetPercent,
      lossLimitPercent: this.config.lossLimitPercent,
      riskPercent: this.config.riskPercent,
      growthRate: this.config.growthRate,
      stopLossPercent: this.config.stopLossPercent,
      takeProfitPercent: this.config.takeProfitPercent,
      payoutMultiplier: this.config.payoutMultiplier,
      maxDrawdownPercent: this.config.maxDrawdownPercent
    });

    const favoredSide = result.recommendation;
    const favoredPlan = favoredSide === 'UP' ? result.upSide : result.downSide;
    const riskGuard = this.validateRiskProfile({ accountBalance, cycle });

    return {
      ...result,
      favoredSide,
      favoredPlan,
      hedgeMode: this.config.hedgeMode,
      autoExecuteFavoredSide: this.config.autoExecuteFavoredSide,
      executedMode: this.config.hedgeMode ? 'HEDGE' : 'FAVORED_SIDE',
      riskGuard,
      timestamp: new Date().toISOString()
    };
  }

  executeDecision({ cycle = 1, currentPrice = 1.1, accountBalance = 1000 }) {
    const analysis = this.buildDecision({ cycle, currentPrice, accountBalance });

    if (this.config.hedgeMode) {
      return {
        mode: 'HEDGE',
        trade: this.executor.executeBothSides(0.5),
        summary: analysis,
        timestamp: new Date().toISOString()
      };
    }

    return {
      mode: 'FAVORED_SIDE',
      trade: this.executor.executeRecommendedSide(),
      summary: analysis,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { StrategyRunner };
