const config = require('../config/primacy.config');
const { calculateStake, calculateProfitTarget, calculateLossLimit, calculateRiskPerTrade } = require('./lib/riskManager');
const { buildExecutionPlan } = require('./lib/executionCalculator');
const { DerivClient } = require('./derivClient');
const { StrategyRunner } = require('./lib/strategyRunner');

function parseArgs(argv) {
  const values = {
    stake: null,
    profit: null,
    loss: null,
    risk: null,
    growth: null,
    entry: null,
    symbol: 'R_100',
    mode: 'demo'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      if (key === 'symbol' || key === 'mode') {
        values[key] = next;
      } else {
        values[key] = Number(next);
      }
      i += 1;
    }
  }

  return values;
}

function printDashboard(plan, userSettings, mode = 'demo') {
  console.log('\n=== PRIMACY DASHBOARD ===');
  console.log(`Mode: ${mode}`);
  console.log(`Bot: ${config.botName}`);
  console.log(`Symbol: ${userSettings.symbol}`);
  console.log(`Cycle: ${plan.cycle}`);
  console.log(`Stake: $${plan.stake}`);
  console.log(`Risk per trade: $${plan.riskPerTrade}`);
  console.log(`Profit target: $${plan.profitTarget}`);
  console.log(`Loss limit: $${plan.lossLimit}`);
  console.log(`Entry price: ${plan.entryPrice}`);
  console.log(`Stop-loss price: ${plan.stopLossPrice}`);
  console.log(`Take-profit price: ${plan.takeProfitPrice}`);
  console.log(`Risk/reward ratio: ${plan.riskReward.toFixed(2)}x`);
  console.log(`maxDrawdown: $${plan.maxDrawdown}`);
  console.log('========================\n');
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const userSettings = {
    symbol: cli.symbol || 'R_100',
    stake: cli.stake || config.baseStake,
    profitTargetPercent: cli.profit || config.profitTargetPercent,
    lossLimitPercent: cli.loss || config.lossLimitPercent,
    riskPercent: cli.risk || config.riskPercent,
    growthRate: cli.growth ? cli.growth / 100 : config.growthRate,
    entryPrice: cli.entry || 1.1,
    stopLossPercent: config.stopLossPercent,
    takeProfitPercent: config.takeProfitPercent,
    mode: cli.mode || 'demo'
  };

  let derivClient = null;

  if (userSettings.mode === 'live') {
    if (!process.env.DERIV_TOKEN) {
      console.error('❌ DERIV_TOKEN not set. Get your token from: https://app.deriv.com/account/api-token');
      console.error('   Then set: export DERIV_TOKEN=your_token_here');
      process.exit(1);
    }

    console.log('🔗 Connecting to live Deriv...');

    derivClient = new DerivClient({
      appId: process.env.DERIV_APP_ID || 31019,
      token: process.env.DERIV_TOKEN,
      symbol: userSettings.symbol,
      payoutMultiplier: config.payoutMultiplier,
      mode: 'live'
    });

    try {
      await derivClient.connect();
      const accountInfo = await derivClient.getAccountInfo();
      console.log(`✅ Connected to Deriv live account`);
      console.log(`   Account: ${accountInfo.email}`);
      console.log(`   Balance: ${accountInfo.currency} ${accountInfo.balance}\n`);
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      process.exit(1);
    }
  }

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

  printDashboard(plan, userSettings, userSettings.mode);

  const runner = new StrategyRunner({
    initialStake: userSettings.stake,
    growthRate: userSettings.growthRate,
    riskPercent: userSettings.riskPercent,
    profitTargetPercent: userSettings.profitTargetPercent,
    lossLimitPercent: userSettings.lossLimitPercent,
    maxDrawdownPercent: config.maxDrawdownPercent,
    stopLossPercent: userSettings.stopLossPercent,
    takeProfitPercent: userSettings.takeProfitPercent,
    payoutMultiplier: config.payoutMultiplier
  });

  const decision = runner.buildDecision({
    cycle,
    currentPrice: userSettings.entryPrice,
    accountBalance: 1000
  });

  console.log(`📊 Dual-side Analysis:`);
  console.log(`   UP Score: ${decision.upSide.score.toFixed(2)}`);
  console.log(`   DOWN Score: ${decision.downSide.score.toFixed(2)}`);
  console.log(`   Recommendation: ${decision.recommendation}\n`);

  if (userSettings.mode === 'live' && derivClient && derivClient.connected) {
    console.log('⚠️  LIVE MODE: About to execute real trade');
    console.log(`   Symbol: ${userSettings.symbol}`);
    console.log(`   Side: ${decision.recommendation}`);
    console.log(`   Stake: ${tradeStake}`);

    try {
      const result = await derivClient.executeTrade(plan, decision.recommendation);
      console.log('\n✅ Trade executed:');
      console.log(`   ID: ${result.id}`);
      console.log(`   Payout: ${result.payout}`);
      console.log(`   Status: ${result.status}\n`);

      derivClient.disconnect();
    } catch (error) {
      console.error('❌ Trade execution failed:', error.message);
      derivClient.disconnect();
      process.exit(1);
    }
  } else {
    console.log('📍 DEMO MODE: Trade simulated');
    console.log(`   Symbol: ${userSettings.symbol}`);
    console.log(`   Side: ${decision.recommendation}`);
    console.log(`   Stake: $${tradeStake}\n`);
  }

  console.log('✅ Execution complete\n');
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
