// Utility functions for analyzing Ethereum transactions

export interface TransactionAnalysis {
  risk: 'low' | 'medium' | 'high'
  warnings: string[]
  details: {
    isContractInteraction: boolean
    estimatedGasUSD?: number
    functionName?: string
    tokenTransfer?: {
      token: string
      amount: string
      recipient: string
    }
  }
}

// Known malicious addresses (example list - should be maintained)
const KNOWN_MALICIOUS_ADDRESSES = [
  // Add known phishing/scam addresses here
]

// Known token contracts
const KNOWN_TOKENS: { [key: string]: string } = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  // Add more token addresses
}

// Analyze transaction for risks and important details
export function analyzeTransaction(method: string, params: any[]): TransactionAnalysis {
  const warnings: string[] = []
  let risk: 'low' | 'medium' | 'high' = 'low'
  const details: TransactionAnalysis['details'] = {
    isContractInteraction: false
  }

  // Check for eth_sendTransaction
  if (method === 'eth_sendTransaction' && params[0]) {
    const tx = params[0]

    // Check if sending to a contract (has data field)
    if (tx.data && tx.data !== '0x') {
      details.isContractInteraction = true
      
      // Try to decode function signature
      if (tx.data.length >= 10) {
        const functionSig = tx.data.slice(0, 10)
        details.functionName = decodeFunctionSignature(functionSig)
        
        // Check for common risky functions
        if (isRiskyFunction(functionSig)) {
          warnings.push('⚠️ Interacting with potentially risky function')
          risk = 'medium'
        }
      }
    }

    // Check if recipient is malicious
    if (tx.to && KNOWN_MALICIOUS_ADDRESSES.includes(tx.to.toLowerCase())) {
      warnings.push('🚨 DANGER: Known malicious address!')
      risk = 'high'
    }

    // Check for high value transfers
    if (tx.value) {
      const valueInEth = parseInt(tx.value, 16) / 1e18
      if (valueInEth > 1) {
        warnings.push(`⚠️ High value transfer: ${valueInEth.toFixed(4)} ETH`)
        risk = risk === 'low' ? 'medium' : risk
      }
    }

    // Check gas settings
    if (tx.maxFeePerGas || tx.gasPrice) {
      const gasPrice = tx.maxFeePerGas || tx.gasPrice
      const gasPriceGwei = parseInt(gasPrice, 16) / 1e9
      if (gasPriceGwei > 200) {
        warnings.push(`⚠️ Very high gas price: ${gasPriceGwei.toFixed(2)} Gwei`)
      }
    }

    // Check if it's a token transfer
    if (details.isContractInteraction && tx.data.startsWith('0xa9059cbb')) {
      // transfer(address,uint256) function signature
      const recipient = '0x' + tx.data.slice(34, 74)
      const amount = tx.data.slice(74, 138)
      details.tokenTransfer = {
        token: KNOWN_TOKENS[tx.to?.toLowerCase()] || 'Unknown Token',
        amount: amount,
        recipient: recipient
      }
    }
  }

  // Check for signing operations
  if (method.includes('sign')) {
    warnings.push('📝 Signing operation - verify the message carefully')
    
    if (method === 'eth_signTypedData_v4') {
      risk = 'medium'
      warnings.push('⚠️ Complex signature request - review all fields')
    }
  }

  // Check for wallet configuration changes
  if (method.includes('wallet_')) {
    if (method === 'wallet_addEthereumChain') {
      warnings.push('🔗 Adding new network - verify chain parameters')
      risk = 'medium'
    }
    if (method === 'wallet_switchEthereumChain') {
      warnings.push('🔄 Switching network')
    }
  }

  return {
    risk,
    warnings,
    details
  }
}

