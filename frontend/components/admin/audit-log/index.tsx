'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { AuditRow, SuccessFilter } from './types'
import { Filters } from './filters'
import { ResultsTable } from './results-table'

interface AuditLogSectionProps {
  accessToken: string
}

export default function AuditLogSection({ accessToken }: AuditLogSectionProps) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  })
  const [loading, setLoading] = useState(true)

  // Filters
  const [event, setEvent] = useState('')
  const [clientId, setClientId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>('all')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')

  // Expanded row IDs (multi-open allowed)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', '50')
        if (event) params.set('event', event)
        if (clientId) params.set('clientId', clientId)
        if (companyId) params.set('companyId', companyId)
        if (successFilter !== 'all') params.set('success', successFilter)
        if (since) params.set('since', new Date(since).toISOString())
        if (until) params.set('until', new Date(until).toISOString())

        const res = await api.get(`/admin/audit-log?${params.toString()}`, config)
        setRows(res.data.rows)
        setPagination(res.data.pagination)
      } catch {
        toast.error('Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [config, event, clientId, companyId, successFilter, since, until],
  )

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, clientId, companyId, successFilter, since, until])

  const resetFilters = () => {
    setEvent('')
    setClientId('')
    setCompanyId('')
    setSuccessFilter('all')
    setSince('')
    setUntil('')
  }

  const toggleRow = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeFilterCount = [
    event,
    clientId,
    companyId,
    successFilter !== 'all' ? successFilter : '',
    since,
    until,
  ].filter(Boolean).length

  return (
    <div className="space-y-4">
      <Filters
        event={event}
        setEvent={setEvent}
        clientId={clientId}
        setClientId={setClientId}
        companyId={companyId}
        setCompanyId={setCompanyId}
        successFilter={successFilter}
        setSuccessFilter={setSuccessFilter}
        since={since}
        setSince={setSince}
        until={until}
        setUntil={setUntil}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      />

      <ResultsTable
        rows={rows}
        loading={loading}
        pagination={pagination}
        activeFilterCount={activeFilterCount}
        openIds={openIds}
        toggleRow={toggleRow}
        onPage={load}
      />
    </div>
  )
}
