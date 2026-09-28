# Primacy

Primacy is a practical Deriv-focused risk-management bot with configurable stake, profit targets, loss limits, execution planning, and 10% growth-rate handling.

It is a tool for managing risk and exploring execution logic responsibly. It does not guarantee profits.

## Features

- Adjustable stake, profit target, and loss limit values
- 10% growth-rate cycle engine
- Risk-per-trade calculations
- Trade execution planning and validation
- Deriv-style API interface stub for integration
- Terminal dashboard and CLI configuration

## Start

```bash
npm install
npm start
```

## Custom values

```bash
node src/index.js --stake 5 --profit 20 --loss 10 --risk 2.5 --growth 10
```

## File structure

```text
config/
  primacy.config.js
src/
  index.js
  derivClient.js
  lib/
    riskManager.js
    executionCalculator.js
```

## Notes

This project is designed for educational and risk-management purposes. Use responsible money management, and verify broker rules before live trading.
