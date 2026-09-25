/**
 * AI Provider Abstraction (IAIProvider)
 *
 * Defines the contract for interchangeable AI providers.
 * The system must NEVER be hardcoded to a single AI provider.
 *
 * Key architectural constraint:
 * - The Writer and QA roles MUST use logically independent AI calls.
 * - A single inference must not both generate and approve content.
 */

/**
 * Role that determines which AI model/configuration to use.
 */
export type AIRole = 'writer' | 'qa' | 'researcher' | 'policy';

/**
 * A message in an AI conversation.
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Parameters for an AI completion request.
 */
export interface AICompletionRequest {
  messages: AIMessage[];
  role: AIRole;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

/**
 * Result of an AI completion.
 */
export interface AICompletionResult {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  durationMs: number;
}

/**
 * AI Provider interface.
 * Implementations: OpenAIProvider, AnthropicProvider, GoogleProvider, etc.
 */
export interface IAIProvider {
  readonly name: string;

  /**
   * Execute a completion request.
   */
  complete(request: AICompletionRequest): Promise<AICompletionResult>;

  /**
   * Check if the provider is properly configured and reachable.
   */
  healthCheck(): Promise<boolean>;
}
