// interest.schema.ts
import { LeadActionEnum, LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';

export const INTEREST_SCHEMA = {
  name: 'classify_interest',
  type: 'object',
  description: 'Classify whether the lead is interested based on outreach and their reply.',
  additionalProperties: false,
  properties: {
    interested: { type: 'boolean', description: 'True if the lead shows interest or asks for more info.' },
    intent: {
      type: 'string',
      description: 'Fine-grained intent label.',
      enum: Object.values(LeadIntentEnum),
    },
    reason: { type: 'string', description: 'One-sentence justification in plain language.' },
    confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Model confidence heuristic (0–1).' },
    suggestedReply: { type: 'string', description: 'A concise reply to send next (same language as the lead).' },
    action: {
      type: 'string',
      enum: Object.values(LeadActionEnum),
      description: 'Operational action to take.',
    },
    followUpAt: {
      type: 'string',
      description: 'If action is SCHEDULE_FOLLOW_UP, an ISO-8601 datetime with numeric timezone offset (e.g., +03:00).',
      format: 'date-time',
    },

    // 🆕 department classification
    department: {
      type: 'string',
      description: 'Department inferred solely from messages sent by YOU (the sender).',
      enum: Object.values(LeadDepartmentEnum),
    },
  },
  required: ['interested', 'intent', 'reason', 'confidence', 'suggestedReply', 'department'],
} as const;
