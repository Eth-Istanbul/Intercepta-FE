import { useEffect, useState } from "react"
import { analyzeTransaction, formatWeiToEth, formatAddress } from "./utils/transaction-analyzer"
import { fetchAITransactionAnalysis } from "./utils/ai-analyzer"
import "./style.css"

interface InterceptedTransaction {
  id?: string
  method: string
  params: any[]
  timestamp: number
  origin: string
  userAgent: string
  intercepted: boolean
  status?: 'pending' | 'approved' | 'rejected'
  tabId?: number
}

function IndexPopup() {
  const [transactions, setTransactions] = useState<InterceptedTransaction[]>([])
  const [pendingTransactions, setPendingTransactions] = useState<InterceptedTransaction[]>([])
  const [filter, setFilter] = useState<string>("")
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [aiSummaries, setAiSummaries] = useState<Record<string, { text: string; loading: boolean; error?: string }>>({})

  // Load all transactions from storage
  const loadTransactions = async () => {
    console.log("[Popup] Loading transactions...")
    
    // Load both pending and history transactions
    chrome.storage.local.get(['intercepted_transactions', 'pending_transactions'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error reading from storage:", chrome.runtime.lastError)
        // Fallback to message passing
        loadViaMessage()
      } else {
        const history = result.intercepted_transactions || []
        const pending = result.pending_transactions || []
        console.log("[Popup] Loaded transactions - History:", history.length, "Pending:", pending.length)
        setTransactions(history.reverse()) // Show newest first
        setPendingTransactions(pending.reverse()) // Show newest first
        
        // If there are pending transactions, switch to pending tab
        if (pending.length > 0) {
          setActiveTab('pending')
          // Fetch AI analysis for pending transactions
          pending.forEach(tx => {
            if (tx.id && tx.method === 'eth_sendTransaction' && tx.params?.[0]) {
              fetchAIAnalysisForTransaction(tx)
            }
          })
        }
      }
    })
  }

  // Fetch AI analysis for a transaction
  const fetchAIAnalysisForTransaction = async (tx: InterceptedTransaction) => {
    if (!tx.id || !tx.params?.[0]) return
    
    const txData = tx.params[0]
    const transactionId = tx.id
    
    // Set loading state
    setAiSummaries(prev => ({
      ...prev,
      [transactionId]: { text: '', loading: true }
    }))
    
    try {
      let accumulatedText = ''
      
      await fetchAITransactionAnalysis({
        from: txData.from,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        gas: txData.gas,
        gasPrice: txData.gasPrice
      }, {
        onChunk: (chunk) => {
          accumulatedText += chunk
          // Update state with streaming text
          setAiSummaries(prev => ({
            ...prev,
            [transactionId]: { 
              text: accumulatedText, 
              loading: true 
            }
          }))
        },
        onComplete: (fullText) => {
          // Mark as complete
          setAiSummaries(prev => ({
            ...prev,
            [transactionId]: { 
              text: fullText, 
              loading: false 
            }
          }))
        },
        onError: (error) => {
          console.error("[Popup] Error fetching AI analysis:", error)
          setAiSummaries(prev => ({
            ...prev,
            [transactionId]: { 
              text: '', 
              loading: false, 
              error: error.message 
            }
          }))
        }
      })
    } catch (error) {
      console.error("[Popup] Error in AI analysis:", error)
      setAiSummaries(prev => ({
        ...prev,
        [transactionId]: { 
          text: '', 
          loading: false, 
          error: 'Failed to fetch AI analysis' 
        }
      }))
    }
  }

  // Fallback to message passing
  const loadViaMessage = () => {
    // Load history
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
    
    // Load pending
    chrome.runtime.sendMessage({ type: 'GET_PENDING_TRANSACTIONS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error getting pending transactions:", chrome.runtime.lastError)
        setPendingTransactions([])
      } else if (response?.transactions) {
        console.log("[Popup] Received pending transactions:", response.transactions.length)
        setPendingTransactions(response.transactions.reverse())
        if (response.transactions.length > 0) {
          setActiveTab('pending')
          // Fetch AI analysis for pending transactions
          response.transactions.forEach((tx: InterceptedTransaction) => {
            if (tx.id && tx.method === 'eth_sendTransaction' && tx.params?.[0]) {
              fetchAIAnalysisForTransaction(tx)
            }
          })
        }
      } else {
        setPendingTransactions([])
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
    const keysToRemove = activeTab === 'pending' ? ['pending_transactions'] : ['intercepted_transactions']
    chrome.storage.local.remove(keysToRemove, () => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] Error clearing transactions:", chrome.runtime.lastError)
      } else {
        console.log("[Popup] Transactions cleared")
        if (activeTab === 'pending') {
          setPendingTransactions([])
        } else {
          setTransactions([])
        }
        // Update badge count
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' })
      }
    })
  }

  // Approve a transaction
  const approveTransaction = (transaction: InterceptedTransaction) => {
    if (!transaction.id || transaction.tabId === undefined) return
    
    console.log("[Popup] Approving transaction:", transaction.id)
    chrome.runtime.sendMessage({
      type: 'APPROVE_TRANSACTION',
      transactionId: transaction.id,
      tabId: transaction.tabId
    }, (response) => {
      if (response?.success) {
        console.log("[Popup] Transaction approved")
        // Reload to update the list
        loadTransactions()
      }
    })
  }

  // Reject a transaction
  const rejectTransaction = (transaction: InterceptedTransaction) => {
    if (!transaction.id || transaction.tabId === undefined) return
    
    console.log("[Popup] Rejecting transaction:", transaction.id)
    chrome.runtime.sendMessage({
      type: 'REJECT_TRANSACTION',
      transactionId: transaction.id,
      tabId: transaction.tabId
    }, (response) => {
      if (response?.success) {
        console.log("[Popup] Transaction rejected")
        // Reload to update the list
        loadTransactions()
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

  // Filter transactions based on active tab
  const currentTransactions = activeTab === 'pending' ? pendingTransactions : transactions
  const filteredTransactions = currentTransactions.filter(tx => 
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
            🗑️ Clear {activeTab === 'pending' ? 'Pending' : 'History'}
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

      <div className="tabs-container">
        <button 
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Pending ({pendingTransactions.length})
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 History ({transactions.length})
        </button>
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
          <span className="stat-label">Total {activeTab === 'pending' ? 'Pending' : 'History'}:</span>
          <span className="stat-value">{currentTransactions.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Showing:</span>
          <span className="stat-value">{filteredTransactions.length}</span>
        </div>
      </div>

      <div className="transactions-container">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No {activeTab === 'pending' ? 'pending' : ''} transactions {activeTab === 'pending' ? 'awaiting approval' : 'intercepted yet'}.</p>
            <p className="hint">Visit a DApp and interact with your wallet to see intercepted transactions.</p>
          </div>
        ) : (
          filteredTransactions.map((tx, index) => {
            const aiSummary = tx.id ? aiSummaries[tx.id] : undefined
            
            return (
              <div key={`${tx.id || tx.timestamp}-${index}`} className="transaction-card">
                <div className="transaction-header">
                  <span 
                    className="method-badge"
                    style={{ backgroundColor: getMethodColor(tx.method) }}
                  >
                    {formatMethod(tx.method)}
                  </span>
                  <span className="timestamp">{formatTime(tx.timestamp)}</span>
                </div>
                
                {/* AI Summary Section - Display above transaction details */}
                {activeTab === 'pending' && tx.id && tx.method === 'eth_sendTransaction' && (
                  <div className="ai-summary-section">
                    <div className="ai-summary-header">
                      <span className="ai-icon">🤖</span>
                      <strong>AI Transaction Analysis</strong>
                    </div>
                    {aiSummary?.loading ? (
                      <div className="ai-summary-loading">
                        <div className="loading-spinner"></div>
                        {aiSummary.text ? (
                          <div className="ai-summary-text streaming">{aiSummary.text}</div>
                        ) : (
                          <span>Analyzing transaction...</span>
                        )}
                      </div>
                    ) : aiSummary?.error ? (
                      <div className="ai-summary-error">
                        ⚠️ {aiSummary.error}
                      </div>
                    ) : aiSummary?.text ? (
                      <div className="ai-summary-text">{aiSummary.text}</div>
                    ) : (
                      <div className="ai-summary-pending">
                        <button 
                          onClick={() => fetchAIAnalysisForTransaction(tx)}
                          className="btn-analyze"
                        >
                          🔍 Analyze Transaction
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="transaction-body">
                  <div className="origin">
                    <strong>Origin:</strong> {tx.origin}
                  </div>
                  <div className="params">
                    <strong>Parameters:</strong>
                    {formatParams(tx.method, tx.params)}
                  </div>
                  {activeTab === 'pending' && tx.status === 'pending' && (
                    <div className="action-buttons">
                      <button 
                        className="btn-approve"
                        onClick={() => approveTransaction(tx)}
                      >
                        ✅ Approve & Send to Wallet
                      </button>
                      <button 
                        className="btn-reject"
                        onClick={() => rejectTransaction(tx)}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                  {tx.status === 'approved' && (
                    <div className="status-badge approved">✅ Approved</div>
                  )}
                  {tx.status === 'rejected' && (
                    <div className="status-badge rejected">❌ Rejected</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="footer">
        <p>Intercepting Ethereum transactions in real-time</p>
      </div>
    </div>
  )
}

export default IndexPopup