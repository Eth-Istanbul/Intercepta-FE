import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  world: "MAIN",
  run_at: "document_start"
}

// Since we're in MAIN world, we can't use chrome.runtime directly
// We'll use a custom event to communicate with an isolated world script

// Extended interface for providers that might have additional properties
interface ExtendedProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on?: (event: string, handler: (...args: any[]) => void) => void
  removeListener?: (event: string, handler: (...args: any[]) => void) => void
  isMetaMask?: boolean
  selectedAddress?: string | null
  chainId?: string | null
  providers?: ExtendedProvider[]  // For multiple wallet support
}

interface InterceptedTransaction {
  method: string
  params: any[]
  timestamp: number
  origin: string
  userAgent: string
  intercepted: boolean
  id?: string  // Unique ID for tracking pending transactions
  status?: 'pending' | 'approved' | 'rejected'
}

// Track wrapped providers to avoid double-wrapping
const wrappedProviders = new WeakSet<any>()
let interceptCount = 0

// Store pending transaction promises
const pendingTransactions = new Map<string, {
  resolve: (value: any) => void
  reject: (reason?: any) => void
}>()

// Generate unique ID for each transaction
const generateTransactionId = () => {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Initialize interceptor immediately
;(() => {
  console.log("[Ethereum Interceptor] Initializing...")

  // Function to wrap the request method
  const wrapRequestMethod = (provider: any) => {
    // Skip if already wrapped
    if (wrappedProviders.has(provider)) {
      return
    }

    // Mark as wrapped
    wrappedProviders.add(provider)
    
    // Store original request method
    const originalRequest = provider.request?.bind(provider)
    
    if (!originalRequest) {
      console.log("[Ethereum Interceptor] Provider has no request method")
      return
    }

    console.log("[Ethereum Interceptor] Wrapping request method")

    // Override the request method
    provider.request = async function(args: { method: string; params?: any[] }) {
      console.log("[Ethereum Interceptor] Request called:", args.method)

      // List of transaction-related methods to intercept
      const transactionMethods = [
        'eth_sendTransaction',
        'eth_signTransaction', 
        'eth_sendRawTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v1',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
        'wallet_sendDomainMetadata',
        'wallet_addEthereumChain',
        'wallet_switchEthereumChain'
      ]

      // Check if this is a transaction-related method
      if (transactionMethods.includes(args.method)) {
        interceptCount++
        const transactionId = generateTransactionId()
        
        const interceptedData: InterceptedTransaction = {
          id: transactionId,
          method: args.method,
          params: args.params || [],
          timestamp: Date.now(),
          origin: window.location.origin,
          userAgent: navigator.userAgent,
          intercepted: true,
          status: 'pending'
        }

        console.log(`[Ethereum Interceptor] Transaction #${interceptCount} intercepted:`, interceptedData)

        // Create a promise that will be resolved when user approves/rejects
        const approvalPromise = new Promise((resolve, reject) => {
          pendingTransactions.set(transactionId, { resolve, reject })
          
          // Set a timeout to auto-reject if no response (5 minutes)
          setTimeout(() => {
            if (pendingTransactions.has(transactionId)) {
              pendingTransactions.delete(transactionId)
              reject(new Error('Transaction approval timeout'))
            }
          }, 5 * 60 * 1000)
        })

        // Send to extension for approval
        try {
          window.postMessage({
            type: 'PLASMO_ETHEREUM_INTERCEPTED',
            data: interceptedData,
            requiresApproval: true
          }, '*')
          
          console.log("[Ethereum Interceptor] Transaction sent for approval, waiting...")

          // Log specific transaction details
          if (args.method === 'eth_sendTransaction' && args.params?.[0]) {
            const txParams = args.params[0]
            console.log("[Ethereum Interceptor] Transaction details:", {
              from: txParams.from,
              to: txParams.to,
              value: txParams.value,
              data: txParams.data?.slice(0, 66) + '...',
              gas: txParams.gas,
              gasPrice: txParams.gasPrice
            })
          }

          // Wait for approval
          const result = await approvalPromise
          
          if (result === 'approved') {
            console.log(`[Ethereum Interceptor] Transaction ${transactionId} approved, proceeding to wallet...`)
            // Proceed with the original request
            return originalRequest(args)
          } else {
            console.log(`[Ethereum Interceptor] Transaction ${transactionId} rejected by user`)
            throw new Error('Transaction rejected by user')
          }
        } catch (error) {
          console.error("[Ethereum Interceptor] Error processing transaction:", error)
          throw error
        }
      }

      // Non-transaction methods pass through immediately
      return originalRequest(args)
    }

    console.log("[Ethereum Interceptor] Request method wrapped successfully")
  }

  // Function to check and wrap ethereum provider
  const checkAndWrapEthereum = () => {
    if (typeof window.ethereum !== 'undefined' && window.ethereum) {
      console.log("[Ethereum Interceptor] Found ethereum provider, wrapping...")
      wrapRequestMethod(window.ethereum)
      
      // Also wrap any providers in the providers array (for multiple wallets)
      const provider = window.ethereum as ExtendedProvider
      if (provider.providers?.length) {
        console.log(`[Ethereum Interceptor] Found ${provider.providers.length} sub-providers`)
        provider.providers.forEach((subProvider: any, index: number) => {
          console.log(`[Ethereum Interceptor] Wrapping sub-provider ${index}`)
          wrapRequestMethod(subProvider)
        })
      }
      
      return true
    }
    return false
  }

  // Try to wrap immediately
  if (checkAndWrapEthereum()) {
    console.log("[Ethereum Interceptor] Initial wrapping complete")
  }

  // Monitor for ethereum provider using multiple strategies
  
  // Strategy 1: Use Object.defineProperty to intercept ethereum setter
  let currentEthereum = window.ethereum
  try {
    Object.defineProperty(window, 'ethereum', {
      get() {
        return currentEthereum
      },
      set(newProvider) {
        console.log("[Ethereum Interceptor] New ethereum provider detected via setter")
        currentEthereum = newProvider
        if (newProvider) {
          setTimeout(() => {
            wrapRequestMethod(newProvider)
          }, 0)
        }
        return true
      },
      configurable: true
    })
  } catch (e) {
    console.log("[Ethereum Interceptor] Could not define ethereum property:", e)
  }

  // Strategy 2: Poll for changes
  let lastEthereum = window.ethereum
  const pollInterval = setInterval(() => {
    if (window.ethereum !== lastEthereum) {
      console.log("[Ethereum Interceptor] Ethereum provider changed (detected by polling)")
      lastEthereum = window.ethereum
      if (window.ethereum) {
        wrapRequestMethod(window.ethereum)
      }
    }
  }, 500)

  // Stop polling after 30 seconds
  setTimeout(() => {
    clearInterval(pollInterval)
    console.log("[Ethereum Interceptor] Stopped polling for ethereum changes")
  }, 30000)

  // Strategy 3: Listen for common wallet ready events
  window.addEventListener('ethereum#initialized', () => {
    console.log("[Ethereum Interceptor] Ethereum initialized event")
    checkAndWrapEthereum()
  })

  document.addEventListener('DOMContentLoaded', () => {
    console.log("[Ethereum Interceptor] DOM loaded, checking ethereum...")
    checkAndWrapEthereum()
  })

  window.addEventListener('load', () => {
    console.log("[Ethereum Interceptor] Window loaded, final ethereum check...")
    checkAndWrapEthereum()
  })

  // Strategy 4: Intercept common wallet injection points
  const injectionTargets = ['ethereum', 'web3', 'solana', 'tronWeb']
  injectionTargets.forEach(target => {
    let value = (window as any)[target]
    Object.defineProperty(window, target, {
      get() {
        return value
      },
      set(newValue) {
        console.log(`[Ethereum Interceptor] ${target} provider injected`)
        value = newValue
        if (target === 'ethereum' && newValue) {
          setTimeout(() => {
            wrapRequestMethod(newValue)
          }, 0)
        }
        return true
      },
      configurable: true
    })
  })

  // Listen for approval/rejection messages from the extension
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    
    if (event.data && event.data.type === 'PLASMO_TRANSACTION_RESPONSE') {
      const { transactionId, approved } = event.data
      console.log(`[Ethereum Interceptor] Received response for ${transactionId}: ${approved ? 'approved' : 'rejected'}`)
      
      const pending = pendingTransactions.get(transactionId)
      if (pending) {
        if (approved) {
          pending.resolve('approved')
        } else {
          pending.reject(new Error('Transaction rejected by user'))
        }
        pendingTransactions.delete(transactionId)
      }
    }
  })

  // Log current state
  const ethereumProvider = window.ethereum as ExtendedProvider
  console.log("[Ethereum Interceptor] Setup complete. Current state:", {
    hasEthereum: typeof window.ethereum !== 'undefined',
    isMetaMask: ethereumProvider?.isMetaMask,
    hasProviders: ethereumProvider?.providers?.length > 0
  })

  // Add a global test function for debugging
  ;(window as any).testEthereumInterceptor = async () => {
    console.log("[Ethereum Interceptor] Running test...")
    if (!window.ethereum) {
      console.error("[Ethereum Interceptor] No ethereum provider found!")
      return
    }
    
    try {
      // Test with a simple RPC call that won't actually send a transaction
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      console.log("[Ethereum Interceptor] Test - Got accounts:", accounts)
      
      // Test with a signing request (will trigger MetaMask but won't send funds)
      if (accounts.length > 0) {
        const msg = `Test message from Ethereum Interceptor at ${new Date().toISOString()}`
        console.log("[Ethereum Interceptor] Test - Attempting to sign message...")
        await window.ethereum.request({
          method: 'personal_sign',
          params: [msg, accounts[0]]
        })
      }
    } catch (error) {
      console.log("[Ethereum Interceptor] Test error (this is expected if user rejects):", error)
    }
  }
  
  console.log("[Ethereum Interceptor] 💡 TIP: Run 'testEthereumInterceptor()' in console to test the interceptor")
})()

// Export empty object to satisfy module requirements
export {}