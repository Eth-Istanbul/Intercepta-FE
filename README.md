# ⚔️ Praetor - Ethereum Transaction Guardian

Hackathon-built browser extension that intercepts, analyzes, and protects your Ethereum transactions with AI-powered insights.

> Note: This is a hackathon prototype. Expect rough edges and rapid iteration. Not financial advice.

## ✨ Features

- 🛡️ **Transaction Interception**: Catch Ethereum transactions before they reach your wallet
- 🤖 **AI-Powered Analysis**: Intelligent insights about transaction risks and purposes
- 🎯 **Smart Filtering**: Filter and search through intercepted calls and history
- ⚡ **Real-time Monitoring**: Auto-refresh and live tracking of contract interactions
- 🎨 **Modern UI**: Responsive interface built with Tailwind CSS
- 🔒 **Security First**: Review and approve transactions before execution

## 🏁 Hackathon Context

- **Built for**: Rapid prototype during a Web3/AI hackathon
- **Focus**: Protect users from risky or malicious Ethereum interactions by adding an explainable AI layer before wallet confirmation
- **Scope**: Working MVP showcasing interception, analysis, and an approval workflow
- **What’s missing**: Extended chain support, deeper on-chain heuristics, and broad wallet/provider coverage

## 🚀 Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Building

```bash
# Build for production
pnpm build

# Package extension
pnpm package
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `build/chrome-mv3-dev` (for dev) or the packaged build directory

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Plasmo Framework (MV3)
- **AI Integration**: `utils/ai-analyzer.ts` via AI SDK
- **Analyzer**: `utils/transaction-analyzer.ts` for static and heuristic checks
- **Extension**: Chrome Manifest V3

## 🧠 How It Works

- **Content Scripts**: `contents/ethereum-intercept.ts` hooks into the Ethereum provider to observe RPC calls (e.g., `eth_sendTransaction`) and relays data via `contents/relay.ts`.
- **Background**: `background.ts` coordinates message passing and security logic.
- **Popup UI**: `popup.tsx` displays pending calls, risk insights, and an approval/reject flow.
- **AI Layer**: `utils/ai-analyzer.ts` enriches transactions with natural language explanations and risk indicators.
- **Static Analysis**: `utils/transaction-analyzer.ts` inspects parameters, origins, and methods to flag suspicious patterns.

## 📦 Installation

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm dev` for development
4. Load from `build/chrome-mv3-dev` in Chrome as an unpacked extension

## 🔐 Security Features

- Interception before wallet execution
- AI-powered risk assessment
- Manual approval/rejection workflow
- Detailed transaction parameter analysis
- Origin and method tracking

## 🎥 Demo

- Open any dApp and initiate a transaction or contract call
- The popup shows intercepted details, human-readable context, and a risk summary
- Approve or reject with a single click

## 🗺️ Roadmap (Post-Hackathon)

- Multi-chain support (L2s, EVM variants)
- Deeper on-chain heuristics (bytecode diffing, known-bad lists, sim-based checks)
- Wallet integrations beyond generic provider interception
- Exportable reports and shareable risk profiles
- Opt-in telemetry for improving models (privacy-preserving)

## ⚠️ Limitations

- Prototype-level reliability; some providers or dApps may bypass interception
- AI explanations can be incomplete or incorrect; always verify on-chain
- No guarantee against loss; use at your own risk

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License — Feel free to use this project for personal and commercial purposes.

---

**Praetor** — *Your trusted guardian in the Web3 realm*