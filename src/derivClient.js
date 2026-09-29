const WebSocket = require('ws');
require('dotenv').config();

class DerivClient {
  constructor({
    appId = process.env.DERIV_APP_ID || 31019,
    token = process.env.DERIV_TOKEN,
    symbol = process.env.DERIV_SYMBOL || 'R_100',
    currency = process.env.DERIV_CURRENCY || 'USD',
    payoutMultiplier = 1.8,
    mode = process.env.DERIV_MODE || 'demo'
  } = {}) {
    this.appId = Number(appId);
    this.token = token;
    this.symbol = symbol;
    this.currency = currency;
    this.payoutMultiplier = payoutMultiplier;
    this.mode = mode;
    this.connected = false;
    this.ws = null;
    this.messageId = 1;
    this.tradeHistory = [];
    this.pending = new Map();
    this.marketPrice = null;
    this.accountInfo = null;
  }

  async connect() {
    if (!this.token) {
      throw new Error(
        'DERIV_TOKEN is required. Get your token from: https://app.deriv.com/account/api-token'
      );
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `wss://ws.deriv.com/websockets/v3?app_id=${this.appId}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[Deriv] WebSocket connected to', this.mode, 'mode');
        this.authorize()
          .then(() => {
            this.connected = true;
            console.log('[Deriv] Authorization successful');
            resolve(this);
          })
          .catch(reject);
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(msg);
        } catch (error) {
          console.error('[Deriv] Message parse error:', error.message);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[Deriv] WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[Deriv] WebSocket disconnected');
        this.connected = false;
      });

      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  async authorize() {
    return this.send({
      authorize: this.token
    });
  }

  async getAccountInfo() {
    const result = await this.send({
      get_account_status: 1
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to get account status');
    }

    this.accountInfo = result.get_account_status;
    return result.get_account_status;
  }

  async getMarketPrice() {
    if (!this.connected) {
      throw new Error('Not connected to Deriv');
    }

    const result = await this.send({
      ticks: this.symbol
    });

    if (result.error) {
      console.warn('[Deriv] Market price error:', result.error.message);
      return this.marketPrice || null;
    }

    if (result.tick) {
      this.marketPrice = Number(result.tick.quote);
      return this.marketPrice;
    }

    return this.marketPrice;
  }

  async createProposal({
    contractType = 'CALL',
    duration = 5,
    durationUnit = 'm',
    amount = 1,
    currency = this.currency
  } = {}) {
    if (!this.connected) {
      throw new Error('Not connected to Deriv');
    }

    const payload = {
      proposal: 1,
      amount,
      currency,
      contract_type: contractType,
      symbol: this.symbol,
      duration,
      duration_unit: durationUnit,
      basis: 'stake'
    };

    const result = await this.send(payload);

    if (result.error) {
      throw new Error(result.error.message || 'Proposal creation failed');
    }

    if (!result.proposal) {
      throw new Error('Invalid proposal response');
    }

    return result.proposal;
  }

  async buyContract({ proposalId, price = 1, currency = this.currency }) {
    if (!this.connected) {
      throw new Error('Not connected to Deriv');
    }

    const result = await this.send({
      buy: proposalId,
      price,
      currency
    });

    if (result.error) {
      throw new Error(result.error.message || 'Buy order failed');
    }

    return result.buy;
  }

  async executeTrade(plan, side = 'UP') {
    if (!this.connected || !this.ws) {
      throw new Error('Deriv client is not connected. Call connect() first.');
    }

    try {
      const contractType = side === 'UP' ? 'CALL' : 'PUT';
      const stake = Number(plan.stake || 1);

      console.log(`[Deriv] Executing ${side} trade with stake: ${stake}`);

      const proposal = await this.createProposal({
        contractType,
        amount: stake,
        duration: 5,
        durationUnit: 'm',
        currency: this.currency
      });

      console.log(`[Deriv] Proposal ${proposal.id} created, payout: ${proposal.payout}`);

      const buyResult = await this.buyContract({
        proposalId: proposal.id,
        price: stake,
        currency: this.currency
      });

      const currentPrice = await this.getMarketPrice();

      const tradeResult = {
        id: buyResult.transaction_id,
        symbol: this.symbol,
        side,
        contractType,
        stake,
        marketPrice: currentPrice || plan.entryPrice,
        entryPrice: plan.entryPrice,
        stopLossPrice: plan.stopLossPrice,
        takeProfitPrice: plan.takeProfitPrice,
        payoutMultiplier: this.payoutMultiplier,
        payout: buyResult.payout,
        profit: buyResult.payout - stake,
        status: 'executed',
        mode: this.mode,
        timestamp: new Date().toISOString()
      };

      this.tradeHistory.push(tradeResult);
      console.log('[Deriv] Trade executed:', JSON.stringify(tradeResult, null, 2));

      return tradeResult;
    } catch (error) {
      console.error('[Deriv] Trade execution failed:', error.message);
      throw error;
    }
  }

  async send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const messageId = this.messageId++;
    const request = { ...payload, req_id: messageId };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error(`Deriv request ${messageId} timed out`));
      }, 15000);

      this.pending.set(messageId, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(request), (error) => {
        if (error) {
          this.pending.delete(messageId);
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  handleMessage(msg) {
    const { error, req_id } = msg;

    if (!req_id || !this.pending.has(req_id)) {
      return;
    }

    const { resolve, reject, timeout } = this.pending.get(req_id);
    clearTimeout(timeout);
    this.pending.delete(req_id);

    if (error) {
      reject(new Error(error.message || 'Deriv error'));
      return;
    }

    resolve(msg);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.connected = false;
    console.log('[Deriv] Disconnected');
  }

  getTradeHistory() {
    return this.tradeHistory;
  }
}

module.exports = {
  DerivClient
};
