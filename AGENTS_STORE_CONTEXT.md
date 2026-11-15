# Store Manager Portal — Agent Build Contract

You are building 9 pages inside `src/apps/store/pages/`. The foundation (auth, shell, seed,
store API layer) is DONE and typechecks. Screenshots are the LOOK source of truth (layout,
spacing, copy); the spec text quoted in your prompt is the FEATURE source of truth; where a
screenshot has a data error, the corrections listed below win. Do NOT modify shared files,
other apps, or files outside your page files. Small helpers go INSIDE your page files.

## Reference screenshots (Read the ones for YOUR pages)
Folder: `C:\Users\rajuc\Downloads\WhatsApp Unknown 2026-11-14 at 14.30.30\`
- Orders & Picking: `WhatsApp Image 2026-11-14 at 14.21.09 (1).jpeg`
- Store Dashboard: `WhatsApp Image 2026-11-14 at 14.21.09.jpeg`
- Returns & Quality Checks: `WhatsApp Image 2026-11-14 at 14.21.10 (1).jpeg`
- Rider Applications: `WhatsApp Image 2026-11-14 at 14.21.10 (2).jpeg`
- COD Cash Deposits: `WhatsApp Image 2026-11-14 at 14.21.10 (3).jpeg`
- Inventory: `WhatsApp Image 2026-11-14 at 14.21.10.jpeg`
- Staff & Workload: `WhatsApp Image 2026-11-14 at 14.21.11 (1).jpeg`

## CRITICAL RULES
1. Active store: `useActiveStoreId()` (from `@/apps/store/api/storeQueries`) — scope EVERY query
   to it. The store selector lives in the topbar already (StoreLayout) — changing it re-scopes
   everything automatically (query keys include storeId).
2. NEVER import from `@/apps/admin/*` (ESLint blocks it). Shared kit lives in `@/shared/*`.
3. Do NOT hardcode numbers — compute from the seeded dataset.
4. Run `npx tsc --noEmit` and `npx eslint src/apps/store --ext .ts,.tsx` — fix errors in YOUR
   files only (a parallel agent works on other pages).
5. Keep animations: `useStagger()` variants, `KpiCard` count-ups, `hoverable` Cards, `TabPills`,
   DataTable skeletons, Drawer slide-ins, toasts on every mutation.

## Store API — `@/apps/store/api/storeApi` (+ query hooks in `storeQueries.ts`)
```
useStoreDashboard(storeId) → StoreDashboardSummary {openPickingTasks, completedToday, deadlineBreaches,
  avgPickingTimeMin (4.8 computed), substitutedRatePct, pendingRiderApps(7), storeStatus('online'|'paused'),
  storeName('SRM AP Store'), storeCode('ST-0045'), storeNote, lowStock[6]{variantName,qty,reorderLevel},
  expiringStock[6]{variantName,qty,expiryDate,daysLeft}, hourly[{label,completed,open}],
  byStatus{waiting:18,beingPicked:12,readyToPack:21,readyHandover:12}, staffWorkload[{id,name,activeTasks,level,status}],
  avgTasksPerActivePicker(3.0), upcoming[{taskId,orderId,customerName,itemCount,dueBy,overdue,status,assigneeName}],
  overdueCount(3), dueSoonCount(3), lowStockCount(12), expiringCount(8), pendingReturns(4), underInspection(4),
  processedToday(12), inQuarantine(3), codTodayTotal(₹24,860), codTodayCount(12)}
usePickingTasks(storeId, tab:'queue'|'all'|'mine', filters{status,search}) → [{task,order:{customerName,itemCount}}]
usePickingTask(id) useStoreStock(storeId,filters) useStoreReceipts useStoreAdjustments useStoreCounts useBinLocations
useReturns(storeId,tab:'parcels'|'inspection'|'processed'|'quarantine',filters) useRiderApplicationsStore(storeId,status,search)
useCodDeposits(storeId,filters) useStoreStatusInfo(storeId)→{store,statusChanges[]} useStoreStaff useEligibleAssignees
useStoreNotifications() → {data, prefs} · useActiveStoreId()
```

## Mutations — `@/apps/store/api/storeMutations.ts`
```
usePickingActions: claim(task)/release(taskId)/pickLine(taskId,lineId,qtyPicked,batchId)/
  substitute(taskId,lineId,substitutionVariantId)/markUnavailable(taskId,lineId,reason)/
  completePicking(taskId)/savePacking(taskId,bags,coldChain,packedBy,notes,riderId,riderName)/
  verifyHandover(taskId,code,attempts)/reassign(taskId,toAssigneeId,assigneeName,reason)
useReturnActions: record(parcel)/decide(parcelId,itemBatchId,decision)/complete(parcelId,stockAction,note?)/
  saveDraft(parcelId)/newParcelId()/managerName
useRiderDocActions: decide(appId,docType,'approved'|'rejected',reason?)  // auto: app→under_review on first review;
  app→approved when ALL docs approved; app→rejected if any doc rejected; approved app → rider created
useCodActions: record(deposit)/suggestReference()   // only approved riders of the store may deposit
useStoreInventoryActions: receiveStock(receipt{storeId,variantId,batchNo,expiryDate,qty,binLocation,at,by})/
  setBin(storeId,variantId,binLocation)/startCount(count)/updateCountLine(id,variantId,counted)/
  completeCount(id)/createAdjustment(adjustment)  // ≥20 units or 'unexplained' → pending admin approval
useStoreStatusActions: pause(storeId,reason)/resume(storeId)
useStaffActions: reassign(= picking.reassign)
useStoreNotificationActions: markNotificationRead(id?)/markAllRead()/setPrefs(prefs)
```

## UI kit (unchanged): Button, Card(hoverable)/CardHeader/CardTitle/CardContent, Input, Label, Badge,
Kbd, Skeleton, Switch, Checkbox, Progress, Dialog/Drawer/ConfirmDialog/Dropdown*/Popover/Tooltip,
Select/Field, KpiCard{label,value,format,delta?,deltaGood,icon,tint,highlight?,suffix?}, DataTable+Pagination+
Column, PageHeader{title,titleAccent?,subtitle?,illustration?,actions?,breadcrumb?}, DateChip, RangeToggle,
TabPills{tabs,value,onChange,id}, SearchInput, EmptyState, StatusPill{status,dot?}, DeltaText, charts
(Sparkline/TrendChart/DonutChart/GaugeChart/ComboChart — data: any[]), Tooltip wrapper.

