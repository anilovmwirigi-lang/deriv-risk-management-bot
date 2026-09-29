
# Primacy

Primacy is a **production-ready Deriv risk management bot** with:

- ✅ **Dual-side decision engine** (UP/DOWN analysis with scoring)
- ✅ **Favored-side execution** (automated trade placement)
- ✅ **Hedge mode** (simultaneous dual-side positions)
- ✅ **Live Deriv integration** (WebSocket API)
- ✅ **Demo & Live modes** (safe testing before real money)
- ✅ **Growth-rate cycle** engine for progressive stakes
- ✅ **Risk-per-trade** calculations and limits
- ✅ **Dashboard UI** with real-time trade history

**⚠️ Disclaimer**: This is a tool for **risk management and execution logic exploration**. It does **not guarantee profits**. Use responsible money management and verify broker rules before live trading.

---

## Installation

```bash
npm install
```

This installs:
- `express` (dashboard server)
- `ws` (Deriv WebSocket client)
- `dotenv` (environment config)

---

## Quick Start: Demo Mode

### Run the Dashboard (Browser UI)

```bash
npm run dashboard
```

Then open: **http://localhost:3000**

- Click **🔗 Connect Demo**
- Set parameters (Stake, Profit Target, Loss Limit, Growth Rate)
- Click **⇄ Analyze Both Sides** to see UP/DOWN scoring
- Click **✅ Execute Favored Side** to simulate a trade
- View results in **Trade History**

### Run from CLI (Demo)

```bash
node src/index.js --stake 1 --profit 20 --loss 10 --risk 2.5 --growth 10
```

Output:
```
=== PRIMACY DASHBOARD ===
Mode: demo
Bot: Primacy
Symbol: R_100
Cycle: 1
Stake: $1.00
Risk per trade: $0.25
Profit target: $0.20
Loss limit: $0.10
Entry price: 1.1000
Stop-loss price: 1.0835
Take-profit price: 1.1275
Risk/reward ratio: 1.67x
maxDrawdown: $0.1200
========================

📊 Dual-side Analysis:
   UP Score: 45.32
   DOWN Score: 41.88
   Recommendation: UP

📍 DEMO MODE: Trade simulated
   Symbol: R_100
   Side: UP
   Stake: $1.00

✅ Execution complete
```

---

## Live Trading: Get Your Deriv Token

1. **Go to**: https://app.deriv.com/account/api-token
2. **Create a token** (demo or live)
3. **Copy the token**

### Setup Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DERIV_APP_ID=31019
DERIV_TOKEN=your_token_here
DERIV_SYMBOL=R_100
DERIV_CURRENCY=USD
DERIV_MODE=demo
PORT=3000
```

### Run Dashboard in Live Mode

```bash
# Keep demo mode
DERIV_MODE=demo npm run dashboard

# Or switch to live
DERIV_MODE=live npm run dashboard
```

In the dashboard, click **🔗 Connect Demo** or use live mode credentials.

### Run CLI in Live Mode

```bash
# Demo (safe)
DERIV_MODE=demo node src/index.js --stake 1 --mode demo

# Live (⚠️ REAL MONEY)
DERIV_MODE=live DERIV_TOKEN=your_token node src/index.js --stake 1 --mode live
```

---

## Available Symbols

Common Deriv symbols:

| Symbol | Description |
|--------|-------------|
| `R_100` | Volatility Index 100 (synthetic) |
| `R_50` | Volatility Index 50 |
| `EURUSD` | EUR/USD forex pair |
| `GBPUSD` | GBP/USD forex pair |
| `AUDUSD` | AUD/USD forex pair |
| `USDJPY` | USD/JPY forex pair |

Set via:
```bash
DERIV_SYMBOL=EURUSD npm run dashboard
```

---

## Configuration

Edit `config/primacy.config.js`:

```javascript
module.exports = {
  botName: 'Primacy',
  baseStake: 1,                  // Starting stake (USD)
  growthRate: 0.10,              // 10% growth per cycle
  riskPercent: 2.5,              // Max 2.5% of balance per trade
  profitTargetPercent: 20,       // 20% profit target
  lossLimitPercent: 10,          // 10% loss limit
  maxDrawdownPercent: 12,        // 12% max drawdown allowed
  payoutMultiplier: 1.8,         // Deriv contract multiplier
  stopLossPercent: 1.5,          // 1.5% stop loss
  takeProfitPercent: 2.5,        // 2.5% take profit
  cycleLimit: 30,                // Max cycles before reset
  strategy: {
    name: 'balanced-growth',
    mode: 'manual-risk-control'
  }
};
```

---

## CLI Commands

### Demo Execution

```bash
node src/index.js \
  --stake 1 \
  --profit 20 \
  --loss 10 \
  --risk 2.5 \
  --growth 10 \
  --entry 1.1000 \
  --symbol R_100 \
  --mode demo
