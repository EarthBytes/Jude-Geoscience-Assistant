export type TaskType =
  | 'general'
  | 'facts'
  | 'compare'
  | 'borders'
  | 'concepts'
  | 'quiz'
  | 'map'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  timestamp: string
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

export interface ChatMetaEvent {
  conversation_id: string | null
  persisted: boolean
  user_message: Message
}

export interface ChatDoneEvent {
  conversation_id: string | null
  persisted: boolean
  assistant_message: Message
}

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}
