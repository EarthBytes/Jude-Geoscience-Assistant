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
  conversation_id: string
  user_message: Message
}

export interface ChatDoneEvent {
  conversation_id: string
  assistant_message: Message
}

export const TASKS: { id: TaskType; label: string; hint: string }[] = [
  { id: 'general', label: 'Ask', hint: 'Open geography questions' },
  { id: 'facts', label: 'Facts', hint: 'Country & place facts' },
  { id: 'compare', label: 'Compare', hint: 'Side-by-side places' },
  { id: 'borders', label: 'Borders', hint: 'Neighbours & regions' },
  { id: 'concepts', label: 'Concepts', hint: 'Terms & processes' },
  { id: 'quiz', label: 'Quiz', hint: 'Revision questions' },
  { id: 'map', label: 'Map', hint: 'Interpret a map' },
]