```

### Live Execution (⚠️ Real Money)

```bash
DERIV_TOKEN=your_token_here \
node src/index.js \
  --stake 1 \
  --profit 20 \
  --loss 10 \
  --risk 2.5 \
  --growth 10 \
  --mode live
```

---

## Dashboard API Routes

### `/api/connect`
Connect to Deriv (demo or live).

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"mode": "demo"}'
```

### `/api/balance`
Get current account balance.

```bash
curl http://localhost:3000/api/balance
```

### `/api/plan`
Generate execution plan.

```bash
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "stake": 1,
    "profitTargetPercent": 20,
    "lossLimitPercent": 10,
    "riskPercent": 2.5,
    "growthRate": 0.1,
    "entryPrice": 1.1000,
    "cycle": 1
  }'
```

### `/api/dual-side`
Analyze both UP and DOWN sides.

```bash
curl -X POST http://localhost:3000/api/dual-side \
  -H "Content-Type: application/json" \
  -d '{
    "cycle": 1,
    "currentPrice": 1.1000,
    "accountBalance": 1000
  }'
```

### `/api/execute-favored-side`
Execute the recommended side.

```bash
curl -X POST http://localhost:3000/api/execute-favored-side \
  -H "Content-Type: application/json" \
  -d '{"cycle": 1, "currentPrice": 1.1000}'
```

### `/api/execute-hedge`
Execute both sides simultaneously.

```bash
curl -X POST http://localhost:3000/api/execute-hedge \
  -H "Content-Type: application/json" \
  -d '{"cycle": 1, "currentPrice": 1.1000}'
```

### `/api/trades`
Get all trade history.

```bash
curl http://localhost:3000/api/trades
```

### `/api/config`
Get current config.

```bash
curl http://localhost:3000/api/config
```

---

## File Structure

```
.
├── config/
│   └── primacy.config.js         # Main configuration
├── src/
│   ├── index.js                  # CLI entry point
│   ├── derivClient.js            # Deriv WebSocket client (live integration)
│   ├── dashboard/
│   │   ├── server.js             # Express server
│   │   └── public/
│   │       └── index.html        # Dashboard UI
│   └── lib/
│       ├── riskManager.js        # Risk calculations
│       ├── executionCalculator.js # Execution plan builder
│       ├── strategyRunner.js     # Strategy orchestration
│       └── dualSideExecutor.js   # Dual-side logic
├── .env.example                  # Environment template
├── package.json
└── README.md
```

---

## How It Works

### 1. **Dual-Side Analysis**

Analyzes both UP (CALL) and DOWN (PUT) sides:

- Calculates stake for the cycle
- Computes risk/reward ratio
- Scores each side (risk, safety, profit potential)
- Recommends the favored side

### 2. **Favored-Side Execution**

Automatically executes only the recommended side:

- Creates a proposal with Deriv
- Executes the trade
- Records the result
- Updates balance and history

### 3. **Hedge Mode**

Executes both sides simultaneously:

- Splits stake 50/50 between UP and DOWN
- Creates market-neutral position
- Useful for testing or volatility trading

### 4. **Growth-Rate Cycle**

Progressive stake scaling:

```
Cycle 1: $1.00
Cycle 2: $1.10 (10% growth)
Cycle 3: $1.21
Cycle 4: $1.33
...
```

---

## Testing Checklist

### Before Live Trading

- [ ] Test in **demo mode** with several cycles
- [ ] Verify **profit/loss calculations** match expectations
- [ ] Review **trade history** for consistency
- [ ] Test **hedge mode** execution
- [ ] Confirm **risk limits** are respected
- [ ] Check **balance updates** after trades

### Live Trading Safety

1. **Start small** (min stake)
2. **Use demo token first** (required)
3. **Monitor first trade** carefully
4. **Review logs** for errors
5. **Set position limits** in config
6. **Never trade with money you can't afford to lose**

---

## Troubleshooting

### "DERIV_TOKEN is required"

```bash
# Get your token from: https://app.deriv.com/account/api-token
export DERIV_TOKEN=your_token_here
node src/index.js --mode live
```

### "WebSocket connection timeout"

- Check your internet connection
- Verify Deriv API is accessible
- Try again in a few seconds

### Trade execution fails

- Ensure your **balance** is sufficient
- Check the **symbol** is correct
- Verify **contract duration** is allowed

### Dashboard won't load

```bash
# Make sure server is running
npm run dashboard

# Check if port 3000 is in use
lsof -i :3000
```

---

## Notes

- **Educational Use**: This is designed for learning and risk management exploration
- **No Guarantees**: Past performance ≠ future results
- **Money Management**: Use appropriate position sizing
- **Broker Rules**: Verify all rules with your broker before live trading
- **Responsible Trading**: Set realistic expectations and stop-loss limits

---

## License

MIT

---

**Questions or feedback?** Open an issue on GitHub or contact the maintainer.

🚀 **Happy trading responsibly!**
