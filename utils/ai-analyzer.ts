import { createParser } from 'eventsource-parser'

interface TransactionData {
  from: string
  to: string
  value?: string
  data?: string
  gas?: string
  gasPrice?: string
}

interface AISummaryCallback {
  onChunk: (chunk: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
}

// Fetch AI analysis from backend with streaming support
export async function fetchAITransactionAnalysis(
  transactionData: TransactionData,
  callbacks: AISummaryCallback
): Promise<void> {
  const BACKEND_URL = 'http://localhost:8000'
  
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: transactionData.from,
        to: transactionData.to,
        value: transactionData.value,
        data: transactionData.data,
        gas: transactionData.gas,
        gasPrice: transactionData.gasPrice
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let accumulatedText = ''
    
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    // Create SSE parser for handling the stream
    const parser = createParser({
      onEvent: (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.text) {
            accumulatedText += data.text
            callbacks.onChunk(data.text)
          }
        } catch (e) {
          // Handle non-JSON data
          if (event.data) {
            accumulatedText += event.data
            callbacks.onChunk(event.data)
          }
        }
      }
    })

    // Read the stream
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      
      // Check if it's SSE formatted data
      if (chunk.startsWith('data:')) {
        parser.feed(chunk)
      } else {
        // Handle plain text streaming
        accumulatedText += chunk
        callbacks.onChunk(chunk)
      }
    }
    
    callbacks.onComplete(accumulatedText)
  } catch (error) {
    console.error('[AI Analyzer] Error fetching analysis:', error)
    callbacks.onError(error as Error)
  }
}

// Simplified version for non-streaming response
export async function fetchAITransactionSummary(
  transactionData: TransactionData
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullText = ''
    
    fetchAITransactionAnalysis(transactionData, {
      onChunk: (chunk) => {
        fullText += chunk
      },
      onComplete: (text) => {
        resolve(text)
      },
      onError: (error) => {
        reject(error)
      }
    })
  })
}
