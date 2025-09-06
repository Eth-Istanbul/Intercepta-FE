// utils/ai-analyzer.ts

// Represents the structure of an intercepted transaction for AI analysis
export interface AIAnalysisRequest {
  id: string
  method: string
  params: any[]
  timestamp: number
  origin: string
  userAgent: string
  intercepted: boolean
  status: "pending" | "approved" | "rejected"
}

// Represents the structure of the AI analysis response
export interface AIAnalysisResponse {
  id: string
  method: string
  success: boolean
  analysis: {
    type: string
    riskLevel: string
    fraudScore: number
    description: string
    reasoning: string
    warnings: string[]
    contractInfo: {
      address: string
      abiAvailable: boolean
      abiSource: string
      sourceCodeAvailable: boolean
      functionName: string
      functionDescription: string
    }
    aiConfidence: number
  }
  timestamp: string
}

const API_ENDPOINT = "http://localhost:3000/tx/ai-analyze"

/**
 * Fetches transaction analysis from the AI backend.
 * @param transactionData - The intercepted transaction data.
 * @returns A promise that resolves to the AI analysis response.
 */
export async function fetchAIAnalysis(
  transactionData: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(transactionData)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("[AI Analyzer] HTTP error:", response.status, errorBody)
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const analysisResult: AIAnalysisResponse = await response.json()
    console.log("[AI Analyzer] Analysis received:", analysisResult)
    return analysisResult
    
  } catch (error) {
    console.error("[AI Analyzer] Error fetching analysis:", error)
    // Re-throw the error so the caller can handle it
    throw error
  }
}
