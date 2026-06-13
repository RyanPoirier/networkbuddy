export interface UserProfile {
  id: string
  email: string
  name: string
  school: string
  program: string
  year: string
  target_industries: string[]
  target_companies: string[]
  resume_summary: string | null
  onboarding_complete: boolean
  created_at: string
}

export interface Contact {
  id: string
  user_id: string
  full_name: string
  title: string
  company: string
  domain: string
  email: string | null
  linkedin_url: string | null
  email_verified: boolean
  last_verified_at: string | null
  created_at: string
}

export type LinkedInConnectionStatus = 'none' | 'pending' | 'connected'

export type InteractionType =
  | 'connection_sent'
  | 'connection_accepted'
  | 'linkedin_message'
  | 'email_sent'
  | 'reply_received'
  | 'note'

export interface Interaction {
  id: string
  user_id: string
  outreach_id: string
  type: InteractionType
  channel: 'linkedin' | 'email'
  content: string | null
  created_at: string
}

export type OutreachStatus =
  | 'saved'
  | 'contacted'
  | 'followed_up'
  | 'responded'
  | 'coffee_chat_booked'
  | 'referral_received'

export interface OutreachRecord {
  id: string
  user_id: string
  contact_id: string
  status: OutreachStatus
  linkedin_connection_status: LinkedInConnectionStatus
  connection_requested_at: string | null
  email_sent_at: string | null
  followup_due_at: string | null
  notes: string | null
  created_at: string
  contact?: Contact
}

export interface GeneratedMessages {
  email_subject: string
  email_body: string
  linkedin_message: string
}

export const OUTREACH_COLUMNS: { key: OutreachStatus; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'followed_up', label: 'Followed Up' },
  { key: 'responded', label: 'Responded' },
  { key: 'coffee_chat_booked', label: 'Coffee Chat Booked' },
  { key: 'referral_received', label: 'Referral Received' },
]

export const INDUSTRIES = [
  'Technology',
  'Finance',
  'Consulting',
  'Healthcare',
  'Consumer Goods',
  'Media & Entertainment',
  'Energy',
  'Real Estate',
  'Government',
  'Non-Profit',
  'Education',
  'Manufacturing',
  'Retail',
  'Transportation',
  'Legal',
]

export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduate']
