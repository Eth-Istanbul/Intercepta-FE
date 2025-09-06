// Background script for managing intercepted transactions
console.log("[Background] Ethereum Interceptor background script loaded")

// We'll use chrome.storage.local directly for simplicity
const STORAGE_KEY = 'intercepted_transactions'

// Message handler for communication between content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Message received:", message, "from:", sender.url || "extension")

  switch (message.type) {
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

// Initialize badge on startup
getStoredTransactions().then((transactions: any[]) => {
  if (transactions.length > 0) {
    chrome.action.setBadgeText({
      text: transactions.length.toString()
    })
    chrome.action.setBadgeBackgroundColor({
      color: "#ef4444"
    })
  }
})

export {}
