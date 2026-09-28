const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateStake, calculateProfitTarget, calculateLossLimit, calculateRiskPerTrade } = require('../src/lib/riskManager');
const { buildExecutionPlan } = require('../src/lib/executionCalculator');

test('stake grows by 10%', () => {
  const stake = calculateStake({ baseStake: 1, growthRate: 0.10, cycle: 3 });
  assert.equal(stake, 1.21);
});

test('profit target is calculated properly', () => {
  const target = calculateProfitTarget({ stake: 10, pct: 20 });
  assert.equal(target, 2);
});

test('loss limit is calculated properly', () => {
  const limit = calculateLossLimit({ stake: 10, pct: 10 });
  assert.equal(limit, 1);
});

test('risk per trade respects account balance', () => {
  const risk = calculateRiskPerTrade({ accountBalance: 100, riskPercent: 2.5 });
  assert.equal(risk, 2.5);
});

test('execution plan calculates stop and take-profit prices', () => {
  const execution = buildExecutionPlan({
    stake: 10,
    cycle: 1,
    entryPrice: 1.1000,
    stopLossPercent: 1.5,
    takeProfitPercent: 2.5,
    payoutMultiplier: 1.8,
    riskPerTrade: 2.5,
    profitTarget: 2,
    lossLimit: 1,
    maxDrawdownPercent: 12,
    growthRate: 0.10
  });

  assert.equal(execution.stopLossPrice, 1.0835);
  assert.equal(execution.takeProfitPrice, 1.1275);
  assert.equal(execution.safe, true);
});
