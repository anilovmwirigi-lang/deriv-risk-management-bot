const express = require('express');
const path = require('path');
const { DualSideExecutor } = require('../lib/dualSideExecutor');
const { buildExecutionPlan } = require('../lib/executionCalculator');
const {
  calculateStake,
  calculateProfitTarget,
  calculateLossLimit,
  calculateRiskPerTrade
} = require('../lib/riskManager');
const config = require('../../config/primacy.config');

const app = express();
const PORT = process.env.BOT_PORT || 3000;

let accountBalance = 1000;
let tradeHistory = [];
let currentPlan = null;
let dualExecutor = new DualSideExecutor();

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
      stake = config.baseStake,
      profitTargetPercent = config.profitTargetPercent,
      lossLimitPercent = config.lossLimitPercent,
      riskPercent = config.riskPercent,
      growthRate = config.growthRate,
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
      stopLossPercent: config.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent,
      payoutMultiplier: config.payoutMultiplier,
      riskPerTrade,
      profitTarget,
      lossLimit,
      maxDrawdownPercent: config.maxDrawdownPercent,
      growthRate
    });

    res.json(currentPlan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dual-side', (req, res) => {
  try {
    const {
      stake = config.baseStake,
      profitTargetPercent = config.profitTargetPercent,
      lossLimitPercent = config.lossLimitPercent,
      riskPercent = config.riskPercent,
      growthRate = config.growthRate,
      currentPrice = 1.1000,
      cycle = 1
    } = req.body;

    dualExecutor = new DualSideExecutor();

    const result = dualExecutor.generateDualPlans(cycle, currentPrice, accountBalance, {
      stake,
      profitTargetPercent,
      lossLimitPercent,
      riskPercent,
      growthRate,
      stopLossPercent: config.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent,
      payoutMultiplier: config.payoutMultiplier,
      maxDrawdownPercent: config.maxDrawdownPercent
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-favored-side', (req, res) => {
  try {
    if (!dualExecutor.selectedSide) {
      return res.status(400).json({ error: 'No favored side. Run /api/dual-side first.' });
    }

    const trade = dualExecutor.executeRecommendedSide();
    tradeHistory.push({
      ...trade,
      symbol: 'EURUSD',
      status: 'favored-side-open',
      timestamp: new Date()
    });

    res.json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute', (req, res) => {
  try {
    if (!currentPlan) {
      return res.status(400).json({ error: 'No plan created' });
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
      timestamp: new Date(),
      status: 'open'
    };

    tradeHistory.push(trade);
    res.json(trade);
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
  console.log(`\n🚀 Primacy Dashboard running at http://localhost:${PORT}`);
  console.log(`📊 Open your browser and navigate to http://localhost:${PORT}`);
  console.log(`🎯 Dual Side Executor: ENABLED\n`);
});

module.exports = app;
