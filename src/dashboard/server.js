const express = require('express');
const path = require('path');
const { StrategyRunner } = require('../lib/strategyRunner');
const { DerivClient } = require('../derivClient');
const { getPreset, getPresets } = require('../lib/strategyPresets');
const { TradeJournal } = require('../lib/tradeJournal');
const config = require('../../config/primacy.config');

const app = express();
const PORT = process.env.PORT || 3000;
const DERIV_MODE = process.env.DERIV_MODE || 'demo';
const DEFAULT_SYMBOLS = ['R_100', 'R_50', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY'];
const journal = new TradeJournal();

let tradeHistory = [];
let accountBalance = 1000;
let currentPlan = null;
let derivClient = null;

const getRunner = (presetName = 'balanced', symbol = process.env.DERIV_SYMBOL || config.market || 'R_100') => {
  const preset = getPreset(presetName) || getPreset('balanced');
  return new StrategyRunner({
    initialStake: preset.baseStake || config.baseStake || 1,
    growthRate: preset.growthRate || config.growthRate || 0.10,
    riskPercent: preset.riskPercent || config.riskPercent || 2.5,
    profitTargetPercent: preset.profitTargetPercent || config.profitTargetPercent || 20,
    lossLimitPercent: preset.lossLimitPercent || config.lossLimitPercent || 10,
    maxDrawdownPercent: preset.maxDrawdownPercent || config.maxDrawdownPercent || 12,
    hedgeMode: false,
    autoExecuteFavoredSide: true,
    stopLossPercent: preset.stopLossPercent || config.stopLossPercent || 1.5,
    takeProfitPercent: preset.takeProfitPercent || config.takeProfitPercent || 2.5,
    payoutMultiplier: config.payoutMultiplier || 1.8,
    symbol
  });
};

let runner = getRunner();

const buildRiskSummary = (plan, balance = accountBalance) => {
  if (!plan) {
    return {
      safe: true,
      status: 'no_plan',
      riskPerTrade: 0,
      maxDrawdown: 0,
      lossLimit: 0,
      accountBalance: Number(balance || 0)
    };
  }

  return {
    safe: plan.safe !== false,
    status: plan.safe === false ? 'risk_limit_exceeded' : 'within_limits',
    riskPerTrade: Number(plan.riskPerTrade || 0),
    maxDrawdown: Number(plan.maxDrawdown || 0),
    lossLimit: Number(plan.lossLimit || 0),
    accountBalance: Number(balance || 0)
  };
};

const recordTrade = (trade) => {
  const entry = journal.addTrade({
    ...trade,
    pnl: Number(trade.pnl ?? 0),
    status: trade.status || 'simulated',
    mode: trade.mode || 'demo'
  });
  tradeHistory.push(entry);
  return entry;
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/connect', async (req, res) => {
  try {
    const { mode = DERIV_MODE, preset = 'balanced', symbol = process.env.DERIV_SYMBOL || config.market || 'R_100' } = req.body;
    runner = getRunner(preset, symbol);

    if (mode === 'live') {
      if (!process.env.DERIV_TOKEN) {
        return res.status(400).json({
          error: 'DERIV_TOKEN not set. Get your token from https://app.deriv.com/account/api-token'
        });
      }

      derivClient = new DerivClient({
        appId: process.env.DERIV_APP_ID || 31019,
        token: process.env.DERIV_TOKEN,
        symbol,
        currency: process.env.DERIV_CURRENCY || 'USD',
        payoutMultiplier: config.payoutMultiplier,
        mode: 'live'
      });

      await derivClient.connect();
      const accountInfo = await derivClient.getAccountInfo();
      accountBalance = accountInfo.balance || 1000;

      return res.json({
        status: 'connected',
        mode: 'live',
        balance: accountBalance,
        currency: accountInfo.currency,
        email: accountInfo.email,
        preset,
        symbol
      });
    }

    return res.json({ status: 'connected', mode: 'demo', balance: accountBalance, preset, symbol });
  } catch (error) {
    console.error('[Server] Connection error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/balance', (req, res) => {
  res.json({ balance: accountBalance, mode: derivClient ? 'live' : 'demo' });
});

app.get('/api/presets', (req, res) => {
  res.json({ presets: getPresets() });
});

app.get('/api/symbols', (req, res) => {
  res.json({ symbols: DEFAULT_SYMBOLS, active: process.env.DERIV_SYMBOL || config.market || 'R_100' });
});

app.get('/api/session-summary', (req, res) => {
  const summary = journal.getSessionSummary({ startBalance: 1000, currentBalance: accountBalance });
  res.json(summary);
});

app.get('/api/analytics', (req, res) => {
  const trades = journal.getTrades();
  const summary = journal.getSessionSummary({ startBalance: 1000, currentBalance: accountBalance });
  const risk = buildRiskSummary(currentPlan, accountBalance);

  res.json({
    trades,
    count: trades.length,
    summary,
    risk,
    preset: runner.config,
    mode: derivClient ? 'live' : 'demo'
  });
});

app.get('/api/trades/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
  res.send(journal.exportCsv());
});

app.post('/api/plan', (req, res) => {
  try {
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
      cycle = 1,
      preset = 'balanced',
      symbol = process.env.DERIV_SYMBOL || config.market || 'R_100'
    } = req.body;

    const selectedPreset = getPreset(preset) || getPreset('balanced');
    const activeStake = stake || selectedPreset.baseStake || config.baseStake || 1;
    const activeGrowth = growthRate || selectedPreset.growthRate || config.growthRate || 0.1;

    const tradeStake = calculateStake({ baseStake: activeStake, growthRate: activeGrowth, cycle });
    const riskPerTrade = calculateRiskPerTrade({ accountBalance: tradeStake * 100, riskPercent });
    const profitTarget = calculateProfitTarget({ stake: tradeStake, pct: profitTargetPercent });
    const lossLimit = calculateLossLimit({ stake: tradeStake, pct: lossLimitPercent });

    currentPlan = buildExecutionPlan({
      stake: tradeStake,
      cycle,
      entryPrice,
      stopLossPercent: selectedPreset.stopLossPercent || config.stopLossPercent || 1.5,
      takeProfitPercent: selectedPreset.takeProfitPercent || config.takeProfitPercent || 2.5,
      payoutMultiplier: config.payoutMultiplier || 1.8,
      riskPerTrade,
      profitTarget,
      lossLimit,
      maxDrawdownPercent: selectedPreset.maxDrawdownPercent || config.maxDrawdownPercent || 12,
      growthRate: activeGrowth
    });

    currentPlan.riskSummary = buildRiskSummary(currentPlan, accountBalance);
    currentPlan.symbol = symbol;
    currentPlan.preset = preset;
    res.json({ ...currentPlan, preset: selectedPreset.name || preset, symbol });
  } catch (error) {
    console.error('[Server] Plan error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/decision', (req, res) => {
  try {
    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance, preset = 'balanced' } = req.body;
    runner = getRunner(preset, process.env.DERIV_SYMBOL || config.market || 'R_100');

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
      growthRate = config.growthRate || 0.1,
      preset = 'balanced',
      symbol = process.env.DERIV_SYMBOL || config.market || 'R_100'
    } = req.body;

    const selectedPreset = getPreset(preset) || getPreset('balanced');
    runner = getRunner(preset, symbol);
    runner.config.initialStake = stake || selectedPreset.baseStake || config.baseStake || 1;
    runner.config.profitTargetPercent = profitTargetPercent || selectedPreset.profitTargetPercent || config.profitTargetPercent || 20;
    runner.config.lossLimitPercent = lossLimitPercent || selectedPreset.lossLimitPercent || config.lossLimitPercent || 10;
    runner.config.riskPercent = riskPercent || selectedPreset.riskPercent || config.riskPercent || 2.5;
    runner.config.growthRate = growthRate || selectedPreset.growthRate || config.growthRate || 0.1;

    const result = runner.buildDecision({ cycle, currentPrice, accountBalance: inputBalance });
    res.json(result);
  } catch (error) {
    console.error('[Server] Dual-side error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute', async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      ...body,
      currentPrice: body.currentPrice ?? 1.1,
      cycle: body.cycle ?? 1,
      accountBalance: body.accountBalance ?? accountBalance,
      preset: body.preset ?? 'balanced'
    };
    return app._router ? app._router.handle ? res.json({ status: 'redirected', redirect: '/api/execute-favored-side', payload }) : null : null;
  } catch (error) {
    console.error('[Server] Legacy execute error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-favored-side', async (req, res) => {
  try {
    if (!currentPlan) {
      return res.status(400).json({ error: 'No plan created. Call /api/plan first.' });
    }

    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance, preset = 'balanced' } = req.body;
    runner = getRunner(preset, process.env.DERIV_SYMBOL || config.market || 'R_100');

    const analysis = runner.buildDecision({ cycle, currentPrice, accountBalance: inputBalance });
    const side = analysis.favoredSide;

    if (analysis.riskGuard && analysis.riskGuard.safe === false) {
      return res.status(400).json({
        error: 'Risk limit exceeded. Reduce stake or adjust your preset before executing.',
        risk: analysis.riskGuard
      });
    }

    if (derivClient && derivClient.connected) {
      const tradeResult = await derivClient.executeTrade(currentPlan, side);
      const recorded = recordTrade({
        ...tradeResult,
        side,
        pnl: Number((tradeResult.profit || 0).toFixed(4)),
        status: 'executed',
        mode: 'live'
      });

      return res.json({ trade: recorded, analysis, mode: 'live', status: 'executed' });
    }

    const simulatedTrade = {
      symbol: currentPlan.symbol || 'EURUSD',
      side,
      stake: currentPlan.stake,
      entryPrice: currentPlan.entryPrice,
      stopLossPrice: currentPlan.stopLossPrice,
      takeProfitPrice: currentPlan.takeProfitPrice,
      riskReward: currentPlan.riskReward,
      timestamp: new Date().toISOString(),
      status: 'simulated',
      mode: 'demo',
      pnl: 0
    };

    const recorded = recordTrade(simulatedTrade);
    return res.json({ trade: recorded, analysis, mode: 'demo', status: 'simulated' });
  } catch (error) {
    console.error('[Server] Execute error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execute-hedge', async (req, res) => {
  try {
    const { cycle = 1, currentPrice = 1.1, accountBalance: inputBalance = accountBalance, preset = 'balanced' } = req.body;
    runner = getRunner(preset, process.env.DERIV_SYMBOL || config.market || 'R_100');
    runner.config.hedgeMode = true;

    const analysis = runner.buildDecision({ cycle, currentPrice, accountBalance: inputBalance });

    const upTrade = currentPlan ? {
      symbol: currentPlan.symbol || 'EURUSD',
      side: 'UP',
      stake: Number((currentPlan.stake * 0.5).toFixed(4)),
      entryPrice: currentPlan.entryPrice,
      stopLossPrice: currentPlan.stopLossPrice,
      takeProfitPrice: currentPlan.takeProfitPrice,
      timestamp: new Date().toISOString(),
      status: 'simulated',
      mode: 'demo',
      pnl: 0
    } : null;

    const downTrade = currentPlan ? {
      symbol: currentPlan.symbol || 'EURUSD',
      side: 'DOWN',
      stake: Number((currentPlan.stake * 0.5).toFixed(4)),
      entryPrice: currentPlan.entryPrice,
      stopLossPrice: currentPlan.stopLossPrice,
      takeProfitPrice: currentPlan.takeProfitPrice,
      timestamp: new Date().toISOString(),
      status: 'simulated',
      mode: 'demo',
      pnl: 0
    } : null;

    if (derivClient && derivClient.connected && upTrade && downTrade) {
      const upResult = await derivClient.executeTrade(upTrade, 'UP');
      const downResult = await derivClient.executeTrade(downTrade, 'DOWN');
      const a = recordTrade({ ...upResult, pnl: Number((upResult.profit || 0).toFixed(4)), status: 'executed', mode: 'live' });
      const b = recordTrade({ ...downResult, pnl: Number((downResult.profit || 0).toFixed(4)), status: 'executed', mode: 'live' });
      return res.json({ trades: [a, b], analysis, mode: 'live', status: 'executed', strategy: 'hedge' });
    }

    const simulatedTrades = [upTrade, downTrade].filter(Boolean).map((t) => recordTrade(t));
    return res.json({ trades: simulatedTrades, analysis, mode: 'demo', status: 'simulated', strategy: 'hedge' });
  } catch (error) {
    console.error('[Server] Hedge error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades', (req, res) => {
  const trades = journal.getTrades();
  res.json({
    trades,
    count: trades.length,
    mode: derivClient ? 'live' : 'demo'
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    ...config,
    mode: derivClient ? 'live' : 'demo',
    connected: derivClient ? derivClient.connected : false,
    presets: getPresets(),
    symbols: DEFAULT_SYMBOLS
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