## Status → StatusPill keys (all defined): waiting_to_pick, being_picked, ready_to_pack, ready_for_handover,
completed, cancelled, placed, picking, ready, out_for_delivery, delivered, on_hold, online, paused, pending,
under_review→'processing', approved, rejected, received, pending_verification, discrepancy, in_stock, low_stock,
expiring, saleable→'active', damaged→'rejected', expired→'expired', saleable→'active'.

## Illustrations — `@/shared/illustrations/scenes.tsx`: MeadowScene{variant:'dashboard'|'stores'|'reports'|'settings'|'payments'},
ScooterScene{moving?}, CityScene, StaffScene, OffersScene, ProductsScene, InventoryScene, PayoutsScene,
SupportScene, ApprovalsScene, PeopleScene, EmptyIllustration{kind}, LoginHero. Product glyphs: ProductTile{icon}
from '@/shared/illustrations/productIcons'. Avatars: InitialAvatar{name,size} / Avatar{index,name,size}.

## Seeded store facts (SRM AP Store = st-ap1, code ST-0045; st-ap2 = Guntur Central Store ST-0046)
- 63 picking tasks today: 18 waiting / 12 being picked / 21 ready to pack / 12 ready for handover.
  Being-picked assignees: Vikram Varma ×4, Sneha Yadav ×4, Arjun Reddy ×3, Meera Nair ×1.
- 42 tasks completed today (avg picking time 4.8 min computed from claimed→completed).
- 3 OVERDUE tasks (deadlines 10:30/10:45/10:50 AM — before the 11:05 AM demo now): PICK ids in
  the seed order; 3 DUE SOON (11:15/11:20/11:25 AM). Overdue applies ONLY to waiting/being-picked tasks.
- PICK-7842 (ORD-78422) is the screenshot's crafted task: 8 lines, 2 picked (Cow Milk 1L 2/2 ML-2403,
  Curd 400g 1/1 CR-1124), Paneer 200g 0/1 UNAVAILABLE ('Damaged pack in cold storage') with Tofu – 200 g
  substitute (v-131), Butter 500g 0/2 BT-7781, plus 4 more unpicked lines.
- Inventory: ~24 variants stocked at st-ap1; 12 LOW (below per-product reorderLevel), 8 EXPIRING ≤7 days;
  batches have bin locations (A1-01…C1-01); 3 stock receipts; 1 open stock count (5 lines, counted=null);
  10 adjustments (2 PENDING admin approval — they appear in /admin/approvals; 8 approved).
- Returns: 4 pending + 4 under inspection (unprocessed = 8 shown in "Returned Parcels"), 12 processed
  today, 3 in quarantine; RTN ids RTN-1048…; linked to PAST failed-delivery orders (ORD-78301…).
- Rider applications: 48 (7 pending / 4 under review / 32 approved / 5 rejected); APP-1058 Rohit Kumar
  under review; docs per app: license, vehicle_rc, aadhaar, insurance with statuses; approved apps have
  all docs approved.
- COD deposits: 48 (12 today totalling ₹24,860; outcomes received/pending_verification/discrepancy);
  riders = the 12 approved AP riders (rd-ap1…rd-ap12).
- Store status history: paused yesterday 09:20 by Chaitanya Raju (stock receipt delayed) → resumed
  14:00 → auto-open 06:00 today. Current: ONLINE.
- Store notifications: 24 (3 action-required unread / 16 operational / 5 system; 6 unread total).
- Staff: 6 accounts (Chaitanya Raju signed-in + Vikram Varma, Sneha Yadav, Arjun Reddy, Meera Nair,
  Nithin Sai inactive). Active pickers 4 → 4/4/3/1 tasks = 12, avg 3.0.
- Feature note: substitute eligible example = Tofu – 200 g (v-131) seeded in catalog + stock.

## Page frame (every page)
PageHeader with breadcrumb + subtitle + mapped illustration + staggered content via useStagger().
Map: Dashboard→MeadowScene('dashboard'), Orders & Picking→ScooterScene, Inventory→InventoryScene,
Returns→SupportScene? NO — Returns uses SupportScene is wrong: use SupportScene for Support-like pages;
Returns→SupportScene ONLY if no better: use ProductsScene for Inventory, SupportScene for Returns,
ScooterScene for Rider Applications, PayoutsScene for COD, MeadowScene('stores') for Store Status,
PeopleScene for Staff & Workload, MeadowScene('settings') for Notifications & Account.

## Quality bar
Skeletons while loading, empty states, toasts on every mutation, ConfirmDialog before destructive
ops, aria-labels on icon buttons, responsive (drawer workspace becomes full-screen on mobile).
