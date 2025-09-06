import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start"
  // No world specified means it runs in ISOLATED world by default
}

// This script runs in the isolated world and relays messages from the main world to the background

console.log("[Ethereum Relay] Relay script loaded in isolated world at", window.location.href)

// Debug: Count messages received
let messageCount = 0

// Listen for postMessage from the main world script
window.addEventListener('message', (event) => {
  // Only process messages from the same window
  if (event.source !== window) {
    return
  }
  
  // Handle intercepted transactions that need approval
  if (event.data && event.data.type === 'PLASMO_ETHEREUM_INTERCEPTED') {
    messageCount++
    const requiresApproval = event.data.requiresApproval || false
    const transactionData = event.data.data
    
    console.log("[Ethereum Relay] 🎯 Transaction #" + messageCount + " received from interceptor")
    console.log("[Ethereum Relay] Transaction details:", {
      id: transactionData.id,
      method: transactionData.method,
      origin: transactionData.origin,
      requiresApproval: requiresApproval,
      timestamp: new Date(transactionData.timestamp).toISOString()
    })
    
    // Forward to background script
    chrome.runtime.sendMessage({
      type: requiresApproval ? 'TRANSACTION_PENDING_APPROVAL' : 'TRANSACTION_INTERCEPTED',
      data: transactionData,
      requiresApproval: requiresApproval
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Ethereum Relay] ❌ Error sending to background:", chrome.runtime.lastError)
        // If approval is required and we can't communicate with background, reject
        if (requiresApproval) {
          window.postMessage({
            type: 'PLASMO_TRANSACTION_RESPONSE',
            transactionId: transactionData.id,
            approved: false
          }, '*')
        }
      } else {
        console.log("[Ethereum Relay] ✅ Transaction #" + messageCount + " forwarded to background")
        // If this requires approval, the popup will be opened by the background script
      }
    })
  }
})

// Listen for approval/rejection messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSACTION_APPROVED' || message.type === 'TRANSACTION_REJECTED') {
    console.log(`[Ethereum Relay] Received ${message.type} for transaction ${message.transactionId}`)
    
    // Forward the approval/rejection to the main world
    window.postMessage({
      type: 'PLASMO_TRANSACTION_RESPONSE',
      transactionId: message.transactionId,
      approved: message.type === 'TRANSACTION_APPROVED'
    }, '*')
    
    sendResponse({ success: true })
  }
})

// Test that the relay is working by sending a test message after 2 seconds
setTimeout(() => {
  console.log("[Ethereum Relay] Sending test ping to background")
  chrome.runtime.sendMessage({ type: 'RELAY_TEST', message: 'Relay is active' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[Ethereum Relay] Test ping failed:", chrome.runtime.lastError)
    } else {
      console.log("[Ethereum Relay] Test ping successful:", response)
    }
  })
}, 2000)

// Also listen for page visibility changes to notify background
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Page became visible, might want to refresh data
    chrome.runtime.sendMessage({ type: 'PAGE_VISIBLE' })
  }
})

export {}
