// Background script for managing intercepted transactions
console.log("[Background] Ethereum Interceptor background script loaded")

// We'll use chrome.storage.local directly for simplicity
const STORAGE_KEY = 'intercepted_transactions'
const PENDING_KEY = 'pending_transactions'

// Track tabs that have pending transactions
const pendingTransactionTabs = new Map<number, string>()

// Message handler for communication between content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message received:", message, "from:", sender.url || "extension")

  switch (message.type) {
    case "TRANSACTION_PENDING_APPROVAL":
      handlePendingTransaction(message.data, sender.tab?.id).then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error handling pending transaction:", error)
        sendResponse({ success: false, error: error.message })
      })
      return true // Keep channel open for async response

    case "APPROVE_TRANSACTION":
      approveTransaction(message.transactionId, message.tabId).then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error approving transaction:", error)
        sendResponse({ success: false })
      })
      return true

    case "REJECT_TRANSACTION":
      rejectTransaction(message.transactionId, message.tabId).then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error rejecting transaction:", error)
        sendResponse({ success: false })
      })
      return true

    case "GET_PENDING_TRANSACTIONS":
      getPendingTransactions().then((transactions: any[]) => {
        console.log("[Background] Sending pending transactions to popup:", transactions.length)
        sendResponse({ transactions })
      }).catch(error => {
        console.error("[Background] Error getting pending transactions:", error)
        sendResponse({ transactions: [] })
      })
      return true // Keep channel open for async response

    case "CLEAR_PENDING_TRANSACTIONS":
      clearPendingTransactions().then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error clearing pending transactions:", error)
        sendResponse({ success: false })
      })
      return true

    // Original cases continue below
    
    case "TRANSACTION_INTERCEPTED":
      handleTransactionIntercepted(message.data).then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error handling transaction:", error)
        sendResponse({ success: false, error: error.message })
      })
      return true // Keep channel open for async response

    case "GET_TRANSACTIONS":
      getStoredTransactions().then((transactions: any[]) => {
        console.log("[Background] Sending transactions to popup:", transactions.length)
        sendResponse({ transactions })
      }).catch(error => {
        console.error("[Background] Error getting transactions:", error)
        sendResponse({ transactions: [] })
      })
      return true // Keep channel open for async response

    case "CLEAR_TRANSACTIONS":
      clearTransactions().then(() => {
        sendResponse({ success: true })
      }).catch(error => {
        console.error("[Background] Error clearing transactions:", error)
        sendResponse({ success: false })
      })
      return true

    case "PAGE_VISIBLE":
      // Page visibility changed
      console.log("[Background] Page became visible")
      break

    case "UPDATE_BADGE":
      updateBadgeCount()
      sendResponse({ success: true })
      break

    case "RELAY_TEST":
      // Test message from relay
      console.log("[Background] Relay test received:", message.message)
      sendResponse({ success: true, message: "Background received test" })
      break

    default:
      console.log("[Background] Unknown message type:", message.type)
  }
})

// Handle intercepted transaction
async function handleTransactionIntercepted(transaction: any) {
  return new Promise((resolve, reject) => {
    // Get existing transactions
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const transactions = result[STORAGE_KEY] || []
      
      // Add new transaction
      transactions.push(transaction)
      
      // Keep only last 100 transactions
      if (transactions.length > 100) {
        transactions.splice(0, transactions.length - 100)
      }
      
      // Store updated transactions
      chrome.storage.local.set({ [STORAGE_KEY]: transactions }, () => {
        if (chrome.runtime.lastError) {
          console.error("[Background] Error storing transaction:", chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          // Update badge to show count
          chrome.action.setBadgeText({
            text: transactions.length.toString()
          })
          
          chrome.action.setBadgeBackgroundColor({
            color: "#ef4444"
          })
          
          console.log("[Background] Transaction stored, total:", transactions.length)
          resolve(true)
        }
      })
    })
  })
}

// Get stored transactions
async function getStoredTransactions(): Promise<any[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Error getting transactions:", chrome.runtime.lastError)
        resolve([])
      } else {
        const transactions = result[STORAGE_KEY] || []
        console.log("[Background] Retrieved transactions:", transactions.length)
        resolve(transactions)
      }
    })
  })
}

// Clear all transactions
async function clearTransactions() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([STORAGE_KEY], () => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Error clearing transactions:", chrome.runtime.lastError)
        reject(chrome.runtime.lastError)
      } else {
        chrome.action.setBadgeText({ text: "" })
        console.log("[Background] Transactions cleared")
        resolve(true)
      }
    })
  })
}

