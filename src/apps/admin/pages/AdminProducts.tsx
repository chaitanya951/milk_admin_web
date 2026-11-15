import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Plus, FileUp, MoreVertical, Pencil, Package, Store as StoreIcon, Trash2,
  Send, EyeOff, Eye, Save,
} from 'lucide-react'
import { useStagger, useDebouncedValue } from '@/shared/hooks/misc'
import { useProducts, useStores } from '@/apps/admin/api/queries'
import { useProductActions } from '@/apps/admin/api/mutations'
import { useDB } from '@/shared/data/db'
import { PageHeader, SearchInput, StatusPill, EmptyState } from '@/shared/components/misc'
import { Select, Field } from '@/shared/components/ui/form'
import { Button, Card, Input, Switch, Badge, Textarea, Label } from '@/shared/components/ui/base'
import {
  Dialog, DialogContent, Drawer, ConfirmDialog, DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownItem, DropdownSeparator,
} from '@/shared/components/ui/overlays'
import { DataTable, Pagination } from '@/shared/components/DataTable'
import { ApprovalBadge, CsvImportWizard } from '@/shared/components/domain'
import { ProductTile } from '@/shared/illustrations/productIcons'
import { ProductsScene } from '@/shared/illustrations/scenes'
import type { Product, ProductIcon, Variant, VariantAvailability } from '@/shared/types'
import { fmtINR } from '@/shared/lib/utils'

/* ── Local helpers ─────────────────────────────────────────── */
const ICON_POOL: ProductIcon[] = ['milk', 'paneer', 'ghee', 'curd', 'butter', 'lassi', 'buttermilk', 'cream', 'cheese', 'khoya', 'flavored_milk']
const iconFor = (imageVariant: number): ProductIcon => ICON_POOL[imageVariant % ICON_POOL.length]!
const STORAGE_LABEL: Record<Product['storage'], string> = { chilled: 'Chilled', ambient: 'Ambient', frozen: 'Frozen' }

/* ── Variant edit dialog (price/label/active + approval flow) ─ */
const variantSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  price: z.coerce.number({ invalid_type_error: 'Price must be a number' }).min(1, 'Price must be at least ₹1'),
  active: z.boolean(),
  requiresApproval: z.boolean(),
  reason: z.string(),
}).superRefine((v, ctx) => {
  if (v.requiresApproval && v.reason.trim().length < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A reason is required when sending for approval' })
  }
})
type VariantFormValues = z.infer<typeof variantSchema>

