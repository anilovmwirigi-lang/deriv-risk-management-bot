const express = require('express');
const path = require('path');
const { StrategyRunner } = require('../lib/strategyRunner');
const { buildExecutionPlan } = require('../lib/executionCalculator');
const {
  calculateStake,
  calculateProfitTarget,
  calculateLossLimit,
  calculateRiskPerTrade
} = require('../lib/riskManager');
const config = require('../../config/primacy.config');

const app = express();
const PORT = process.env.PORT || 3000;

let accountBalance = 1000;
let tradeHistory = [];
let currentPlan = null;

const runner = new StrategyRunner({
  initialStake: config.baseStake || 1,
  growthRate: config.growthRate || 0.10,
  riskPercent: config.riskPercent || 2.5,
  profitTargetPercent: config.profitTargetPercent || 20,
  lossLimitPercent: config.lossLimitPercent || 10,
  maxDrawdownPercent: config.maxDrawdownPercent || 12,
  hedgeMode: false,
  autoExecuteFavoredSide: true,
  stopLossPercent: config.stopLossPercent || 1.5,
  takeProfitPercent: config.takeProfitPercent || 2.5,
  payoutMultiplier: config.payoutMultiplier || 1.8
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/connect', (req, res) => {
  const { mode = 'demo' } = req.body;
  res.json({ status: 'connected', mode, balance: accountBalance });
});

app.get('/api/balance', (req, res) => {
  res.json({ balance: accountBalance });
});

app.post('/api/plan', (req, res) => {
  try {
    const {
      stake = config.baseStake || 1,
      profitTargetPercent = config.profitTargetPercent || 20,
      lossLimitPercent = config.lossLimitPercent || 10,
      riskPercent = config.riskPercent || 2.5,
      growthRate = config.growthRate || 0.10,
      entryPrice = 1.1000,
      cycle = 1
    } = req.body;

    const tradeStake = calculateStake({
      baseStake: stake,
      growthRate,
      cycle
    });

    const riskPerTrade = calculateRiskPerTrade({
      accountBalance: tradeStake * 100,
      riskPercent
    });

    const profitTarget = calculateProfitTarget({
      stake: tradeStake,
      pct: profitTargetPercent
    });

    const lossLimit = calculateLossLimit({
      stake: tradeStake,
      pct: lossLimitPercent
    });

    currentPlan = buildExecutionPlan({
      stake: tradeStake,
      cycle,
      entryPrice,
      stopLossPercent: config.stopLossPercent || 1.5,
      takeProfitPercent: config.takeProfitPercent || 2.5,
      payoutMultiplier: config.payoutMultiplier || 1.8,
      riskPerTrade,
      profitTarget,
      lossLimit,
      maxDrawdownPercent: config.maxDrawdownPercent || 12,
      growthRate
    });

    res.json(currentPlan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/decision', (req, res) => {
  try {
    const {
      cycle = 1,
      currentPrice = 1.1000,
      accountBalance: inputBalance = accountBalance
    } = req.body;

    const result = runner.buildDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dual-side', (req, res) => {
  try {
    const {
      cycle = 1,
      currentPrice = 1.1000,
      accountBalance: inputBalance = accountBalance,
      stake = config.baseStake || 1,
      profitTargetPercent = config.profitTargetPercent || 20,
      lossLimitPercent = config.lossLimitPercent || 10,
      riskPercent = config.riskPercent || 2.5,
      growthRate = config.growthRate || 0.10
    } = req.body;

    runner.config.initialStake = stake;
    runner.config.profitTargetPercent = profitTargetPercent;
    runner.config.lossLimitPercent = lossLimitPercent;
    runner.config.riskPercent = riskPercent;
    runner.config.growthRate = growthRate;

    const result = runner.buildDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute', (req, res) => {
  try {
    if (!currentPlan) {
      return res.status(400).json({ error: 'No plan created. Call /api/plan first.' });
    }

    const trade = {
      symbol: 'EURUSD',
      stake: currentPlan.stake,
      entryPrice: currentPlan.entryPrice,
      stopLossPrice: currentPlan.stopLossPrice,
      takeProfitPrice: currentPlan.takeProfitPrice,
      risk: currentPlan.risk,
      reward: currentPlan.reward,
      riskReward: currentPlan.riskReward,
      timestamp: new Date().toISOString(),
      status: 'open'
    };

    tradeHistory.push(trade);
    res.json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-favored-side', (req, res) => {
  try {
    const {
      cycle = 1,
      currentPrice = 1.1000,
      accountBalance: inputBalance = accountBalance
    } = req.body;

    const execution = runner.executeDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    const tradeRecord = {
      ...execution.trade,
      symbol: 'EURUSD',
      status: 'executed',
      timestamp: new Date().toISOString(),
      type: 'FAVORED_SIDE'
    };

    tradeHistory.push(tradeRecord);
    res.json({ ...execution, tradeRecord });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-hedge', (req, res) => {
  try {
    runner.config.hedgeMode = true;

    const {
      cycle = 1,
      currentPrice = 1.1000,
      accountBalance: inputBalance = accountBalance
    } = req.body;

    const execution = runner.executeDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    const tradeRecord = {
      ...execution.trade,
      symbol: 'EURUSD',
      status: 'executed',
      timestamp: new Date().toISOString(),
      type: 'HEDGE'
    };

    tradeHistory.push(tradeRecord);
    res.json({ ...execution, tradeRecord });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades', (req, res) => {
  res.json({ trades: tradeHistory });
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Primacy dashboard running at http://localhost:${PORT}`);
  console.log(`📊 Open: http://localhost:${PORT}`);
  console.log(`🎯 Dual-side analysis + favored-side execution enabled\n`);
});

module.exports = app;
