const { buildExecutionPlan } = require('./executionCalculator');
const {
  calculateStake,
  calculateProfitTarget,
  calculateLossLimit,
  calculateRiskPerTrade
} = require('./riskManager');

class DualSideExecutor {
  constructor() {
    this.name = 'Dual Side Executor';
    this.upSidePlan = null;
    this.downSidePlan = null;
    this.selectedSide = null;
  }

  generateDualPlans(cycle, currentPrice, accountBalance, config = {}) {
    const {
      stake = 1,
      profitTargetPercent = 20,
      lossLimitPercent = 10,
      riskPercent = 2.5,
      growthRate = 0.1,
      stopLossPercent = 1.5,
      takeProfitPercent = 2.5,
      payoutMultiplier = 1.8,
      maxDrawdownPercent = 12
    } = config;

    const tradeStake = calculateStake({ baseStake: stake, growthRate, cycle });
    const riskPerTrade = calculateRiskPerTrade({ accountBalance, riskPercent });
    const profitTarget = calculateProfitTarget({ stake: tradeStake, pct: profitTargetPercent });
    const lossLimit = calculateLossLimit({ stake: tradeStake, pct: lossLimitPercent });

    const upSideEntry = currentPrice;
    const upSideStopLoss = Number((upSideEntry * (1 - stopLossPercent / 100)).toFixed(4));
    const upSideTakeProfit = Number((upSideEntry * (1 + takeProfitPercent / 100)).toFixed(4));

    this.upSidePlan = buildExecutionPlan({
      stake: tradeStake,
      cycle,
      entryPrice: upSideEntry,
      stopLossPercent,
      takeProfitPercent,
      payoutMultiplier,
      riskPerTrade,
      profitTarget,
      lossLimit,
      maxDrawdownPercent,
      growthRate
    });

    this.upSidePlan.direction = 'UP';
    this.upSidePlan.type = 'CALL';
    this.upSidePlan.signal = 'Price expected to rise';
    this.upSidePlan.stopLossPrice = upSideStopLoss;
    this.upSidePlan.takeProfitPrice = upSideTakeProfit;

    const downSideEntry = currentPrice;
    const downSideStopLoss = Number((downSideEntry * (1 + stopLossPercent / 100)).toFixed(4));
    const downSideTakeProfit = Number((downSideEntry * (1 - takeProfitPercent / 100)).toFixed(4));

    this.downSidePlan = buildExecutionPlan({
      stake: tradeStake,
      cycle,
      entryPrice: downSideEntry,
      stopLossPercent,
      takeProfitPercent,
      payoutMultiplier,
      riskPerTrade,
      profitTarget,
      lossLimit,
      maxDrawdownPercent,
      growthRate
    });

    this.downSidePlan.stopLossPrice = downSideStopLoss;
    this.downSidePlan.takeProfitPrice = downSideTakeProfit;
    this.downSidePlan.direction = 'DOWN';
    this.downSidePlan.type = 'PUT';
    this.downSidePlan.signal = 'Price expected to fall';

    return this.comparePlans();
  }

  comparePlans() {
    if (!this.upSidePlan || !this.downSidePlan) {
      throw new Error('Both plans must be generated first');
    }

    const upSideScore = this.calculatePlanScore(this.upSidePlan);
    const downSideScore = this.calculatePlanScore(this.downSidePlan);

    const comparison = {
      upSide: { ...this.upSidePlan, score: upSideScore },
      downSide: { ...this.downSidePlan, score: downSideScore },
      recommendation: upSideScore > downSideScore ? 'UP' : 'DOWN',
      scoreGap: Math.abs(upSideScore - downSideScore).toFixed(3),
      rationale: this.generateRationale(upSideScore, downSideScore)
    };

    this.selectedSide = comparison.recommendation;
    return comparison;
  }

  calculatePlanScore(plan) {
    const riskRewardWeight = 0.4;
    const safetyWeight = 0.3;
    const profitWeight = 0.3;

    const riskRewardScore = Math.min(plan.riskReward * 10, 100);
    const safetyScore = plan.safe ? 100 : 50;
    const profitScore = (plan.profitTarget / plan.lossLimit) * 20;

    return (
      riskRewardScore * riskRewardWeight +
      safetyScore * safetyWeight +
      Math.min(profitScore, 100) * profitWeight
    );
  }

  generateRationale(upScore, downScore) {
    const difference = Math.abs(upScore - downScore);
    const favored = upScore > downScore ? 'UP' : 'DOWN';
    const strength = difference > 20 ? 'STRONG' : difference > 10 ? 'MODERATE' : 'WEAK';
    return `${strength} signal favoring ${favored} side (Score gap: ${difference.toFixed(2)} points)`;
  }

  executeRecommendedSide() {
    if (!this.selectedSide) {
      throw new Error('No recommendation available. Run comparePlans first.');
    }

    const selectedPlan = this.selectedSide === 'UP' ? this.upSidePlan : this.downSidePlan;

    return {
      ...selectedPlan,
      executedAt: new Date(),
      reason: `Auto-selected ${this.selectedSide} side based on risk/reward analysis`,
      symbol: 'EURUSD'
    };
  }

  executeBothSides(stakeAdjustment = 0.5) {
    return {
      strategy: 'Dual Side Hedge',
      upSideTrade: {
        ...this.upSidePlan,
        stake: (this.upSidePlan.stake * stakeAdjustment).toFixed(4),
        status: 'open',
        executedAt: new Date()
      },
      downSideTrade: {
        ...this.downSidePlan,
        stake: (this.downSidePlan.stake * stakeAdjustment).toFixed(4),
        status: 'open',
        executedAt: new Date()
      },
      totalStake: (this.upSidePlan.stake + this.downSidePlan.stake).toFixed(4),
      hedgeRatio: stakeAdjustment,
      description: 'Both sides open simultaneously for market neutral strategy'
    };
  }

  getSummary() {
    return {
      upSide: {
        direction: this.upSidePlan.direction,
        type: this.upSidePlan.type,
        entryPrice: this.upSidePlan.entryPrice,
        stopLossPrice: this.upSidePlan.stopLossPrice,
        takeProfitPrice: this.upSidePlan.takeProfitPrice,
        riskReward: `${this.upSidePlan.riskReward.toFixed(2)}x`,
        signal: this.upSidePlan.signal,
        stake: this.upSidePlan.stake.toFixed(4)
      },
      downSide: {
        direction: this.downSidePlan.direction,
        type: this.downSidePlan.type,
        entryPrice: this.downSidePlan.entryPrice,
        stopLossPrice: this.downSidePlan.stopLossPrice,
        takeProfitPrice: this.downSidePlan.takeProfitPrice,
        riskReward: `${this.downSidePlan.riskReward.toFixed(2)}x`,
        signal: this.downSidePlan.signal,
        stake: this.downSidePlan.stake.toFixed(4)
      },
      recommendation: this.selectedSide,
      timestamp: new Date()
    };
  }
}

module.exports = { DualSideExecutor };
