const fs = require('fs');
const path = require('path');

class TradeJournal {
  constructor({ filePath = path.join(process.cwd(), 'data', 'trades.json') } = {}) {
    this.filePath = filePath;
    this.trades = this.load();
  }

  ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]', 'utf8');
    }
  }

  load() {
    try {
      this.ensureDirectory();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  save() {
    this.ensureDirectory();
    fs.writeFileSync(this.filePath, JSON.stringify(this.trades, null, 2), 'utf8');
    return this.trades;
  }

  addTrade(trade) {
    const entry = {
      id: trade.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: trade.timestamp || new Date().toISOString(),
      ...trade
    };

    this.trades.push(entry);
    this.save();
    return entry;
  }

  getTrades() {
    return [...this.trades];
  }

  exportCsv() {
    if (!this.trades.length) {
      return 'id,timestamp,symbol,side,stake,entryPrice,stopLossPrice,takeProfitPrice,status,mode,pnl\n';
    }

    const header = ['id', 'timestamp', 'symbol', 'side', 'stake', 'entryPrice', 'stopLossPrice', 'takeProfitPrice', 'status', 'mode', 'pnl'];
    const rows = this.trades.map((trade) => [
      trade.id || '',
      trade.timestamp || '',
      trade.symbol || '',
      trade.side || '',
      trade.stake ?? '',
      trade.entryPrice ?? '',
      trade.stopLossPrice ?? '',
      trade.takeProfitPrice ?? '',
      trade.status || '',
      trade.mode || '',
      trade.pnl ?? ''
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));

    return [header.join(','), ...rows].join('\n');
  }

  getSessionSummary({ startBalance = 1000, currentBalance = startBalance } = {}) {
    const trades = this.trades;
    const wins = trades.filter((trade) => Number(trade.pnl || 0) > 0).length;
    const losses = trades.filter((trade) => Number(trade.pnl || 0) < 0).length;
    const totalPnl = trades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const totalTrades = trades.length;
    const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
    const avgPnl = totalTrades ? totalPnl / totalTrades : 0;
    const netBalance = Number(currentBalance || startBalance);

    return {
      startBalance: Number(startBalance),
      currentBalance: netBalance,
      totalTrades,
      wins,
      losses,
      totalPnl: Number(totalPnl.toFixed(4)),
      averagePnl: Number(avgPnl.toFixed(4)),
      winRate: Number(winRate.toFixed(2)),
      sessionDelta: Number((netBalance - Number(startBalance)).toFixed(4))
    };
  }
}

module.exports = { TradeJournal };
