import { useEffect, useState } from "react"
import { analyzeTransaction, formatWeiToEth, formatAddress } from "./utils/transaction-analyzer"
import { fetchAITransactionAnalysis } from "./utils/ai-analyzer"
import "./tailwind.css"

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
              <div className="mb-2 p-2 bg-red-500/20 border border-red-500/40 rounded">
                {analysis.warnings.map((warning, idx) => (
                  <div key={idx} className="text-xs text-white font-medium mb-1 last:mb-0">{warning}</div>
                ))}
              </div>
            )}
            <div className="mt-1.5 p-2 bg-black/20 rounded font-mono text-xs">
              {txData.from && <div className="mb-1 break-all"><strong className="font-semibold">From:</strong> {formatAddress(txData.from)}</div>}
              {txData.to && <div className="mb-1 break-all"><strong className="font-semibold">To:</strong> {formatAddress(txData.to)}</div>}
              {txData.value && <div className="mb-1"><strong className="font-semibold">Value:</strong> {formatWeiToEth(txData.value)}</div>}
              {analysis.details.functionName && <div className="mb-1"><strong className="font-semibold">Function:</strong> {analysis.details.functionName}</div>}
              {analysis.details.tokenTransfer && (
                <div className="mb-1"><strong className="font-semibold">Token Transfer:</strong> {analysis.details.tokenTransfer.token}</div>
              )}
              {txData.data && txData.data !== '0x' && <div className="mb-1 break-all"><strong className="font-semibold">Data:</strong> {txData.data.slice(0, 20)}...</div>}
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
    <div className="w-[520px] min-h-[400px] max-h-[600px] bg-gradient-to-br from-praetor-indigo to-praetor-purple text-white font-sans">
      <div className="glass p-4 border-b border-white/20">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-2xl">⚔️</span>
          Praetor - Transaction Guardian
        </h2>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white/90">
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-white/30 bg-white/10 text-praetor-purple focus:ring-2 focus:ring-white/30"
            />
            Auto-refresh
          </label>
          <button onClick={loadTransactions} className="btn-base glass hover:bg-white/20 text-sm">
            🔄 Refresh
          </button>
          <button onClick={clearTransactions} className="btn-base glass hover:bg-white/20 text-sm">
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
          }} className="btn-base glass hover:bg-white/20 text-sm">
            🧪 Test
          </button>
        </div>
      </div>

      <div className="flex bg-white/5 border-b border-white/10">
        <button 
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
            activeTab === 'pending' 
              ? 'text-white border-white bg-white/10' 
              : 'text-white/70 border-transparent hover:text-white/90 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Pending ({pendingTransactions.length})
        </button>
        <button 
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
            activeTab === 'history' 
              ? 'text-white border-white bg-white/10' 
              : 'text-white/70 border-transparent hover:text-white/90 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('history')}
        >
          📜 History ({transactions.length})
        </button>
      </div>

      <div className="p-3 bg-white/5">
        <input 
          type="text"
          placeholder="Filter by method or origin..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:bg-white/15 focus:border-white/40 transition-all"
        />
      </div>

      <div className="flex gap-5 px-4 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80">Total {activeTab === 'pending' ? 'Pending' : 'History'}:</span>
          <span className="text-sm font-semibold bg-white/20 px-2 py-0.5 rounded-full">{currentTransactions.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80">Showing:</span>
          <span className="text-sm font-semibold bg-white/20 px-2 py-0.5 rounded-full">{filteredTransactions.length}</span>
        </div>
      </div>

      <div className="max-h-[350px] overflow-y-auto p-4 custom-scrollbar">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-10 text-white/90">
            <p className="text-sm mb-2">No {activeTab === 'pending' ? 'pending' : ''} transactions {activeTab === 'pending' ? 'awaiting approval' : 'intercepted yet'}.</p>
            <p className="text-xs text-white/70">Visit a DApp and interact with your wallet to see intercepted transactions.</p>
          </div>
        ) : (
          filteredTransactions.map((tx, index) => {
            const aiSummary = tx.id ? aiSummaries[tx.id] : undefined
            
            return (
              <div key={`${tx.id || tx.timestamp}-${index}`} className="glass rounded-lg p-3 mb-3 transition-all duration-200 hover:bg-white/15 hover:transform hover:translate-x-1 animate-slide-in">
                <div className="flex justify-between items-center mb-3">
                  <span 
                    className="px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider text-white shadow-lg"
                    style={{ backgroundColor: getMethodColor(tx.method) }}
                  >
                    {formatMethod(tx.method)}
                  </span>
                  <span className="text-xs text-white/70">{formatTime(tx.timestamp)}</span>
                </div>
                
                {/* AI Summary Section - Display above transaction details */}
                {activeTab === 'pending' && tx.id && tx.method === 'eth_sendTransaction' && (
                  <div className="ai-summary-gradient rounded-lg p-3 mb-3 shadow-md">
                    <div className="flex items-center gap-2 mb-2 text-blue-700 text-sm font-medium">
                      <span className="text-lg">🤖</span>
                      <strong>AI Transaction Analysis</strong>
                    </div>
                    {aiSummary?.loading ? (
                      <div className="flex flex-col gap-2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                        {aiSummary.text ? (
                          <div className="bg-white p-2.5 rounded-md text-xs leading-relaxed text-gray-800 whitespace-pre-wrap break-words border border-dashed border-blue-400 animate-pulse">{aiSummary.text}</div>
                        ) : (
                          <span className="text-xs text-gray-600">Analyzing transaction...</span>
                        )}
                      </div>
                    ) : aiSummary?.error ? (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-2.5 py-2 rounded-md text-xs">
                        ⚠️ {aiSummary.error}
                      </div>
                    ) : aiSummary?.text ? (
                      <div className="bg-white p-2.5 rounded-md text-xs leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{aiSummary.text}</div>
                    ) : (
                      <div className="py-2">
                        <button 
                          onClick={() => fetchAIAnalysisForTransaction(tx)}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-md text-xs font-medium shadow-md hover:from-blue-700 hover:to-blue-800 hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-md"
                        >
                          🔍 Analyze Transaction
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-xs">
                  <div className="mb-2 text-white/90 break-all">
                    <strong className="font-semibold text-white mr-1.5">Origin:</strong> {tx.origin}
                  </div>
                  <div className="text-white/90">
                    <strong className="font-semibold text-white mr-1.5">Parameters:</strong>
                    {formatParams(tx.method, tx.params)}
                  </div>
                  {activeTab === 'pending' && tx.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                      <button 
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 shadow-md hover:from-green-700 hover:to-emerald-700 hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                        onClick={() => approveTransaction(tx)}
                      >
                        ✅ Approve & Send to Wallet
                      </button>
                      <button 
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-red-600 to-rose-600 shadow-md hover:from-red-700 hover:to-rose-700 hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                        onClick={() => rejectTransaction(tx)}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                  {tx.status === 'approved' && (
                    <div className="inline-block px-2.5 py-1 mt-2 bg-green-500/20 border border-green-500/40 text-green-400 rounded text-xs font-medium">✅ Approved</div>
                  )}
                  {tx.status === 'rejected' && (
                    <div className="inline-block px-2.5 py-1 mt-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-xs font-medium">❌ Rejected</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="glass px-4 py-3 border-t border-white/20 text-center">
        <p className="text-xs text-white/80">Praetor - Guarding your Ethereum transactions in real-time</p>
      </div>
    </div>
  )
}

export default IndexPopup