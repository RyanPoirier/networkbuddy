'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { OutreachRecord, OutreachStatus, OUTREACH_COLUMNS } from '@/types'
import { Clock, Mail, ExternalLink } from 'lucide-react'
import LinkedInIcon from '@/components/ui/LinkedInIcon'
import { formatDistanceToNow, isPast } from 'date-fns'
import OutreachModal from '@/components/outreach/OutreachModal'

export default function KanbanBoard({
  initialGrouped,
}: {
  initialGrouped: Record<string, OutreachRecord[]>
}) {
  const [grouped, setGrouped] = useState(initialGrouped)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function findRecord(id: string): OutreachRecord | undefined {
    return Object.values(grouped).flat().find(r => r.id === id)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const recordId = active.id as string
    const newStatus = over.id as OutreachStatus
    const record = findRecord(recordId)
    if (!record || record.status === newStatus) return

    // Optimistic update
    setGrouped(prev => {
      const next = { ...prev }
      next[record.status] = next[record.status].filter(r => r.id !== recordId)
      next[newStatus] = [{ ...record, status: newStatus }, ...next[newStatus]]
      return next
    })

    await fetch('/api/outreach/save', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recordId, status: newStatus }),
    })
  }

  const activeRecord = activeId ? findRecord(activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-8 px-8">
        {OUTREACH_COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            records={grouped[col.key] ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeRecord ? <KanbanCardPreview record={activeRecord} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  columnKey,
  label,
  records,
}: {
  columnKey: OutreachStatus
  label: string
  records: OutreachRecord[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey })

  const COLUMN_COLORS: Record<OutreachStatus, string> = {
    saved: 'bg-content/40',
    contacted: 'bg-blue-500',
    followed_up: 'bg-amber-500',
    responded: 'bg-emerald-500',
    coffee_chat_booked: 'bg-accent',
    referral_received: 'bg-violet-500',
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-2xl p-3 transition-colors ${
        isOver ? 'bg-accent/10 border-2 border-accent' : 'bg-content/5 border-2 border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`w-2 h-2 rounded-full ${COLUMN_COLORS[columnKey]}`} />
        <span className="text-xs font-semibold text-content/60 uppercase tracking-wide">{label}</span>
        <span className="ml-auto text-xs font-bold text-content/50 bg-content/10 rounded-full px-1.5 py-0.5">
          {records.length}
        </span>
      </div>
      <div className="space-y-2 min-h-[4rem]">
        {records.map(record => (
          <KanbanCard key={record.id} record={record} />
        ))}
      </div>
    </div>
  )
}

function KanbanCard({ record }: { record: OutreachRecord }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: record.id })
  const [showOutreach, setShowOutreach] = useState(false)

  const followupDue =
    record.followup_due_at &&
    record.status === 'contacted' &&
    isPast(new Date(record.followup_due_at))

  return (
    <>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={`kanban-card bg-surface rounded-xl p-3 shadow-sm border border-line/10 transition-opacity ${
          isDragging ? 'opacity-30' : ''
        }`}
      >
        <div className="flex items-start gap-2 mb-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {record.contact?.full_name?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-content truncate leading-tight">
              {record.contact?.full_name}
            </p>
            <p className="text-xs text-content/45 truncate">{record.contact?.title}</p>
          </div>
          {followupDue && (
            <span className="flex-shrink-0 w-2 h-2 bg-accent rounded-full badge-followup" title="Follow up due" />
          )}
        </div>

        <p className="text-xs text-content/55 mb-3 truncate">{record.contact?.company}</p>

        {followupDue && (
          <div className="flex items-center gap-1 text-xs text-accent mb-2 font-medium">
            <Clock className="w-3 h-3" />
            Follow up overdue
          </div>
        )}

        <div className="flex gap-1.5" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={() => setShowOutreach(true)}
            className="flex items-center gap-1 text-xs text-content/60 hover:text-content bg-content/5 hover:bg-content/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Mail className="w-3 h-3" />
            Message
          </button>
          {record.contact?.linkedin_url && (
            <a
              href={record.contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-content/60 hover:text-blue-500 bg-content/5 hover:bg-content/10 px-2 py-1 rounded-lg transition-colors"
            >
              <LinkedInIcon className="w-3 h-3" />
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>

      {showOutreach && record.contact && (
        <OutreachModal
          contact={record.contact}
          onClose={() => setShowOutreach(false)}
        />
      )}
    </>
  )
}

function KanbanCardPreview({ record }: { record: OutreachRecord }) {
  return (
    <div className="bg-surface rounded-xl p-3 shadow-lg border border-accent w-64 rotate-2">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {record.contact?.full_name?.[0] ?? '?'}
        </div>
        <div>
          <p className="text-sm font-semibold text-content">{record.contact?.full_name}</p>
          <p className="text-xs text-content/45">{record.contact?.company}</p>
        </div>
      </div>
    </div>
  )
}
