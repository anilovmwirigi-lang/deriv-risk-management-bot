class DerivClient {
  constructor({ symbol, payoutMultiplier }) {
    this.symbol = symbol;
    this.payoutMultiplier = payoutMultiplier;
    this.connected = false;
    this.tradeHistory = [];
  }

  connect() {
    this.connected = true;
    console.log(`[Deriv] Connected to market: ${this.symbol}`);
    return this;
  }

  getMarketPrice() {
    return Number((1.1000 + Math.random() * 0.02).toFixed(4));
  }

  executeTrade(plan) {
    if (!this.connected) {
      throw new Error('Deriv client is not connected');
    }

    const marketPrice = this.getMarketPrice();
    const result = {
      symbol: this.symbol,
      stake: plan.stake,
      marketPrice,
      entryPrice: plan.entryPrice,
      stopLossPrice: plan.stopLossPrice,
      takeProfitPrice: plan.takeProfitPrice,
      risk: plan.risk,
      reward: plan.reward,
      payoutMultiplier: this.payoutMultiplier,
      status: 'simulated'
    };

    this.tradeHistory.push(result);
    console.log('[Deriv] Order prepared:', JSON.stringify(result, null, 2));
    return result;
  }
}

module.exports = {
  DerivClient
};
