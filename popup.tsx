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
              <div className="mb-2 p-2 bg-praetor-danger/10 border border-praetor-danger/30 rounded">
                {analysis.warnings.map((warning, idx) => (
                  <div key={idx} className="text-xs text-praetor-warning font-medium mb-1 last:mb-0">{warning}</div>
                ))}
              </div>
            )}
            <div className="mt-1.5 p-2 bg-praetor-gray/50 rounded font-mono text-xs text-gray-300">
              {txData.from && <div className="mb-1 break-all"><strong className="font-semibold text-gray-100">From:</strong> {formatAddress(txData.from)}</div>}
              {txData.to && <div className="mb-1 break-all"><strong className="font-semibold text-gray-100">To:</strong> {formatAddress(txData.to)}</div>}
              {txData.value && <div className="mb-1"><strong className="font-semibold text-gray-100">Value:</strong> {formatWeiToEth(txData.value)}</div>}
              {analysis.details.functionName && <div className="mb-1"><strong className="font-semibold text-gray-100">Function:</strong> {analysis.details.functionName}</div>}
              {analysis.details.tokenTransfer && (
                <div className="mb-1"><strong className="font-semibold text-gray-100">Token Transfer:</strong> {analysis.details.tokenTransfer.token}</div>
              )}
              {txData.data && txData.data !== '0x' && <div className="mb-1 break-all"><strong className="font-semibold text-gray-100">Data:</strong> {txData.data.slice(0, 20)}...</div>}
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
    <div className="w-[520px] min-h-[400px] max-h-[600px] bg-praetor-black text-white font-sans">
      <div className="bg-praetor-dark border-b border-praetor-border p-4">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
          <span className="text-2xl">⚔️</span>
          <span className="bg-gradient-to-r from-praetor-accent to-blue-400 bg-clip-text text-transparent font-bold">Praetor</span>
          <span className="text-gray-400 font-normal">Transaction Guardian</span>
        </h2>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-300 hover:text-white transition-colors">
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-praetor-border bg-praetor-gray text-praetor-accent focus:ring-2 focus:ring-praetor-accent/50"
            />
            Auto-refresh
          </label>
          <button onClick={loadTransactions} className="px-3 py-1.5 bg-praetor-gray hover:bg-praetor-border border border-praetor-border rounded-lg text-sm font-medium transition-all hover:scale-105">
            🔄 Refresh
          </button>
          <button onClick={clearTransactions} className="px-3 py-1.5 bg-praetor-gray hover:bg-praetor-border border border-praetor-border rounded-lg text-sm font-medium transition-all hover:scale-105">
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
          }} className="px-3 py-1.5 bg-praetor-gray hover:bg-praetor-border border border-praetor-border rounded-lg text-sm font-medium transition-all hover:scale-105">
            🧪 Test
          </button>
        </div>
      </div>

      <div className="flex bg-praetor-darker border-b border-praetor-border">
        <button 
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
            activeTab === 'pending' 
              ? 'text-praetor-accent border-praetor-accent bg-praetor-gray/30' 
              : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-praetor-gray/20'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Pending ({pendingTransactions.length})
        </button>
        <button 
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
            activeTab === 'history' 
              ? 'text-praetor-accent border-praetor-accent bg-praetor-gray/30' 
              : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-praetor-gray/20'
          }`}
          onClick={() => setActiveTab('history')}
        >
          📜 History ({transactions.length})
        </button>
      </div>

      <div className="p-3 bg-praetor-darker">
        <input 
          type="text"
          placeholder="Filter by method or origin..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 bg-praetor-gray border border-praetor-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-praetor-accent/50 focus:ring-1 focus:ring-praetor-accent/30 transition-all"
        />
      </div>

      <div className="flex gap-5 px-4 py-3 bg-praetor-darker border-b border-praetor-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Total {activeTab === 'pending' ? 'Pending' : 'History'}:</span>
          <span className="text-sm font-semibold bg-praetor-accent/20 text-praetor-accent px-2 py-0.5 rounded-full">{currentTransactions.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Showing:</span>
          <span className="text-sm font-semibold bg-praetor-accent/20 text-praetor-accent px-2 py-0.5 rounded-full">{filteredTransactions.length}</span>
        </div>
      </div>

      <div className="max-h-[350px] overflow-y-auto p-4 custom-scrollbar bg-praetor-black">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm mb-2 text-gray-300">No {activeTab === 'pending' ? 'pending' : ''} transactions {activeTab === 'pending' ? 'awaiting approval' : 'intercepted yet'}.</p>
            <p className="text-xs text-gray-500">Visit a DApp and interact with your wallet to see intercepted transactions.</p>
          </div>
        ) : (
          filteredTransactions.map((tx, index) => {
            const aiSummary = tx.id ? aiSummaries[tx.id] : undefined
            
            return (
              <div key={`${tx.id || tx.timestamp}-${index}`} className="bg-praetor-dark border border-praetor-border rounded-lg p-3 mb-3 transition-all duration-200 hover:bg-praetor-darker hover:border-praetor-accent/30 hover:transform hover:translate-x-1 animate-slide-in">
                <div className="flex justify-between items-center mb-3">
                  <span 
                    className="px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider text-white shadow-lg"
                    style={{ backgroundColor: getMethodColor(tx.method) }}
                  >
                    {formatMethod(tx.method)}
                  </span>
                  <span className="text-xs text-gray-500">{formatTime(tx.timestamp)}</span>
                </div>
                
                {/* AI Summary Section - Display above transaction details */}
                {activeTab === 'pending' && tx.id && tx.method === 'eth_sendTransaction' && (
                  <div className="bg-gradient-to-r from-praetor-accent/10 to-blue-500/10 border border-praetor-accent/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2 text-praetor-accent text-sm font-medium">
                      <span className="text-lg">🤖</span>
                      <strong>AI Transaction Analysis</strong>
                    </div>
                    {aiSummary?.loading ? (
                      <div className="flex flex-col gap-2">
                        <div className="w-5 h-5 border-2 border-praetor-border border-t-praetor-accent rounded-full animate-spin"></div>
                        {aiSummary.text ? (
                          <div className="bg-praetor-gray/50 p-2.5 rounded-md text-xs leading-relaxed text-gray-200 whitespace-pre-wrap break-words border border-dashed border-praetor-accent/50 animate-pulse">{aiSummary.text}</div>
                        ) : (
                          <span className="text-xs text-gray-400">Analyzing transaction...</span>
                        )}
                      </div>
                    ) : aiSummary?.error ? (
                      <div className="bg-praetor-danger/10 border border-praetor-danger/30 text-praetor-danger px-2.5 py-2 rounded-md text-xs">
                        ⚠️ {aiSummary.error}
                      </div>
                    ) : aiSummary?.text ? (
                      <div className="bg-praetor-gray/50 p-2.5 rounded-md text-xs leading-relaxed text-gray-200 whitespace-pre-wrap break-words">{aiSummary.text}</div>
                    ) : (
                      <div className="py-2">
                        <button 
                          onClick={() => fetchAIAnalysisForTransaction(tx)}
                          className="bg-gradient-to-r from-praetor-accent to-blue-500 text-white px-4 py-2 rounded-md text-xs font-medium shadow-md hover:from-blue-500 hover:to-praetor-accent hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-md"
                        >
                          🔍 Analyze Transaction
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-xs">
                  <div className="mb-2 text-gray-300 break-all">
                    <strong className="font-semibold text-gray-100 mr-1.5">Origin:</strong> {tx.origin}
                  </div>
                  <div className="text-gray-300">
                    <strong className="font-semibold text-gray-100 mr-1.5">Parameters:</strong>
                    {formatParams(tx.method, tx.params)}
                  </div>
                  {activeTab === 'pending' && tx.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-praetor-border">
                      <button 
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-medium text-white bg-praetor-success hover:bg-praetor-success/80 transition-all duration-200 transform hover:scale-105"
                        onClick={() => approveTransaction(tx)}
                      >
                        ✅ Approve & Send to Wallet
                      </button>
                      <button 
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-medium text-white bg-praetor-danger hover:bg-praetor-danger/80 transition-all duration-200 transform hover:scale-105"
                        onClick={() => rejectTransaction(tx)}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                  {tx.status === 'approved' && (
                    <div className="inline-block px-2.5 py-1 mt-2 bg-praetor-success/20 border border-praetor-success/40 text-praetor-success rounded text-xs font-medium">✅ Approved</div>
                  )}
                  {tx.status === 'rejected' && (
                    <div className="inline-block px-2.5 py-1 mt-2 bg-praetor-danger/20 border border-praetor-danger/40 text-praetor-danger rounded text-xs font-medium">❌ Rejected</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="bg-praetor-dark px-4 py-3 border-t border-praetor-border text-center">
        <p className="text-xs text-gray-500">Praetor - Guarding your Ethereum transactions in real-time</p>
      </div>
    </div>
  )
}

export default IndexPopup