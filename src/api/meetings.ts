/**
 * Meeting room API -- multi-agent discussions with file context.
 */

import { apiRequest } from './client';

// -- Types ----------------------------------------------------------------

export interface MeetingRow {
  id: string;
  topic: string;
  participants: string[];
  messages: MeetingMessage[];
  file_context: FileContext[];
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface MeetingMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderModel?: string;
  content: string;
  timestamp: number;
  isUser: boolean;
  costUsd?: number;
}

export interface FileContext {
  filename: string;
  content: string;
  mimeType: string;
}

export interface MeetingAskResult {
  response: string;
  model: string;
  agentName: string;
  costUsd: number;
  latencyMs: number;
}

// -- Endpoints ------------------------------------------------------------

/** List meetings (optionally filter by status). */
export function listMeetings(status?: string): Promise<MeetingRow[]> {
  const qs = status ? `?status=${status}` : '';
  return apiRequest(`/api/meetings${qs}`);
}

/** Fetch a single meeting with full messages. */
export function getMeeting(meetingId: string): Promise<MeetingRow> {
  return apiRequest(`/api/meetings/${meetingId}`);
}

/** Start a new meeting. */
export function startMeetingApi(data: {
  topic: string;
  participants: string[];
  fileContext?: FileContext[];
}): Promise<MeetingRow> {
  return apiRequest('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Add/update file context on an active meeting. */
export function updateMeetingContext(
  meetingId: string,
  fileContext: FileContext[],
): Promise<{ id: string; file_context: FileContext[] }> {
  return apiRequest(`/api/meetings/${meetingId}/context`, {
    method: 'PATCH',
    body: JSON.stringify({ fileContext }),
  });
}

/** Append a user message to an active meeting. */
export function addMeetingMessage(
  meetingId: string,
  message: MeetingMessage,
): Promise<MeetingRow> {
  return apiRequest(`/api/meetings/${meetingId}/message`, {
    method: 'PATCH',
    body: JSON.stringify({ message }),
  });
}

/** Ask a specific desk/model in a meeting and get an AI response. */
export function askInMeeting(
  meetingId: string,
  deskId: string,
  content: string,
  options?: {
    modelId?: string;
    round?: number;
    otherResponses?: { agentName: string; content: string }[];
  },
): Promise<MeetingAskResult> {
  return apiRequest(`/api/meetings/${meetingId}/ask`, {
    method: 'POST',
    body: JSON.stringify({
      deskId,
      content,
      modelId: options?.modelId,
      round: options?.round,
      otherResponses: options?.otherResponses,
    }),
  });
}

/** End an active meeting. */
export function endMeetingApi(
  meetingId: string,
): Promise<{ id: string; topic: string; status: string; ended_at: string }> {
  return apiRequest(`/api/meetings/${meetingId}/end`, {
    method: 'PATCH',
  });
}

/** Reactivate an ended meeting. */
export function reactivateMeeting(
  meetingId: string,
): Promise<MeetingRow> {
  return apiRequest(`/api/meetings/${meetingId}/reactivate`, {
    method: 'PATCH',
  });
}

/** Delete a single meeting. */
export function deleteMeeting(
  meetingId: string,
): Promise<{ message: string; id: string }> {
  return apiRequest(`/api/meetings/${meetingId}`, {
    method: 'DELETE',
  });
}

/** Delete all meetings for the team. */
export function clearAllMeetings(): Promise<{ message: string; count: number }> {
  return apiRequest('/api/meetings', {
    method: 'DELETE',
  });
}