// Handle pending transaction that needs approval
async function handlePendingTransaction(transaction: any, tabId?: number) {
  return new Promise((resolve, reject) => {
    // Store the pending transaction
    chrome.storage.local.get([PENDING_KEY], (result) => {
      const pendingTransactions = result[PENDING_KEY] || []
      
      // Add tab ID to the transaction
      transaction.tabId = tabId
      pendingTransactions.push(transaction)
      
      // Store tab association
      if (tabId && transaction.id) {
        pendingTransactionTabs.set(tabId, transaction.id)
      }
      
      // Store updated pending transactions
      chrome.storage.local.set({ [PENDING_KEY]: pendingTransactions }, () => {
        if (chrome.runtime.lastError) {
          console.error("[Background] Error storing pending transaction:", chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          // Update badge to show pending count
          chrome.action.setBadgeText({
            text: pendingTransactions.length.toString()
          })
          
          chrome.action.setBadgeBackgroundColor({
            color: "#f59e0b" // Orange for pending
          })
          
          // Open popup to show the pending transaction
          chrome.action.openPopup()
          
          console.log("[Background] Pending transaction stored, popup opened")
          resolve(true)
        }
      })
    })
  })
}

// Get pending transactions
async function getPendingTransactions(): Promise<any[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([PENDING_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Error getting pending transactions:", chrome.runtime.lastError)
        resolve([])
      } else {
        const transactions = result[PENDING_KEY] || []
        console.log("[Background] Retrieved pending transactions:", transactions.length)
        resolve(transactions)
      }
    })
  })
}

// Clear pending transactions
async function clearPendingTransactions() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([PENDING_KEY], () => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Error clearing pending transactions:", chrome.runtime.lastError)
        reject(chrome.runtime.lastError)
      } else {
        pendingTransactionTabs.clear()
        updateBadgeCount()
        console.log("[Background] Pending transactions cleared")
        resolve(true)
      }
    })
  })
}

// Approve a transaction
async function approveTransaction(transactionId: string, tabId: number) {
  return new Promise((resolve, reject) => {
    // Remove from pending transactions
    chrome.storage.local.get([PENDING_KEY, STORAGE_KEY], (result) => {
      let pendingTransactions = result[PENDING_KEY] || []
      const allTransactions = result[STORAGE_KEY] || []
      
      // Find and remove the pending transaction
      const transactionIndex = pendingTransactions.findIndex((tx: any) => tx.id === transactionId)
      if (transactionIndex !== -1) {
        const transaction = pendingTransactions[transactionIndex]
        transaction.status = 'approved'
        
        // Remove from pending
        pendingTransactions.splice(transactionIndex, 1)
        
        // Add to history
        allTransactions.push(transaction)
        
        // Update storage
        chrome.storage.local.set({ 
          [PENDING_KEY]: pendingTransactions,
          [STORAGE_KEY]: allTransactions
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            // Send approval to the content script
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                type: 'TRANSACTION_APPROVED',
                transactionId: transactionId
              })
              pendingTransactionTabs.delete(tabId)
            }
            
            updateBadgeCount()
            console.log(`[Background] Transaction ${transactionId} approved`)
            resolve(true)
          }
        })
      } else {
        reject(new Error('Transaction not found'))
      }
    })
  })
}

// Reject a transaction
async function rejectTransaction(transactionId: string, tabId: number) {
  return new Promise((resolve, reject) => {
    // Remove from pending transactions
    chrome.storage.local.get([PENDING_KEY, STORAGE_KEY], (result) => {
      let pendingTransactions = result[PENDING_KEY] || []
      const allTransactions = result[STORAGE_KEY] || []
      
      // Find and remove the pending transaction
      const transactionIndex = pendingTransactions.findIndex((tx: any) => tx.id === transactionId)
      if (transactionIndex !== -1) {
        const transaction = pendingTransactions[transactionIndex]
        transaction.status = 'rejected'
        
        // Remove from pending
        pendingTransactions.splice(transactionIndex, 1)
        
        // Add to history
        allTransactions.push(transaction)
        
        // Update storage
        chrome.storage.local.set({ 
          [PENDING_KEY]: pendingTransactions,
          [STORAGE_KEY]: allTransactions
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            // Send rejection to the content script
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                type: 'TRANSACTION_REJECTED',
                transactionId: transactionId
              })
              pendingTransactionTabs.delete(tabId)
            }
            
            updateBadgeCount()
            console.log(`[Background] Transaction ${transactionId} rejected`)
            resolve(true)
          }
        })
      } else {
        reject(new Error('Transaction not found'))
      }
    })
  })
}

// Update badge count
function updateBadgeCount() {
  chrome.storage.local.get([PENDING_KEY, STORAGE_KEY], (result) => {
    const pendingCount = (result[PENDING_KEY] || []).length
    const totalCount = (result[STORAGE_KEY] || []).length
    
    if (pendingCount > 0) {
      chrome.action.setBadgeText({ text: pendingCount.toString() })
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }) // Orange for pending
    } else if (totalCount > 0) {
      chrome.action.setBadgeText({ text: totalCount.toString() })
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }) // Red for history
    } else {
      chrome.action.setBadgeText({ text: "" })
    }
  })
}

// Initialize badge on startup
updateBadgeCount()

export {}