// Decode common function signatures
function decodeFunctionSignature(signature: string): string {
  const commonFunctions: { [key: string]: string } = {
    '0xa9059cbb': 'transfer',
    '0x095ea7b3': 'approve',
    '0x23b872dd': 'transferFrom',
    '0x39509351': 'increaseAllowance',
    '0xa457c2d7': 'decreaseAllowance',
    '0x70a08231': 'balanceOf',
    '0xdd62ed3e': 'allowance',
    '0x06fdde03': 'name',
    '0x95d89b41': 'symbol',
    '0x313ce567': 'decimals',
    '0x18160ddd': 'totalSupply',
    '0x40c10f19': 'mint',
    '0x42966c68': 'burn',
    '0xa0712d68': 'mint',
    '0x6a627842': 'mint',
    '0xd505accf': 'permit',
    // Uniswap functions
    '0x7ff36ab5': 'swapExactETHForTokens',
    '0x18cbafe5': 'swapExactTokensForETH',
    '0x38ed1739': 'swapExactTokensForTokens',
    '0xfb3bdb41': 'swapETHForExactTokens',
    '0x4a25d94a': 'swapTokensForExactETH',
    '0x8803dbee': 'swapTokensForExactTokens',
    // OpenSea functions
    '0xfb0f3ee1': 'fulfillBasicOrder',
    '0x00000000': 'fulfillOrder',
    // Common DeFi functions
    '0xe8e33700': 'addLiquidity',
    '0xf305d719': 'addLiquidityETH',
    '0xbaa2abde': 'removeLiquidity',
    '0x02751cec': 'removeLiquidityETH',
    '0xaf2979eb': 'removeLiquidityETHSupportingFeeOnTransferTokens',
    '0x5c11d795': 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
  }

  return commonFunctions[signature] || `Unknown (${signature})`
}

// Check if function is potentially risky
function isRiskyFunction(signature: string): boolean {
  const riskyFunctions = [
    '0x095ea7b3', // approve - giving spending permission
    '0x39509351', // increaseAllowance
    '0xd505accf', // permit - gasless approval
    '0x40c10f19', // mint - creating new tokens
    '0x42966c68', // burn - destroying tokens
  ]

  return riskyFunctions.includes(signature)
}

// Format wei to ETH with proper decimals
export function formatWeiToEth(weiValue: string | number): string {
  try {
    const wei = typeof weiValue === 'string' ? parseInt(weiValue, 16) : weiValue
    const eth = wei / 1e18
    
    if (eth < 0.0001) {
      return `${(wei / 1e9).toFixed(2)} Gwei`
    } else if (eth < 1) {
      return `${eth.toFixed(6)} ETH`
    } else {
      return `${eth.toFixed(4)} ETH`
    }
  } catch {
    return 'Invalid value'
  }
}

// Format address for display
export function formatAddress(address: string, length: number = 10): string {
  if (!address || address.length < 42) return address
  return `${address.slice(0, length)}...${address.slice(-length + 2)}`
}

// Validate Ethereum address
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

// Parse and decode transaction data
export function decodeTransactionData(data: string): {
  method: string
  params: string[]
} | null {
  if (!data || data === '0x' || data.length < 10) {
    return null
  }

  try {
    const method = data.slice(0, 10)
    const params = []
    
    // Simple parameter extraction (32 bytes each)
    let remaining = data.slice(10)
    while (remaining.length >= 64) {
      params.push('0x' + remaining.slice(0, 64))
      remaining = remaining.slice(64)
    }

    return {
      method: decodeFunctionSignature(method),
      params
    }
  } catch {
    return null
  }
}

// Get chain name from chain ID
export function getChainName(chainId: string | number): string {
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 16) : chainId
  
  const chains: { [key: number]: string } = {
    1: 'Ethereum Mainnet',
    3: 'Ropsten Testnet',
    4: 'Rinkeby Testnet',
    5: 'Goerli Testnet',
    11155111: 'Sepolia Testnet',
    10: 'Optimism',
    42161: 'Arbitrum One',
    137: 'Polygon',
    56: 'Binance Smart Chain',
    43114: 'Avalanche',
    250: 'Fantom',
    25: 'Cronos',
    1284: 'Moonbeam',
    1285: 'Moonriver',
    42220: 'Celo',
    1313161554: 'Aurora',
    1666600000: 'Harmony',
    8453: 'Base',
    324: 'zkSync Era',
    1101: 'Polygon zkEVM',
    534352: 'Scroll',
  }

  return chains[chainIdNum] || `Chain ID: ${chainIdNum}`
}

// Estimate transaction cost in USD (simplified)
export async function estimateTransactionCost(
  gasLimit: string | number,
  gasPrice: string | number,
  ethPriceUSD: number = 2000 // Default ETH price, should be fetched from API
): Promise<number> {
  try {
    const gas = typeof gasLimit === 'string' ? parseInt(gasLimit, 16) : gasLimit
    const price = typeof gasPrice === 'string' ? parseInt(gasPrice, 16) : gasPrice
    
    const costInEth = (gas * price) / 1e18
    return costInEth * ethPriceUSD
  } catch {
    return 0
  }
}
