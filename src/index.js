const config = require('../config/primacy.config');
const { calculateStake, calculateProfitTarget, calculateLossLimit, calculateRiskPerTrade } = require('./lib/riskManager');
const { buildExecutionPlan } = require('./lib/executionCalculator');
const { DerivClient } = require('./derivClient');

function parseArgs(argv) {
  const values = {
    stake: null,
    profit: null,
    loss: null,
    risk: null,
    growth: null,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    symbol: 'EURUSD'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      values[key] = Number(next);
      i += 1;
    }
  }

  return values;
}

function printDashboard(plan, userSettings) {
  console.log('\n=== PRIMACY DASHBOARD ===');
  console.log(`Bot: ${config.botName}`);
  console.log(`Symbol: ${userSettings.symbol}`);
  console.log(`Cycle: ${plan.cycle}`);
  console.log(`Stake: ${plan.stake}`);
  console.log(`Risk per trade: ${plan.riskPerTrade}`);
  console.log(`Profit target: ${plan.profitTarget}`);
  console.log(`Loss limit: ${plan.lossLimit}`);
  console.log(`Entry price: ${plan.entryPrice}`);
  console.log(`Stop-loss price: ${plan.stopLossPrice}`);
  console.log(`Take-profit price: ${plan.takeProfitPrice}`);
  console.log(`Risk/reward ratio: ${plan.riskReward.toFixed(2)}x`);
  console.log(`maxDrawdown: ${plan.maxDrawdown}`);
  console.log('========================\n');
}

function main() {
  const cli = parseArgs(process.argv.slice(2));

  const userSettings = {
    symbol: cli.symbol || 'EURUSD',
    stake: cli.stake || config.baseStake,
    profitTargetPercent: cli.profit || config.profitTargetPercent,
    lossLimitPercent: cli.loss || config.lossLimitPercent,
    riskPercent: cli.risk || config.riskPercent,
    growthRate: cli.growth ? cli.growth / 100 : config.growthRate,
    entryPrice: cli.entry || 1.1000,
    stopLossPercent: config.stopLossPercent,
    takeProfitPercent: config.takeProfitPercent
  };

  const cycle = 1;
  const tradeStake = calculateStake({
    baseStake: userSettings.stake,
    growthRate: userSettings.growthRate,
    cycle
  });

  const riskPerTrade = calculateRiskPerTrade({
    accountBalance: tradeStake * 100,
    riskPercent: userSettings.riskPercent
  });

  const profitTarget = calculateProfitTarget({
    stake: tradeStake,
    pct: userSettings.profitTargetPercent
  });

  const lossLimit = calculateLossLimit({
    stake: tradeStake,
    pct: userSettings.lossLimitPercent
  });

  const plan = buildExecutionPlan({
    stake: tradeStake,
    cycle,
    entryPrice: userSettings.entryPrice,
    stopLossPercent: userSettings.stopLossPercent,
    takeProfitPercent: userSettings.takeProfitPercent,
    payoutMultiplier: config.payoutMultiplier,
    riskPerTrade,
    profitTarget,
    lossLimit,
    maxDrawdownPercent: config.maxDrawdownPercent,
    growthRate: userSettings.growthRate
  });

  printDashboard(plan, userSettings);

  const client = new DerivClient({
    symbol: userSettings.symbol,
    payoutMultiplier: config.payoutMultiplier
  });

  client.connect();
  client.executeTrade(plan);
}

main();