function VariantEditDialog({ open, onOpenChange, product, variant, onSave, onRequestApproval }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product
  variant: Variant | null
  onSave: (values: VariantFormValues) => void
  onRequestApproval: (values: VariantFormValues) => void
}) {
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: { label: '', price: 0, active: true, requiresApproval: false, reason: '' },
  })
  useEffect(() => {
    if (open && variant) reset({ label: variant.label, price: variant.price, active: variant.active, requiresApproval: false, reason: '' })
  }, [open, variant, reset])

  const wantsApproval = watch('requiresApproval')

  const submit = (v: VariantFormValues) => {
    if (v.requiresApproval) onRequestApproval(v)
    else onSave(v)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${product.name} – ${variant?.label ?? ''}`} description="Price edits on published products can be routed through approvals">
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <Field label="Label" required error={errors.label?.message}><Input {...register('label')} /></Field>
          <Field label="Price (₹)" required error={errors.price?.message}><Input type="number" {...register('price')} /></Field>
          <Controller control={control} name="active" render={({ field }) => (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div><Label className="mb-0">Variant active</Label><p className="text-xs text-muted-foreground">Inactive variants are hidden from new orders</p></div>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )} />
          <Controller control={control} name="requiresApproval" render={({ field }) => (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 dark:border-amber-500/30">
              <div>
                <Label className="mb-0">Requires approval?</Label>
                <p className="text-xs text-muted-foreground">Sends a price-change request to /approvals instead of applying it</p>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )} />
          {wantsApproval && (
            <Field label="Reason for approval request" required error={errors.reason?.message} hint="Shown to the approving admin">
              <Textarea {...register('reason')} placeholder="e.g. Input milk cost up 8% this week" />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md">
              {wantsApproval ? <><Send className="h-4 w-4" /> Send for approval</> : <><Save className="h-4 w-4" /> Save variant</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Add/Edit product dialog (RHF + zod) ───────────────────── */
const productSchema = z.object({
  name: z.string().min(2, 'Product name is required'),
  categoryId: z.string().min(1, 'Pick a category'),
  brandId: z.string().min(1, 'Pick a brand'),
  taxRatePct: z.coerce.number({ invalid_type_error: 'Tax must be a number' }).min(0).max(28),
  shelfLifeDays: z.coerce.number({ invalid_type_error: 'Shelf life must be a number' }).int().min(1, 'At least 1 day'),
  storage: z.enum(['chilled', 'ambient', 'frozen']),
  description: z.string(),
  publishNow: z.boolean(),
})
type ProductFormValues = z.infer<typeof productSchema>

interface VariantRowInput { label: string; price: string }

function ProductFormDialog({ open, onOpenChange, initial, categories, brands, onSubmit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Product | null
  categories: Array<{ id: string; name: string }>
  brands: Array<{ id: string; name: string }>
  onSubmit: (values: ProductFormValues, variantRows: VariantRowInput[]) => void
}) {
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', categoryId: '', brandId: '', taxRatePct: 5, shelfLifeDays: 7, storage: 'chilled', description: '', publishNow: true },
  })
  const [variantRows, setVariantRows] = useState<VariantRowInput[]>([{ label: '', price: '' }])

  useEffect(() => {
    if (open) {
      reset(initial
        ? { name: initial.name, categoryId: initial.categoryId, brandId: initial.brandId, taxRatePct: initial.taxRatePct, shelfLifeDays: initial.shelfLifeDays, storage: initial.storage, description: initial.description, publishNow: initial.publishState === 'published' }
        : { name: '', categoryId: '', brandId: '', taxRatePct: 5, shelfLifeDays: 7, storage: 'chilled', description: '', publishNow: true })
      setVariantRows([{ label: '', price: '' }])
    }
  }, [open, initial, reset])

  const priceError = variantRows.some((r) => r.label.trim() && (!r.price || Number(r.price) <= 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={initial ? `Edit ${initial.name}` : 'Add product'} wide description="Catalog entry with its initial pack sizes">
        <form onSubmit={handleSubmit((v) => {
          const rows = variantRows.filter((r) => r.label.trim() && Number(r.price) > 0)
          if (!initial && rows.length === 0) return
          onSubmit(v, rows)
        })} className="space-y-3">
          <Field label="Name" required error={errors.name?.message}><Input {...register('name')} placeholder="e.g. Organic Cow Milk" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required error={errors.categoryId?.message}>
              <Controller control={control} name="categoryId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Pick category" />
              )} />
            </Field>
            <Field label="Brand" required error={errors.brandId?.message}>
              <Controller control={control} name="brandId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={brands.map((b) => ({ value: b.id, label: b.name }))} placeholder="Pick brand" />
              )} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tax %" error={errors.taxRatePct?.message}><Input type="number" {...register('taxRatePct')} /></Field>
            <Field label="Shelf life (days)" error={errors.shelfLifeDays?.message}><Input type="number" {...register('shelfLifeDays')} /></Field>
            <Field label="Storage">
              <Controller control={control} name="storage" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} options={[
                  { value: 'chilled', label: 'Chilled' }, { value: 'ambient', label: 'Ambient' }, { value: 'frozen', label: 'Frozen' },
                ]} />
              )} />
            </Field>
          </div>
          <Field label="Description" error={errors.description?.message}><Textarea {...register('description')} placeholder="Short customer-facing description" /></Field>

          {!initial && (
            <div>
              <Label>Initial variants</Label>
              <div className="space-y-2">
                {variantRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(e) => setVariantRows((rs) => rs.map((r, k) => (k === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="Label, e.g. 500 ml"
                      className="flex-1"
                    />
                    <Input
                      value={row.price}
                      onChange={(e) => setVariantRows((rs) => rs.map((r, k) => (k === i ? { ...r, price: e.target.value } : r)))}
                      placeholder="₹ price"
                      type="number"
                      className="w-28"
                    />
                    {variantRows.length > 1 && (
                      <Button type="button" size="iconSm" variant="ghost" aria-label="Remove variant row" onClick={() => setVariantRows((rs) => rs.filter((_, k) => k !== i))}>×</Button>
                    )}
                  </div>
                ))}
              </div>
              {priceError && <p className="mt-1 text-xs font-medium text-destructive">Every labelled variant needs a positive price</p>}
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setVariantRows((rs) => [...rs, { label: '', price: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Add variant row
              </Button>
            </div>
          )}

          <Controller control={control} name="publishNow" render={({ field }) => (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <Label className="mb-0">{initial ? 'Published' : 'Publish now'}</Label>
                <p className="text-xs text-muted-foreground">Visible on the customer storefront</p>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )} />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md"><Save className="h-4 w-4" /> {initial ? 'Save product' : 'Create product'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Product detail drawer ─────────────────────────────────── */
function ProductDrawer({ product, variants, stores, storeVariants, onClose, onUpdateVariant, onRequestApproval, onUpdateAvailability }: {
  product: Product
  variants: Variant[]
  stores: Array<{ id: string; name: string }>
  storeVariants: VariantAvailability[]
  onClose: () => void
  onUpdateVariant: (v: Variant, values: VariantFormValues) => void
  onRequestApproval: (v: Variant, values: VariantFormValues) => void
  onUpdateAvailability: (variantId: string, storeId: string, patch: { available: boolean; priceOverride: number | null }) => void
}) {
  const [editVariant, setEditVariant] = useState<Variant | null>(null)
  const [availVariantId, setAvailVariantId] = useState(variants[0]?.id ?? '')

  return (
    <Drawer open onOpenChange={(v) => { if (!v) onClose() }} width="lg" title={product.name} subtitle={`${STORAGE_LABEL[product.storage]} · ${product.shelfLifeDays} days shelf life`}>
      <div className="space-y-5">
        {/* details */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
          <p className="text-[13px] text-foreground/85">{product.description || 'No description yet.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">{product.taxRatePct}% tax</Badge>
            <Badge tone="violet">{product.shelfLifeDays} days shelf life</Badge>
            <Badge>{STORAGE_LABEL[product.storage]}</Badge>
            <Badge tone={product.subscribable ? 'green' : 'neutral'}>{product.subscribable ? 'Subscribable' : 'One-time purchase'}</Badge>
            <ApprovalBadge pendingApprovalId={product.pendingApprovalId} label={product.pendingChangeLabel ?? 'Pending approval'} />
          </div>
        </div>

        {/* variant list */}
        <section>
          <h4 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">Variants ({variants.length})</h4>
          <div className="space-y-1.5">
            {variants.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    {v.label}
                    {!v.active && <Badge tone="neutral">Inactive</Badge>}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">SKU {v.sku} · barcode {v.barcode}</p>
                </div>
                <span className="shrink-0 text-[13.5px] font-bold tabular">{fmtINR(v.price)}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditVariant(v)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              </div>
            ))}
          </div>
        </section>

        {/* store availability */}
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground"><StoreIcon className="h-3.5 w-3.5" /> Store availability</h4>
          {variants.length > 1 && (
            <div className="mb-2 w-56">
              <Select value={availVariantId} onValueChange={setAvailVariantId} options={variants.map((v) => ({ value: v.id, label: v.label }))} />
            </div>
          )}
          <div className="space-y-1.5">
            {stores.map((s) => {
              const sv = storeVariants.find((x) => x.variantId === availVariantId && x.storeId === s.id)
              const override = sv?.priceOverride ?? null
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{s.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">Override ₹</span>
                    <Input
                      type="number"
                      value={override ?? ''}
                      placeholder="—"
                      className="h-8 w-24"
                      onChange={(e) => onUpdateAvailability(availVariantId, s.id, { available: sv?.available ?? true, priceOverride: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <Switch
                    checked={sv?.available ?? false}
                    onCheckedChange={(v) => onUpdateAvailability(availVariantId, s.id, { available: v, priceOverride: override })}
                  />
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <VariantEditDialog
        open={!!editVariant}
        onOpenChange={(v) => { if (!v) setEditVariant(null) }}
        product={product}
        variant={editVariant}
        onSave={(values) => { if (editVariant) onUpdateVariant(editVariant, values) }}
        onRequestApproval={(values) => { if (editVariant) onRequestApproval(editVariant, values) }}
      />
    </Drawer>
  )
}

/* ── CSV row shape ─────────────────────────────────────────── */
interface ProductCsvRow { name: string; category: string; brand: string; variantLabel: string; price: number; sku: string }

/* ── Page ──────────────────────────────────────────────────── */
export function AdminProducts() {
  const container = useStagger()
  const db = useDB((s) => s.db)
  const actions = useProductActions()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [categoryId, setCategoryId] = useState('all')
  const [brandId, setBrandId] = useState('all')
  const [state, setState] = useState('all')
  const [page, setPage] = useState(1)

  const productsQ = useProducts({ search: debouncedSearch || undefined, categoryId, brandId, state, page, pageSize: 8 })
  const storesQ = useStores()
  const stores = storesQ.data ?? []
  const total = productsQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 8))
  const categories = productsQ.data?.categories ?? []
  const brands = productsQ.data?.brands ?? []

  useEffect(() => { setPage(1) }, [debouncedSearch, categoryId, brandId, state])

  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const [publishTarget, setPublishTarget] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)

  // SKU uniqueness across the catalog AND prior rows of the file being validated
  const csvSeenSkus = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (csvOpen) csvSeenSkus.current = new Set(db.variants.map((v) => v.sku.toLowerCase()))
  }, [csvOpen, db.variants])

  // variants + availability for the open drawer (read live from the store so edits reflect instantly)
  const detailProduct = detail ? db.products.find((p) => p.id === detail.id) ?? detail : null
  const detailVariants = detailProduct ? db.variants.filter((v) => v.productId === detailProduct.id) : []

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? '—'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products &"
        titleAccent="pricing"
        subtitle="Catalog, pack sizes, store-level pricing and the approval flow for sensitive changes."
        illustration={<ProductsScene />}
        breadcrumb={['Products']}
      />

      <motion.div variants={container.container} initial="hidden" animate="show" className="space-y-4">
        <motion.section variants={container.item} className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU or barcode…" className="min-w-[220px] flex-1" />
          <div className="w-40">
            <Select value={categoryId} onValueChange={setCategoryId} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          <div className="w-44">
            <Select value={brandId} onValueChange={setBrandId} options={[{ value: 'all', label: 'All brands' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
          </div>
          <div className="w-40">
            <Select value={state} onValueChange={setState} options={[
              { value: 'all', label: 'All states' }, { value: 'published', label: 'Published' }, { value: 'unpublished', label: 'Unpublished' },
            ]} />
          </div>
          <Button variant="primary" size="md" onClick={() => { setEditingProduct(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
          <Button variant="secondary" size="md" onClick={() => setCsvOpen(true)}>
            <FileUp className="h-4 w-4" /> CSV import
          </Button>
        </motion.section>

        <motion.section variants={container.item} className="space-y-3">
          <Card className="overflow-hidden">
            <DataTable
              keyId={(r) => r.product.id}
              rows={productsQ.data?.rows ?? []}
              loading={productsQ.isLoading}
              onRowClick={(r) => setDetail(r.product)}
              empty={<EmptyState icon={Package} title="No products match" body="Try a different search, category, brand or state filter." />}
              columns={[
                {
                  key: 'name', header: 'Product',
                  render: (r) => (
                    <div className="flex items-center gap-3">
                      <ProductTile icon={iconFor(r.product.imageVariant)} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{r.product.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{catName(r.product.categoryId)} · {brandName(r.product.brandId)}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'variants', header: 'Variants',
                  render: (r) => (
                    <div className="flex max-w-[260px] flex-wrap gap-1.5">
                      {r.variants.map((v) => (
                        <Badge key={v.id} tone="neutral" className="max-w-full gap-1.5">
                          <span className="truncate">{v.label} · {fmtINR(v.price)}</span>
                          <span className="font-mono text-[9.5px] opacity-60">{v.sku}</span>
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'price', header: 'Price range',
                  render: (r) => <span className="font-semibold tabular">{r.minPrice === r.maxPrice ? fmtINR(r.minPrice) : `${fmtINR(r.minPrice)}–${fmtINR(r.maxPrice)}`}</span>,
                },
                {
                  key: 'stores', header: 'Stores',
                  render: (r) => <span className="tabular">{r.storeCount} <span className="text-xs text-muted-foreground">of {stores.length}</span></span>,
                },
                { key: 'tax', header: 'Tax', render: (r) => <span className="tabular">{r.product.taxRatePct}%</span> },
                { key: 'shelf', header: 'Shelf life', render: (r) => <span>{r.product.shelfLifeDays} days</span> },
                { key: 'state', header: 'State', render: (r) => <StatusPill status={r.product.publishState} /> },
                {
                  key: 'pending', header: 'Pending',
                  render: (r) => <ApprovalBadge pendingApprovalId={r.product.pendingApprovalId} label={r.product.pendingChangeLabel ?? 'Pending approval'} />,
                },
                {
                  key: 'actions', header: '', align: 'right' as const,
                  render: (r) => (
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="iconSm" variant="ghost" aria-label={`Actions for ${r.product.name}`}><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownItem onSelect={() => { setEditingProduct(r.product); setFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /> Edit product</DropdownItem>
                          <DropdownItem onSelect={() => setDetail(r.product)}><Package className="h-3.5 w-3.5" /> Manage variants</DropdownItem>
                          <DropdownItem onSelect={() => setDetail(r.product)}><StoreIcon className="h-3.5 w-3.5" /> Store availability</DropdownItem>
                          <DropdownSeparator />
                          {r.product.publishState === 'published' ? (
                            <DropdownItem onSelect={() => setPublishTarget(r.product)}><EyeOff className="h-3.5 w-3.5" /> Unpublish</DropdownItem>
                          ) : (
                            <DropdownItem onSelect={() => setPublishTarget(r.product)}><Eye className="h-3.5 w-3.5" /> Publish</DropdownItem>
                          )}
                          <DropdownItem danger onSelect={() => setDeleteTarget(r.product)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              showing={`Showing ${productsQ.data?.rows.length ?? 0} of ${total.toLocaleString('en-IN')} products`}
            />
          </Card>
        </motion.section>
      </motion.div>

      {/* detail drawer */}
      {detailProduct && (
        <ProductDrawer
          key={detailProduct.id}
          product={detailProduct}
          variants={detailVariants}
          stores={stores.map((s) => ({ id: s.id, name: s.name }))}
          storeVariants={db.storeVariants}
          onClose={() => setDetail(null)}
          onUpdateVariant={(v, values) => actions.updateVariant(v.id, { label: values.label, price: values.price, active: values.active }, `${detailProduct.name} – ${values.label}`)}
          onRequestApproval={(v, values) => actions.requestApproval(
            {
              action: 'Variant price change',
              targetType: 'variant_price',
              targetLabel: `${detailProduct.name} – ${v.label}`,
              details: `Price ${fmtINR(v.price)} → ${fmtINR(values.price)}`,
              reason: values.reason || 'Price correction requested by admin',
            },
            { productId: detailProduct.id, pendingLabel: 'Price change pending' },
          )}
          onUpdateAvailability={(variantId, storeId, patch) => actions.updateAvailability(variantId, storeId, patch)}
        />
      )}

      {/* add / edit */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editingProduct}
        categories={categories}
        brands={brands}
        onSubmit={(v, variantRows) => {
          if (editingProduct) {
            actions.updateProduct(editingProduct.id, {
              name: v.name, categoryId: v.categoryId, brandId: v.brandId,
              taxRatePct: v.taxRatePct, shelfLifeDays: v.shelfLifeDays, storage: v.storage,
              description: v.description, publishState: v.publishNow ? 'published' : 'unpublished',
            }, editingProduct.name)
          } else {
            const pid = `pr-${Date.now()}`
            actions.addProduct(
              {
                id: pid, name: v.name, categoryId: v.categoryId, brandId: v.brandId,
                description: v.description, taxRatePct: v.taxRatePct, shelfLifeDays: v.shelfLifeDays,
                storage: v.storage, imageVariant: db.products.length % 8,
                publishState: v.publishNow ? 'published' : 'unpublished', subscribable: false, reorderLevel: 20,
                pendingChangeLabel: undefined, pendingApprovalId: undefined,
              },
              variantRows.map((r, i) => ({
                id: `${pid}-v${i + 1}`, productId: pid, label: r.label.trim(),
                sku: `DD-${String(db.variants.length + i + 1).padStart(3, '0')}-${Math.floor(100 + Math.random() * 900)}`,
                barcode: `89${Math.floor(100000000000 + Math.random() * 899999999999)}`,
                price: Number(r.price), active: true,
              })),
            )
          }
          setFormOpen(false)
        }}
      />

      {/* publish / unpublish */}
      <ConfirmDialog
        open={!!publishTarget}
        onOpenChange={(v) => { if (!v) setPublishTarget(null) }}
        title={publishTarget?.publishState === 'published' ? `Unpublish ${publishTarget?.name}?` : `Publish ${publishTarget?.name}?`}
        description={publishTarget?.publishState === 'published'
          ? 'The product disappears from the storefront immediately. Existing subscriptions keep working.'
          : 'The product goes live on the storefront in all stores that carry it.'}
        confirmLabel={publishTarget?.publishState === 'published' ? 'Unpublish' : 'Publish'}
        destructive={publishTarget?.publishState === 'published'}
        onConfirm={() => { if (publishTarget) actions.updateProduct(publishTarget.id, { publishState: publishTarget.publishState === 'published' ? 'unpublished' : 'published' }, publishTarget.name); setPublishTarget(null) }}
      />

      {/* delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
        title={`Delete ${deleteTarget?.name}?`}
        description="The product and all its variants are removed from the catalog. Past orders keep their line items."
        confirmLabel="Delete product"
        destructive
        onConfirm={() => { if (deleteTarget) actions.deleteProduct(deleteTarget.id, deleteTarget.name); setDeleteTarget(null) }}
      />

      {/* CSV import wizard */}
      <CsvImportWizard<ProductCsvRow>
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Import products from CSV"
        templateHeader="name,category,brand,variant_label,price,sku"
        itemNoun="product rows"
        validateRow={(row, index) => {
          const name = (row['name'] ?? '').trim()
          const category = (row['category'] ?? '').trim()
          const brand = (row['brand'] ?? '').trim()
          const variantLabel = (row['variant_label'] ?? '').trim()
          const priceRaw = (row['price'] ?? '').trim()
          const sku = (row['sku'] ?? '').trim()
          if (!name) return { row: index, field: 'name', error: 'Name is required' }
          if (!categories.some((c) => c.name.toLowerCase() === category.toLowerCase())) return { row: index, field: 'category', error: `Unknown category "${category}"` }
          const price = Number(priceRaw)
          if (!priceRaw || !Number.isFinite(price) || price <= 0) return { row: index, field: 'price', error: 'Price must be a positive number' }
          if (!sku) return { row: index, field: 'sku', error: 'SKU is required' }
          const lowerSku = sku.toLowerCase()
          if (csvSeenSkus.current.has(lowerSku)) return { row: index, field: 'sku', error: `SKU ${sku} already exists in the catalog or earlier in this file` }
          csvSeenSkus.current.add(lowerSku)
          return { name, category, brand, variantLabel, price, sku }
        }}
        onApply={(rows) => {
          const groups = new Map<string, { cat: string; brand: string; items: Array<{ label: string; price: number; sku: string }> }>()
          for (const r of rows) {
            const g = groups.get(r.name) ?? { cat: r.category, brand: r.brand, items: [] }
            g.items.push({ label: r.variantLabel || r.name, price: r.price, sku: r.sku })
            groups.set(r.name, g)
          }
          let n = 0
          for (const [name, g] of groups) {
            const cat = categories.find((c) => c.name.toLowerCase() === g.cat.toLowerCase())
            const brand = brands.find((b) => b.name.toLowerCase() === g.brand.toLowerCase())
            const pid = `pr-${Date.now()}-${n++}`
            actions.addProduct(
              {
                id: pid, name, categoryId: cat?.id ?? categories[0]?.id ?? 'cat-other', brandId: brand?.id ?? brands[0]?.id ?? 'br-1',
                description: `${name} imported via CSV catalog upload.`, taxRatePct: 5, shelfLifeDays: 7, storage: 'chilled',
                imageVariant: db.products.length % 8, publishState: 'published', subscribable: false, reorderLevel: 20,
              },
              g.items.map((it, i) => ({
                id: `${pid}-v${i + 1}`, productId: pid, label: it.label,
                sku: it.sku, barcode: `89${Math.floor(100000000000 + Math.random() * 899999999999)}`,
                price: it.price, active: true,
              })),
            )
          }
        }}
      />
    </div>
  )
}

