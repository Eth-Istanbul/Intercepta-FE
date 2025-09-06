import { useEffect, useState } from "react"
import { analyzeTransaction, formatWeiToEth, formatAddress } from "./utils/transaction-analyzer"
import "./style.css"

interface InterceptedTransaction {
  method: string
  params: any[]
  timestamp: number
  origin: string
  userAgent: string
  intercepted: boolean
}

function IndexPopup() {
  const [transactions, setTransactions] = useState<InterceptedTransaction[]>([])
  const [filter, setFilter] = useState<string>("")
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)

  // Load transactions from storage
  const loadTransactions = async () => {
    console.log("[Popup] Loading transactions...")
    
    // Try to get directly from chrome storage first
    chrome.storage.local.get(['intercepted_transactions'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error reading from storage:", chrome.runtime.lastError)
        // Fallback to message passing
        loadViaMessage()
      } else {
        const txs = result.intercepted_transactions || []
        console.log("[Popup] Loaded transactions from storage:", txs.length)
        setTransactions(txs.reverse()) // Show newest first
      }
    })
  }

  // Fallback to message passing
  const loadViaMessage = () => {
    chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error getting transactions via message:", chrome.runtime.lastError)
        setTransactions([])
      } else if (response?.transactions) {
        console.log("[Popup] Received transactions via message:", response.transactions.length)
        setTransactions(response.transactions.reverse()) // Show newest first
      } else {
        console.log("[Popup] No transactions in response")
        setTransactions([])
      }
    })
  }

  // Load transactions on mount and set up auto-refresh
  useEffect(() => {
    loadTransactions()

    if (autoRefresh) {
      const interval = setInterval(loadTransactions, 2000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Clear all transactions
  const clearTransactions = async () => {
    // Clear directly from chrome storage
    chrome.storage.local.remove(['intercepted_transactions'], () => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error clearing transactions:", chrome.runtime.lastError)
      } else {
        console.log("[Popup] Transactions cleared")
        setTransactions([])
        // Also update badge
        chrome.action.setBadgeText({ text: "" })
      }
    })
  }

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  // Format method name
  const formatMethod = (method: string) => {
    return method.replace('eth_', '').replace('_', ' ').toUpperCase()
  }

  // Get method color
  const getMethodColor = (method: string) => {
    if (method.includes('send')) return '#ef4444'
    if (method.includes('sign')) return '#f59e0b'
    if (method.includes('wallet')) return '#3b82f6'
    return '#6b7280'
  }

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => 
    filter === "" || 
    tx.method.toLowerCase().includes(filter.toLowerCase()) ||
    tx.origin.toLowerCase().includes(filter.toLowerCase())
  )

  // Format transaction params with analysis
  const formatParams = (method: string, params: any[]) => {
    if (!params || params.length === 0) return "No parameters"
    
    const analysis = analyzeTransaction(method, params)
    
    try {
      if (params[0] && typeof params[0] === 'object') {
        const txData = params[0]
        return (
          <div>
            {analysis.warnings.length > 0 && (
              <div className="warnings">
                {analysis.warnings.map((warning, idx) => (
                  <div key={idx} className="warning">{warning}</div>
                ))}
              </div>
            )}
            <div className="params-details">
              {txData.from && <div><strong>From:</strong> {formatAddress(txData.from)}</div>}
              {txData.to && <div><strong>To:</strong> {formatAddress(txData.to)}</div>}
              {txData.value && <div><strong>Value:</strong> {formatWeiToEth(txData.value)}</div>}
              {analysis.details.functionName && <div><strong>Function:</strong> {analysis.details.functionName}</div>}
              {analysis.details.tokenTransfer && (
                <div><strong>Token Transfer:</strong> {analysis.details.tokenTransfer.token}</div>
              )}
              {txData.data && txData.data !== '0x' && <div><strong>Data:</strong> {txData.data.slice(0, 20)}...</div>}
            </div>
          </div>
        )
      }
      return JSON.stringify(params, null, 2).slice(0, 100) + "..."
    } catch {
      return "Complex parameters"
    }
  }

  return (
    <div className="popup-container">
      <div className="header">
        <h2>🔒 Ethereum Transaction Interceptor</h2>
        <div className="header-controls">
          <label className="auto-refresh">
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadTransactions} className="btn-refresh">
            🔄 Refresh
          </button>
          <button onClick={clearTransactions} className="btn-clear">
            🗑️ Clear
          </button>
          <button onClick={() => {
            // Test button to verify system is working
            const testTransaction = {
              method: 'eth_sendTransaction',
              params: [{
                from: '0x1234567890123456789012345678901234567890',
                to: '0x0987654321098765432109876543210987654321',
                value: '0xde0b6b3a7640000', // 1 ETH
                data: '0x'
              }],
              timestamp: Date.now(),
              origin: 'Test from Popup',
              userAgent: 'Test',
              intercepted: true
            }
            chrome.runtime.sendMessage({
              type: 'TRANSACTION_INTERCEPTED',
              data: testTransaction
            }, (response) => {
              console.log("[Popup] Test transaction sent:", response)
              setTimeout(loadTransactions, 500)
            })
          }} className="btn-refresh">
            🧪 Test
          </button>
        </div>
      </div>

      <div className="filter-container">
        <input 
          type="text"
          placeholder="Filter by method or origin..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Total Intercepted:</span>
          <span className="stat-value">{transactions.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Showing:</span>
          <span className="stat-value">{filteredTransactions.length}</span>
        </div>
      </div>

      <div className="transactions-container">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions intercepted yet.</p>
            <p className="hint">Visit a DApp and interact with your wallet to see intercepted transactions.</p>
          </div>
        ) : (
          filteredTransactions.map((tx, index) => (
            <div key={`${tx.timestamp}-${index}`} className="transaction-card">
              <div className="transaction-header">
                <span 
                  className="method-badge"
                  style={{ backgroundColor: getMethodColor(tx.method) }}
                >
                  {formatMethod(tx.method)}
                </span>
                <span className="timestamp">{formatTime(tx.timestamp)}</span>
              </div>
              <div className="transaction-body">
                <div className="origin">
                  <strong>Origin:</strong> {tx.origin}
                </div>
                <div className="params">
                  <strong>Parameters:</strong>
                  {formatParams(tx.method, tx.params)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="footer">
        <p>Intercepting Ethereum transactions in real-time</p>
      </div>
    </div>
  )
}

export default IndexPopup