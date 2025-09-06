// Type declarations for window.ethereum

interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, handler: (...args: any[]) => void) => void
  removeListener: (event: string, handler: (...args: any[]) => void) => void
  isMetaMask?: boolean
  selectedAddress?: string | null
  chainId?: string | null
  providers?: EthereumProvider[]  // For multiple wallet support
  _metamask?: {
    isUnlocked: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export {}
