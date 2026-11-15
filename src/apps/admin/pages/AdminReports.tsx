// ── §12 Reports & exports ────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileSpreadsheet } from 'lucide-react'
import { fmtNum } from '@/shared/lib/utils'
import { toast } from '@/shared/lib/toast'
import { Button, Skeleton } from '@/shared/components/ui/base'
import { PageHeader, RangeToggle, TabPills } from '@/shared/components/misc'
import { DataTable, Pagination, type Column } from '@/shared/components/DataTable'
import { ExportJobRow, SectionCard } from '@/shared/components/domain'
import { Select } from '@/shared/components/ui/form'
import { MeadowScene } from '@/shared/illustrations/scenes'
import { useStagger } from '@/shared/hooks/misc'
import { useExportJobs, useReportPreview, useStoreOptions } from '@/apps/admin/api/queries'
import { useExportActions } from '@/apps/admin/api/mutations'
import { getReportPreview } from '@/shared/data/api'
import { downloadXlsx } from '@/shared/services/exports'
import type { ExportJob, ReportTab } from '@/shared/types'

const REPORT_TABS: Array<{ value: ReportTab; label: string; storeFilter: boolean; rangeFilter: boolean }> = [
  { value: 'catalog_stock', label: 'Catalog & stock', storeFilter: true, rangeFilter: false },
  { value: 'financial', label: 'Financial activity', storeFilter: true, rangeFilter: true },
  { value: 'picking', label: 'Picking & store performance', storeFilter: true, rangeFilter: true },
  { value: 'rider_activity', label: 'Rider activity', storeFilter: true, rangeFilter: true },
  { value: 'subscriptions', label: 'Subscriptions', storeFilter: false, rangeFilter: false },
  { value: 'support', label: 'Support activity', storeFilter: false, rangeFilter: false },
]
const RANGE_LABEL: Record<string, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }

/* ── Preview table with columns derived from the first row ──── */
function PreviewTable({ tab, page, onPage }: { tab: ReportTab; page: number; onPage: (p: number) => void }) {
  const query = useReportPreview(tab)
  const rows = query.data ?? []
  const keys = rows.length > 0 ? Object.keys(rows[0]!) : []

  const cols: Array<Column<Record<string, string | number>>> = keys.map((k) => ({
    key: k,
    header: k,
    align: typeof rows[0]?.[k] === 'number' ? 'right' : 'left',
    render: (r) => {
      const v = r[k]
      return typeof v === 'number' ? <span className="tabular font-medium">{fmtNum(v)}</span> : <span>{v}</span>
    },
  }))

  const pageSize = 10
  const total = rows.length
  const totalPages = Math.ceil(total / pageSize)
  const safePage = Math.min(page, Math.max(1, totalPages))
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1

  if (query.isLoading) {
    return (
      <div className="space-y-2 rounded-card border border-border/70 bg-card p-4 shadow-soft">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    )
  }

  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize).map((r, i) => ({ ...r, __idx: (safePage - 1) * pageSize + i }))

  return (
    <div className="rounded-card border border-border/70 bg-card shadow-soft">
      <DataTable
        columns={cols}
        rows={pagedRows}
        keyId={(r) => `${tab}-${r.__idx}`}
        loading={false}
        skeletonRows={8}
        empty={<div className="flex flex-col items-center gap-2 py-12 text-center"><p className="text-sm font-bold">No rows for this report</p><p className="text-xs text-muted-foreground">Adjust filters or try another tab.</p></div>}
        footer={
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onChange={onPage}
            showing={total > 0 ? `Preview ${start}–${Math.min(safePage * pageSize, total)} of ${fmtNum(total)} rows` : 'No results'}
          />
        }
      />
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export function AdminReports() {
  const stagger = useStagger()
  const exportActions = useExportActions()
  const storeOptions = useStoreOptions()
  const [tab, setTab] = useState<ReportTab>('catalog_stock')
  const [storeId, setStoreId] = useState('all')
  const [range, setRange] = useState('7d')
  const [page, setPage] = useState(1)

  const meta = REPORT_TABS.find((t) => t.value === tab)!
  useEffect(() => { setStoreId('all'); setRange('7d'); setPage(1) }, [tab])

  const storeLabel = storeId === 'all' ? 'All stores' : storeOptions.data?.find((o) => o.value === storeId)?.label ?? storeId
  const filtersSummary = [storeLabel, meta.rangeFilter ? RANGE_LABEL[range] ?? range : null].filter(Boolean).join(' · ')

  const runExport = () => {
    exportActions.createJob(tab, meta.label, filtersSummary)
    toast.info(`Export queued — it will appear below when complete`)
  }

  const handleDownload = async (job: ExportJob) => {
    const rows = await getReportPreview(job.tab)
    await downloadXlsx([{ name: job.tab, rows }], job.fileName ?? `${job.tab}.xlsx`)
    toast.success(`Downloaded ${job.fileName ?? job.tab}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        titleAccent="& exports"
        breadcrumb={['Reports']}
        subtitle="Operational report previews with real .xlsx exports — jobs run in the background and download here when complete."
        illustration={<MeadowScene variant="reports" />}
      />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-5">
        <motion.section variants={stagger.item}>
          <TabPills id="reports-tabs" tabs={REPORT_TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => setTab(v as ReportTab)} />
        </motion.section>

        <motion.section variants={stagger.item} className="space-y-4" key={tab}>
          <div className="flex flex-wrap items-center gap-3">
            {meta.storeFilter && (
              <Select
                className="w-52"
                value={storeId}
                onValueChange={setStoreId}
                options={[{ value: 'all', label: 'All stores' }, ...(storeOptions.data ?? [])]}
              />
            )}
            {meta.rangeFilter && <RangeToggle id={`reports-range-${tab}`} value={range} onChange={setRange} />}
            <div className="ml-auto">
              <Button variant="primary" size="md" onClick={runExport}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
          </div>
          <PreviewTable tab={tab} page={page} onPage={setPage} />
        </motion.section>

        <motion.section variants={stagger.item}>
          <SectionCard
            title="Exports"
            subtitle="Jobs run in the background — pending shows a spinner, failed shows the error, complete downloads as .xlsx."
            action={<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><FileSpreadsheet className="h-3.5 w-3.5" /> .xlsx</span>}
          >
            <ExportJobsList onDownload={handleDownload} />
          </SectionCard>
        </motion.section>
      </motion.div>
    </div>
  )
}

function ExportJobsList({ onDownload }: { onDownload: (job: ExportJob) => void | Promise<void> }) {
  const query = useExportJobs()
  const jobs = query.data ?? []
  if (query.isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
  }
  if (jobs.length === 0) {
    return <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-[13px] text-muted-foreground">No export jobs yet — run one from any report tab above.</p>
  }
  return (
    <div className="space-y-2.5">
      {jobs.map((job) => <ExportJobRow key={job.id} job={job} onDownload={onDownload} />)}
    </div>
  )
}
