/**
 * @deprecated This module is being replaced by chat.ts which routes through the backend.
 * The backend handles API key encryption, provider routing, cost tracking, and usage recording.
 *
 * Use `import { sendChat } from './chat'` instead.
 *
 * This file is kept temporarily for backwards compatibility during migration.
 * It will be removed once all frontend components use the backend-routed chat API.
 */

export { sendChat as callAI } from './chat';
export type { ChatMessage as Message, ChatResponse } from './chat';
