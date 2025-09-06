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
  
  // Only log our specific message type to reduce noise
  if (event.data && event.data.type === 'PLASMO_ETHEREUM_INTERCEPTED') {
    messageCount++
    console.log("[Ethereum Relay] 🎯 Transaction #" + messageCount + " received from interceptor")
    console.log("[Ethereum Relay] Transaction details:", {
      method: event.data.data.method,
      origin: event.data.data.origin,
      timestamp: new Date(event.data.data.timestamp).toISOString()
    })
    
    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'TRANSACTION_INTERCEPTED',
      data: event.data.data
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Ethereum Relay] ❌ Error sending to background:", chrome.runtime.lastError)
      } else {
        console.log("[Ethereum Relay] ✅ Transaction #" + messageCount + " forwarded to background")
      }
    })
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
