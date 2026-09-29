const express = require('express');
const path = require('path');
const { StrategyRunner } = require('../lib/strategyRunner');
const { DerivClient } = require('../derivClient');
const config = require('../../config/primacy.config');

const app = express();
const PORT = process.env.PORT || 3000;
const DERIV_MODE = process.env.DERIV_MODE || 'demo';

let tradeHistory = [];
let accountBalance = 1000;
let currentPlan = null;
let derivClient = null;

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

app.post('/api/connect', async (req, res) => {
  try {
    const { mode = DERIV_MODE } = req.body;

    if (mode === 'live') {
      if (!process.env.DERIV_TOKEN) {
        return res.status(400).json({
          error: 'DERIV_TOKEN not set. Get your token from https://app.deriv.com/account/api-token'
        });
      }

      derivClient = new DerivClient({
        appId: process.env.DERIV_APP_ID || 31019,
        token: process.env.DERIV_TOKEN,
        symbol: process.env.DERIV_SYMBOL || 'R_100',
        currency: process.env.DERIV_CURRENCY || 'USD',
        payoutMultiplier: config.payoutMultiplier,
        mode: 'live'
      });

      await derivClient.connect();
      const accountInfo = await derivClient.getAccountInfo();

      accountBalance = accountInfo.balance || 1000;

      res.json({
        status: 'connected',
        mode: 'live',
        balance: accountBalance,
        currency: accountInfo.currency,
        email: accountInfo.email
      });
    } else {
      res.json({
        status: 'connected',
        mode: 'demo',
        balance: accountBalance
      });
    }
  } catch (error) {
    console.error('[Server] Connection error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/balance', (req, res) => {
  res.json({ balance: accountBalance, mode: derivClient ? 'live' : 'demo' });
});

app.post('/api/plan', (req, res) => {
  try {
    const { StrategyRunner: SR } = require('../lib/strategyRunner');
    const { buildExecutionPlan } = require('../lib/executionCalculator');
    const { calculateStake, calculateProfitTarget, calculateLossLimit, calculateRiskPerTrade } =
      require('../lib/riskManager');

    const {
      stake = config.baseStake || 1,
      profitTargetPercent = config.profitTargetPercent || 20,
      lossLimitPercent = config.lossLimitPercent || 10,
      riskPercent = config.riskPercent || 2.5,
      growthRate = config.growthRate || 0.1,
      entryPrice = 1.1,
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
    console.error('[Server] Plan error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/decision', (req, res) => {
  try {
    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance } = req.body;

    const result = runner.buildDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    res.json(result);
  } catch (error) {
    console.error('[Server] Decision error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dual-side', (req, res) => {
  try {
    const {
      cycle = 1,
      currentPrice = 1.1,
      accountBalance: inputBalance = accountBalance,
      stake = config.baseStake || 1,
      profitTargetPercent = config.profitTargetPercent || 20,
      lossLimitPercent = config.lossLimitPercent || 10,
      riskPercent = config.riskPercent || 2.5,
      growthRate = config.growthRate || 0.1
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
    console.error('[Server] Dual-side error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-favored-side', async (req, res) => {
  try {
    if (!currentPlan) {
      return res.status(400).json({ error: 'No plan created. Call /api/plan first.' });
    }

    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance } = req.body;

    const analysis = runner.buildDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    const side = analysis.favoredSide;

    if (derivClient && derivClient.connected) {
      const tradeResult = await derivClient.executeTrade(currentPlan, side);

      tradeHistory.push(tradeResult);

      res.json({
        trade: tradeResult,
        analysis,
        mode: 'live',
        status: 'executed'
      });

      return;
    }

    const simulatedTrade = {
      symbol: 'EURUSD',
      side,
      stake: currentPlan.stake,
      entryPrice: currentPlan.entryPrice,
      stopLossPrice: currentPlan.stopLossPrice,
      takeProfitPrice: currentPlan.takeProfitPrice,
      riskReward: currentPlan.riskReward,
      timestamp: new Date().toISOString(),
      status: 'simulated',
      mode: 'demo'
    };

    tradeHistory.push(simulatedTrade);

    res.json({
      trade: simulatedTrade,
      analysis,
      mode: 'demo',
      status: 'simulated'
    });
  } catch (error) {
    console.error('[Server] Execute error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-hedge', async (req, res) => {
  try {
    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance } = req.body;

    runner.config.hedgeMode = true;

    const analysis = runner.buildDecision({
      cycle,
      currentPrice,
      accountBalance: inputBalance
    });

    const upTrade = currentPlan
      ? {
          symbol: 'EURUSD',
          side: 'UP',
          stake: Number((currentPlan.stake * 0.5).toFixed(4)),
          entryPrice: currentPlan.entryPrice,
          stopLossPrice: currentPlan.stopLossPrice,
          takeProfitPrice: currentPlan.takeProfitPrice,
          timestamp: new Date().toISOString()
        }
      : null;

    const downTrade = currentPlan
      ? {
          symbol: 'EURUSD',
          side: 'DOWN',
          stake: Number((currentPlan.stake * 0.5).toFixed(4)),
          entryPrice: currentPlan.entryPrice,
          stopLossPrice: currentPlan.stopLossPrice,
          takeProfitPrice: currentPlan.takeProfitPrice,
          timestamp: new Date().toISOString()
        }
      : null;

    if (derivClient && derivClient.connected && upTrade && downTrade) {
      const upResult = await derivClient.executeTrade(upTrade, 'UP');
      const downResult = await derivClient.executeTrade(downTrade, 'DOWN');

      tradeHistory.push(upResult);
      tradeHistory.push(downResult);

      res.json({
        trades: [upResult, downResult],
        analysis,
        mode: 'live',
        status: 'executed',
        strategy: 'hedge'
      });

      return;
    }

    const simulatedTrades = [upTrade, downTrade].filter(Boolean).map((t) => ({
      ...t,
      status: 'simulated',
      mode: 'demo'
    }));

    tradeHistory.push(...simulatedTrades);

    res.json({
      trades: simulatedTrades,
      analysis,
      mode: 'demo',
      status: 'simulated',
      strategy: 'hedge'
    });
  } catch (error) {
    console.error('[Server] Hedge error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades', (req, res) => {
  res.json({
    trades: tradeHistory,
    count: tradeHistory.length,
    mode: derivClient ? 'live' : 'demo'
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    ...config,
    mode: derivClient ? 'live' : 'demo',
    connected: derivClient ? derivClient.connected : false
  });
});

app.post('/api/disconnect', (req, res) => {
  if (derivClient) {
    derivClient.disconnect();
    derivClient = null;
  }
  res.json({ status: 'disconnected' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Primacy Dashboard running on http://localhost:${PORT}`);
  console.log(`📊 Mode: ${DERIV_MODE}`);
  console.log(`🎯 Ready for execution\n`);
});

module.exports = app;
