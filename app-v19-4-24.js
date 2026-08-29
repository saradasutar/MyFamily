'use strict';

const CONFIG = window.PORTFOLIO_CONFIG || {};
const APP_VERSION = '19.4.24';
const EXPECTED_BACKEND_VERSION = '3.17.8';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 4 * 60 * 1000;
const SESSION_HEARTBEAT_MS = 2 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 10000;
const LAST_ACTIVITY_KEY = 'myfinance_last_activity_at';
const LAST_HIDDEN_KEY = 'myfinance_last_hidden_at';
const APP_BUILD_ID = '20260829-19424-summarydecimal1';
const APP_BUILD_STORAGE_KEY = 'myfinance_current_build_id';
const AUTOMATIC_LOGIN_RECOVERY_KEY = `myfinance_login_recovery_${APP_BUILD_ID}`;
const STARTUP_STUCK_MS = 30000;
const MOBILE_BREAKPOINT = 860;
const QUICK_VALUE_SYNC_MS = 30 * 1000;
const GOOD_VALUE_SNAPSHOT_PREFIX = 'myfinance_last_good_values_v1_';
const GOOD_DASHBOARD_SNAPSHOT_PREFIX = 'myfinance_last_good_dashboard_v1_';

function valueSnapshotStorageKey(username){
  return `${GOOD_VALUE_SNAPSHOT_PREFIX}${String(username||'').trim().toLowerCase()}`;
}
function dashboardSnapshotStorageKey(username){
  return `${GOOD_DASHBOARD_SNAPSHOT_PREFIX}${String(username||'').trim().toLowerCase()}`;
}
function legacyHoldingSnapshotId(h){
  return String(h?.id||`${h?.owner||''}::${h?.type||''}::${h?.code||h?.assetName||''}`).trim().toLowerCase();
}
function preserveLastGoodValuesFromLegacyCache(){
  try{
    Object.keys(localStorage).filter(key=>key.startsWith('portfolio_cache_')).forEach(key=>{
      let wrapper=null;
      try{wrapper=JSON.parse(localStorage.getItem(key)||'null');}catch{}
      const data=wrapper?.data;
      const username=String(data?.user?.username||localStorage.getItem('portfolio_saved_username')||'').trim();
      if(!username||!Array.isArray(data?.holdings))return;
      if(data.holdings.length){
        const dashboardKey=dashboardSnapshotStorageKey(username);
        let previousDashboard=null;
        try{previousDashboard=JSON.parse(localStorage.getItem(dashboardKey)||'null');}catch{}
        const savedAt=Number(wrapper?.savedAt)||Date.now();
        if(!previousDashboard?.data?.holdings?.length||savedAt>=Number(previousDashboard.savedAt||0)){
          try{localStorage.setItem(dashboardKey,JSON.stringify({savedAt,data}));}catch{}
        }
      }
      const snapshotKey=valueSnapshotStorageKey(username);
      let previous={values:{}};
      try{previous=JSON.parse(localStorage.getItem(snapshotKey)||'{"values":{}}');}catch{}
      const values={...(previous?.values||{})};
      data.holdings.forEach(h=>{
        const units=Number(h.units)||0;
        const price=Number(h.currentPrice)||0;
        const rawValue=Number(h.currentValue)||0;
        const currentValue=rawValue>0?rawValue:(units>0&&price>0?units*price:0);
        if(!(price>0||currentValue>0))return;
        values[legacyHoldingSnapshotId(h)]={
          units:units>0?units:null,
          currentPrice:price>0?price:null,
          currentValue:currentValue>0?currentValue:null,
          priceDate:h.priceDate||data.updatedAt||'',
          priceSource:h.priceSource||'Last verified value'
        };
      });
      if(Object.keys(values).length){
        localStorage.setItem(snapshotKey,JSON.stringify({savedAt:Number(wrapper?.savedAt)||Date.now(),values}));
      }
    });
  }catch(e){console.warn('Legacy value snapshot migration skipped:',e);}
}

function clearTransientBrowserStateForUpdate(){
  try{
    const previous=localStorage.getItem(APP_BUILD_STORAGE_KEY)||'';
    if(previous===APP_BUILD_ID)return false;

    // Promote the last correct device values before changing builds. Keep the
    // authenticated session and versioned dashboard cache: a frontend update
    // must not force a new sign-in or replace a working portfolio snapshot.
    preserveLastGoodValuesFromLegacyCache();
    localStorage.setItem(APP_BUILD_STORAGE_KEY,APP_BUILD_ID);
    localStorage.setItem('myfinance_browser_updated_notice','1');
    return true;
  }catch(e){return false;}
}
const BROWSER_STORAGE_REPAIRED_ON_LOAD = clearTransientBrowserStateForUpdate();

const MOBILE_DATA_CACHE_VERSION = '19.4.24-expenditure-categories-1';
const state = {
  token: localStorage.getItem('portfolio_token') || '',
  username: localStorage.getItem('portfolio_username') || '',
  user: null,
  holdings: [],
  transactions: [],
  watchlist: [],
  sipPlans: [],
  sipEvents: [],
  expenses: [],
  expensePlans: [],
  recurringExpenses: [],
  expenseCategories: [],
  expenseView: 'ACTUAL',
  expenseInlineEdit: null,
  expenseSubcategoriesVisible: localStorage.getItem('myfinance_expense_subcategories_visible') !== '0',
  sipHorizonMonths: 12,
  startupPortfolioLoaded: false,
  idleCheckTimer: null,
  idleWarningTimer: null,
  sessionHeartbeatTimer: null,
  sessionHeartbeatBusy: false,
  quickValueSyncTimer: null,
  coreSyncing: false,
  holdingViewChecked: false,
  lastActivityAt: Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now()),
  lastActivityWrittenAt: 0,
  idleWarningShown: false,
  startupWatchdogTimer: null,
  stickyNotes: [],
  stickyNoteHistory: [],
  lifeQuotes: [],
  customColumns: [],
  customValues: [],
  lifeQuoteIndex: 0,
  lifeQuoteTimer: null,
  lifeQuotePaused: false,
  utilityDrawerOpen: false,
  utilityDrawerTab: 'STICKY',
  dataFullscreenSection: '',
  overviewMode: 'PERSONAL',
  diary: [],
  monthlyDiary: [],
  monthStatus: [],
  diaryView: 'DAILY',
  diaryWorkspace: 'DAILY',
  users: [],
  owners: [],
  selectedOwner: 'ALL',
  selectedAssetView: 'ALL',
  activeSection: 'overview',
  syncing: false,
  importMode: 'MF_STATEMENT',
  pendingImport: [],
  growthRange: '30D',
  autoRefreshMinutes: Number(localStorage.getItem('portfolio_auto_refresh_min') || 15),
  autoRefreshNextAt: 0,
  autoRefreshTimer: null,
  backendVersion: EXPECTED_BACKEND_VERSION,
  lastServerSyncAt: 0,
  inlineEditHoldingId: '',
  mobileAmountRepairTried: false,
  mobileLastAmountCheckAt: 0,
  masterDataVersion: '',
  masterDataAppliedAt: '',
  hScrollTarget: null,
  diaryDraftTimer: null,
  monthlyDraftTimer: null,
  quickDiaryMode: 'DAILY'
};

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const els = {};
[
  'loginView','appView','runtimeWarning','portfolioStartupOverlay','portfolioStartupTitle','portfolioStartupMessage','portfolioStartupRetryBtn','loginForm','loginUsername','loginPassword','rememberUsername','loginVersion','loginBackendVersion','loginButton','loginMessage','sideAppName','dashboardUsername','dashboardVersion','dashboardBackendVersion','dashboardVersionTop','dashboardBackendVersionTop','mobileSessionBar','mobileFrontendVersion','mobileBackendVersion','mobileChangePasswordBtn','mobileLogoutBtn','todayLabel','pageTitle','autoRefreshSelect','autoRefreshCountdown','syncStatus','refreshBtn','addInvestmentBtn','addInvestmentTableBtn','bulkImportBtn','logoutBtn','profileButton','avatarInitial','personalHomeModeBtn','investmentHomeModeBtn','overviewSetDefaultBtn','personalHomeContent','investmentOverviewContent','personalHomeGreeting','homeDailyWriteBtn','homeMonthlyWriteBtn','homeAddTargetBtn','homeDiaryCount','homeDiaryPreview','homeDiaryQuickBtn','homeFullDiaryBtn','homeStickyCount','homeStickyDueToday','homeStickyOverdue','homeStickyUpcoming','homeStickyPreview','homeTargetAddBtn','homeTargetsOpenBtn','homeQuoteCard','homeQuoteText','homeQuoteAuthor','homeQuoteAutoStatus','homeQuoteNextBtn','homeQuotesOpenBtn','homeShowInvestmentsBtn','welcomeTitle','lastUpdatedText','viewChip','overviewStickyShortcut','overviewStickyShortcutCount','overviewQuoteShortcut','utilityDrawerOpenBtn','utilityDrawerCloseBtn','utilityDrawerScrim','utilityDrawer','utilityStickyBadge','utilityStickyTabCount','utilityStickySection','utilityQuoteSection','lifeQuoteText','lifeQuoteAuthor','lifeQuoteShuffleStatus','lifeQuoteNextBtn','lifeQuotePauseBtn','lifeQuoteLibraryBtn','lifeQuoteModal','lifeQuoteForm','lifeQuoteId','lifeQuoteInput','lifeQuoteAuthorInput','lifeQuoteSearch','lifeQuoteCount','lifeQuoteList','lifeQuoteEmpty','clearLifeQuoteBtn','saveLifeQuoteBtn','stickyNotesCount','stickyNotesList','stickyNotesEmpty','addStickyNoteBtn','pinnedStickyLayer','ownerSwitcher','assetViewSwitcher','typeSummaryGrid','holdingsHeading','sumInvestedLabel','sumCurrentLabel','importBtn','exportBtn','sumInvested','sumCurrent','sumGain','sumReturn','sumAssetCount','sumPricedCount','sumSplit','sumWatchCount','sumInvestedTrend','sumCurrentTrend','sumGainTrend','sumWatchTrend','growthRangeButtons','growthInvestedDelta','growthInvestedPct','growthValueDelta','growthValuePct','growthGainNow','growthReturnNow','portfolioGrowthChart','growthHistoryNote','watchPulseBadge','watchAtTarget','watchNearTarget','watchAverageGap','watchPulseCount','watchlistTrendChart','watchTrendNote','watchlistLastAutoUpdate','watchStripAtTarget','watchStripNear','watchStripGap','allocationChart','investorSummary','topHoldings','replaceMasterDataBtn','masterDataStatus','masterLoadBanner','masterLoadNowBtn','showAllInvestmentsBtn','holdingSearch','holdingTypeFilter','holdingResultFilter','holdingNotesFilter','holdingTradeFilter','holdingsFilterCount','holdingsSummaryPanel','toggleHoldingsSummaryBtn','holdingsViewPreset','saveHoldingsDefaultViewBtn','restoreHoldingsDefaultViewBtn','resetHoldingsViewBtn','holdingsDefaultViewStatus','printHoldingsBtn','holdingsFullscreenBtn','holdRowMinusBtn','holdRowPlusBtn','holdRowSizeLabel','holdRowSlider','holdWidthMinusBtn','holdWidthPlusBtn','holdWidthSizeLabel','holdWidthSlider','holdLayoutSavedStatus','holdSizeResetBtn','holdSumCombinedTotalInvested','holdSumCombinedTotalCurrent','holdSumCombinedTotalGrowth','holdSumCombinedMfInvested','holdSumCombinedMfCurrent','holdSumCombinedMfGrowth','holdSumCombinedStockInvested','holdSumCombinedStockCurrent','holdSumCombinedStockGrowth','holdSumNiharikaTotalInvested','holdSumNiharikaTotalCurrent','holdSumNiharikaTotalGrowth','holdSumNiharikaMfInvested','holdSumNiharikaMfCurrent','holdSumNiharikaMfGrowth','holdSumNiharikaStockInvested','holdSumNiharikaStockCurrent','holdSumNiharikaStockGrowth','holdSumSaradaTotalInvested','holdSumSaradaTotalCurrent','holdSumSaradaTotalGrowth','holdSumSaradaMfInvested','holdSumSaradaMfCurrent','holdSumSaradaMfGrowth','holdSumSaradaStockInvested','holdSumSaradaStockCurrent','holdSumSaradaStockGrowth','holdingsBody','holdingsEmpty','holdCurrentPnlToday','holdRealizedPnl','holdTotalPnlToDate','holdTradeDateCoverage','holdPnlAsOf','mfNavHealthBadge','manageHoldingsColumnsBtn','showAllHoldingColumnsBtn','viewAllNotesBtn','watchAllNotesBtn','columnManagerModal','columnManagerTitle','customColumnForm','customColumnId','customColumnSection','customColumnLabel','customColumnKey','customColumnType','customColumnOrder','clearCustomColumnBtn','saveCustomColumnBtn','standardColumnsList','saveColumnsAsDefaultBtn','showAllColumnsTempBtn','resetStandardColumnsBtn','customColumnsList','customColumnsEmpty','customColumnCount','customValueModal','customValueTitle','customValueRecord','customValueForm','customValueSection','customValueRecordId','customValueColumnKey','customValueFieldLabel','customValueInput','saveCustomValueBtn','notesModal','notesSearch','notesSource','notesScope','notesFilter','notesSummary','notesList','notesEmpty','transactionSearch','transactionOwnerFilter','transactionAssetFilter','transactionSideFilter','transactionFromDate','transactionToDate','transactionFilterCount','transactionBuyTotal','transactionSaleTotal','transactionRealizedPnl','transactionCount','transactionBody','transactionEmpty','transactionImportBtn','printTransactionsBtn','watchSearch','watchTypeFilter','watchPriorityFilter','watchTargetFilter','watchNotesFilter','watchFilterCount','saveWatchDefaultViewBtn','restoreWatchDefaultViewBtn','watchDefaultViewStatus','printWatchlistBtn','watchlistFullscreenBtn','watchRowMinusBtn','watchRowPlusBtn','watchRowSizeLabel','watchRowSlider','watchWidthMinusBtn','watchWidthPlusBtn','watchWidthSizeLabel','watchWidthSlider','watchLayoutSavedStatus','watchSizeResetBtn','manageWatchlistColumnsBtn','showAllWatchColumnsBtn','watchBody','watchEmpty','addSipPlanBtn','sipOwnerFilter','sipStatusFilter','sipPlanCount','sipMonthlyCommitment','sipNext30Amount','sipNext30Count','sipNext12Amount','sipActiveCount','sipPausedCount','sipPlansBody','sipPlansEmpty','sipHorizonSelect','sipScheduleCount','sipScheduleBody','sipScheduleEmpty','sipPlanModal','sipPlanModalTitle','sipPlanForm','sipPlanId','sipPlanOwner','sipPlanAssetType','sipPlanAssetName','sipAssetSuggestions','sipPlanCode','sipPlanAmount','sipPlanFrequency','sipPlanDay','sipPlanStartDate','sipPlanEndDate','sipPlanStepUpPct','sipPlanExpectedReturnPct','sipPlanStatus','sipPlanNotes','saveSipPlanBtn','addExpenseBtn','addExpensePlanBtn','addRecurringExpenseBtn','expenseMonthActual','expenseMonthActualCount','expensePlannedPending','expensePlannedCount','expenseRegularDue','expenseRegularDueCount','expenseYearActual','expenseDataPanel','expenseCategoriesView','expenseSearch','expenseFromDate','expenseToDate','expenseCategoryFilter','expenseSubcategoryFilter','expenseAccountFilter','expenseSort','expenseSubcategoryToggle','expenseResetFiltersBtn','expensePrintBtn','expenseResultCount','actualExpenseView','plannedExpenseView','regularExpenseView','actualExpenseTable','plannedExpenseTable','regularExpenseTable','actualExpenseBody','plannedExpenseBody','regularExpenseBody','actualExpenseEmpty','plannedExpenseEmpty','regularExpenseEmpty','addExpenseCategoryBtn','expenseCategoryGrid','expenseCategoryEmpty','expenseModal','expenseModalEyebrow','expenseModalTitle','expenseModalSubcopy','expenseForm','expenseRecordId','expenseRecordMode','expenseRegularNameGroup','expenseRegularName','expenseAmount','expenseDateGroup','expenseDateLabel','expenseDate','expensePaidTo','expenseDebitedFrom','expenseAccountSuggestions','expenseReason','expenseCategory','expenseSubcategory','expenseSubcategoryHelp','expenseFrequencyGroup','expenseFrequency','expenseEndDateGroup','expenseEndDate','expenseStatusGroup','expenseStatus','expenseNotes','saveExpenseBtn','expensePaymentModal','expensePaymentTitle','expensePaymentForm','expensePaymentSourceType','expensePaymentSourceId','expensePaymentAmount','expensePaymentDate','expensePaymentPaidTo','expensePaymentAccount','expensePaymentNotes','confirmExpensePaymentBtn','expenseCategoryModal','expenseCategoryModalTitle','expenseCategoryForm','expenseCategoryId','expenseCategoryName','expenseCategoryColor','expenseCategorySubcategories','saveExpenseCategoryBtn','expensePrintModal','expensePrintTitle','expensePrintOrientation','expensePrintColumns','expensePrintAllColumnsBtn','expensePrintPreview','runExpensePrintBtn','diaryForm','diaryId','diaryDate','diaryPrevDayBtn','diaryTodayBtn','diaryNextDayBtn','diaryTitle','diaryText','diaryDraftStatus','diaryCharCount','saveDiaryBtn','clearDiaryBtn','newDiaryEntryBtn','diarySaveStatus','diaryViewSwitcher','diarySearch','diarySearchClearBtn','diaryDayControl','diaryMonthControl','diaryRangeControl','diaryBrowseDate','diaryBrowseMonth','diaryFromDate','diaryToDate','printDiaryBtn','diarySummary','diaryList','diaryEmpty','diaryHeroStatus','diaryWorkspaceSwitcher','dailyDiaryWorkspace','monthlyDiaryWorkspace','recentDailyRail','recentDailyMobileCount','recentDailyCount','recentDailyLimit','recentDailySearch','recentDailyList','recentDailyEmpty','recentMonthlyRail','recentMonthlyMobileCount','recentMonthlyCount','recentMonthlyLimit','recentMonthlySearch','recentMonthlyList','recentMonthlyEmpty','monthlyYearFilter','monthlyMonthFilter','monthlyTypeFilter','monthlyStatusFilter','monthlySearch','printMonthlyBtn','monthCompletionPanel','monthCompletionTitle','monthCompletionText','monthProgressBar','monthProgressLabel','completeMonthBtn','monthlyForm','monthlyId','monthlyEntryMonth','monthlyPrevMonthBtn','monthlyThisMonthBtn','monthlyNextMonthBtn','monthlyEntryType','monthlyTitle','monthlyText','monthlyDraftStatus','monthlyCharCount','monthlyTargetHelp','monthlySaveStatus','clearMonthlyBtn','saveMonthlyBtn','monthlyListTitle','monthlyResultCount','completedMonthArchive','monthlyList','monthlyEmpty','usersBody','modalBackdrop','investmentModal','investmentForm','holdingId','holdingOwner','holdingType','holdingName','holdingCode','holdingExchange','holdingUnits','holdingInvested','holdingManualPrice','holdingBuyDate','holdingNotes','holdingCodeLabel','exchangeLabel','mfHelp','bulkImportModal','bulkImportForm','bulkCsvFile','bulkImportStatus','runBulkImportBtn','downloadImportTemplateBtn','mfImportHelp','mfSnapshotImportHelp','stockImportHelp','stockTradeImportHelp','stockOwnerLabel','importOwner','importFileHint','watchModal','watchForm','watchId','watchType','watchName','watchCode','watchExchange','watchTarget','watchManualPrice','watchPriority','watchNotes','watchCodeLabel','watchExchangeLabel','watchMfHelp','stickyNoteModal','stickyNoteForm','stickyNoteId','stickyNoteType','stickyNoteTitle','stickyNoteDueDate','stickyNoteText','stickyNoteModalTitle','saveStickyNoteBtn','passwordModal','passwordForm','currentPassword','newPassword','confirmPassword','userModal','userForm','userModalTitle','userFormMode','editOriginalUsername','newUsername','usernameEditHelp','newDisplayName','newUserRole','newUserActiveLabel','newUserActive','userPasswordGroup','newUserPassword','generateUserPasswordBtn','copyUserPasswordBtn','userFormStatus','saveUserBtn','quickDiaryBtn','quickDiaryMobileBtn','quickDiaryPanel','quickDiaryCloseBtn','quickDailyForm','quickDailyDate','quickDailyTitle','quickDailyText','quickDailyStatus','quickDailyCount','quickDailySaveBtn','quickMonthlyForm','quickMonthlyMonth','quickMonthlyType','quickMonthlyTitle','quickMonthlyText','quickMonthlyStatus','quickMonthlyCount','quickMonthlySaveBtn','openFullDiaryBtn','dashboardHScroll','dashboardHScrollRange','dashboardHScrollLabel','dashboardHScrollPct','dashboardHScrollLeft','dashboardHScrollRight','holdingDrawerBackdrop','holdingDrawer','drawerEyebrow','drawerAssetBadge','drawerTitle','drawerSubtitle','drawerContent','drawerCloseBtn','drawerEditBtn','drawerDoneBtn','idleWarningBar','idleWarningCountdown','staySignedInBtn','repairBrowserBtn','toastRegion'
].forEach((id) => { els[id] = $(id); });

function isMobileViewport(){
  return window.matchMedia ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches : window.innerWidth <= MOBILE_BREAKPOINT;
}

function isConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(String(CONFIG.API_URL || '').trim());
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatCurrency(value, compact = false) {
  if (value === null || value === '' || value === undefined) return '—';
  const n = Number(value); if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:CONFIG.CURRENCY||'INR',maximumFractionDigits:compact?0:2,notation:compact&&Math.abs(n)>=100000?'compact':'standard'}).format(n);
}
function formatHoldingValue(value) {
  if (value === null || value === '' || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const absolute = Math.abs(n);
  if (absolute >= 10000000) return `${sign}₹${(absolute / 10000000).toFixed(2)} Crore`;
  if (absolute >= 100000) return `${sign}₹${(absolute / 100000).toFixed(2)} Lakh`;
  return `${sign}₹${new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(absolute)}`;
}
function formatHoldingsSummaryAmount(value) {
  if (value === null || value === '' || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const absolute = Math.abs(n);
  if (absolute >= 10000000) return `${sign}₹${(absolute / 10000000).toFixed(2)} Crore`;
  if (absolute >= 100000) return `${sign}₹${(absolute / 100000).toFixed(2)} Lakh`;
  return `${sign}₹${new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(absolute)}`;
}
function formatNumber(value, digits = 4) { const n=Number(value); return value===null||value===''||value===undefined||!Number.isFinite(n)?'—':new Intl.NumberFormat('en-IN',{maximumFractionDigits:digits}).format(n); }
function formatPercent(value) { const n=Number(value); return value===null||value===''||value===undefined||!Number.isFinite(n)?'—':`${n>=0?'+':''}${n.toFixed(2)}%`; }
function pnlClass(value) {
  const raw=String(value??'').replace(/[,₹%\s]/g,'').replace(/\(([^)]+)\)/,'-$1');
  const n=Number(raw);
  return Number.isFinite(n)?(n>0?'positive':n<0?'negative':'neutral'):'neutral';
}
function dateLabel(value) { const d=value?new Date(value):null; return !d||Number.isNaN(d.getTime())?'Not available':new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(d); }
function setBusy(button,busy,text){ if(!button)return; if(busy){button.dataset.originalText=button.textContent;button.disabled=true;button.textContent=text||'Please wait…';}else{button.disabled=false;button.textContent=button.dataset.originalText||button.textContent;} }
function setSyncStatus(mode,message){ if(!els.syncStatus)return; els.syncStatus.className=`sync-status ${mode||''}`.trim(); const label=els.syncStatus.querySelector('span:last-child'); if(label)label.textContent=message; }
function toast(message,type=''){ const node=document.createElement('div');node.className=`toast ${type}`.trim();node.textContent=message;els.toastRegion.appendChild(node);setTimeout(()=>node.remove(),4500); }

function asyncRequestId(){
  return `mfreq_${Date.now()}_${Math.random().toString(36).slice(2,12)}_${Math.random().toString(36).slice(2,10)}`;
}
function jsonpCallbackName(){
  return `__mfPoll_${Date.now()}_${Math.random().toString(36).slice(2,9)}`.replace(/[^A-Za-z0-9_$]/g,'_');
}
function pollOnce(requestId,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const cb=jsonpCallbackName();
    const script=document.createElement('script');
    let settled=false;

    const cleanup=()=>{
      clearTimeout(timer);
      try{delete window[cb];}catch{window[cb]=undefined;}
      try{script.remove();}catch{}
    };
    const fail=message=>{
      if(settled)return;
      settled=true;
      cleanup();
      reject(new Error(message));
    };

    window[cb]=envelope=>{
      if(settled)return;
      settled=true;
      cleanup();
      if(!envelope||envelope.__myfinanceAsyncResult!==true){
        reject(new Error('Invalid response from backend polling endpoint.'));
        return;
      }
      resolve(envelope);
    };

    const u=new URL(String(CONFIG.API_URL).trim());
    u.searchParams.set('action','pollResult');
    u.searchParams.set('requestId',requestId);
    u.searchParams.set('callback',cb);
    u.searchParams.set('_',String(Date.now()));
    script.src=u.toString();
    script.async=true;
    script.onerror=()=>fail('Could not reach the backend polling endpoint.');
    const timer=setTimeout(()=>fail('Backend polling request timed out.'),timeoutMs);
    document.head.appendChild(script);
  });
}
async function waitForAsyncResult(requestId,timeoutMs){
  const started=Date.now();
  let lastError=null;
  let pauseMs=850;

  while(Date.now()-started<timeoutMs){
    try{
      const envelope=await pollOnce(requestId,Math.min(12000,Math.max(3000,timeoutMs-(Date.now()-started))));
      if(envelope.ready){
        const result=envelope.payload||{};
        if(!result.ok){
          const err=new Error(result.message||'Request failed.');
          err.code=result.code||'REQUEST_FAILED';
          throw err;
        }
        return result;
      }
      lastError=null;
    }catch(err){
      lastError=err;
    }
    await new Promise(r=>setTimeout(r,pauseMs));
    pauseMs=Math.min(2400,Math.round(pauseMs*1.45));
  }

  if(lastError)throw lastError;
  throw new Error('The backend did not return a result. Confirm Backend v3.17.8 is deployed and config.js uses the same /exec URL.');
}
function apiViaAsyncPost(action,payload={},options={}){
  if(!isConfigured())return Promise.reject(new Error('Backend is not configured. Check config.js.'));
  const timeoutMs=Number(options.timeoutMs)||CONFIG.REQUEST_TIMEOUT_MS||60000;
  const requestId=asyncRequestId();
  const body={action,...payload,transport:'hybrid',requestId,clientOrigin:location.origin};
  if(state.token&&!body.token)body.token=state.token;

  return new Promise((resolve,reject)=>{
    let settled=false;
    let fallbackTimer=null;
    const frame=document.createElement('iframe');
    const frameName=`${requestId}_frame`;
    frame.name=frameName;
    frame.id=frameName;
    frame.title='MyFinance backend request';
    frame.setAttribute('aria-hidden','true');
    frame.tabIndex=-1;
    frame.style.position='fixed';
    frame.style.left='-9999px';
    frame.style.top='-9999px';
    frame.style.width='2px';
    frame.style.height='2px';
    frame.style.opacity='0';
    frame.style.pointerEvents='none';

    const form=document.createElement('form');
    form.method='POST';
    form.action=String(CONFIG.API_URL).trim();
    form.target=frameName;
    form.enctype='application/x-www-form-urlencoded';
    form.acceptCharset='UTF-8';
    form.style.display='none';

    const input=document.createElement('input');
    input.type='hidden';
    input.name='payload';
    input.value=JSON.stringify(body);
    form.appendChild(input);

    document.body.appendChild(frame);
    document.body.appendChild(form);

    const cleanup=()=>{
      if(fallbackTimer)clearTimeout(fallbackTimer);
      window.removeEventListener('message',onMessage);
      setTimeout(()=>{try{form.remove();frame.remove();}catch{}},0);
    };
    const finish=(result,error)=>{
      if(settled)return;
      settled=true;
      cleanup();
      if(error){reject(error);return;}
      if(!result?.ok){
        const err=new Error(result?.message||'Request failed.');
        err.code=result?.code||'REQUEST_FAILED';
        reject(err);
        return;
      }
      resolve(result);
    };
    const trustedGoogleOrigin=origin=>{
      try{
        const host=new URL(origin).hostname.toLowerCase();
        return host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.googleusercontent.com');
      }catch{return false;}
    };
    const onMessage=event=>{
      const message=event.data;
      // Apps Script can redirect the submitted iframe between google.com and
      // googleusercontent.com. Some normal Chrome profiles expose the final
      // postMessage through a different WindowProxy, so event.source identity
      // is not reliable. A trusted Google origin plus the unguessable request
      // ID is the secure and stable match.
      if(!trustedGoogleOrigin(event.origin))return;
      if(!message||message.__myfinanceDirectResult!==true||message.requestId!==requestId)return;
      finish(message.payload||{},null);
    };
    window.addEventListener('message',onMessage);

    try{
      form.submit();
    }catch(e){
      finish(null,new Error(`Could not submit request to backend: ${e.message}`));
      return;
    }

    // Backend v3.17.8 replies directly to the hidden frame. Polling starts only
    // as a compatibility fallback, avoiding a burst of competing executions.
    const requestedFallbackDelay=Number(options.pollFallbackDelayMs);
    const fallbackDelay=Number.isFinite(requestedFallbackDelay)&&requestedFallbackDelay>0
      ?Math.min(Math.max(700,requestedFallbackDelay),Math.max(700,timeoutMs-3000))
      :Math.min(1800,Math.max(700,Math.round(timeoutMs*.06)));
    fallbackTimer=setTimeout(()=>{
      waitForAsyncResult(requestId,Math.max(3000,timeoutMs-fallbackDelay))
        .then(result=>finish(result,null))
        .catch(error=>finish(null,error));
    },fallbackDelay);
  });
}
function isNativeBackendMode(){
  return Boolean(window.__MYFINANCE_NATIVE__&&window.google?.script?.run);
}
function apiViaNativeBridge(action,payload={},options={}){
  if(!isNativeBackendMode())return Promise.reject(new Error('Secure native backend bridge is unavailable.'));
  const timeoutMs=Number(options.timeoutMs)||CONFIG.REQUEST_TIMEOUT_MS||60000;
  const body={action,...payload,transport:'native'};
  if(state.token&&!body.token)body.token=state.token;

  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{
      if(settled)return;
      settled=true;
      reject(new Error('The secure backend took too long to respond. Please try again.'));
    },timeoutMs);
    const finish=(result,error)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(error){reject(error);return;}
      if(!result?.ok){
        const err=new Error(result?.message||'Request failed.');
        err.code=result?.code||'REQUEST_FAILED';
        reject(err);
        return;
      }
      resolve(result);
    };
    try{
      window.google.script.run
        .withSuccessHandler(result=>finish(result,null))
        .withFailureHandler(error=>finish(null,new Error(error?.message||String(error||'Secure backend request failed.'))))
        .nativeApi(body);
    }catch(error){finish(null,error);}
  });
}
async function api(action,payload={},options={}){
  try{
    return await (isNativeBackendMode()?apiViaNativeBridge(action,payload,options):apiViaAsyncPost(action,payload,options));
  }catch(error){
    if(options.retry&&!options._retried){
      await new Promise(r=>setTimeout(r,700));
      return api(action,payload,{...options,_retried:true});
    }
    throw error;
  }
}

function cacheKey(){return `portfolio_cache_${MOBILE_DATA_CACHE_VERSION}_${state.username||'unknown'}`;}
function isUsableDashboardData(data){
  return Boolean(data&&Array.isArray(data.holdings)&&data.holdings.length>0);
}
function readGoodDashboardSnapshot(username=state.username){
  try{
    const wrapper=JSON.parse(localStorage.getItem(dashboardSnapshotStorageKey(username))||'null');
    return isUsableDashboardData(wrapper?.data)?wrapper:null;
  }catch{return null;}
}
function saveCache(data){
  if(!isUsableDashboardData(data))return false;
  try{
    const previous=readGoodDashboardSnapshot();
    const completeData=data.partial&&previous?.data?{...previous.data,...data}:data;
    const wrapper={savedAt:Date.now(),data:completeData};
    localStorage.setItem(cacheKey(),JSON.stringify(wrapper));
    localStorage.setItem(dashboardSnapshotStorageKey(state.username),JSON.stringify(wrapper));
    return true;
  }catch{return false;}
}
function loadCache(){
  // This snapshot is displayed only after authentication succeeds. It keeps a
  // temporary empty backend response from replacing a known complete portfolio.
  return readGoodDashboardSnapshot()?.data||null;
}
function clearSession(){
  stopSessionActivityMonitor();
  stopQuickValueSync();
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  localStorage.removeItem(LAST_HIDDEN_KEY);
  state.token='';
  state.username='';
  state.user=null;
  state.mobileAmountRepairTried=false;
  state.mobileLastAmountCheckAt=0;
  state.coreSyncing=false;
  state.holdingViewChecked=false;
  state.holdings=[];
  state.transactions=[];
  state.watchlist=[];
  state.sipPlans=[];
  state.sipEvents=[];
  state.expenses=[];
  state.expensePlans=[];
  state.recurringExpenses=[];
  state.expenseCategories=[];
  state.stickyNotes=[];
  state.stickyNoteHistory=[];
  state.lifeQuotes=[];
  state.customColumns=[];
  state.customValues=[];
  state.diary=[];
  state.monthlyDiary=[];
  state.monthStatus=[];
  state.users=[];
  state.owners=[];
  localStorage.removeItem('portfolio_token');
  localStorage.removeItem('portfolio_username');
}


function growthHistoryKey(){return `portfolio_growth_history_${state.username||'unknown'}`;}
function loadGrowthHistory(){try{const p=JSON.parse(localStorage.getItem(growthHistoryKey())||'[]');return Array.isArray(p)?p:[];}catch{return [];}}
function saveGrowthHistory(h){try{localStorage.setItem(growthHistoryKey(),JSON.stringify(h.slice(-2200)));}catch{}}
function scopeKey(owner,asset){return `${owner||'ALL'}::${asset||'ALL'}`;}
function scopedItems(owner,asset){let items=state.holdings;if(owner&&owner!=='ALL')items=items.filter(h=>canonicalOwner(h.owner)===owner);if(asset==='MF')items=items.filter(h=>h.type==='MF');if(asset==='STOCKS')items=items.filter(h=>h.type==='STOCK'||h.type==='ETF');return items;}
function watchPulseSummary(){const valid=state.watchlist.filter(x=>Number(x.currentPrice)>0&&Number(x.targetPrice)>0);const d=valid.map(x=>Number.isFinite(Number(x.distancePct))?Number(x.distancePct):(Number(x.currentPrice)-Number(x.targetPrice))/Number(x.targetPrice)*100);return{count:state.watchlist.length,priced:valid.length,atTarget:d.filter(x=>x<=0).length,nearTarget:d.filter(x=>x>0&&x<=5).length,avgDistance:d.length?d.reduce((a,b)=>a+b,0)/d.length:null};}
function buildGrowthSnapshot(ts=Date.now()){const owners=['ALL',...configuredOwners()],assets=['ALL','MF','STOCKS'],scopes={};owners.forEach(o=>assets.forEach(a=>{const items=scopedItems(o,a),s=summarizeHoldings(items);scopes[scopeKey(o,a)]={invested:s.invested,current:s.current,gain:s.gain,returnPct:s.returnPct,count:items.length};}));return{ts,scopes,watch:watchPulseSummary()};}
function recordGrowthSnapshot(){if(!state.username||holdingAmountsMissing())return;const now=Date.now(),h=loadGrowthHistory(),prev=h[h.length-1],cur=buildGrowthSnapshot(now),k=scopeKey('ALL','ALL'),a=cur.scopes[k]||{},b=prev?.scopes?.[k]||{};const changed=Math.abs(Number(a.invested||0)-Number(b.invested||0))>.01||Math.abs(Number(a.current||0)-Number(b.current||0))>.01||Math.abs(Number(cur.watch?.avgDistance||0)-Number(prev?.watch?.avgDistance||0))>.01;if(prev&&now-Number(prev.ts||0)<10*60*1000&&!changed)return;h.push(cur);saveGrowthHistory(h);}
function filteredGrowthHistory(){const h=loadGrowthHistory(),now=Date.now();if(state.growthRange==='7D')return h.filter(x=>now-Number(x.ts||0)<=7*86400000);if(state.growthRange==='30D')return h.filter(x=>now-Number(x.ts||0)<=30*86400000);return h;}
function pctChange(c,s){c=Number(c);s=Number(s);return Number.isFinite(c)&&Number.isFinite(s)&&s!==0?(c-s)/Math.abs(s)*100:null;}
function trendText(delta,pct,label=''){if(!Number.isFinite(Number(delta)))return'Tracking growth…';const d=Number(delta),p=Number(pct),sign=d>0?'▲':d<0?'▼':'•';return`${sign} ${formatCurrency(Math.abs(d),true)}${Number.isFinite(p)?` · ${p>=0?'+':''}${p.toFixed(2)}%`:''}${label?` ${label}`:''}`;}
function svgTrendChart(series,{height=220,emptyText='More history will appear after automatic updates.'}={}){const vals=series.flatMap(s=>s.points.map(p=>Number(p.value)).filter(Number.isFinite));if(!vals.length)return`<div class="chart-empty">${escapeHtml(emptyText)}</div>`;const W=720,H=height,l=20,r=18,t=18,b=28;let mn=Math.min(...vals),mx=Math.max(...vals);if(mn===mx){mn-=1;mx+=1;}const sp=mx-mn||1,n=Math.max(...series.map(s=>s.points.length),1),x=i=>l+(n<=1?0:i/(n-1))*(W-l-r),y=v=>t+(mx-Number(v))/sp*(H-t-b),grid=[0,.25,.5,.75,1].map(f=>{const yy=t+f*(H-t-b);return`<line x1="${l}" y1="${yy}" x2="${W-r}" y2="${yy}" class="chart-grid-line"/>`;}).join(''),paths=series.map(s=>{const pts=s.points.map((p,i)=>`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),last=s.points[s.points.length-1],lx=x(Math.max(0,s.points.length-1)),ly=last?y(last.value):0;return`<polyline points="${pts}" fill="none" class="chart-series ${s.className}" vector-effect="non-scaling-stroke"/>${last?`<circle cx="${lx}" cy="${ly}" r="4" class="chart-point ${s.className}"/>`:''}`;}).join('');return`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${paths}</svg>`;}
function renderGrowthDashboard(){const hist=filteredGrowthHistory(),key=scopeKey(state.selectedOwner,state.selectedAssetView),pts=hist.map(h=>({ts:h.ts,scope:h.scopes?.[key]})).filter(x=>x.scope),cur=summarizeHoldings(visibleHoldings()),first=pts[0]?.scope||null,last=pts[pts.length-1]?.scope||{invested:cur.invested,current:cur.current,gain:cur.gain,returnPct:cur.returnPct},id=first?Number(last.invested||0)-Number(first.invested||0):0,vd=first?Number(last.current||0)-Number(first.current||0):0,ip=first?pctChange(last.invested,first.invested):0,vp=first?pctChange(last.current,first.current):0;
 if(els.growthInvestedDelta){els.growthInvestedDelta.textContent=formatCurrency(id,true);els.growthInvestedDelta.className=pnlClass(id);els.growthInvestedPct.textContent=first?formatPercent(ip):'Starting now';els.growthValueDelta.textContent=formatCurrency(vd,true);els.growthValueDelta.className=pnlClass(vd);els.growthValuePct.textContent=first?formatPercent(vp):'Starting now';els.growthGainNow.textContent=formatCurrency(cur.gain,true);els.growthGainNow.className=pnlClass(cur.gain);els.growthReturnNow.textContent=formatPercent(cur.returnPct);els.growthReturnNow.className=pnlClass(cur.returnPct);}
 if(els.portfolioGrowthChart)els.portfolioGrowthChart.innerHTML=svgTrendChart([{className:'invested',points:pts.map(x=>({value:Number(x.scope.invested)||0}))},{className:'current',points:pts.map(x=>({value:Number(x.scope.current)||0}))}]);
 if(els.growthHistoryNote)els.growthHistoryNote.textContent=pts.length>1?`${pts.length} snapshots · ${state.growthRange==='ALL'?'all recorded history':state.growthRange}`:'Growth history starts now and builds automatically.';
 if(els.sumInvestedTrend){els.sumInvestedTrend.textContent=pts.length>1?trendText(id,ip,state.growthRange):'Tracking from now';els.sumInvestedTrend.className=`summary-trend ${pnlClass(id)}`;els.sumCurrentTrend.textContent=pts.length>1?trendText(vd,vp,state.growthRange):'Tracking from now';els.sumCurrentTrend.className=`summary-trend ${pnlClass(vd)}`;els.sumGainTrend.textContent=`${formatPercent(cur.returnPct)} total return`;els.sumGainTrend.className=`summary-trend ${pnlClass(cur.returnPct)}`;}renderWatchPulse(hist);}
function renderWatchPulse(hist=filteredGrowthHistory()){const p=watchPulseSummary();if(els.watchAtTarget)els.watchAtTarget.textContent=String(p.atTarget);if(els.watchNearTarget)els.watchNearTarget.textContent=String(p.nearTarget);if(els.watchAverageGap)els.watchAverageGap.textContent=p.avgDistance===null?'—':formatPercent(p.avgDistance);if(els.watchPulseCount)els.watchPulseCount.textContent=String(p.count);if(els.watchStripAtTarget)els.watchStripAtTarget.textContent=String(p.atTarget);if(els.watchStripNear)els.watchStripNear.textContent=String(p.nearTarget);if(els.watchStripGap)els.watchStripGap.textContent=p.avgDistance===null?'—':formatPercent(p.avgDistance);const wp=hist.map(h=>({value:Number(h.watch?.avgDistance)})).filter(x=>Number.isFinite(x.value));if(els.watchlistTrendChart)els.watchlistTrendChart.innerHTML=svgTrendChart([{className:'watch',points:wp}],{height:160,emptyText:'Watchlist target-distance history will build after updates.'});const first=hist.find(h=>Number.isFinite(Number(h.watch?.avgDistance)))?.watch?.avgDistance,gd=Number.isFinite(Number(first))&&Number.isFinite(Number(p.avgDistance))?Number(p.avgDistance)-Number(first):null;if(els.watchTrendNote)els.watchTrendNote.textContent=gd===null?'Lower average gap means ideas are moving closer to your targets.':`${gd<=0?'Closer':'Farther'} by ${Math.abs(gd).toFixed(2)} percentage points over ${state.growthRange}.`;if(els.sumWatchTrend){els.sumWatchTrend.textContent=p.atTarget?`${p.atTarget} at/below target · ${p.nearTarget} near`:`${p.nearTarget} near target · avg gap ${p.avgDistance===null?'—':formatPercent(p.avgDistance)}`;els.sumWatchTrend.className=`summary-trend ${p.atTarget?'positive':'neutral'}`;}}
function updateAutoRefreshUI(){if(!els.autoRefreshCountdown)return;const m=Number(state.autoRefreshMinutes)||0;if(!m){els.autoRefreshCountdown.textContent='Off';return;}const left=Math.max(0,state.autoRefreshNextAt-Date.now()),sec=Math.ceil(left/1000);els.autoRefreshCountdown.textContent=left>0?`Next ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`:'Updating…';}
function resetAutoRefreshClock(){const m=Number(state.autoRefreshMinutes)||0;state.autoRefreshNextAt=m?Date.now()+m*60000:0;updateAutoRefreshUI();}
function startAutoRefresh(){if(state.autoRefreshTimer)clearInterval(state.autoRefreshTimer);if(els.autoRefreshSelect)els.autoRefreshSelect.value=String(state.autoRefreshMinutes);resetAutoRefreshClock();state.autoRefreshTimer=setInterval(async()=>{updateAutoRefreshUI();if(!state.token||document.hidden||!state.autoRefreshMinutes||state.syncing)return;if(Date.now()>=state.autoRefreshNextAt){resetAutoRefreshClock();await loadDashboard(true);}},1000);}
function changeAutoRefresh(){state.autoRefreshMinutes=Number(els.autoRefreshSelect?.value||0);localStorage.setItem('portfolio_auto_refresh_min',String(state.autoRefreshMinutes));resetAutoRefreshClock();toast(state.autoRefreshMinutes?`Auto update set to every ${state.autoRefreshMinutes} minutes.`:'Auto update turned off.','success');}
function stopQuickValueSync(){
  if(state.quickValueSyncTimer){clearInterval(state.quickValueSyncTimer);state.quickValueSyncTimer=null;}
}
function startQuickValueSync(){
  stopQuickValueSync();
  if(!state.token)return;
  state.quickValueSyncTimer=setInterval(()=>{
    if(!state.token||document.hidden||state.syncing||state.coreSyncing)return;
    const age=Date.now()-Number(state.lastServerSyncAt||0);
    if(age<20000)return;
    loadPortfolioCore({silent:true}).catch(error=>console.warn('Quick value sync failed:',error));
  },QUICK_VALUE_SYNC_MS);
}

function overviewDefaultMode(){
  return 'PERSONAL';
}
function setOverviewMode(mode,{saveDefault=false}={}){
  state.overviewMode='PERSONAL';
  if(saveDefault)localStorage.setItem('portfolio_overview_default','PERSONAL');
  const investment=false;
  els.personalHomeContent?.classList.toggle('hidden',investment);
  els.investmentOverviewContent?.classList.toggle('hidden',!investment);
  els.personalHomeModeBtn?.classList.toggle('active',!investment);
  els.investmentHomeModeBtn?.classList.toggle('active',investment);
  const isDefault=overviewDefaultMode()===state.overviewMode;
  if(els.overviewSetDefaultBtn){
    els.overviewSetDefaultBtn.textContent=isDefault?'✓ Default view':'☆ Make default';
    els.overviewSetDefaultBtn.classList.toggle('is-default',isDefault);
  }
  if(state.activeSection==='overview'&&els.pageTitle)els.pageTitle.textContent=investment?'Investment overview':'My dashboard';
  if(!investment){
    renderPersonalHome();
    startLifeQuoteShuffle();
  }
  scheduleDashboardHScrollRefresh();
}
function setCurrentOverviewAsDefault(){
  setOverviewMode(state.overviewMode,{saveDefault:true});
  toast(state.overviewMode==='PERSONAL'?'My Home is now your default dashboard.':'Investments is now your default Overview.','success');
}
function diaryPreviewText(text,max=145){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  return clean.length>max?clean.slice(0,max-1)+'…':clean;
}
function quoteToneClass(){
  return `quote-tone-${normalizeLifeQuoteIndex(state.lifeQuoteIndex)%6}`;
}
function applyQuoteTone(){
  const cls=quoteToneClass();
  if(els.homeQuoteCard){
    [...els.homeQuoteCard.classList].filter(x=>x.startsWith('quote-tone-')).forEach(x=>els.homeQuoteCard.classList.remove(x));
    els.homeQuoteCard.classList.add(cls);
  }
  const panel=els.lifeQuoteText?.closest('.life-quote-panel');
  if(panel){
    [...panel.classList].filter(x=>x.startsWith('quote-tone-')).forEach(x=>panel.classList.remove(x));
    panel.classList.add(cls);
  }
}
function renderPersonalHome(){
  if(!els.personalHomeContent)return;
  const today=localIsoDate();
  const todayItems=state.diary
    .filter(x=>String(x.entryDate||'').slice(0,10)===today)
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  if(els.homeDiaryCount)els.homeDiaryCount.textContent=`${todayItems.length} today`;
  if(els.homeDiaryPreview){
    els.homeDiaryPreview.innerHTML=todayItems.length
      ? todayItems.slice(0,2).map((item,i)=>`<article class="home-diary-item tone-row-${i%2}"><strong>${escapeHtml(item.title?.trim()||'Daily note')}</strong><p>${escapeHtml(diaryPreviewText(item.text))}</p></article>`).join('')
      : '<p class="personal-empty-copy">Nothing written today yet. Add a quick note whenever you want to remember something.</p>';
  }

  const active=[...state.stickyNotes];
  const dueToday=active.filter(x=>String(x.dueDate||'')===today).length;
  const overdue=active.filter(x=>x.dueDate&&String(x.dueDate)<today).length;
  const upcoming=active.filter(x=>x.dueDate&&String(x.dueDate)>today).length;
  if(els.homeStickyCount)els.homeStickyCount.textContent=`${active.length} active`;
  if(els.homeStickyDueToday)els.homeStickyDueToday.textContent=String(dueToday);
  if(els.homeStickyOverdue)els.homeStickyOverdue.textContent=String(overdue);
  if(els.homeStickyUpcoming)els.homeStickyUpcoming.textContent=String(upcoming);

  if(els.homeStickyPreview){
    const sorted=active.sort((a,b)=>(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')).slice(0,3);
    els.homeStickyPreview.innerHTML=sorted.length
      ? sorted.map((note,i)=>{
          const due=stickyDueState(note);
          return `<button type="button" class="home-sticky-item ${due.cls} tone-row-${i%2}" data-home-open-sticky="1"><span class="home-sticky-dot"></span><span><strong>${escapeHtml(note.title||'Untitled')}</strong><small>${escapeHtml(due.label)}</small></span></button>`;
        }).join('')
      : '<p class="personal-empty-copy">No active target or reminder. Keep this area for only what matters now.</p>';
  }

  const displayName=state.user?.displayName||state.user?.username||'';
  if(els.personalHomeGreeting)els.personalHomeGreeting.textContent=displayName?`Good to see you, ${displayName}`:'Your day at a glance';
  syncHomeQuote();
}
function syncHomeQuote(){
  if(!els.homeQuoteText)return;
  const q=currentLifeQuote();
  if(q){
    els.homeQuoteText.textContent=q.text||'';
    els.homeQuoteAuthor.textContent=q.author?`— ${q.author}`:'— Life note';
  }else{
    els.homeQuoteText.textContent='Add your favorite life quotes in the Quote Library.';
    els.homeQuoteAuthor.textContent='— Quote Library';
  }
  applyQuoteTone();
}

function renderUtilityDrawerTab(){
  const sticky=state.utilityDrawerTab!=='QUOTE';
  if(els.utilityStickySection)els.utilityStickySection.classList.toggle('hidden',!sticky);
  if(els.utilityQuoteSection)els.utilityQuoteSection.classList.toggle('hidden',sticky);
  $$('[data-utility-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.utilityTab===state.utilityDrawerTab));
  if(state.utilityDrawerOpen&&state.utilityDrawerTab==='QUOTE'){
    renderLifeQuote(false);
    if(!state.lifeQuotePaused)startLifeQuoteShuffle();
  }else{
    stopLifeQuoteShuffle();
  }
}
function openUtilityDrawer(tab='STICKY'){
  state.utilityDrawerOpen=true;
  state.utilityDrawerTab=tab==='QUOTE'?'QUOTE':'STICKY';
  els.utilityDrawer?.classList.add('open');
  els.utilityDrawer?.setAttribute('aria-hidden','false');
  els.utilityDrawerOpenBtn?.setAttribute('aria-expanded','true');
  els.utilityDrawerScrim?.classList.add('show');
  els.utilityDrawerScrim?.setAttribute('aria-hidden','false');
  document.body.classList.add('utility-drawer-open');
  renderUtilityDrawerTab();
  if(state.utilityDrawerTab==='QUOTE')startLifeQuoteShuffle();
  setTimeout(()=>els.utilityDrawerCloseBtn?.focus(),50);
}
function closeUtilityDrawer(){
  state.utilityDrawerOpen=false;
  els.utilityDrawer?.classList.remove('open');
  els.utilityDrawer?.setAttribute('aria-hidden','true');
  els.utilityDrawerOpenBtn?.setAttribute('aria-expanded','false');
  els.utilityDrawerScrim?.classList.remove('show');
  els.utilityDrawerScrim?.setAttribute('aria-hidden','true');
  document.body.classList.remove('utility-drawer-open');
  if(lifeQuoteAutoContextVisible())startLifeQuoteShuffle();else stopLifeQuoteShuffle();
}
function toggleUtilityDrawer(){
  if(state.utilityDrawerOpen)closeUtilityDrawer();
  else openUtilityDrawer('STICKY');
}

function lifeQuoteDaySeed(){
  const key=`${localIsoDate()}|${state.username||state.user?.username||'user'}`;
  let hash=0;
  for(let i=0;i<key.length;i++)hash=((hash<<5)-hash+key.charCodeAt(i))|0;
  return Math.abs(hash);
}
function normalizeLifeQuoteIndex(index){
  const n=state.lifeQuotes.length;
  if(!n)return 0;
  return ((Number(index)||0)%n+n)%n;
}
function currentLifeQuote(){
  if(!state.lifeQuotes.length)return null;
  state.lifeQuoteIndex=normalizeLifeQuoteIndex(state.lifeQuoteIndex);
  return state.lifeQuotes[state.lifeQuoteIndex];
}
const LIFE_QUOTE_AUTO_MS=12000;
function lifeQuoteAutoContextVisible(){
  const homeVisible=state.activeSection==='overview'&&!els.personalHomeContent?.classList.contains('hidden');
  const drawerVisible=state.utilityDrawerOpen&&state.utilityDrawerTab==='QUOTE';
  return homeVisible||drawerVisible;
}
function updateLifeQuoteAutoStatus(){
  const items=state.lifeQuotes;
  const status=items.length<2?'1 saved quote':state.lifeQuotePaused?'Auto move paused':'Auto move · 12s';
  if(els.homeQuoteAutoStatus)els.homeQuoteAutoStatus.textContent=status;
  if(els.lifeQuoteShuffleStatus){
    els.lifeQuoteShuffleStatus.textContent=items.length<2?'1 saved quote':state.lifeQuotePaused?'Auto move paused':`Auto move · 12s · ${items.length} saved`;
  }
}
function animateLifeQuoteMovement(){
  const targets=[
    els.homeQuoteCard,
    els.lifeQuoteText?.closest('.life-quote-panel')
  ].filter(Boolean);
  targets.forEach(el=>{
    el.classList.remove('quote-auto-transition');
    void el.offsetWidth;
    el.classList.add('quote-auto-transition');
    setTimeout(()=>el.classList.remove('quote-auto-transition'),850);
  });
}
function renderLifeQuote(resetForDay=false,{animate=false}={}){
  if(!els.lifeQuoteText)return;
  const items=state.lifeQuotes;
  if(!items.length){
    els.lifeQuoteText.textContent='Add your favorite life quotes to start the daily rotation.';
    syncHomeQuote();
    els.lifeQuoteAuthor.textContent='— Quote Library';
    if(els.homeQuoteAutoStatus)els.homeQuoteAutoStatus.textContent='Add quotes to start';
    els.lifeQuoteShuffleStatus.textContent='No saved quotes';
    els.lifeQuoteNextBtn.disabled=true;
    els.lifeQuotePauseBtn.disabled=true;
    stopLifeQuoteShuffle();
    return;
  }
  if(resetForDay)state.lifeQuoteIndex=lifeQuoteDaySeed()%items.length;
  else state.lifeQuoteIndex=normalizeLifeQuoteIndex(state.lifeQuoteIndex);
  const q=currentLifeQuote();
  syncHomeQuote();
  els.lifeQuoteText.textContent=q.text||'';
  applyQuoteTone();
  els.lifeQuoteAuthor.textContent=q.author?`— ${q.author}`:'— Life note';
  els.lifeQuoteNextBtn.disabled=items.length<2;
  els.lifeQuotePauseBtn.disabled=items.length<2;
  els.lifeQuotePauseBtn.textContent=state.lifeQuotePaused?'▶ Resume':'Ⅱ Pause';
  updateLifeQuoteAutoStatus();
  if(animate)animateLifeQuoteMovement();
  if(!state.lifeQuotePaused&&items.length>1&&lifeQuoteAutoContextVisible())startLifeQuoteShuffle();
}
function nextLifeQuote(){
  if(state.lifeQuotes.length<2)return;
  state.lifeQuoteIndex=normalizeLifeQuoteIndex(state.lifeQuoteIndex+1);
  renderLifeQuote(false,{animate:true});
}
function stopLifeQuoteShuffle(){
  if(state.lifeQuoteTimer){clearInterval(state.lifeQuoteTimer);state.lifeQuoteTimer=null;}
}
function startLifeQuoteShuffle(){
  stopLifeQuoteShuffle();
  if(state.lifeQuotePaused||state.lifeQuotes.length<2||!lifeQuoteAutoContextVisible())return;
  state.lifeQuoteTimer=setInterval(()=>{
    if(document.hidden||!lifeQuoteAutoContextVisible())return;
    state.lifeQuoteIndex=normalizeLifeQuoteIndex(state.lifeQuoteIndex+1);
    renderLifeQuote(false,{animate:true});
  },LIFE_QUOTE_AUTO_MS);
}
function toggleLifeQuoteShuffle(){
  state.lifeQuotePaused=!state.lifeQuotePaused;
  if(state.lifeQuotePaused)stopLifeQuoteShuffle();else startLifeQuoteShuffle();
  renderLifeQuote(false);
}

function resetLifeQuoteForm(){
  if(!els.lifeQuoteForm)return;
  els.lifeQuoteForm.reset();
  els.lifeQuoteId.value='';
  els.saveLifeQuoteBtn.textContent='Save quote';
}
function openLifeQuoteLibrary(){
  resetLifeQuoteForm();
  if(els.lifeQuoteSearch)els.lifeQuoteSearch.value='';
  renderLifeQuoteLibrary();
  openModal('lifeQuoteModal');
  setTimeout(()=>els.lifeQuoteInput?.focus(),60);
}
function renderLifeQuoteLibrary(){
  if(!els.lifeQuoteList)return;
  const q=String(els.lifeQuoteSearch?.value||'').trim().toLowerCase();
  const items=state.lifeQuotes.filter(item=>`${item.text||''} ${item.author||''}`.toLowerCase().includes(q));
  els.lifeQuoteCount.textContent=`${items.length} quote${items.length===1?'':'s'}`;
  els.lifeQuoteEmpty.classList.toggle('hidden',items.length>0);
  els.lifeQuoteList.innerHTML=items.map(item=>`<article class="quote-library-item">
    <div class="quote-library-item-copy"><p>“${escapeHtml(item.text||'')}”</p><span>${escapeHtml(item.author||'Life note')}</span></div>
    <div class="quote-library-item-actions"><button type="button" class="small-button" data-life-quote-edit="${escapeHtml(item.id)}">Edit</button><button type="button" class="small-button danger" data-life-quote-delete="${escapeHtml(item.id)}">Delete</button></div>
  </article>`).join('');
}
function editLifeQuote(id){
  const item=state.lifeQuotes.find(x=>x.id===id);
  if(!item)return;
  els.lifeQuoteId.value=item.id;
  els.lifeQuoteInput.value=item.text||'';
  els.lifeQuoteAuthorInput.value=item.author||'';
  els.saveLifeQuoteBtn.textContent='Update quote';
  els.lifeQuoteInput.focus();
}
async function saveLifeQuote(event){
  event.preventDefault();
  const text=els.lifeQuoteInput.value.trim();
  if(!text){toast('Enter the quote text.','error');return;}
  setBusy(els.saveLifeQuoteBtn,true,'Saving…');
  try{
    const result=await api('saveLifeQuote',{quote:{id:els.lifeQuoteId.value,text,author:els.lifeQuoteAuthorInput.value.trim()}});
    applyBootstrap(result.data);saveCache(result.data);resetLifeQuoteForm();renderLifeQuoteLibrary();renderLifeQuote(true);
    toast('Quote saved to DailyQuotes.','success');
  }catch(e){toast(e.message,'error');}
  finally{setBusy(els.saveLifeQuoteBtn,false);}
}
async function deleteLifeQuote(id){
  const item=state.lifeQuotes.find(x=>x.id===id);
  if(!item||!confirm('Delete this saved quote?'))return;
  try{
    const result=await api('deleteLifeQuote',{id});
    applyBootstrap(result.data);saveCache(result.data);renderLifeQuoteLibrary();renderLifeQuote(true);
    toast('Quote deleted.','success');
  }catch(e){toast(e.message,'error');}
}

function stickyDueState(note){
  const due=String(note.dueDate||'');
  if(!due)return {label:'No due date',cls:'normal'};
  const today=localIsoDate();
  if(due<today)return {label:`Overdue · ${diaryDateLabel(due)}`,cls:'overdue'};
  if(due===today)return {label:'Due today',cls:'today'};
  return {label:`Due ${diaryDateLabel(due)}`,cls:'upcoming'};
}

const STICKY_PIN_STORAGE_KEY='portfolio_pinned_sticky_ids_v1';
const STICKY_LAYOUT_STORAGE_KEY='portfolio_pinned_sticky_layouts_v2';
let stickyTopZ=210;

function loadPinnedStickyIds(){
  try{
    const raw=JSON.parse(localStorage.getItem(STICKY_PIN_STORAGE_KEY)||'[]');
    return Array.isArray(raw)?raw.map(String).filter(Boolean):[];
  }catch{return [];}
}
function savePinnedStickyIds(ids){
  try{localStorage.setItem(STICKY_PIN_STORAGE_KEY,JSON.stringify([...new Set(ids.map(String).filter(Boolean))]));}catch{}
}
function isStickyPinned(id){
  return loadPinnedStickyIds().includes(String(id));
}
function loadStickyLayouts(){
  try{const value=JSON.parse(localStorage.getItem(STICKY_LAYOUT_STORAGE_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function saveStickyLayouts(layouts){try{localStorage.setItem(STICKY_LAYOUT_STORAGE_KEY,JSON.stringify(layouts||{}));}catch{}}
function defaultStickyLayout(index=0){
  const width=Math.min(340,Math.max(270,window.innerWidth-24));
  return {left:Math.max(8,window.innerWidth-width-18-(index%3)*24),top:Math.min(Math.max(72,86+(index%5)*34),Math.max(72,window.innerHeight-210)),width,height:Math.min(360,Math.max(220,window.innerHeight-150))};
}
function stickyLayoutFor(id,index=0){
  const stored=loadStickyLayouts()[String(id)]||{};const fallback=defaultStickyLayout(index);
  return {left:Number.isFinite(Number(stored.left))?Number(stored.left):fallback.left,top:Number.isFinite(Number(stored.top))?Number(stored.top):fallback.top,width:Number.isFinite(Number(stored.width))?Number(stored.width):fallback.width,height:Number.isFinite(Number(stored.height))?Number(stored.height):fallback.height};
}
function clampStickyLayout(layout){
  const width=Math.max(245,Math.min(Number(layout.width)||320,Math.max(245,window.innerWidth-12)));
  const height=Math.max(180,Math.min(Number(layout.height)||260,Math.max(180,window.innerHeight-12)));
  return {width,height,left:Math.max(6,Math.min(Number(layout.left)||6,Math.max(6,window.innerWidth-width-6))),top:Math.max(6,Math.min(Number(layout.top)||72,Math.max(6,window.innerHeight-height-6)))};
}
function saveStickyCardLayout(card){
  if(!card?.dataset.stickyFloatingId)return;const layouts=loadStickyLayouts();const rect=card.getBoundingClientRect();layouts[card.dataset.stickyFloatingId]=clampStickyLayout({left:rect.left,top:rect.top,width:rect.width,height:rect.height});saveStickyLayouts(layouts);
}
function clearStickyCardLayout(id){const layouts=loadStickyLayouts();delete layouts[String(id)];saveStickyLayouts(layouts);}
function prunePinnedStickyIds(){
  const active=new Set((state.stickyNotes||[]).map(x=>String(x.id)));
  const clean=loadPinnedStickyIds().filter(id=>active.has(String(id)));
  savePinnedStickyIds(clean);
  const layouts=loadStickyLayouts();let changed=false;Object.keys(layouts).forEach(id=>{if(!active.has(String(id))){delete layouts[id];changed=true;}});if(changed)saveStickyLayouts(layouts);
  return clean;
}
function toggleStickyPin(id){
  const key=String(id||'');
  if(!key)return;
  const ids=loadPinnedStickyIds();
  const pos=ids.indexOf(key);
  if(pos>=0){
    ids.splice(pos,1);
    toast('Sticky note unpinned.','success');
  }else{
    ids.push(key);
    toast('Sticky note pinned above the dashboard.','success');
  }
  savePinnedStickyIds(ids);
  renderStickyNotes();
}
function pinnedStickyCardHtml(note,index=0){
  const due=stickyDueState(note);
  const type=String(note.noteType||'REMINDER').toUpperCase();
  const layout=clampStickyLayout(stickyLayoutFor(note.id,index));
  return `<article class="sticky-note-card pinned-floating ${type.toLowerCase()} ${due.cls}" data-sticky-floating-id="${escapeHtml(note.id)}" style="left:${Math.round(layout.left)}px;top:${Math.round(layout.top)}px;width:${Math.round(layout.width)}px;height:${Math.round(layout.height)}px;z-index:${200+index}">
    <div class="sticky-floating-toolbar" data-sticky-drag-handle title="Drag this bar to move the sticky note">
      <span class="sticky-move-grip">✥ Move</span><span class="sticky-pinned-badge">📌 Pinned</span>
    </div>
    <div class="sticky-note-top">
      <span class="sticky-note-type">${type==='TARGET'?'Target':'Reminder'}</span>
      <span class="sticky-due ${due.cls}">${escapeHtml(due.label)}</span>
    </div>
    <h4>${escapeHtml(note.title||'Untitled')}</h4>
    ${note.text?`<p class="sticky-full-text">${escapeHtml(note.text)}</p>`:''}
    <div class="sticky-note-actions pinned-actions">
      <button type="button" class="sticky-pin-button active" data-sticky-pin="${escapeHtml(note.id)}" title="Unpin">↘ Unpin</button>
      <button type="button" class="sticky-done-button" data-sticky-done="${escapeHtml(note.id)}">✓ Completed</button>
      <button type="button" class="small-button" data-sticky-edit="${escapeHtml(note.id)}">Edit</button>
      <button type="button" class="small-button" data-sticky-reset-layout="${escapeHtml(note.id)}">Reset size</button>
      <button type="button" class="small-button danger" data-sticky-delete="${escapeHtml(note.id)}">Delete</button>
    </div>
    <span class="sticky-resize-handle" data-sticky-resize-handle title="Drag to resize"></span>
  </article>`;
}
function startStickyPointerAction(event,card,mode){
  if(!card||event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();event.stopPropagation();
  stickyTopZ+=1;card.style.zIndex=String(stickyTopZ);const rect=card.getBoundingClientRect();const startX=event.clientX,startY=event.clientY;
  const move=ev=>{const dx=ev.clientX-startX,dy=ev.clientY-startY;if(mode==='move'){const layout=clampStickyLayout({left:rect.left+dx,top:rect.top+dy,width:rect.width,height:rect.height});card.style.left=`${layout.left}px`;card.style.top=`${layout.top}px`;}else{const layout=clampStickyLayout({left:rect.left,top:rect.top,width:rect.width+dx,height:rect.height+dy});card.style.width=`${layout.width}px`;card.style.height=`${layout.height}px`;}};
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);document.body.classList.remove('sticky-pointer-active');saveStickyCardLayout(card);};
  document.body.classList.add('sticky-pointer-active');window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
}
function installPinnedStickyInteractions(){
  els.pinnedStickyLayer?.querySelectorAll('[data-sticky-floating-id]').forEach(card=>{card.addEventListener('pointerdown',()=>{stickyTopZ+=1;card.style.zIndex=String(stickyTopZ);},{passive:true});card.querySelector('[data-sticky-drag-handle]')?.addEventListener('pointerdown',event=>startStickyPointerAction(event,card,'move'));card.querySelector('[data-sticky-resize-handle]')?.addEventListener('pointerdown',event=>startStickyPointerAction(event,card,'resize'));});
}
function resetStickyLayout(id){clearStickyCardLayout(id);renderPinnedStickyNotes();toast('Sticky size and position reset.','success');}
function clampPinnedStickyCards(){els.pinnedStickyLayer?.querySelectorAll('[data-sticky-floating-id]').forEach(card=>{const rect=card.getBoundingClientRect();const layout=clampStickyLayout({left:rect.left,top:rect.top,width:rect.width,height:rect.height});Object.assign(card.style,{left:`${layout.left}px`,top:`${layout.top}px`,width:`${layout.width}px`,height:`${layout.height}px`});saveStickyCardLayout(card);});}
function renderPinnedStickyNotes(){
  if(!els.pinnedStickyLayer)return;
  const ids=prunePinnedStickyIds();
  const map=new Map((state.stickyNotes||[]).map(x=>[String(x.id),x]));
  const notes=ids.map(id=>map.get(String(id))).filter(Boolean);
  els.pinnedStickyLayer.innerHTML=notes.map((note,index)=>pinnedStickyCardHtml(note,index)).join('');
  els.pinnedStickyLayer.classList.toggle('hidden',notes.length===0);
  installPinnedStickyInteractions();
}

function stickyHistoryCardHtml(note){
  const due=note.dueDate?`<span>Due ${escapeHtml(diaryDateLabel(note.dueDate))}</span>`:'';
  const completed=note.completedAt?dateLabel(note.completedAt):'Completed';
  return `<article class="sticky-history-card ${String(note.noteType||'REMINDER').toLowerCase()}">
    <div class="sticky-history-card-top"><span>✓ ${escapeHtml(completed)}</span>${due}</div>
    <h5>${escapeHtml(note.title||'Untitled')}</h5>
    ${note.text?`<p>${escapeHtml(note.text)}</p>`:''}
  </article>`;
}
function renderStickyNoteHistory(){
  const history=[...(state.stickyNoteHistory||[])];
  const targets=history.filter(x=>String(x.noteType).toUpperCase()==='TARGET');
  const reminders=history.filter(x=>String(x.noteType).toUpperCase()!=='TARGET');
  const targetList=$('stickyTargetHistoryList'),reminderList=$('stickyReminderHistoryList');
  if(targetList)targetList.innerHTML=targets.length?targets.map(stickyHistoryCardHtml).join(''):'<p class="sticky-history-empty-column">No completed targets yet.</p>';
  if(reminderList)reminderList.innerHTML=reminders.length?reminders.map(stickyHistoryCardHtml).join(''):'<p class="sticky-history-empty-column">No completed reminders yet.</p>';
  if($('stickyHistoryCount'))$('stickyHistoryCount').textContent=`${history.length} completed`;
  if($('stickyTargetHistoryCount'))$('stickyTargetHistoryCount').textContent=String(targets.length);
  if($('stickyReminderHistoryCount'))$('stickyReminderHistoryCount').textContent=String(reminders.length);
  if($('stickyHistoryEmpty'))$('stickyHistoryEmpty').classList.toggle('hidden',history.length>0);
}

function renderStickyNotes(){
  if(!els.stickyNotesList)return;
  const items=[...state.stickyNotes].sort((a,b)=>{
    const ap=isStickyPinned(a.id)?0:1,bp=isStickyPinned(b.id)?0:1;
    if(ap!==bp)return ap-bp;
    const ad=a.dueDate||'9999-12-31',bd=b.dueDate||'9999-12-31';
    const d=ad.localeCompare(bd);
    return d!==0?d:String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
  });
  els.stickyNotesCount.textContent=`${items.length} active`;
  if(els.utilityStickyBadge)els.utilityStickyBadge.textContent=String(items.length);
  if(els.utilityStickyTabCount)els.utilityStickyTabCount.textContent=String(items.length);
  if(els.overviewStickyShortcutCount)els.overviewStickyShortcutCount.textContent=`${items.length} active`;
  els.stickyNotesEmpty.classList.toggle('hidden',items.length>0);
  els.stickyNotesList.innerHTML=items.map(note=>{
    const due=stickyDueState(note);
    const type=String(note.noteType||'REMINDER').toUpperCase();
    const pinned=isStickyPinned(note.id);
    return `<article class="sticky-note-card ${pinned?'is-pinned':''} ${type.toLowerCase()} ${due.cls}">
      <div class="sticky-note-top"><span class="sticky-note-type">${type==='TARGET'?'Target':'Reminder'}</span><span class="sticky-due ${due.cls}">${escapeHtml(due.label)}</span></div>
      <h4>${escapeHtml(note.title||'Untitled')}</h4>
      ${note.text?`<p class="sticky-full-text">${escapeHtml(note.text)}</p>`:''}
      <div class="sticky-note-actions">
        <button type="button" class="sticky-pin-button ${pinned?'active':''}" data-sticky-pin="${escapeHtml(note.id)}">${pinned?'📌 Pinned':'📍 Pin'}</button>
        <button type="button" class="sticky-done-button" data-sticky-done="${escapeHtml(note.id)}">✓ Completed</button>
        <button type="button" class="small-button" data-sticky-edit="${escapeHtml(note.id)}">Edit</button>
        <button type="button" class="small-button danger" data-sticky-delete="${escapeHtml(note.id)}">Delete</button>
      </div>
    </article>`;
  }).join('');
  renderStickyNoteHistory();
  renderPinnedStickyNotes();
  renderPersonalHome();
}
function openStickyNote(note=null){
  els.stickyNoteForm.reset();
  els.stickyNoteId.value=note?.id||'';
  els.stickyNoteType.value=note?.noteType||'TARGET';
  els.stickyNoteTitle.value=note?.title||'';
  els.stickyNoteDueDate.value=note?.dueDate||'';
  els.stickyNoteText.value=note?.text||'';
  els.stickyNoteModalTitle.textContent=note?'Edit sticky note':'Add target or reminder';
  openModal('stickyNoteModal');
  setTimeout(()=>els.stickyNoteTitle?.focus(),60);
}
async function saveStickyNote(event){
  event.preventDefault();
  const title=els.stickyNoteTitle.value.trim();
  if(!title){toast('Enter a title for the sticky note.','error');return;}
  setBusy(els.saveStickyNoteBtn,true,'Saving…');
  try{
    const result=await api('saveStickyNote',{note:{
      id:els.stickyNoteId.value,
      noteType:els.stickyNoteType.value,
      title,
      dueDate:els.stickyNoteDueDate.value,
      text:els.stickyNoteText.value.trim()
    }});

    // Backend save succeeded. Close the editor before doing a full dashboard rerender.
    closeModals();

    try{
      applyBootstrap(result.data);
      saveCache(result.data);
      renderStickyNotes();
      toast('Sticky note saved and shown on Overview.','success');
    }catch(renderError){
      console.error('Sticky saved; dashboard rerender failed',renderError);
      toast('Sticky note was saved. Refresh once to display the latest dashboard.','info');
    }
  }catch(e){
    toast(e.message,'error');
  }finally{
    setBusy(els.saveStickyNoteBtn,false);
  }
}
async function completeStickyNote(id){
  const item=state.stickyNotes.find(x=>x.id===id);
  if(!item)return;
  if(!confirm(`Mark "${item.title}" done and move it to the Sticky Note Diary?`))return;
  try{
    const result=await api('completeStickyNote',{id});
    applyBootstrap(result.data);saveCache(result.data);renderStickyNotes();
    toast('Done — moved to Sticky Note Diary.','success');
  }catch(e){toast(e.message,'error');}
}
async function deleteStickyNote(id){
  const item=state.stickyNotes.find(x=>x.id===id);
  if(!item||!confirm(`Delete sticky note "${item.title}"?`))return;
  try{
    const result=await api('deleteStickyNote',{id});
    applyBootstrap(result.data);saveCache(result.data);renderStickyNotes();
    toast('Sticky note deleted.','success');
  }catch(e){toast(e.message,'error');}
}

function titleCase(value){return String(value||'').trim().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function canonicalOwner(value){
  const raw=String(value||'').trim(); if(!raw)return 'Portfolio';
  const low=raw.toLowerCase(); const configured=Array.isArray(CONFIG.OWNERS)?CONFIG.OWNERS:[];
  for(const owner of configured){const first=String(owner).trim().toLowerCase().split(/\s+/)[0]; if(first&&low.includes(first))return String(owner).trim();}
  return titleCase(raw);
}
function configuredOwners(){
  const defaults=Array.isArray(CONFIG.OWNERS)?CONFIG.OWNERS.map(canonicalOwner):[];
  return [...new Set([...defaults,...state.owners.map(canonicalOwner),...state.holdings.map(h=>canonicalOwner(h.owner)),...state.sipPlans.map(p=>canonicalOwner(p.owner))].filter(Boolean))];
}
function shortOwner(owner){ const c=canonicalOwner(owner); const configured=Array.isArray(CONFIG.OWNERS)?CONFIG.OWNERS:[]; const match=configured.find(x=>c.toLowerCase().includes(String(x).toLowerCase().split(/\s+/)[0])); return match||c.split(/\s+/)[0]||c; }

function updateVersionLabels(){
  const backendVersion=state.backendVersion||EXPECTED_BACKEND_VERSION;
  if(els.loginVersion)els.loginVersion.textContent=`Frontend · v${APP_VERSION}`;
  if(els.dashboardVersion)els.dashboardVersion.textContent=`Frontend · v${APP_VERSION}`;
  if(els.dashboardVersionTop)els.dashboardVersionTop.textContent=`FE v${APP_VERSION}`;
  if(els.mobileFrontendVersion)els.mobileFrontendVersion.textContent=`FE v${APP_VERSION}`;
  if(els.loginBackendVersion)els.loginBackendVersion.textContent=`Backend · v${backendVersion}`;
  if(els.dashboardBackendVersion)els.dashboardBackendVersion.textContent=`Backend · v${backendVersion}`;
  if(els.dashboardBackendVersionTop)els.dashboardBackendVersionTop.textContent=`BE v${backendVersion}`;
  if(els.mobileBackendVersion)els.mobileBackendVersion.textContent=`BE v${backendVersion}`;
}
async function loadBackendVersion(){
  updateVersionLabels();
  if(!isConfigured())return;
  // Never compete with a sign-in request. Login/core bootstrap confirms the
  // actual backend version immediately after authentication on every device.
  if(!state.token)return;
  try{
    const data=await api('status',{}, {timeoutMs:15000});
    if(data&&data.version){
      state.backendVersion=String(data.version);
      const parts=state.backendVersion.split('.').map(Number);
      if(parts[0]<3||(parts[0]===3&&(parts[1]<17||(parts[1]===17&&(parts[2]||0)<2)))){
        showRuntimeWarning(`Backend v${state.backendVersion} is older than required v3.17.8. Deploy the included Code-v3.17.8.gs for expenditure subcategories.`);
      }
    }
  }catch(e){
    if(!state.backendVersion)state.backendVersion='unavailable';
    console.warn('Backend status check failed:',e);
  }
  updateVersionLabels();
}
function loadSavedUsername(){
  let saved=localStorage.getItem('portfolio_saved_username')||'';
  try{
    const relayed=new URLSearchParams(location.search).get('user')||'';
    if(relayed&&/^[A-Za-z0-9._-]{1,60}$/.test(relayed)){
      saved=relayed;
      localStorage.setItem('portfolio_saved_username',relayed);
    }
  }catch{}
  if(els.loginUsername&&saved){els.loginUsername.value=saved;if(els.rememberUsername)els.rememberUsername.checked=true;}
  updateVersionLabels();
}
function updateSavedUsernamePreference(){
  const username=els.loginUsername?.value.trim()||'';
  if(els.rememberUsername?.checked&&username)localStorage.setItem('portfolio_saved_username',username);
  else localStorage.removeItem('portfolio_saved_username');
}
function localIsoDate(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localIsoMonth(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}


function holdingRowsHealth(rows){
  const holdings=Array.isArray(rows)?rows:[];
  const priceable=holdings.filter(h=>
    ['MF','STOCK','ETF'].includes(String(h.type||'').toUpperCase()) &&
    (Number(h.units)||0)>0
  );
  const invested=priceable.reduce((sum,h)=>sum+(Number(h.investedAmount)||0),0);
  const current=priceable.reduce((sum,h)=>sum+(Number(h.currentValue)||0),0);
  const displayed=priceable.filter(h=>
    (Number(h.currentValue)||0)>0 || (Number(h.currentPrice)||0)>0
  ).length;
  const priced=priceable.filter(h=>
    !h.valueFromSnapshot&&!h.sharedValueRecovery&&((Number(h.currentValue)||0)>0 || (Number(h.currentPrice)||0)>0)
  ).length;
  const missing=Math.max(0,priceable.length-priced);
  return {count:holdings.length,priceable:priceable.length,invested,current,displayed,priced,missing};
}
function holdingAmountHealth(){return holdingRowsHealth(state.holdings);}
function holdingAmountsMissing(){
  const h=holdingAmountHealth();
  if(!h.priceable)return false;
  // Repair if even ONE MF/stock/ETF is missing its live value.
  return h.invested>0 && (h.current<=0 || h.priced<h.priceable || h.missing>0);
}
function normalizeHoldingValues(holdings){
  return (Array.isArray(holdings)?holdings:[]).map(source=>{
    const h={...source};
    const units=Number(h.units);
    const invested=Number(h.investedAmount);
    const price=Number(h.currentPrice);
    const value=Number(h.currentValue);

    // A device must never present an unavailable live value as a real ₹0.
    // Derive either field when the other is available; otherwise retain null
    // until the authoritative backend refresh completes.
    if(units>0&&price>0&&!(value>0))h.currentValue=units*price;
    if(units>0&&value>0&&!(price>0))h.currentPrice=value/units;
    if(units>0&&invested>0&&!(Number(h.currentPrice)>0)&&!(Number(h.currentValue)>0)){
      h.currentPrice=null;
      h.currentValue=null;
    }
    return h;
  });
}
function readGoodValueSnapshot(){
  try{
    const raw=JSON.parse(localStorage.getItem(valueSnapshotStorageKey(state.username))||'null');
    return raw&&raw.values&&typeof raw.values==='object'?raw:{savedAt:0,values:{}};
  }catch{return {savedAt:0,values:{}};}
}
function mergeGoodValueSnapshot(holdings){
  const snapshot=readGoodValueSnapshot();
  return normalizeHoldingValues(holdings).map(source=>{
    const h={...source,valueFromSnapshot:false};
    if((Number(h.currentPrice)||0)>0||(Number(h.currentValue)||0)>0)return h;
    const saved=snapshot.values?.[legacyHoldingSnapshotId(h)];
    if(!saved)return h;
    const units=Number(h.units)||0;
    const savedPrice=Number(saved.currentPrice)||0;
    const savedValue=Number(saved.currentValue)||0;
    const savedUnits=Number(saved.units)||0;
    if(savedPrice>0){
      h.currentPrice=savedPrice;
      h.currentValue=units>0?units*savedPrice:(savedValue>0?savedValue:null);
    }else if(savedValue>0&&(!savedUnits||!units||Math.abs(savedUnits-units)<1e-8)){
      h.currentValue=savedValue;
      if(units>0)h.currentPrice=savedValue/units;
    }
    if((Number(h.currentPrice)||0)>0||(Number(h.currentValue)||0)>0){
      h.valueFromSnapshot=true;
      h.priceSource='Last verified value';
      h.priceDate=saved.priceDate||snapshot.savedAt||h.priceDate||'';
    }
    return h;
  });
}
function persistGoodValueSnapshot(updatedAt=''){
  if(!state.username||!Array.isArray(state.holdings))return;
  const previous=readGoodValueSnapshot();
  const values={...(previous.values||{})};
  let wroteLive=false;
  state.holdings.forEach(h=>{
    if(h.valueFromSnapshot)return;
    const units=Number(h.units)||0;
    const price=Number(h.currentPrice)||0;
    const value=Number(h.currentValue)||0;
    if(!(price>0||value>0))return;
    values[legacyHoldingSnapshotId(h)]={
      units:units>0?units:null,
      currentPrice:price>0?price:null,
      currentValue:value>0?value:(units>0&&price>0?units*price:null),
      priceDate:h.priceDate||updatedAt||'',
      priceSource:h.priceSource||'Backend verified'
    };
    wroteLive=true;
  });
  if(!wroteLive)return;
  try{localStorage.setItem(valueSnapshotStorageKey(state.username),JSON.stringify({savedAt:Date.now(),values}));}catch{}
}
// Keep old names for compatibility with existing v19.2.9 code.
function mobileHoldingAmountHealth(){return holdingAmountHealth();}
function mobileHoldingAmountsMissing(){return holdingAmountsMissing();}

async function repairHoldingAmounts({allowPriceRefresh=true,skipBootstrap=false}={}){
  if(!state.token||!isConfigured())return false;
  state.mobileLastAmountCheckAt=Date.now();

  // Login already returns a complete bootstrap snapshot. On phones, do not
  // immediately repeat that slow request before allowing the user into the app.
  if(!skipBootstrap){
    try{
      const boot=await api('bootstrap',{}, {retry:true,timeoutMs:90000});
      if(boot?.data&&(isUsableDashboardData(boot.data)||!state.holdings.length)){
        applyBootstrap(boot.data);
        saveCache(boot.data);
        state.lastServerSyncAt=Date.now();
      }
    }catch(error){
      console.warn('Portfolio bootstrap retry failed:',error);
    }
  }

  if(!holdingAmountsMissing())return true;
  if(!allowPriceRefresh||state.mobileAmountRepairTried)return false;

  state.mobileAmountRepairTried=true;
  setSyncStatus('syncing','Repairing holding values…');
  try{
    const refreshed=await api('refreshPrices',{}, {retry:false,timeoutMs:120000});
    if(refreshed?.data&&(isUsableDashboardData(refreshed.data)||!state.holdings.length)){
      applyBootstrap(refreshed.data);
      saveCache(refreshed.data);
      state.lastServerSyncAt=Date.now();
    }
    const repaired=!holdingAmountsMissing();
    if(!repaired)setTimeout(()=>{state.mobileAmountRepairTried=false;},30000);
    return repaired;
  }catch(error){
    console.warn('Holding value repair failed:',error);
    // Permit a later resume/online event to try again instead of leaving this
    // device at missing values for the remainder of the session.
    state.mobileAmountRepairTried=false;
    return false;
  }finally{
    setSyncStatus('','Up to date');
  }
}
async function repairMobileHoldingAmounts(options={}){
  return repairHoldingAmounts(options);
}

async function beginBackgroundHydration(tokenAtStart,{hasSaved=false}={}){
  if(!tokenAtStart||tokenAtStart!==state.token)return;
  setPortfolioStartupLoading(false);
  setSyncStatus('syncing',hasSaved?'Refreshing quietly…':'Loading holdings quietly…');

  const coreReady=await loadPortfolioCore({startup:false,silent:true});
  if(!state.token||state.token!==tokenAtStart)return;
  if(coreReady)setSyncStatus('','Holdings ready · details updating quietly');
  else setSyncStatus('','Signed in · retrying holdings quietly');

  // Give the Apps Script worker and mobile network a short rest before the
  // larger dashboard request. This prevents concurrent startup requests.
  await new Promise(resolve=>setTimeout(resolve,coreReady?1200:3500));
  if(!state.token||state.token!==tokenAtStart)return;
  const fullReady=await loadDashboard(false,{startup:false});
  if(!state.token||state.token!==tokenAtStart)return;

  if(!fullReady&&!coreReady){
    setSyncStatus('','Signed in · holdings will retry automatically');
    setTimeout(()=>{
      if(state.token===tokenAtStart)loadPortfolioCore({startup:false,silent:true,forceShared:true});
    },12000);
  }
}

function isRecoverableLoginTransportError(error){
  const code=String(error?.code||'').toUpperCase();
  if(['INVALID_LOGIN','RATE_LIMITED','BAD_REQUEST'].includes(code))return false;
  return /timed out|could not reach|did not return|polling endpoint|network|failed to fetch|load failed/i.test(String(error?.message||error||''));
}
async function loginWithAutomaticBrowserRecovery(username,password){
  const payload={username,password,fastLogin:true};
  try{
    // Give the direct secure iframe reply time to arrive before using JSONP.
    // This avoids the polling endpoint that some normal browser profiles block.
    return await api('login',payload,{timeoutMs:26000,pollFallbackDelayMs:12000});
  }catch(error){
    let alreadyRecovered=false;
    try{alreadyRecovered=sessionStorage.getItem(AUTOMATIC_LOGIN_RECOVERY_KEY)==='1';}catch{}
    if(alreadyRecovered||!isRecoverableLoginTransportError(error))throw error;

    try{sessionStorage.setItem(AUTOMATIC_LOGIN_RECOVERY_KEY,'1');}catch{}
    if(els.loginMessage)els.loginMessage.textContent='Old browser cache detected. Repairing it and signing in again…';
    await purgeAppManagedBrowserCaches();
    await new Promise(resolve=>setTimeout(resolve,350));
    return api('login',payload,{timeoutMs:36000,pollFallbackDelayMs:15000});
  }
}

async function login(event){
  event.preventDefault();
  if(els.loginMessage)els.loginMessage.textContent='';
  if(!isConfigured()){if(els.loginMessage)els.loginMessage.textContent='Setup required: paste the Apps Script /exec URL into config.js.';return;}
  setBusy(els.loginButton,true,'Signing in…');
  try{
    const result=await loginWithAutomaticBrowserRecovery(els.loginUsername.value.trim(),els.loginPassword.value);
    if(!result?.token||!result?.user?.username)throw new Error('Login did not complete. Please try once more.');
    state.token=result.token;
    state.username=result.user.username;
    state.user=result.user;
    if(result.backendVersion)state.backendVersion=String(result.backendVersion);
    updateVersionLabels();
    state.lastActivityAt=nowMs();
    localStorage.setItem(LAST_ACTIVITY_KEY,String(state.lastActivityAt));
    localStorage.removeItem(LAST_HIDDEN_KEY);
    state.mobileAmountRepairTried=false;
    state.holdingViewChecked=false;
    localStorage.setItem('portfolio_token',state.token);
    localStorage.setItem('portfolio_username',state.username);
    updateSavedUsernamePreference();

    showApp();
    state.startupPortfolioLoaded=false;
    const saved=loadCache();
    if(isUsableDashboardData(result.data)){
      applyBootstrap(result.data);
      saveCache(result.data);
      state.lastServerSyncAt=Date.now();
    }else if(saved){
      applyBootstrap({...saved,user:result.user},true);
    }else{
      setPortfolioStartupLoading(false);
      refreshOwnerControls();
      renderAll();
      if(els.lastUpdatedText)els.lastUpdatedText.textContent='Signed in · holdings are updating quietly';
    }

    restoreHoldingsSummaryState();
    switchSection('overview');
    resetAutoRefreshClock();
    toast('Signed in successfully.','success');
    try{sessionStorage.removeItem(AUTOMATIC_LOGIN_RECOVERY_KEY);}catch{}
    if(els.loginPassword)els.loginPassword.value='';
    setBusy(els.loginButton,false);

    // Authentication is the only work the sign-in button waits for. Holdings
    // and full details hydrate sequentially after the dashboard is usable.
    beginBackgroundHydration(state.token,{hasSaved:Boolean(saved||isUsableDashboardData(result.data))});
  }
  catch(error){if(els.loginMessage)els.loginMessage.textContent=error.message;}
  finally{setBusy(els.loginButton,false);}
}

async function purgeAppManagedBrowserCaches(){
  // Cache Storage is different from Chrome's HTTP cache. We only remove
  // app-named caches and any old service worker whose scope is this repo.
  try{
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys
        .filter(k=>/myfinance|sarni|portfolio/i.test(String(k)))
        .map(k=>caches.delete(k)));
    }
  }catch(e){console.warn('Cache Storage cleanup skipped:',e);}

  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      const currentPath=location.pathname.replace(/[^/]*$/,'');
      await Promise.all(regs.map(reg=>{
        try{
          const scopePath=new URL(reg.scope).pathname;
          return scopePath.startsWith(currentPath)?reg.unregister():Promise.resolve(false);
        }catch(e){return Promise.resolve(false);}
      }));
    }
  }catch(e){console.warn('Service worker cleanup skipped:',e);}
}
function clearStartupWatchdog(){
  if(state.startupWatchdogTimer){
    clearTimeout(state.startupWatchdogTimer);
    state.startupWatchdogTimer=null;
  }
}
function startStartupWatchdog(tokenAtStart){
  clearStartupWatchdog();
  state.startupWatchdogTimer=setTimeout(()=>{
    if(!state.token||state.token!==tokenAtStart||state.startupPortfolioLoaded)return;
    // A clean Incognito window works but an old normal-browser session can hang.
    // Recover automatically instead of leaving the loading overlay forever.
    clearSession();
    setPortfolioStartupLoading(false);
    showLoggedOutUi();
    if(els.loginMessage){
      els.loginMessage.textContent='An old browser session was automatically cleared because loading took too long. Please sign in again.';
    }
  },STARTUP_STUCK_MS);
}
async function manualRepairBrowser(){
  const savedUsername=localStorage.getItem('portfolio_saved_username')||'';
  clearSession();
  try{
    Object.keys(localStorage).forEach(key=>{
      if(key.startsWith('portfolio_cache_'))localStorage.removeItem(key);
    });
    localStorage.setItem(APP_BUILD_STORAGE_KEY,APP_BUILD_ID);
    if(savedUsername)localStorage.setItem('portfolio_saved_username',savedUsername);
  }catch{}
  await purgeAppManagedBrowserCaches();
  const next=isNativeBackendMode()
    ?`${String(CONFIG.API_URL).trim()}?app=1&v=${encodeURIComponent(APP_VERSION)}&repair=${Date.now()}`
    :`${location.pathname}?v=${encodeURIComponent(APP_VERSION)}&repair=${Date.now()}`;
  location.replace(next);
}

function showLoggedOutUi(){
  clearStartupWatchdog();
  els.appView?.classList.add('hidden');
  els.loginView?.classList.remove('hidden');
  if(els.loginPassword)els.loginPassword.value='';
  loadSavedUsername();
  updateVersionLabels();
  try{
    if(localStorage.getItem('myfinance_browser_updated_notice')==='1'){
      localStorage.removeItem('myfinance_browser_updated_notice');
      if(els.loginMessage&&!els.loginMessage.textContent){
        els.loginMessage.textContent='App updated. Your saved session and preferences were kept.';
      }
    }
    if(localStorage.getItem('myfinance_browser_repaired_notice')==='1'){
      localStorage.removeItem('myfinance_browser_repaired_notice');
      if(els.loginMessage&&!els.loginMessage.textContent){
        els.loginMessage.textContent='Browser session/cache refreshed for the new version. Please sign in once.';
      }
    }
  }catch{}
}

function nowMs(){return Date.now();}
function setLastActivity(ts=nowMs(),{forceWrite=false}={}){
  state.lastActivityAt=Number(ts)||nowMs();
  if(forceWrite||state.lastActivityAt-state.lastActivityWrittenAt>=ACTIVITY_WRITE_THROTTLE_MS){
    state.lastActivityWrittenAt=state.lastActivityAt;
    try{localStorage.setItem(LAST_ACTIVITY_KEY,String(state.lastActivityAt));}catch{}
  }
  if(state.idleWarningShown)hideIdleWarning();
}
function sessionReferenceTime(){
  const activity=Number(localStorage.getItem(LAST_ACTIVITY_KEY)||state.lastActivityAt||0);
  const hidden=Number(localStorage.getItem(LAST_HIDDEN_KEY)||0);
  // While the page is closed/hidden, 5 minutes is counted from when it was hidden.
  return hidden>0?hidden:activity;
}
function locallySessionExpired(){
  if(!state.token)return false;
  const ref=sessionReferenceTime();
  return Boolean(ref)&&nowMs()-ref>=IDLE_TIMEOUT_MS;
}
function showIdleWarning(){
  if(!state.token||state.idleWarningShown)return;
  state.idleWarningShown=true;
  els.idleWarningBar?.classList.remove('hidden');
  updateIdleWarningCountdown();
}
function hideIdleWarning(){
  state.idleWarningShown=false;
  els.idleWarningBar?.classList.add('hidden');
}
function updateIdleWarningCountdown(){
  if(!state.idleWarningShown)return;
  const remaining=Math.max(0,IDLE_TIMEOUT_MS-(nowMs()-Number(state.lastActivityAt||nowMs())));
  if(els.idleWarningCountdown)els.idleWarningCountdown.textContent=`${Math.ceil(remaining/1000)} sec`;
}
async function sessionHeartbeat(){
  if(!state.token||state.sessionHeartbeatBusy||document.hidden)return;
  if(nowMs()-Number(state.lastActivityAt||0)>=IDLE_TIMEOUT_MS)return;
  if(nowMs()-Number(state.lastServerSyncAt||0)<90000)return;
  state.sessionHeartbeatBusy=true;
  try{
    await api('touchSession',{}, {retry:false,timeoutMs:15000});
  }catch(error){
    if(error?.code==='AUTH_REQUIRED'||error?.code==='SESSION_EXPIRED'){
      autoLogoutForInactivity('Your session expired after 5 minutes of inactivity.');
    }
  }finally{
    state.sessionHeartbeatBusy=false;
  }
}
function autoLogoutForInactivity(message='Logged out automatically after 5 minutes of inactivity.'){
  if(!state.token)return;
  const token=state.token;
  clearSession();
  stopLifeQuoteShuffle();
  showLoggedOutUi();
  if(els.loginMessage)els.loginMessage.textContent=message;
  if(token)api('logout',{token},{timeoutMs:8000}).catch(()=>{});
}
function checkSessionIdle(){
  if(!state.token)return;
  const idleFor=nowMs()-Number(state.lastActivityAt||nowMs());
  const hiddenAt=Number(localStorage.getItem(LAST_HIDDEN_KEY)||0);
  if(hiddenAt&&nowMs()-hiddenAt>=IDLE_TIMEOUT_MS){
    autoLogoutForInactivity('Logged out because the dashboard was closed/backgrounded for more than 5 minutes.');
    return;
  }
  if(idleFor>=IDLE_TIMEOUT_MS){
    autoLogoutForInactivity();
    return;
  }
  if(idleFor>=IDLE_WARNING_MS)showIdleWarning();
  else hideIdleWarning();
  updateIdleWarningCountdown();
}
function noteUserActivity(event){
  if(!state.token)return;
  // Ignore synthetic events and passive mouse movement to avoid needless writes.
  if(event?.isTrusted===false)return;
  setLastActivity(nowMs());
}
function startSessionActivityMonitor(){
  stopSessionActivityMonitor();
  if(!state.token)return;
  const existing=Number(localStorage.getItem(LAST_ACTIVITY_KEY)||0);
  if(existing&&nowMs()-existing<IDLE_TIMEOUT_MS)state.lastActivityAt=existing;
  else setLastActivity(nowMs(),{forceWrite:true});

  const opts={passive:true,capture:true};
  ['pointerdown','touchstart','wheel','scroll'].forEach(type=>document.addEventListener(type,noteUserActivity,opts));
  ['keydown','input','change'].forEach(type=>document.addEventListener(type,noteUserActivity,true));

  state.idleCheckTimer=setInterval(checkSessionIdle,1000);
  state.sessionHeartbeatTimer=setInterval(sessionHeartbeat,SESSION_HEARTBEAT_MS);
  checkSessionIdle();
  // Login/bootstrap already refreshes the server session. Waiting for the
  // scheduled heartbeat prevents an extra Apps Script request competing with
  // mobile sign-in and first render.
}
function stopSessionActivityMonitor(){
  if(state.idleCheckTimer){clearInterval(state.idleCheckTimer);state.idleCheckTimer=null;}
  if(state.sessionHeartbeatTimer){clearInterval(state.sessionHeartbeatTimer);state.sessionHeartbeatTimer=null;}
  const opts={capture:true};
  ['pointerdown','touchstart','wheel','scroll'].forEach(type=>document.removeEventListener(type,noteUserActivity,opts));
  ['keydown','input','change'].forEach(type=>document.removeEventListener(type,noteUserActivity,true));
  hideIdleWarning();
}
function markPageHidden(){
  if(!state.token)return;
  try{localStorage.setItem(LAST_HIDDEN_KEY,String(nowMs()));}catch{}
  // Best-effort heartbeat so server-side idle time starts close to the time the page was hidden.
  sessionHeartbeat();
}
function markPageVisible(){
  if(!state.token)return;
  const hiddenAt=Number(localStorage.getItem(LAST_HIDDEN_KEY)||0);
  if(hiddenAt&&nowMs()-hiddenAt>=IDLE_TIMEOUT_MS){
    autoLogoutForInactivity('Logged out because the dashboard was closed/backgrounded for more than 5 minutes.');
    return;
  }
  try{localStorage.removeItem(LAST_HIDDEN_KEY);}catch{}
  setLastActivity(nowMs(),{forceWrite:true});
  checkSessionIdle();
  sessionHeartbeat();
}

function logout(){
  // Mobile must feel immediate: never wait for a slow network request before leaving the dashboard.
  const token=state.token;
  clearSession();
  stopLifeQuoteShuffle();
  showLoggedOutUi();
  if(token){
    api('logout',{token},{timeoutMs:12000}).catch(()=>{});
  }
}

function setPortfolioStartupLoading(active,message='',error=false){
  if(!els.portfolioStartupOverlay)return;
  els.portfolioStartupOverlay.classList.toggle('hidden',!active);
  els.portfolioStartupOverlay.classList.toggle('error',Boolean(error));
  document.body.classList.toggle('portfolio-startup-loading',Boolean(active));
  if(els.portfolioStartupTitle){
    els.portfolioStartupTitle.textContent=error?'Portfolio could not load':'Loading your portfolio…';
  }
  if(els.portfolioStartupMessage){
    els.portfolioStartupMessage.textContent=message||(error
      ?'The backend did not return portfolio data. Use Retry load.'
      :'Holdings are updating quietly in the background.');
  }
  if(els.portfolioStartupRetryBtn){
    els.portfolioStartupRetryBtn.classList.toggle('hidden',!error);
  }
}
function showStoredSessionIdentity(){
  if(els.dashboardUsername){
    els.dashboardUsername.textContent=state.username||localStorage.getItem('portfolio_username')||'Loading…';
  }
  if(els.avatarInitial){
    const value=state.username||localStorage.getItem('portfolio_username')||'I';
    els.avatarInitial.textContent=String(value).charAt(0).toUpperCase();
  }
}
async function retryStartupPortfolioLoad(){
  if(!state.token)return;
  setPortfolioStartupLoading(true,'Retrying Backend v3.17.8…',false);
  const coreLoaded=await loadPortfolioCore({startup:true});
  if(!coreLoaded)await loadDashboard(false,{startup:true});
}

function protectInitialHoldingView(){
  if(state.holdingViewChecked||!state.holdings.length)return false;
  let visible=[];
  try{visible=state.holdings.filter(holdingMatches);}catch{}
  let repaired=false;
  if(!visible.length){
    state.selectedOwner='ALL';
    state.selectedAssetView='ALL';
    if(els.holdingSearch)els.holdingSearch.value='';
    if(els.holdingTypeFilter)els.holdingTypeFilter.value='ALL';
    if(els.holdingResultFilter)els.holdingResultFilter.value='ALL';
    if(els.holdingNotesFilter)els.holdingNotesFilter.value='ALL';
    if(els.holdingTradeFilter)els.holdingTradeFilter.value='ALL';
    if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='All holdings shown · hidden phone filter cleared';
    repaired=true;
  }
  state.holdingViewChecked=true;
  return repaired;
}

function applyPortfolioCore(data,{fromCache=false}={}){
  if(!isUsableDashboardData(data))return false;
  if(data.backendVersion)state.backendVersion=String(data.backendVersion);
  if(data.user)state.user=data.user;
  state.masterDataVersion=String(data.masterDataVersion||state.masterDataVersion||'');
  state.masterDataAppliedAt=String(data.masterDataAppliedAt||state.masterDataAppliedAt||'');
  state.holdings=mergeGoodValueSnapshot(data.holdings);
  if(Array.isArray(data.transactions))state.transactions=data.transactions;
  if(Array.isArray(data.watchlist))state.watchlist=data.watchlist;
  if(Array.isArray(data.owners))state.owners=data.owners;
  persistGoodValueSnapshot(data.updatedAt||'');
  protectInitialHoldingView();
  updateVersionLabels();
  refreshOwnerControls();
  renderAll();
  if(state.user){
    if(els.avatarInitial)els.avatarInitial.textContent=(state.user.displayName||state.user.username||'I').charAt(0).toUpperCase();
    if(els.dashboardUsername)els.dashboardUsername.textContent=state.user.username||state.user.displayName||'—';
  }
  const amountHealth=holdingAmountHealth();
  const sharedCount=Number(data.holdingRecovery?.shared||0);
  if(els.lastUpdatedText)els.lastUpdatedText.textContent=`${fromCache?'Showing last complete portfolio':'Holdings updated'} ${dateLabel(data.updatedAt)} · ${amountHealth.count} holdings · ${amountHealth.displayed}/${amountHealth.priceable} values${sharedCount?` · ${sharedCount} securely recovered`:''}`;
  return true;
}

async function loadPortfolioCore({startup=false,silent=false,forceShared=false}={}){
  if(!state.token||state.coreSyncing||state.syncing)return false;
  state.coreSyncing=true;
  if(startup&&!state.holdings.length)setPortfolioStartupLoading(true,'Loading your holdings first…',false);
  if(!silent)setSyncStatus('syncing','Loading holdings…');
  try{
    const payload=forceShared?{forceSharedRecovery:true,recoveryNonce:Date.now()}:{};
    const result=await api('bootstrapCore',payload, {retry:false,timeoutMs:25000});
    if(!isUsableDashboardData(result?.data)){
      if(state.holdings.length){
        if(els.lastUpdatedText)els.lastUpdatedText.textContent='Keeping the last complete portfolio · backend sent an empty temporary response';
        return false;
      }
      return false;
    }
    applyPortfolioCore(result.data);
    saveCache(result.data);
    state.lastServerSyncAt=Date.now();
    state.startupPortfolioLoaded=true;
    setPortfolioStartupLoading(false);
    if(!silent)setSyncStatus('','Holdings ready');
    return true;
  }catch(error){
    if(error?.code==='AUTH_REQUIRED'||error?.code==='SESSION_EXPIRED'){
      setPortfolioStartupLoading(false);
      logout();
      return false;
    }
    console.warn('Fast holdings load failed:',error);
    return false;
  }finally{
    state.coreSyncing=false;
  }
}

function showApp(){
  els.loginView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  els.sideAppName.textContent=CONFIG.APP_NAME||'My Finance';
  updateVersionLabels();
  showStoredSessionIdentity();
  els.todayLabel.textContent=new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toUpperCase();
  startSessionActivityMonitor();
  startQuickValueSync();
}
async function loadDashboard(force=false,{startup=false}={}){
  if(state.syncing)return false;
  state.syncing=true;
  const requestToken=state.token;
  if(startup)startStartupWatchdog(requestToken);
  if(startup)setPortfolioStartupLoading(true,'Loading Holdings, current values and SIP data…',false);
  setSyncStatus('syncing',force?'Updating prices & performance…':'Syncing…');
  try{
    const result=await api(force?'refreshPrices':'bootstrap',{}, {retry:false,timeoutMs:force?120000:60000});
    if(startup&&requestToken!==state.token)return false;
    if(!result?.data)throw Object.assign(new Error('Backend returned no portfolio data.'),{code:'EMPTY_DATA'});
    const incomingHoldings=Array.isArray(result.data.holdings)?result.data.holdings:[];
    if(!incomingHoldings.length&&(state.holdings.length||result.data.masterDataAppliedAt)){
      if(state.holdings.length){
        setSyncStatus('','Last complete portfolio kept');
        setPortfolioStartupLoading(false);
        if(els.lastUpdatedText)els.lastUpdatedText.textContent='Last complete portfolio kept · empty backend response rejected';
        return false;
      }
      throw Object.assign(new Error('The backend returned an incomplete holdings list. Please use Retry load.'),{code:'INCOMPLETE_DATA'});
    }
    applyBootstrap(result.data);
    saveCache(result.data);
    state.lastServerSyncAt=Date.now();
    state.startupPortfolioLoaded=true;

    setSyncStatus('','Up to date');
    setPortfolioStartupLoading(false);
    if(force){
      const nav=result.refreshReport?.mfNav,perf=result.refreshReport?.mfPerformance;
      if(nav){
        const issues=(nav.missing?.length||0)+(perf?.failed?.length||0);
        const msg=`MF NAV ${nav.updated}/${nav.tracked}${nav.fallbackRepaired?` · ${nav.fallbackRepaired} fallback repaired`:''}${nav.remapped?` · ${nav.remapped} code remapped`:''} · MF performance ${perf?.updated??0}/${perf?.tracked??0}${nav.remainingMissing?` · ${nav.remainingMissing} NAV still missing`:issues?` · ${issues} need attention`:''}`;
        toast(msg,issues?'info':'success');
      }else toast('Prices, NAVs and performance refreshed.','success');
    }
    return true;
  }
  catch(error){
    if(error.code==='AUTH_REQUIRED'||error.code==='SESSION_EXPIRED'){
      setPortfolioStartupLoading(false);
      toast('Your session expired. Please sign in again.','error');
      logout();
      return false;
    }
    setSyncStatus('error','Sync failed');
    if(startup)setPortfolioStartupLoading(true,`${error.message||'Backend sync failed.'} Your saved portfolio has not been replaced by ₹0.`,true);
    toast(error.message,'error');
    return false;
  }
  finally{if(startup)clearStartupWatchdog();state.syncing=false;}
}

function applyBootstrap(data,fromCache=false){
  if(!data)return;
  state.startupPortfolioLoaded=true;
  clearStartupWatchdog();
  setPortfolioStartupLoading(false);
  if(data.backendVersion)state.backendVersion=String(data.backendVersion);
  state.masterDataVersion=String(data.masterDataVersion||'');
  state.masterDataAppliedAt=String(data.masterDataAppliedAt||'');
  if(!state.masterDataAppliedAt && data.holdings && data.holdings.length){
    setTimeout(()=>toast('Master spreadsheet has not been applied yet. Click “Load Master Sheet Data” on Overview.','info'),500);
  }
  updateVersionLabels();
  state.user=data.user||state.user;state.holdings=mergeGoodValueSnapshot(data.holdings);state.transactions=Array.isArray(data.transactions)?data.transactions:[];state.watchlist=Array.isArray(data.watchlist)?data.watchlist:[];state.sipPlans=Array.isArray(data.sipPlans)?data.sipPlans:[];state.sipEvents=Array.isArray(data.sipEvents)?data.sipEvents:[];state.expenses=Array.isArray(data.expenses)?data.expenses:[];state.expensePlans=Array.isArray(data.expensePlans)?data.expensePlans:[];state.recurringExpenses=Array.isArray(data.recurringExpenses)?data.recurringExpenses:[];state.expenseCategories=Array.isArray(data.expenseCategories)?data.expenseCategories:[];state.customColumns=Array.isArray(data.customColumns)?data.customColumns:[];state.customValues=Array.isArray(data.customValues)?data.customValues:[];state.stickyNotes=Array.isArray(data.stickyNotes)?data.stickyNotes:[];state.stickyNoteHistory=Array.isArray(data.stickyNoteHistory)?data.stickyNoteHistory:[];state.lifeQuotes=Array.isArray(data.lifeQuotes)?data.lifeQuotes:[];state.diary=Array.isArray(data.diary)?data.diary:[];state.monthlyDiary=Array.isArray(data.monthlyDiary)?data.monthlyDiary:[];state.monthStatus=Array.isArray(data.monthStatus)?data.monthStatus:[];state.owners=Array.isArray(data.owners)?data.owners:[];if(Array.isArray(data.users))state.users=data.users;
  persistGoodValueSnapshot(data.updatedAt||'');
  protectInitialHoldingView();
  if(!fromCache)recordGrowthSnapshot();
  refreshOwnerControls();renderAll();
  if(state.user){els.avatarInitial.textContent=(state.user.displayName||state.user.username||'I').charAt(0).toUpperCase();if(els.dashboardUsername)els.dashboardUsername.textContent=state.user.username||state.user.displayName||'—';if(els.diaryHeroStatus)els.diaryHeroStatus.textContent=`Private diary · ${state.user.username||'signed in'}`;$$('.admin-only').forEach(el=>el.classList.toggle('hidden',state.user.role!=='ADMIN'));}
  if(els.masterLoadBanner){
    const loaded=Boolean(state.masterDataAppliedAt);
    els.masterLoadBanner.classList.toggle('hidden',loaded);
  }
  if(els.masterDataStatus){
    els.masterDataStatus.textContent=state.masterDataAppliedAt?`Master sheet loaded · 35 holdings · 17 watchlist · ${detailDate(state.masterDataAppliedAt)}`:'Master spreadsheet not loaded yet · use “Replace from Master Sheet”.';
    els.masterDataStatus.classList.toggle('loaded',Boolean(state.masterDataAppliedAt));
  }
  const amountHealth=holdingAmountHealth();
  const snapshotCount=state.holdings.filter(h=>h.valueFromSnapshot).length;
  const sharedCount=Number(data.holdingRecovery?.shared||0);
  const amountNote=amountHealth.priceable?` · ${amountHealth.priced}/${amountHealth.priceable} live${snapshotCount?` · ${snapshotCount} last verified`:''}`:'';
  const instantNote=snapshotCount?' · live update running':sharedCount?` · ${sharedCount} securely recovered`:'';
  els.lastUpdatedText.textContent=`${fromCache?'Showing saved data':'Updated'} ${dateLabel(data.updatedAt)}${data.priceNote?` · ${data.priceNote}`:''}${instantNote}${amountNote}`;if(els.watchlistLastAutoUpdate)els.watchlistLastAutoUpdate.textContent=`Updated ${dateLabel(data.updatedAt)}`;
}

function refreshOwnerControls(){
  const owners=configuredOwners();
  if(state.selectedOwner!=='ALL'&&!owners.some(o=>o===state.selectedOwner))state.selectedOwner='ALL';
  els.ownerSwitcher.innerHTML=[{value:'ALL',label:'Combined'},...owners.map(o=>({value:o,label:shortOwner(o)}))].map(x=>`<button type="button" class="owner-pill ${state.selectedOwner===x.value?'active':''}" data-owner-view="${escapeHtml(x.value)}">${escapeHtml(x.label)}</button>`).join('');
  const opts=owners.length?owners:['Sarada','Niharika'];
  [els.holdingOwner,els.importOwner,els.sipPlanOwner].forEach(select=>{if(!select)return;const old=select.value;select.innerHTML=opts.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(shortOwner(o))}</option>`).join('');if(opts.includes(old))select.value=old;});
  if(els.sipOwnerFilter){
    const old=els.sipOwnerFilter.value||'ALL';
    els.sipOwnerFilter.innerHTML=`<option value="ALL">All investors</option>`+opts.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(shortOwner(o))}</option>`).join('');
    els.sipOwnerFilter.value=old==='ALL'||opts.includes(old)?old:'ALL';
  }
}
function ownerHoldings(){
  return state.holdings.filter(h=>state.selectedOwner==='ALL'||canonicalOwner(h.owner)===state.selectedOwner);
}
function assetViewMatches(h){
  if(state.selectedAssetView==='ALL')return true;
  if(state.selectedAssetView==='MF')return h.type==='MF';
  if(state.selectedAssetView==='STOCKS')return h.type==='STOCK'||h.type==='ETF';
  if(state.selectedAssetView==='GPF')return h.type==='GPF';
  return true;
}
function visibleHoldings(){return ownerHoldings().filter(assetViewMatches);}
function assetViewLabel(){
  return state.selectedAssetView==='MF'?'Mutual Funds':state.selectedAssetView==='STOCKS'?'Stocks & ETFs':state.selectedAssetView==='GPF'?'GPF':'All Investments';
}
function watchlistMatches(x){
  const q=String(els.watchSearch?.value||'').trim().toLowerCase();
  const type=els.watchTypeFilter?.value||'ALL';
  const priority=els.watchPriorityFilter?.value||'ALL';
  const target=els.watchTargetFilter?.value||'ALL';
  const notesFilter=els.watchNotesFilter?.value||'ALL';
  const s=x.sourceDetails||{};
  const hay=`${x.assetName||''} ${x.code||''} ${x.notes||''} ${s.companyName||''} ${s.salesGrowth||''} ${s.profitGrowth||''} ${s.valuation||''} ${s.moatRemark||''} ${s.finalRemark||''}`.toLowerCase();
  if(q&&!hay.includes(q))return false;
  if(type!=='ALL'&&x.type!==type)return false;
  if(priority!=='ALL'&&String(x.priority||'MEDIUM').toUpperCase()!==priority)return false;
  const hasTarget=Number.isFinite(Number(x.targetPrice))&&Number(x.targetPrice)>0;
  const distance=Number(x.distancePct);
  if(target==='NO_TARGET'&&hasTarget)return false;
  if(target==='AT'&&(!hasTarget||!Number.isFinite(distance)||distance>0))return false;
  if(target==='NEAR'&&(!hasTarget||!Number.isFinite(distance)||distance<=0||distance>5))return false;
  if(target==='FAR'&&(!hasTarget||!Number.isFinite(distance)||distance<=5))return false;
  const hasNotes=Boolean(String(x.notes||'').trim());
  if(notesFilter==='WITH_NOTES'&&!hasNotes)return false;
  if(notesFilter==='WITHOUT_NOTES'&&hasNotes)return false;
  return true;
}
function visibleWatchlist(){return state.watchlist.filter(watchlistMatches);}
function summarizeHoldings(items){
  let invested=0,current=0,pricedInvested=0,priced=0,priceable=0,priceablePriced=0;const allocation={};
  items.forEach(h=>{const canPrice=['MF','STOCK','ETF'].includes(String(h.type||'').toUpperCase())&&(Number(h.units)||0)>0;if(canPrice)priceable++;invested+=Number(h.investedAmount)||0;const basis=h.currentValue==null?(Number(h.investedAmount)||0):Number(h.currentValue)||0;allocation[h.type]=(allocation[h.type]||0)+basis;if(h.currentValue!=null){current+=Number(h.currentValue)||0;pricedInvested+=Number(h.investedAmount)||0;priced++;if(canPrice)priceablePriced++;}});
  const gain=current-pricedInvested;const valuesComplete=priceable===0||priceablePriced>=priceable;return{invested,current,gain,returnPct:pricedInvested>0?gain/pricedInvested*100:0,priced,priceable,priceablePriced,valuesComplete,allocation};
}
function showAllInvestments(){
  state.selectedOwner='ALL';
  state.selectedAssetView='ALL';

  if(els.holdingSearch)els.holdingSearch.value='';
  if(els.holdingTypeFilter)els.holdingTypeFilter.value='ALL';
  if(els.holdingResultFilter)els.holdingResultFilter.value='ALL';
  if(els.holdingNotesFilter)els.holdingNotesFilter.value='ALL';
  if(els.holdingTradeFilter)els.holdingTradeFilter.value='ALL';

  refreshOwnerControls();
  refreshAssetViewControls();
  renderAll();
  switchSection('holdings');

  const total=state.holdings.length;
  toast(
    total
      ? `Showing all ${total} investment${total===1?'':'s'}.`
      : 'All filters cleared. No investments are currently loaded.',
    total ? 'success' : 'info'
  );
}

function refreshAssetViewControls(){
  if(!['ALL','MF','STOCKS','GPF'].includes(state.selectedAssetView))state.selectedAssetView='ALL';
  if(els.assetViewSwitcher){
    $$('[data-asset-view]').forEach(b=>b.classList.toggle('active',b.dataset.assetView===state.selectedAssetView));
  }
  if(els.holdingsHeading){
    els.holdingsHeading.textContent=state.selectedAssetView==='MF'?'Mutual fund holdings':state.selectedAssetView==='STOCKS'?'Stock & ETF holdings':state.selectedAssetView==='GPF'?'General Provident Fund holdings':'Mutual funds, stocks, ETFs and GPF';
  }
}


const EXPENSE_TABLE_COLUMNS={
  ACTUAL:[['amount','Amount'],['date','Dt Spent'],['paidTo','Paid To / Name'],['account','Debited From'],['reason','Reason'],['category','Category'],['subcategory','Subcategory'],['notes','Notes to Remember'],['actions','Actions']],
  PLANNED:[['amount','Planned Amount'],['date','Planned Date'],['paidTo','Paid To / Name'],['account','Debited From'],['reason','Reason'],['category','Category'],['subcategory','Subcategory'],['notes','Notes'],['status','Status'],['actions','Actions']],
  REGULAR:[['name','Regular Payment'],['amount','Amount'],['account','Debited From'],['category','Category'],['subcategory','Subcategory'],['frequency','Frequency'],['date','Next Due'],['reason','Reason'],['notes','Notes'],['status','Status'],['actions','Actions']]
};
function expenseCategoryColor(name){
  const item=state.expenseCategories.find(c=>String(c.name).toLowerCase()===String(name||'').toLowerCase());
  return String(item?.color||'BLUE').toLowerCase();
}
function expenseCategoryBadge(name){
  if(!name)return '<span class="expense-category-badge grey">Uncategorised</span>';
  return `<span class="expense-category-badge ${expenseCategoryColor(name)}">${escapeHtml(name)}</span>`;
}
function expenseSubcategoryDisplay(value){
  return value?`<span class="expense-subcategory-display">${escapeHtml(value)}</span>`:'<span class="expense-subcategory-display empty">—</span>';
}
function expenseCategorySubcategories(categoryName){
  const category=state.expenseCategories.find(c=>String(c.name||'').toLowerCase()===String(categoryName||'').toLowerCase());
  return Array.isArray(category?.subcategories)?category.subcategories.filter(Boolean):[];
}
function parseExpenseSubcategoryList(value){
  const seen=new Set();return String(value||'').split(/[\n,]+/).map(x=>x.trim()).filter(x=>{const key=x.toLowerCase();if(!x||seen.has(key))return false;seen.add(key);return true;}).slice(0,40);
}
function setExpenseSubcategoryOptions(categoryName,value=''){
  if(!els.expenseSubcategory)return;const configured=expenseCategorySubcategories(categoryName);const current=String(value||'').trim();const values=current&&!configured.some(x=>x.toLowerCase()===current.toLowerCase())?[current,...configured]:configured;
  els.expenseSubcategory.innerHTML='<option value="">No subcategory</option>'+values.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  els.expenseSubcategory.value=current;
  if(els.expenseSubcategoryHelp)els.expenseSubcategoryHelp.textContent=configured.length?'Choose the most useful detail for this category.':'Add subcategories in Category Manager whenever needed.';
}
function updateExpenseSubcategoryVisibility(){
  const visible=state.expenseSubcategoriesVisible!==false;document.body.classList.toggle('expense-subcategories-hidden',!visible);
  if(els.expenseSubcategoryToggle){els.expenseSubcategoryToggle.textContent=visible?'Hide subcategory':'Show subcategory';els.expenseSubcategoryToggle.setAttribute('aria-pressed',String(!visible));}
  document.querySelectorAll('[data-exp-col="subcategory"]').forEach(th=>th.classList.toggle('hidden-by-preference',!visible));
}
function toggleExpenseSubcategoryVisibility(){
  state.expenseSubcategoriesVisible=!state.expenseSubcategoriesVisible;try{localStorage.setItem('myfinance_expense_subcategories_visible',state.expenseSubcategoriesVisible?'1':'0');}catch{}
  updateExpenseSubcategoryVisibility();renderExpenditure();toast(state.expenseSubcategoriesVisible?'Subcategory is shown in the default view.':'Subcategory is hidden from the default view.','success');
}
function expenseStatusBadge(status){
  const s=String(status||'').toUpperCase();
  const labels={PLANNED:'Planned',PAID:'Paid',CANCELLED:'Cancelled',ACTIVE:'Active',PAUSED:'Paused',STOPPED:'Stopped'};
  return `<span class="expense-status ${s.toLowerCase()}">${escapeHtml(labels[s]||s||'—')}</span>`;
}
function expenseDateDisplay(value){
  const d=sipIsoDateToLocal(value);return d?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(d):'—';
}
function expenseCurrentView(){return String(state.expenseView||'ACTUAL').toUpperCase();}
function expenseDateField(item,view){return view==='ACTUAL'?item.dateSpent:view==='PLANNED'?item.plannedDate:item.nextDueDate;}
function expenseNameField(item,view){return view==='REGULAR'?item.name:(item.paidTo||item.reason||'');}
function expenseRecords(view=expenseCurrentView()){
  if(view==='ACTUAL')return [...state.expenses];
  if(view==='PLANNED')return [...state.expensePlans];
  if(view==='REGULAR')return [...state.recurringExpenses];
  return [];
}
function expenseFilterRecords(view=expenseCurrentView()){
  const q=String(els.expenseSearch?.value||'').trim().toLowerCase();
  const from=els.expenseFromDate?.value||'';const to=els.expenseToDate?.value||'';
  const cat=els.expenseCategoryFilter?.value||'ALL';const subcat=els.expenseSubcategoryFilter?.value||'ALL';const acct=els.expenseAccountFilter?.value||'ALL';
  let rows=expenseRecords(view).filter(item=>{
    const date=expenseDateField(item,view)||'';
    const hay=`${item.amount||''} ${item.paidTo||''} ${item.name||''} ${item.debitedFrom||''} ${item.reason||''} ${item.category||''} ${item.subcategory||''} ${item.notes||''} ${item.status||''}`.toLowerCase();
    return (!q||hay.includes(q))&&(!from||date>=from)&&(!to||date<=to)&&(cat==='ALL'||item.category===cat)&&(subcat==='ALL'||item.subcategory===subcat)&&(acct==='ALL'||item.debitedFrom===acct);
  });
  const sort=els.expenseSort?.value||'DATE_DESC';
  const cmpText=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{sensitivity:'base'});
  rows.sort((a,b)=>{
    if(sort==='DATE_ASC')return cmpText(expenseDateField(a,view),expenseDateField(b,view));
    if(sort==='AMOUNT_DESC')return Number(b.amount||0)-Number(a.amount||0);
    if(sort==='AMOUNT_ASC')return Number(a.amount||0)-Number(b.amount||0);
    if(sort==='CATEGORY')return cmpText(a.category,b.category)||cmpText(expenseDateField(b,view),expenseDateField(a,view));
    if(sort==='NAME')return cmpText(expenseNameField(a,view),expenseNameField(b,view));
    if(sort==='ACCOUNT')return cmpText(a.debitedFrom,b.debitedFrom);
    return cmpText(expenseDateField(b,view),expenseDateField(a,view));
  });
  return rows;
}
function populateExpenseFilters(){
  const allRecords=[...state.expenses,...state.expensePlans,...state.recurringExpenses];
  const categories=[...new Set([...state.expenseCategories.map(c=>c.name),...allRecords.map(x=>x.category)].filter(Boolean))].sort();
  const selectedCategory=els.expenseCategoryFilter?.value||'ALL';
  const subcategories=[...new Set([...state.expenseCategories.filter(c=>selectedCategory==='ALL'||c.name===selectedCategory).flatMap(c=>Array.isArray(c.subcategories)?c.subcategories:[]),...allRecords.filter(x=>selectedCategory==='ALL'||x.category===selectedCategory).map(x=>x.subcategory)].filter(Boolean))].sort();
  const accounts=[...new Set(allRecords.map(x=>x.debitedFrom).filter(Boolean))].sort();
  if(els.expenseCategoryFilter){const old=els.expenseCategoryFilter.value||'ALL';els.expenseCategoryFilter.innerHTML='<option value="ALL">All categories</option>'+categories.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');els.expenseCategoryFilter.value=old==='ALL'||categories.includes(old)?old:'ALL';}
  if(els.expenseSubcategoryFilter){const old=els.expenseSubcategoryFilter.value||'ALL';els.expenseSubcategoryFilter.innerHTML='<option value="ALL">All subcategories</option>'+subcategories.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');els.expenseSubcategoryFilter.value=old==='ALL'||subcategories.includes(old)?old:'ALL';}
  if(els.expenseAccountFilter){const old=els.expenseAccountFilter.value||'ALL';els.expenseAccountFilter.innerHTML='<option value="ALL">All accounts</option>'+accounts.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');els.expenseAccountFilter.value=old==='ALL'||accounts.includes(old)?old:'ALL';}
  if(els.expenseAccountSuggestions)els.expenseAccountSuggestions.innerHTML=accounts.map(x=>`<option value="${escapeHtml(x)}"></option>`).join('');
  if(els.expenseCategory){const old=els.expenseCategory.value;els.expenseCategory.innerHTML=categories.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');if(categories.includes(old))els.expenseCategory.value=old;}
}
function renderExpenseKpis(){
  const today=localIsoDate();const month=today.slice(0,7);const year=today.slice(0,4);
  const monthRows=state.expenses.filter(x=>String(x.dateSpent||'').slice(0,7)===month);
  const yearRows=state.expenses.filter(x=>String(x.dateSpent||'').slice(0,4)===year);
  const pending=state.expensePlans.filter(x=>String(x.status||'PLANNED').toUpperCase()==='PLANNED');
  const d30=new Date();d30.setDate(d30.getDate()+30);const to30=localIsoDate(d30);
  const due=state.recurringExpenses.filter(x=>String(x.status||'ACTIVE').toUpperCase()==='ACTIVE'&&x.nextDueDate&&x.nextDueDate>=today&&x.nextDueDate<=to30);
  if(els.expenseMonthActual)els.expenseMonthActual.textContent=formatCurrency(monthRows.reduce((s,x)=>s+Number(x.amount||0),0),true);
  if(els.expenseMonthActualCount)els.expenseMonthActualCount.textContent=`${monthRows.length} expense${monthRows.length===1?'':'s'}`;
  if(els.expensePlannedPending)els.expensePlannedPending.textContent=formatCurrency(pending.reduce((s,x)=>s+Number(x.amount||0),0),true);
  if(els.expensePlannedCount)els.expensePlannedCount.textContent=`${pending.length} pending`;
  if(els.expenseRegularDue)els.expenseRegularDue.textContent=formatCurrency(due.reduce((s,x)=>s+Number(x.amount||0),0),true);
  if(els.expenseRegularDueCount)els.expenseRegularDueCount.textContent=`${due.length} payment${due.length===1?'':'s'}`;
  if(els.expenseYearActual)els.expenseYearActual.textContent=formatCurrency(yearRows.reduce((s,x)=>s+Number(x.amount||0),0),true);
}
function expenseInlineOptions(values,selected,emptyLabel=''){
  const list=[...new Set((values||[]).filter(Boolean).map(String))];
  if(selected&&!list.includes(String(selected)))list.push(String(selected));
  return `${emptyLabel?`<option value="">${escapeHtml(emptyLabel)}</option>`:''}${list.map(value=>`<option value="${escapeHtml(value)}" ${String(value)===String(selected)?'selected':''}>${escapeHtml(value)}</option>`).join('')}`;
}
function expenseInlineCategoryOptions(selected){
  return expenseInlineOptions(state.expenseCategories.map(c=>c.name).sort(),selected);
}
function expenseInlineSubcategoryOptions(category,selected){
  const item=state.expenseCategories.find(c=>String(c.name)===String(category));
  return expenseInlineOptions(Array.isArray(item?.subcategories)?item.subcategories:[],selected,'No subcategory');
}
function expenseInlineStatusOptions(view,selected){
  const values=view==='REGULAR'?['ACTIVE','PAUSED','STOPPED']:['PLANNED','CANCELLED'];
  return expenseInlineOptions(values,selected);
}
function expenseInlineFrequencyOptions(selected){
  return expenseInlineOptions(['WEEKLY','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY'],selected);
}
function expenseInlineActive(view,id){
  return state.expenseInlineEdit&&state.expenseInlineEdit.view===view&&String(state.expenseInlineEdit.id)===String(id);
}
function renderInlineExpenseRow(item,view){
  const category=String(item.category||'');
  const common={
    amount:`<input data-expense-inline-field="amount" type="number" min="0.01" step="0.01" value="${escapeHtml(item.amount??'')}" aria-label="Amount">`,
    account:`<input data-expense-inline-field="debitedFrom" type="text" maxlength="120" value="${escapeHtml(item.debitedFrom||'')}" aria-label="Debited from">`,
    category:`<select data-expense-inline-field="category" data-expense-inline-category aria-label="Category">${expenseInlineCategoryOptions(category)}</select>`,
    subcategory:`<select data-expense-inline-field="subcategory" aria-label="Subcategory">${expenseInlineSubcategoryOptions(category,item.subcategory||'')}</select>`,
    reason:`<textarea data-expense-inline-field="reason" rows="2" maxlength="240" aria-label="Reason">${escapeHtml(item.reason||'')}</textarea>`,
    notes:`<textarea data-expense-inline-field="notes" rows="2" maxlength="1000" aria-label="Notes">${escapeHtml(item.notes||'')}</textarea>`,
    actions:`<div class="expense-inline-actions"><button type="button" class="small-button" data-cancel-inline-expense>Cancel</button><button type="button" class="primary-button expense-inline-save" data-save-inline-expense>Save row</button></div>`
  };
  if(view==='REGULAR')return `<tr class="expense-row expense-inline-edit-row expense-row-${expenseCategoryColor(category)}" data-expense-inline-row="${escapeHtml(item.id)}" data-expense-inline-view="REGULAR">
    <td><div class="expense-inline-stack"><input data-expense-inline-field="name" type="text" maxlength="140" value="${escapeHtml(item.name||'')}" placeholder="Payment name" aria-label="Payment name"><input data-expense-inline-field="paidTo" type="text" maxlength="140" value="${escapeHtml(item.paidTo||'')}" placeholder="Paid to" aria-label="Paid to"></div></td>
    <td>${common.amount}</td><td>${common.account}</td><td>${common.category}</td><td class="expense-subcategory-cell">${common.subcategory}</td>
    <td><select data-expense-inline-field="frequency" aria-label="Frequency">${expenseInlineFrequencyOptions(item.frequency||'MONTHLY')}</select></td>
    <td><input data-expense-inline-field="nextDueDate" type="date" value="${escapeHtml(item.nextDueDate||'')}" aria-label="Next due date"></td><td>${common.reason}</td><td>${common.notes}</td>
    <td><select data-expense-inline-field="status" aria-label="Status">${expenseInlineStatusOptions('REGULAR',item.status||'ACTIVE')}</select></td><td class="expense-actions">${common.actions}</td>
  </tr>`;
  const planned=view==='PLANNED';
  return `<tr class="expense-row expense-inline-edit-row expense-row-${expenseCategoryColor(category)}" data-expense-inline-row="${escapeHtml(item.id)}" data-expense-inline-view="${view}">
    <td>${common.amount}</td><td><input data-expense-inline-field="${planned?'plannedDate':'dateSpent'}" type="date" value="${escapeHtml(planned?(item.plannedDate||''):(item.dateSpent||''))}" aria-label="${planned?'Planned date':'Date spent'}"></td>
    <td><input data-expense-inline-field="paidTo" type="text" maxlength="140" value="${escapeHtml(item.paidTo||'')}" aria-label="Paid to"></td><td>${common.account}</td><td>${common.reason}</td><td>${common.category}</td><td class="expense-subcategory-cell">${common.subcategory}</td><td>${common.notes}</td>
    ${planned?`<td>${expenseStatusBadge(item.status)}</td>`:''}<td class="expense-actions">${common.actions}</td>
  </tr>`;
}
function openInlineExpenseEdit(view,id){
  state.expenseInlineEdit={view:String(view).toUpperCase(),id:String(id)};renderExpenditure();
  requestAnimationFrame(()=>document.querySelector('[data-expense-inline-row] [data-expense-inline-field="amount"]')?.focus());
}
function closeInlineExpenseEdit(){state.expenseInlineEdit=null;renderExpenditure();}
function updateInlineExpenseSubcategories(categorySelect){
  const row=categorySelect?.closest('[data-expense-inline-row]');const sub=row?.querySelector('[data-expense-inline-field="subcategory"]');if(!sub)return;
  sub.innerHTML=expenseInlineSubcategoryOptions(categorySelect.value,'');
}
async function saveInlineExpense(button){
  const row=button?.closest('[data-expense-inline-row]');if(!row)return;const view=row.dataset.expenseInlineView;const id=row.dataset.expenseInlineRow;
  const value=name=>String(row.querySelector(`[data-expense-inline-field="${name}"]`)?.value??'').trim();
  const base={id,amount:Number(value('amount')),paidTo:value('paidTo'),debitedFrom:value('debitedFrom'),reason:value('reason'),category:value('category'),subcategory:value('subcategory'),notes:value('notes')};
  if(!Number.isFinite(base.amount)||base.amount<=0){toast('Enter a valid amount greater than zero.','error');row.querySelector('[data-expense-inline-field="amount"]')?.focus();return;}
  if(!base.category){toast('Choose a category.','error');return;}
  let action,record;
  if(view==='REGULAR'){const original=state.recurringExpenses.find(item=>String(item.id)===String(id));action='saveRecurringExpense';record={...base,name:value('name'),frequency:value('frequency')||'MONTHLY',nextDueDate:value('nextDueDate'),endDate:original?.endDate||'',status:value('status')||'ACTIVE'};if(!record.name){toast('Enter the regular payment name.','error');return;}}
  else if(view==='PLANNED'){action='saveExpensePlan';record={...base,plannedDate:value('plannedDate')};}
  else{action='saveExpense';record={...base,dateSpent:value('dateSpent')};}
  setBusy(button,true,'Saving…');
  try{const result=await api(action,{record});applyBootstrap(result.data);saveCache(result.data);state.expenseInlineEdit=null;setExpenseView(view);toast('Expenditure row updated.','success');}
  catch(error){toast(error.message,'error');}
  finally{setBusy(button,false);}
}
function renderActualExpenses(rows){
  if(!els.actualExpenseBody)return;els.actualExpenseEmpty?.classList.toggle('hidden',rows.length>0);
  els.actualExpenseBody.innerHTML=rows.map(x=>expenseInlineActive('ACTUAL',x.id)?renderInlineExpenseRow(x,'ACTUAL'):`<tr class="expense-row expense-row-${expenseCategoryColor(x.category)}">
    <td class="expense-amount">${formatCurrency(x.amount)}</td><td>${expenseDateDisplay(x.dateSpent)}</td><td>${escapeHtml(x.paidTo||'—')}</td>
    <td>${escapeHtml(x.debitedFrom||'—')}</td><td class="expense-reason">${escapeHtml(x.reason||'—')}</td><td>${expenseCategoryBadge(x.category)}</td><td class="expense-subcategory-cell">${expenseSubcategoryDisplay(x.subcategory)}</td>
    <td class="expense-notes">${escapeHtml(x.notes||'—')}</td><td class="expense-actions"><button class="small-button expense-row-edit-button" data-inline-edit-expense="${escapeHtml(x.id)}" data-inline-expense-view="ACTUAL">Row edit</button><button class="small-button expense-edit-button" data-edit-expense="${escapeHtml(x.id)}">Popup edit</button><button class="small-button danger" data-delete-expense="${escapeHtml(x.id)}">Delete</button></td>
  </tr>`).join('');
}
function renderPlannedExpenses(rows){
  if(!els.plannedExpenseBody)return;els.plannedExpenseEmpty?.classList.toggle('hidden',rows.length>0);
  els.plannedExpenseBody.innerHTML=rows.map(x=>{if(expenseInlineActive('PLANNED',x.id))return renderInlineExpenseRow(x,'PLANNED');const planned=String(x.status||'PLANNED').toUpperCase()==='PLANNED';return `<tr class="expense-row expense-row-${expenseCategoryColor(x.category)}">
    <td class="expense-amount">${formatCurrency(x.amount)}</td><td>${expenseDateDisplay(x.plannedDate)}</td><td>${escapeHtml(x.paidTo||'—')}</td>
    <td>${escapeHtml(x.debitedFrom||'—')}</td><td class="expense-reason">${escapeHtml(x.reason||'—')}</td><td>${expenseCategoryBadge(x.category)}</td><td class="expense-subcategory-cell">${expenseSubcategoryDisplay(x.subcategory)}</td><td class="expense-notes">${escapeHtml(x.notes||'—')}</td><td>${expenseStatusBadge(x.status)}</td>
    <td class="expense-actions">${planned?`<button class="small-button success" data-mark-plan-paid="${escapeHtml(x.id)}">Mark paid</button>`:''}<button class="small-button expense-row-edit-button" data-inline-edit-expense="${escapeHtml(x.id)}" data-inline-expense-view="PLANNED">Row edit</button><button class="small-button expense-edit-button" data-edit-plan="${escapeHtml(x.id)}">Popup edit</button><button class="small-button danger" data-delete-plan="${escapeHtml(x.id)}">Delete</button></td>
  </tr>`;}).join('');
}
function renderRegularExpenses(rows){
  if(!els.regularExpenseBody)return;els.regularExpenseEmpty?.classList.toggle('hidden',rows.length>0);
  els.regularExpenseBody.innerHTML=rows.map(x=>{if(expenseInlineActive('REGULAR',x.id))return renderInlineExpenseRow(x,'REGULAR');const active=String(x.status||'ACTIVE').toUpperCase()==='ACTIVE';const toggle=active?'PAUSED':'ACTIVE';return `<tr class="expense-row expense-row-${expenseCategoryColor(x.category)}">
    <td class="expense-reason"><strong>${escapeHtml(x.name||'—')}</strong><small>${escapeHtml(x.paidTo||'')}</small></td><td class="expense-amount">${formatCurrency(x.amount)}</td><td>${escapeHtml(x.debitedFrom||'—')}</td><td>${expenseCategoryBadge(x.category)}</td><td class="expense-subcategory-cell">${expenseSubcategoryDisplay(x.subcategory)}</td>
    <td>${escapeHtml(String(x.frequency||'MONTHLY').replace('_',' '))}</td><td>${expenseDateDisplay(x.nextDueDate)}</td><td>${escapeHtml(x.reason||'—')}</td><td class="expense-notes">${escapeHtml(x.notes||'—')}</td><td>${expenseStatusBadge(x.status)}</td>
    <td class="expense-actions">${active?`<button class="small-button success" data-mark-regular-paid="${escapeHtml(x.id)}">Mark paid</button>`:''}<button class="small-button" data-toggle-regular="${escapeHtml(x.id)}" data-next-status="${toggle}">${active?'Pause':'Resume'}</button><button class="small-button expense-row-edit-button" data-inline-edit-expense="${escapeHtml(x.id)}" data-inline-expense-view="REGULAR">Row edit</button><button class="small-button expense-edit-button" data-edit-regular="${escapeHtml(x.id)}">Popup edit</button><button class="small-button danger" data-delete-regular="${escapeHtml(x.id)}">Delete</button></td>
  </tr>`;}).join('');
}
function renderExpenseCategories(){
  if(!els.expenseCategoryGrid)return;const rows=[...state.expenseCategories].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  els.expenseCategoryEmpty?.classList.toggle('hidden',rows.length>0);
  els.expenseCategoryGrid.innerHTML=rows.map(c=>{const used=state.expenses.filter(x=>x.category===c.name).length+state.expensePlans.filter(x=>x.category===c.name).length+state.recurringExpenses.filter(x=>x.category===c.name).length;const subs=Array.isArray(c.subcategories)?c.subcategories:[];return `<article class="expense-category-card ${String(c.color||'BLUE').toLowerCase()}">
    <div class="expense-category-card-head"><span class="expense-category-dot"></span><div><strong>${escapeHtml(c.name)}</strong><small>${used} record${used===1?'':'s'} · ${subs.length} subcategor${subs.length===1?'y':'ies'}</small></div></div>
    <div class="expense-subcategory-chips">${subs.length?subs.map(s=>`<span class="expense-subcategory-chip">${escapeHtml(s)}</span>`).join(''):'<span class="expense-subcategory-chip empty">No subcategories yet</span>'}</div>
    <div class="expense-category-actions"><button class="small-button expense-edit-button" data-edit-expense-category="${escapeHtml(c.id)}">✎ Edit category &amp; subcategories</button><button class="small-button danger" data-delete-expense-category="${escapeHtml(c.id)}">Delete</button></div>
  </article>`;}).join('');
}
function renderExpenditure(){
  if(!els.expenseDataPanel)return;populateExpenseFilters();renderExpenseKpis();
  const view=expenseCurrentView();
  $$('.expense-view-tab').forEach(b=>b.classList.toggle('active',b.dataset.expenseView===view));
  els.expenseDataPanel.classList.toggle('hidden',view==='CATEGORIES');els.expenseCategoriesView.classList.toggle('hidden',view!=='CATEGORIES');
  ['ACTUAL','PLANNED','REGULAR'].forEach(v=>{const node=$(v==='ACTUAL'?'actualExpenseView':v==='PLANNED'?'plannedExpenseView':'regularExpenseView');node?.classList.toggle('hidden',v!==view);});
  updateExpenseSubcategoryVisibility();if(view==='CATEGORIES'){renderExpenseCategories();return;}
  const rows=expenseFilterRecords(view);if(els.expenseResultCount)els.expenseResultCount.textContent=`${rows.length} record${rows.length===1?'':'s'}`;
  if(view==='ACTUAL')renderActualExpenses(rows);else if(view==='PLANNED')renderPlannedExpenses(rows);else renderRegularExpenses(rows);
  requestAnimationFrame(()=>installExpenseColumnResizers(view));
}
function setExpenseView(view){
  state.expenseView=['ACTUAL','PLANNED','REGULAR','CATEGORIES'].includes(view)?view:'ACTUAL';
  try{localStorage.setItem('myfinance_expense_view',state.expenseView);}catch{}
  renderExpenditure();
}
function resetExpenseFilters(){
  if(els.expenseSearch)els.expenseSearch.value='';if(els.expenseFromDate)els.expenseFromDate.value='';if(els.expenseToDate)els.expenseToDate.value='';if(els.expenseCategoryFilter)els.expenseCategoryFilter.value='ALL';if(els.expenseSubcategoryFilter)els.expenseSubcategoryFilter.value='ALL';if(els.expenseAccountFilter)els.expenseAccountFilter.value='ALL';if(els.expenseSort)els.expenseSort.value='DATE_DESC';renderExpenditure();
}
function expenseWidthKey(view){return `myfinance_expense_widths_${String(view).toLowerCase()}`;}
function loadExpenseWidths(view){try{return JSON.parse(localStorage.getItem(expenseWidthKey(view))||'{}')||{};}catch{return {};}}
function saveExpenseWidths(view,widths){try{localStorage.setItem(expenseWidthKey(view),JSON.stringify(widths));}catch{}}
function applyExpenseWidths(view){
  const table=$(view==='ACTUAL'?'actualExpenseTable':view==='PLANNED'?'plannedExpenseTable':'regularExpenseTable');if(!table)return;const widths=loadExpenseWidths(view);
  table.querySelectorAll('thead th').forEach((th,i)=>{const key=th.dataset.expCol||String(i);const w=Number(widths[key]);if(w>50)table.querySelectorAll('tr').forEach(r=>{const c=r.children[i];if(c){c.style.width=`${w}px`;c.style.minWidth=`${w}px`;c.style.maxWidth=`${w}px`;}});});
}
function installExpenseColumnResizers(view){
  if(view==='CATEGORIES')return;const table=$(view==='ACTUAL'?'actualExpenseTable':view==='PLANNED'?'plannedExpenseTable':'regularExpenseTable');if(!table)return;applyExpenseWidths(view);
  [...table.querySelectorAll('thead th')].forEach((th,index)=>{if(th.querySelector('.expense-resize-handle'))return;const h=document.createElement('span');h.className='expense-resize-handle';h.title='Drag to resize · Double-click to reset';th.appendChild(h);
    h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();h.setPointerCapture?.(e.pointerId);const x=e.clientX,start=th.getBoundingClientRect().width;const move=ev=>{const w=Math.max(70,Math.min(520,start+(ev.clientX-x)));table.querySelectorAll('tr').forEach(r=>{const c=r.children[index];if(c){c.style.width=`${w}px`;c.style.minWidth=`${w}px`;c.style.maxWidth=`${w}px`;}});};const up=()=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);const widths=loadExpenseWidths(view);widths[th.dataset.expCol||String(index)]=Math.round(th.getBoundingClientRect().width);saveExpenseWidths(view,widths);};h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);});
    h.addEventListener('dblclick',e=>{e.preventDefault();const widths=loadExpenseWidths(view);delete widths[th.dataset.expCol||String(index)];saveExpenseWidths(view,widths);table.querySelectorAll('tr').forEach(r=>{const c=r.children[index];if(c){c.style.width='';c.style.minWidth='';c.style.maxWidth='';}});});
  });
}
function fillExpenseCategorySelect(value=''){
  populateExpenseFilters();if(els.expenseCategory&&value&&[...els.expenseCategory.options].some(o=>o.value===value))els.expenseCategory.value=value;setExpenseSubcategoryOptions(els.expenseCategory?.value||value);
}
function openExpenseEditor(mode='ACTUAL',item=null){
  const m=String(mode).toUpperCase();els.expenseForm?.reset();els.expenseRecordMode.value=m;els.expenseRecordId.value=item?.id||'';
  const regular=m==='REGULAR';const planned=m==='PLANNED';
  els.expenseRegularNameGroup.classList.toggle('hidden',!regular);els.expenseFrequencyGroup.classList.toggle('hidden',!regular);els.expenseEndDateGroup.classList.toggle('hidden',!regular);els.expenseStatusGroup.classList.toggle('hidden',!regular);
  els.expenseDateLabel.textContent=regular?'Next due date':planned?'Planned date':'Date spent';els.expenseModalEyebrow.textContent=regular?'REGULAR PAYMENT':planned?'PREPLANNED EXPENSE':'ACTUAL EXPENSE';els.expenseModalTitle.textContent=item?`Edit ${regular?'regular payment':planned?'preplanned expense':'expense'}`:`Add ${regular?'regular payment':planned?'preplanned expense':'expense'}`;
  els.expenseModalSubcopy.textContent=regular?'Create a repeating payment and track its next due date.':planned?'Plan the expense now and later convert it to Actual with Mark paid.':'Record money already spent.';
  els.saveExpenseBtn.textContent=item?'Save changes':regular?'Save regular payment':planned?'Save preplan':'Save expense';
  const defaultDate=localIsoDate();fillExpenseCategorySelect(item?.category||'');
  if(item){els.expenseAmount.value=item.amount??'';els.expenseDate.value=regular?(item.nextDueDate||defaultDate):planned?(item.plannedDate||defaultDate):(item.dateSpent||defaultDate);els.expensePaidTo.value=item.paidTo||'';els.expenseDebitedFrom.value=item.debitedFrom||'';els.expenseReason.value=item.reason||'';fillExpenseCategorySelect(item.category||'');setExpenseSubcategoryOptions(item.category||'',item.subcategory||'');els.expenseNotes.value=item.notes||'';if(regular){els.expenseRegularName.value=item.name||'';els.expenseFrequency.value=item.frequency||'MONTHLY';els.expenseEndDate.value=item.endDate||'';els.expenseStatus.value=item.status||'ACTIVE';}}
  else{els.expenseDate.value=defaultDate;if(els.expenseCategory?.options.length)els.expenseCategory.selectedIndex=0;setExpenseSubcategoryOptions(els.expenseCategory?.value||'');if(regular){els.expenseFrequency.value='MONTHLY';els.expenseStatus.value='ACTIVE';}}
  openModal('expenseModal');
}
async function saveExpenseForm(event){
  event.preventDefault();const mode=els.expenseRecordMode.value;const base={id:els.expenseRecordId.value.trim(),amount:Number(els.expenseAmount.value),paidTo:els.expensePaidTo.value.trim(),debitedFrom:els.expenseDebitedFrom.value.trim(),reason:els.expenseReason.value.trim(),category:els.expenseCategory.value,subcategory:els.expenseSubcategory.value,notes:els.expenseNotes.value.trim()};
  let action,payload;if(mode==='REGULAR'){action='saveRecurringExpense';payload={record:{...base,name:els.expenseRegularName.value.trim(),frequency:els.expenseFrequency.value,nextDueDate:els.expenseDate.value,endDate:els.expenseEndDate.value,status:els.expenseStatus.value}};}else if(mode==='PLANNED'){action='saveExpensePlan';payload={record:{...base,plannedDate:els.expenseDate.value}};}else{action='saveExpense';payload={record:{...base,dateSpent:els.expenseDate.value}};}
  setBusy(els.saveExpenseBtn,true,'Saving…');try{const r=await api(action,payload);applyBootstrap(r.data);saveCache(r.data);closeModals();switchSection('expenditure');setExpenseView(mode);toast(mode==='REGULAR'?'Regular payment saved.':mode==='PLANNED'?'Preplanned expense saved.':'Expense saved.','success');}catch(e){toast(e.message,'error');}finally{setBusy(els.saveExpenseBtn,false);}
}
async function deleteExpenseRecord(kind,id){
  const map={ACTUAL:['deleteExpense','expense'],PLANNED:['deleteExpensePlan','preplanned expense'],REGULAR:['deleteRecurringExpense','regular payment']};const [action,label]=map[kind];if(!confirm(`Delete this ${label}?`))return;try{const r=await api(action,{id});applyBootstrap(r.data);saveCache(r.data);toast(`${label.charAt(0).toUpperCase()+label.slice(1)} deleted.`,'success');}catch(e){toast(e.message,'error');}
}
function openExpensePayment(sourceType,id){
  const kind=String(sourceType).toUpperCase();const item=kind==='PLAN'?state.expensePlans.find(x=>String(x.id)===String(id)):state.recurringExpenses.find(x=>String(x.id)===String(id));if(!item)return;
  els.expensePaymentForm?.reset();els.expensePaymentSourceType.value=kind;els.expensePaymentSourceId.value=item.id;els.expensePaymentTitle.textContent=kind==='PLAN'?'Mark preplanned expense paid':'Mark regular payment paid';els.expensePaymentAmount.value=Number(item.amount||0);els.expensePaymentDate.value=localIsoDate();els.expensePaymentPaidTo.value=item.paidTo||item.name||'';els.expensePaymentAccount.value=item.debitedFrom||'';openModal('expensePaymentModal');
}
async function confirmExpensePayment(event){
  event.preventDefault();setBusy(els.confirmExpensePaymentBtn,true,'Recording…');try{const r=await api('markExpensePaid',{sourceType:els.expensePaymentSourceType.value,sourceId:els.expensePaymentSourceId.value,amount:Number(els.expensePaymentAmount.value),datePaid:els.expensePaymentDate.value,paidTo:els.expensePaymentPaidTo.value.trim(),debitedFrom:els.expensePaymentAccount.value.trim(),notes:els.expensePaymentNotes.value.trim()});applyBootstrap(r.data);saveCache(r.data);closeModals();setExpenseView('ACTUAL');toast('Payment added to Actual Expenses.','success');}catch(e){toast(e.message,'error');}finally{setBusy(els.confirmExpensePaymentBtn,false);}
}
async function toggleRecurringStatus(id,status){
  const item=state.recurringExpenses.find(x=>String(x.id)===String(id));if(!item)return;try{const r=await api('saveRecurringExpense',{record:{...item,status}});applyBootstrap(r.data);saveCache(r.data);toast(`Regular payment ${status==='ACTIVE'?'resumed':'paused'}.`,'success');}catch(e){toast(e.message,'error');}
}
function openExpenseCategoryEditor(item=null){
  els.expenseCategoryForm?.reset();els.expenseCategoryId.value=item?.id||'';els.expenseCategoryModalTitle.textContent=item?'Edit category & subcategories':'Add category';els.expenseCategoryName.value=item?.name||'';els.expenseCategoryColor.value=item?.color||'BLUE';els.expenseCategorySubcategories.value=Array.isArray(item?.subcategories)?item.subcategories.join('\n'):'';openModal('expenseCategoryModal');
}
async function saveExpenseCategory(event){
  event.preventDefault();const subcategories=parseExpenseSubcategoryList(els.expenseCategorySubcategories.value);setBusy(els.saveExpenseCategoryBtn,true,'Saving…');try{const r=await api('saveExpenseCategory',{category:{id:els.expenseCategoryId.value.trim(),name:els.expenseCategoryName.value.trim(),color:els.expenseCategoryColor.value,subcategories}});applyBootstrap(r.data);saveCache(r.data);closeModals();setExpenseView('CATEGORIES');toast(`Category saved with ${subcategories.length} subcategor${subcategories.length===1?'y':'ies'}.`,'success');}catch(e){toast(e.message,'error');}finally{setBusy(els.saveExpenseCategoryBtn,false);}
}
async function deleteExpenseCategory(id){
  const item=state.expenseCategories.find(x=>String(x.id)===String(id));if(!item||!confirm(`Delete expense category “${item.name}”?`))return;try{const r=await api('deleteExpenseCategory',{id});applyBootstrap(r.data);saveCache(r.data);toast('Expense category deleted.','success');}catch(e){toast(e.message,'error');}
}
function expensePrintRows(view){return expenseFilterRecords(view);}
function expensePrintCell(row,key,view){
  if(key==='amount')return formatCurrency(row.amount);if(key==='date')return expenseDateDisplay(expenseDateField(row,view));if(key==='paidTo')return row.paidTo||'—';if(key==='account')return row.debitedFrom||'—';if(key==='reason')return row.reason||'—';if(key==='category')return row.category||'—';if(key==='subcategory')return row.subcategory||'—';if(key==='notes')return row.notes||'—';if(key==='status')return row.status||'—';if(key==='name')return row.name||'—';if(key==='frequency')return String(row.frequency||'').replace('_',' ');return '';
}
function openExpensePrint(){
  const view=expenseCurrentView();if(view==='CATEGORIES'){toast('Choose Actual, Preplanned or Regular Payments to print.','info');return;}const cols=EXPENSE_TABLE_COLUMNS[view].filter(([k])=>k!=='actions');els.expensePrintTitle.textContent=`${view==='ACTUAL'?'Actual Expenses':view==='PLANNED'?'Preplanned Expenses':'Regular Payments'} — Print Preview`;els.expensePrintColumns.innerHTML=cols.map(([k,l])=>`<label><input type="checkbox" data-exp-print-col="${k}" ${k==='subcategory'&&!state.expenseSubcategoriesVisible?'':'checked'}> ${escapeHtml(l)}</label>`).join('');renderExpensePrintPreview();openModal('expensePrintModal');
}
function renderExpensePrintPreview(){
  if(!els.expensePrintPreview)return;const view=expenseCurrentView();if(view==='CATEGORIES')return;const selected=[...els.expensePrintColumns.querySelectorAll('[data-exp-print-col]:checked')].map(x=>x.dataset.expPrintCol);const defs=new Map(EXPENSE_TABLE_COLUMNS[view]);const rows=expensePrintRows(view);els.expensePrintPreview.innerHTML=`<div class="expense-print-sheet"><div class="expense-print-head"><div><strong>${view==='ACTUAL'?'Actual Expenses':view==='PLANNED'?'Preplanned Expenses':'Regular Payments'}</strong><span>${rows.length} filtered record${rows.length===1?'':'s'} · ${escapeHtml(els.expenseFromDate?.value||'All dates')} ${els.expenseToDate?.value?`to ${escapeHtml(els.expenseToDate.value)}`:''}</span></div><span>My Finance · ${escapeHtml(localIsoDate())}</span></div><table><thead><tr>${selected.map(k=>`<th data-exp-print-key="${k}">${escapeHtml(defs.get(k)||k)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${selected.map(k=>`<td class="${k==='amount'?'num':''}">${escapeHtml(expensePrintCell(r,k,view))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;installExpensePrintResizers();
}
function installExpensePrintResizers(){
  const table=els.expensePrintPreview?.querySelector('table');if(!table)return;[...table.querySelectorAll('th')].forEach((th,index)=>{const h=document.createElement('span');h.className='expense-print-resizer';th.appendChild(h);h.addEventListener('pointerdown',e=>{e.preventDefault();const start=e.clientX,w0=th.getBoundingClientRect().width;const move=ev=>{const w=Math.max(60,Math.min(420,w0+(ev.clientX-start)));table.querySelectorAll('tr').forEach(r=>{const c=r.children[index];if(c){c.style.width=`${w}px`;c.style.minWidth=`${w}px`;c.style.maxWidth=`${w}px`;}});};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);});});
}
function runExpensePrint(){
  const sheet=els.expensePrintPreview?.querySelector('.expense-print-sheet');if(!sheet)return;const orientation=els.expensePrintOrientation?.value||'landscape';const win=window.open('','_blank','noopener,noreferrer');if(!win){toast('Allow pop-ups to print.','error');return;}win.document.write(`<!doctype html><html><head><title>Expenditure</title><style>@page{size:A4 ${orientation};margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#28334d;margin:0}.expense-print-head{display:flex;justify-content:space-between;gap:15px;border-bottom:2px solid #5965c9;padding-bottom:7px;margin-bottom:9px}.expense-print-head strong{display:block;font-size:17px;color:#29366d}.expense-print-head span{font-size:8px;color:#7a8498}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px}th,td{border:1px solid #dce1eb;padding:5px;vertical-align:top;white-space:normal;overflow-wrap:break-word}th{background:#edf1fa;color:#344a75;font-size:7.5px}tr:nth-child(even) td{background:#f8faff}.num{text-align:right;font-weight:bold}.expense-print-resizer{display:none}</style></head><body>${sheet.outerHTML}</body></html>`);win.document.close();setTimeout(()=>{win.focus();win.print();},250);
}
function sipIsoDateToLocal(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0);
  return Number.isNaN(d.getTime())?null:d;
}
function sipAddMonths(date,months){
  const d=new Date(date.getFullYear(),date.getMonth()+Number(months||0),1,12,0,0,0);
  return d;
}
function sipDateWithDay(year,month,day){
  return new Date(year,month,Math.max(1,Math.min(28,Number(day)||1)),12,0,0,0);
}
function sipMonthDiff(start,due){
  return (due.getFullYear()-start.getFullYear())*12+(due.getMonth()-start.getMonth());
}
function sipEventKey(planId,dueDate){return `${String(planId)}|${String(dueDate)}`;}
function sipEventMap(){
  const map=new Map();
  state.sipEvents.forEach(e=>map.set(sipEventKey(e.planId,e.dueDate),e));
  return map;
}
function sipPlanAmountAt(plan,due){
  const start=sipIsoDateToLocal(plan.startDate);
  if(!start)return Number(plan.amount)||0;
  const years=Math.max(0,Math.floor(sipMonthDiff(start,due)/12));
  return (Number(plan.amount)||0)*Math.pow(1+(Number(plan.stepUpPct)||0)/100,years);
}
function generateSipSchedule(plan,months=12,{includePastDays=31}={}){
  if(!plan||String(plan.status||'ACTIVE').toUpperCase()==='STOPPED')return [];
  const start=sipIsoDateToLocal(plan.startDate);
  if(!start)return [];
  const end=plan.endDate?sipIsoDateToLocal(plan.endDate):null;
  const today=sipIsoDateToLocal(localIsoDate());
  const from=new Date(today);from.setDate(from.getDate()-Math.max(0,Number(includePastDays)||0));
  const horizon=sipAddMonths(today,Number(months)||12);horizon.setDate(28);
  const interval=String(plan.frequency||'MONTHLY').toUpperCase()==='QUARTERLY'?3:1;
  const day=Math.max(1,Math.min(28,Number(plan.sipDay)||start.getDate()||1));
  const items=[];
  let cursor=sipDateWithDay(start.getFullYear(),start.getMonth(),day);
  if(cursor<start)cursor=sipDateWithDay(sipAddMonths(cursor,interval).getFullYear(),sipAddMonths(cursor,interval).getMonth(),day);
  let guard=0;
  while(cursor<=horizon&&guard<400){
    if((!end||cursor<=end)&&cursor>=from){
      const dueDate=localIsoDate(cursor);
      const ev=sipEventMap().get(sipEventKey(plan.id,dueDate));
      items.push({
        planId:plan.id,owner:plan.owner,assetName:plan.assetName,code:plan.code||'',
        dueDate,amount:sipPlanAmountAt(plan,cursor),
        status:ev?.status||'PLANNED',eventId:ev?.id||'',investedDate:ev?.investedDate||''
      });
    }
    const next=sipAddMonths(cursor,interval);
    cursor=sipDateWithDay(next.getFullYear(),next.getMonth(),day);
    guard++;
  }
  return items;
}
function allSipSchedule(months=12){
  return state.sipPlans
    .filter(p=>String(p.status||'ACTIVE').toUpperCase()!=='STOPPED')
    .flatMap(p=>generateSipSchedule(p,months))
    .sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||String(a.assetName).localeCompare(String(b.assetName)));
}
function sipNextDue(plan){
  const today=localIsoDate();
  const item=generateSipSchedule(plan,24,{includePastDays:0})
    .find(x=>x.dueDate>=today&&x.status!=='INVESTED'&&x.status!=='SKIPPED');
  return item?.dueDate||'';
}
function sipStatusBadge(status){
  const s=String(status||'PLANNED').toUpperCase();
  const label={ACTIVE:'Active',PAUSED:'Paused',STOPPED:'Stopped',PLANNED:'Upcoming',INVESTED:'Invested',SKIPPED:'Skipped'}[s]||s;
  return `<span class="sip-status ${s.toLowerCase()}">${escapeHtml(label)}</span>`;
}
function sipDateDisplay(value){
  const d=sipIsoDateToLocal(value);
  return d?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(d):'—';
}
function sipFilteredPlans(){
  const owner=els.sipOwnerFilter?.value||'ALL';
  const status=els.sipStatusFilter?.value||'ALL';
  return state.sipPlans.filter(p=>
    (owner==='ALL'||canonicalOwner(p.owner)===canonicalOwner(owner)) &&
    (status==='ALL'||String(p.status||'ACTIVE').toUpperCase()===status)
  );
}
function renderSipPlanner(){
  if(!els.sipPlansBody)return;

  const owners=configuredOwners();
  if(els.sipOwnerFilter){
    const old=els.sipOwnerFilter.value||'ALL';
    els.sipOwnerFilter.innerHTML='<option value="ALL">All investors</option>'+owners.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(shortOwner(o))}</option>`).join('');
    els.sipOwnerFilter.value=old==='ALL'||owners.includes(old)?old:'ALL';
  }

  const active=state.sipPlans.filter(p=>String(p.status||'ACTIVE').toUpperCase()==='ACTIVE');
  const paused=state.sipPlans.filter(p=>String(p.status||'').toUpperCase()==='PAUSED');
  const today=localIsoDate();

  const monthlyEquivalent=active.reduce((sum,p)=>{
    const amount=Number(p.amount)||0;
    return sum+(String(p.frequency||'MONTHLY').toUpperCase()==='QUARTERLY'?amount/3:amount);
  },0);

  const schedule12=allSipSchedule(12).filter(x=>x.dueDate>=today);
  const thirty=new Date();thirty.setHours(12,0,0,0);thirty.setDate(thirty.getDate()+30);
  const thirtyIso=localIsoDate(thirty);
  const next30=schedule12.filter(x=>x.dueDate<=thirtyIso&&x.status==='PLANNED');
  const future12=schedule12.filter(x=>x.status==='PLANNED');

  if(els.sipMonthlyCommitment)els.sipMonthlyCommitment.textContent=formatCurrency(monthlyEquivalent,true);
  if(els.sipNext30Amount)els.sipNext30Amount.textContent=formatCurrency(next30.reduce((s,x)=>s+Number(x.amount||0),0),true);
  if(els.sipNext30Count)els.sipNext30Count.textContent=`${next30.length} upcoming instalment${next30.length===1?'':'s'}`;
  if(els.sipNext12Amount)els.sipNext12Amount.textContent=formatCurrency(future12.reduce((s,x)=>s+Number(x.amount||0),0),true);
  if(els.sipActiveCount)els.sipActiveCount.textContent=String(active.length);
  if(els.sipPausedCount)els.sipPausedCount.textContent=`${paused.length} paused`;

  const plans=sipFilteredPlans();
  if(els.sipPlanCount)els.sipPlanCount.textContent=`${plans.length} plan${plans.length===1?'':'s'}`;
  els.sipPlansEmpty?.classList.toggle('hidden',plans.length>0);

  els.sipPlansBody.innerHTML=plans.map(p=>{
    const status=String(p.status||'ACTIVE').toUpperCase();
    const next=sipNextDue(p);
    const pauseButton=status==='ACTIVE'
      ? `<button class="small-button" data-sip-status="${escapeHtml(p.id)}" data-next-status="PAUSED">Pause</button>`
      : status==='PAUSED'
        ? `<button class="small-button" data-sip-status="${escapeHtml(p.id)}" data-next-status="ACTIVE">Resume</button>`
        : `<button class="small-button" data-sip-status="${escapeHtml(p.id)}" data-next-status="ACTIVE">Restart</button>`;
    return `<tr>
      <td><span class="owner-tag">${escapeHtml(shortOwner(p.owner))}</span></td>
      <td class="sip-asset-cell"><strong>${escapeHtml(p.assetName)}</strong><span>${escapeHtml(p.assetType||'MF')}${p.code?` · ${escapeHtml(p.code)}`:''}</span></td>
      <td><strong>${formatCurrency(p.amount)}</strong></td>
      <td>${escapeHtml(String(p.frequency||'MONTHLY').toLowerCase().replace(/^./,c=>c.toUpperCase()))}</td>
      <td>${escapeHtml(String(p.sipDay||'—'))}</td>
      <td>${Number(p.stepUpPct||0).toFixed(1)}%</td>
      <td>${next?sipDateDisplay(next):'—'}</td>
      <td>${sipStatusBadge(status)}</td>
      <td class="sip-actions">
        <button class="small-button" data-edit-sip="${escapeHtml(p.id)}">Edit</button>
        ${pauseButton}
        <button class="small-button danger" data-delete-sip="${escapeHtml(p.id)}">Delete</button>
      </td>
    </tr>`;
  }).join('');

  const horizon=Math.max(3,Number(els.sipHorizonSelect?.value||state.sipHorizonMonths||12));
  state.sipHorizonMonths=horizon;
  const ownerFilter=els.sipOwnerFilter?.value||'ALL';
  const schedule=allSipSchedule(horizon).filter(x=>ownerFilter==='ALL'||canonicalOwner(x.owner)===canonicalOwner(ownerFilter));
  if(els.sipScheduleCount)els.sipScheduleCount.textContent=`${schedule.length} instalment${schedule.length===1?'':'s'}`;
  els.sipScheduleEmpty?.classList.toggle('hidden',schedule.length>0);

  els.sipScheduleBody.innerHTML=schedule.map(x=>{
    const isPast=x.dueDate<today;
    const status=x.status==='PLANNED'&&isPast?'DUE':x.status;
    let action='—';
    if(x.status==='INVESTED'||x.status==='SKIPPED'){
      action=`<button class="small-button" data-clear-sip-event="${escapeHtml(x.planId)}" data-due-date="${escapeHtml(x.dueDate)}">Undo</button>`;
    }else{
      action=`<div class="sip-schedule-actions">
        <button class="small-button success" data-mark-sip-invested="${escapeHtml(x.planId)}" data-due-date="${escapeHtml(x.dueDate)}" data-amount="${Number(x.amount||0)}">Mark Invested</button>
        <button class="small-button" data-mark-sip-skipped="${escapeHtml(x.planId)}" data-due-date="${escapeHtml(x.dueDate)}" data-amount="${Number(x.amount||0)}">Skip</button>
      </div>`;
    }
    return `<tr class="${isPast&&x.status==='PLANNED'?'sip-overdue-row':''}">
      <td>${sipDateDisplay(x.dueDate)}</td>
      <td>${escapeHtml(shortOwner(x.owner))}</td>
      <td class="sip-asset-cell"><strong>${escapeHtml(x.assetName)}</strong>${x.code?`<span>${escapeHtml(x.code)}</span>`:''}</td>
      <td><strong>${formatCurrency(x.amount)}</strong></td>
      <td>${sipStatusBadge(status)}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
}
function populateSipAssetSuggestions(){
  if(!els.sipAssetSuggestions)return;
  const seen=new Set();
  const rows=[];
  state.holdings.forEach(h=>{
    const key=String(h.assetName||'').trim().toLowerCase();
    if(!key||seen.has(key))return;
    seen.add(key);
    rows.push(`<option value="${escapeHtml(h.assetName)}">${escapeHtml(h.code||'')}</option>`);
  });
  els.sipAssetSuggestions.innerHTML=rows.join('');
}
function openSipPlan(plan=null){
  refreshOwnerControls();
  populateSipAssetSuggestions();
  els.sipPlanForm?.reset();
  if(els.sipPlanId)els.sipPlanId.value=plan?.id||'';
  if(els.sipPlanModalTitle)els.sipPlanModalTitle.textContent=plan?'Edit SIP':'Add SIP';
  if(plan){
    els.sipPlanOwner.value=canonicalOwner(plan.owner);
    els.sipPlanAssetType.value=plan.assetType||'MF';
    els.sipPlanAssetName.value=plan.assetName||'';
    els.sipPlanCode.value=plan.code||'';
    els.sipPlanAmount.value=plan.amount??'';
    els.sipPlanFrequency.value=plan.frequency||'MONTHLY';
    els.sipPlanDay.value=plan.sipDay||5;
    els.sipPlanStartDate.value=plan.startDate||localIsoDate();
    els.sipPlanEndDate.value=plan.endDate||'';
    els.sipPlanStepUpPct.value=plan.stepUpPct??0;
    els.sipPlanExpectedReturnPct.value=plan.expectedReturnPct??12;
    els.sipPlanStatus.value=plan.status||'ACTIVE';
    els.sipPlanNotes.value=plan.notes||'';
  }else{
    els.sipPlanOwner.value=state.selectedOwner!=='ALL'?state.selectedOwner:(configuredOwners()[0]||'Sarada');
    els.sipPlanAssetType.value='MF';
    els.sipPlanFrequency.value='MONTHLY';
    els.sipPlanDay.value=Math.min(28,new Date().getDate()||5);
    els.sipPlanStartDate.value=localIsoDate();
    els.sipPlanStepUpPct.value=0;
    els.sipPlanExpectedReturnPct.value=12;
    els.sipPlanStatus.value='ACTIVE';
  }
  openModal('sipPlanModal');
}
async function saveSipPlan(event){
  event.preventDefault();
  const plan={
    id:els.sipPlanId.value.trim(),
    owner:els.sipPlanOwner.value,
    assetType:els.sipPlanAssetType.value,
    assetName:els.sipPlanAssetName.value.trim(),
    code:els.sipPlanCode.value.trim(),
    amount:Number(els.sipPlanAmount.value),
    frequency:els.sipPlanFrequency.value,
    sipDay:Number(els.sipPlanDay.value),
    startDate:els.sipPlanStartDate.value,
    endDate:els.sipPlanEndDate.value,
    stepUpPct:Number(els.sipPlanStepUpPct.value||0),
    expectedReturnPct:Number(els.sipPlanExpectedReturnPct.value||0),
    status:els.sipPlanStatus.value,
    notes:els.sipPlanNotes.value.trim()
  };
  setBusy(els.saveSipPlanBtn,true,'Saving…');
  try{
    const result=await api('saveSipPlan',{plan});
    applyBootstrap(result.data);saveCache(result.data);
    closeModals();
    switchSection('sip');
    toast(plan.id?'SIP updated.':'SIP plan added.','success');
  }catch(e){toast(e.message,'error');}
  finally{setBusy(els.saveSipPlanBtn,false);}
}
async function updateSipPlanStatus(id,status){
  const plan=state.sipPlans.find(p=>String(p.id)===String(id));
  if(!plan)return;
  try{
    const result=await api('saveSipPlan',{plan:{...plan,status}});
    applyBootstrap(result.data);saveCache(result.data);renderSipPlanner();
    toast(`SIP ${String(status).toLowerCase()}.`,'success');
  }catch(e){toast(e.message,'error');}
}
async function deleteSipPlan(id){
  const plan=state.sipPlans.find(p=>String(p.id)===String(id));
  if(!plan||!confirm(`Delete SIP plan "${plan.assetName}"?`))return;
  try{
    const result=await api('deleteSipPlan',{id});
    applyBootstrap(result.data);saveCache(result.data);
    toast('SIP plan deleted.','success');
  }catch(e){toast(e.message,'error');}
}
async function setSipScheduleEvent(planId,dueDate,amount,status){
  const plan=state.sipPlans.find(p=>String(p.id)===String(planId));
  if(!plan)return;
  try{
    const result=await api('setSipEvent',{event:{planId,dueDate,amount:Number(amount)||Number(plan.amount)||0,status,investedDate:status==='INVESTED'?localIsoDate():''}});
    applyBootstrap(result.data);saveCache(result.data);renderSipPlanner();
    toast(status==='INVESTED'?'SIP marked invested.':'SIP instalment skipped.','success');
  }catch(e){toast(e.message,'error');}
}
async function clearSipScheduleEvent(planId,dueDate){
  try{
    const result=await api('clearSipEvent',{planId,dueDate});
    applyBootstrap(result.data);saveCache(result.data);renderSipPlanner();
    toast('SIP instalment returned to planned.','success');
  }catch(e){toast(e.message,'error');}
}

function renderAll(){refreshAssetViewControls();renderSummary();renderGrowthDashboard();renderTypeSummary();renderAllocation();renderInvestorSummary();renderTopHoldings();renderHoldings();renderTransactions();renderWatchlist();renderSipPlanner();renderExpenditure();renderLifeQuote(true);renderStickyNotes();renderPersonalHome();refreshMonthlyYearFilter();renderDiary();renderMonthlyDiary();setOverviewMode(state.overviewMode);if(state.user?.role==='ADMIN')renderUsers();}
function renderSummary(){
  const items=visibleHoldings(),s=summarizeHoldings(items);
  els.sumInvested.textContent=formatHoldingValue(s.invested);
  els.sumCurrent.textContent=s.valuesComplete?formatHoldingValue(s.current):'Updating…';
  els.sumGain.textContent=s.valuesComplete?formatHoldingValue(s.gain):'—';
  els.sumGain.className=s.valuesComplete?pnlClass(s.gain):'neutral';
  els.sumReturn.textContent=s.valuesComplete?formatPercent(s.returnPct):'—';
  els.sumReturn.className=s.valuesComplete?pnlClass(s.returnPct):'neutral';
  els.sumAssetCount.textContent=`${items.length} holding${items.length===1?'':'s'}`;
  els.sumPricedCount.textContent=s.priceable?`${s.priceablePriced}/${s.priceable} priced`:`${s.priced} priced`;
  const viewLabel=assetViewLabel();
  els.sumSplit.textContent=viewLabel;
  els.sumWatchCount.textContent=`${state.watchlist.length} watchlist`;
  const ownerLabel=state.selectedOwner==='ALL'?'Combined':shortOwner(state.selectedOwner);
  els.welcomeTitle.textContent=state.selectedAssetView==='ALL'?`${ownerLabel} portfolio`:`${ownerLabel} · ${viewLabel}`;
  els.viewChip.textContent=state.selectedAssetView==='ALL'?ownerLabel:`${ownerLabel} · ${viewLabel}`;
  if(els.sumInvestedLabel)els.sumInvestedLabel.textContent=state.selectedAssetView==='ALL'?'Invested / cost value':`${viewLabel} invested`;
  if(els.sumCurrentLabel)els.sumCurrentLabel.textContent=state.selectedAssetView==='ALL'?'Current value':`${viewLabel} current value`;
}
function renderTypeSummary(){
  if(!els.typeSummaryGrid)return;
  const base=ownerHoldings();
  const defs=[
    {key:'ALL',label:'All investments',items:base,icon:'▦'},
    {key:'MF',label:'Mutual funds',items:base.filter(h=>h.type==='MF'),icon:'MF'},
    {key:'STOCKS',label:'Stocks & ETFs',items:base.filter(h=>h.type==='STOCK'||h.type==='ETF'),icon:'ST'},
    {key:'GPF',label:'General Provident Fund',items:base.filter(h=>h.type==='GPF'),icon:'GP'}
  ];
  els.typeSummaryGrid.innerHTML=defs.map(d=>{
    const s=summarizeHoldings(d.items);
    const active=state.selectedAssetView===d.key?'active':'';
    if(d.key==='GPF'){
      const monthly=d.items.reduce((sum,h)=>sum+(Number(h.monthlyContribution)||0),0);
      const projected=d.items.reduce((sum,h)=>sum+(Number(h.gpfProjection?.projectedBalance)||Number(h.currentValue)||Number(h.investedAmount)||0),0);
      const interest=d.items.reduce((sum,h)=>sum+(Number(h.gpfProjection?.estimatedInterest)||0),0);
      return `<button type="button" class="type-summary-card ${active}" data-asset-view="${d.key}">
        <div class="type-summary-head"><span class="type-summary-icon">${d.icon}</span><div><strong>${d.label}</strong><span>${d.items.length} account${d.items.length===1?'':'s'} · 12-month estimate</span></div></div>
        <div class="type-summary-values">
          <div><span>Present balance</span><b>${formatHoldingValue(s.current)}</b></div>
          <div><span>Monthly payment</span><b>${formatHoldingValue(monthly)}</b></div>
          <div><span>Est. interest</span><b class="positive">${formatHoldingValue(interest)}</b></div>
          <div><span>Projected balance</span><b>${formatHoldingValue(projected)}</b></div>
        </div>
      </button>`;
    }
    return `<button type="button" class="type-summary-card ${active}" data-asset-view="${d.key}">
      <div class="type-summary-head"><span class="type-summary-icon">${d.icon}</span><div><strong>${d.label}</strong><span>${d.items.length} holding${d.items.length===1?'':'s'}</span></div></div>
      <div class="type-summary-values">
        <div><span>Invested</span><b>${formatHoldingValue(s.invested)}</b></div>
        <div><span>Current</span><b>${s.valuesComplete?formatHoldingValue(s.current):'Updating…'}</b></div>
        <div><span>Gain / loss</span><b class="${s.valuesComplete?pnlClass(s.gain):'neutral'}">${s.valuesComplete?formatHoldingValue(s.gain):'—'}</b></div>
        <div><span>Return</span><b class="${s.valuesComplete?pnlClass(s.returnPct):'neutral'}">${s.valuesComplete?formatPercent(s.returnPct):'—'}</b></div>
      </div>
    </button>`;
  }).join('');
}
function renderAllocation(){
  const s=summarizeHoldings(visibleHoldings()),entries=Object.entries(s.allocation).sort((a,b)=>b[1]-a[1]);const total=entries.reduce((a,[,v])=>a+v,0);
  if(!entries.length){els.allocationChart.innerHTML='<div class="empty-state">Allocation appears after holdings are imported.</div>';return;}
  els.allocationChart.innerHTML=entries.map(([type,value])=>{const pct=total?value/total*100:0;return `<div class="allocation-row"><div class="allocation-name"><span class="allocation-dot ${type.toLowerCase()}"></span>${escapeHtml(type)}</div><div class="allocation-track"><div class="allocation-fill" style="width:${Math.min(100,Math.max(0,pct))}%"></div></div><div class="allocation-value">${pct.toFixed(1)}%</div></div>`;}).join('');
}
function renderInvestorSummary(){
  const owners=configuredOwners();
  if(!owners.length){els.investorSummary.innerHTML='<div class="empty-state">Investor summary appears after import.</div>';return;}
  els.investorSummary.innerHTML=owners.map(owner=>{
    const ownerItems=state.holdings.filter(h=>canonicalOwner(h.owner)===owner).filter(assetViewMatches);
    const s=summarizeHoldings(ownerItems);
    return `<button class="investor-card" data-owner-view="${escapeHtml(owner)}"><div><strong>${escapeHtml(shortOwner(owner))}</strong><span>${ownerItems.length} ${assetViewLabel().toLowerCase()}</span></div><div class="investor-metrics"><b>${s.valuesComplete?formatHoldingValue(s.current):'Updating…'}</b><span class="${s.valuesComplete?pnlClass(s.gain):'neutral'}">${s.valuesComplete?formatPercent(s.returnPct):'Prices pending'}</span></div></button>`;
  }).join('');
}
function renderTopHoldings(){const items=[...visibleHoldings()].sort((a,b)=>(Number(b.currentValue)||Number(b.investedAmount)||0)-(Number(a.currentValue)||Number(a.investedAmount)||0)).slice(0,8);if(!items.length){els.topHoldings.className='mini-holdings empty-state';els.topHoldings.textContent='Add investments or GPF to begin.';return;}els.topHoldings.className='mini-holdings';els.topHoldings.innerHTML=items.map(h=>`<div class="mini-holding" data-view-holding="${escapeHtml(h.id)}" role="button" tabindex="0" aria-label="View details for ${escapeHtml(h.assetName)}"><div><strong>${escapeHtml(h.assetName)}</strong><span>${escapeHtml(shortOwner(h.owner))} · ${escapeHtml(h.type)} · ${h.type==='GPF'?`${formatHoldingValue(h.monthlyContribution)} / month`:escapeHtml(h.exchange?`${h.exchange}:`:'')+escapeHtml(h.code)}</span></div><div class="mini-value">${formatHoldingValue(h.currentValue??h.investedAmount)}<span class="${pnlClass(h.returnPct)}">${h.type==='GPF'?`${Number(h.annualInterestRate||0).toFixed(2)}% p.a.`:h.currentPrice==null?'Price pending':formatPercent(h.returnPct)}</span></div></div>`).join('');}

function holdingMatches(h){
  const q=String(els.holdingSearch?.value||'').trim().toLowerCase(),type=els.holdingTypeFilter?.value||'ALL';
  const result=els.holdingResultFilter?.value||'ALL',notesFilter=els.holdingNotesFilter?.value||'ALL',tradeFilter=els.holdingTradeFilter?.value||'ALL';
  const ownerOk=state.selectedOwner==='ALL'||canonicalOwner(h.owner)===state.selectedOwner,assetOk=assetViewMatches(h);
  const text=`${h.owner} ${h.assetName} ${h.code} ${h.sourceCode||''} ${h.notes||''}`.toLowerCase();
  if(!ownerOk||!assetOk||(q&&!text.includes(q))||(type!=='ALL'&&h.type!==type))return false;
  const current=Number(h.gainLoss),total=Number(h.totalPnlToDate),realised=Number(h.realizedPnl);
  if(result==='CURRENT_PROFIT'&&!(Number.isFinite(current)&&current>0))return false;
  if(result==='CURRENT_LOSS'&&!(Number.isFinite(current)&&current<0))return false;
  if(result==='TOTAL_PROFIT'&&!(Number.isFinite(total)&&total>0))return false;
  if(result==='TOTAL_LOSS'&&!(Number.isFinite(total)&&total<0))return false;
  if(result==='REALISED_PROFIT'&&!(Number.isFinite(realised)&&realised>0))return false;
  if(result==='REALISED_LOSS'&&!(Number.isFinite(realised)&&realised<0))return false;
  if(result==='PNL_PENDING'&&h.gainLoss!==null&&h.gainLoss!==undefined&&Number.isFinite(Number(h.gainLoss)))return false;
  const hasNotes=Boolean(String(h.notes||'').trim());
  if(notesFilter==='WITH_NOTES'&&!hasNotes)return false;
  if(notesFilter==='WITHOUT_NOTES'&&hasNotes)return false;
  const s=h.transactionStats||{},hasPurchase=(Array.isArray(s.purchaseDates)&&s.purchaseDates.length>0)||Boolean(h.buyDate),hasSale=Array.isArray(s.saleDates)&&s.saleDates.length>0;
  if(tradeFilter==='HAS_PURCHASE'&&!hasPurchase)return false;
  if(tradeFilter==='HAS_SALE'&&!hasSale)return false;
  if(tradeFilter==='MISSING_DATES'&&hasPurchase)return false;
  return true;
}
function notePreview(value, max=82){
  const clean=String(value||'').replace(/\s+/g,' ').trim();
  if(!clean)return '<span class="note-empty">Add note</span>';
  const short=clean.length>max?`${clean.slice(0,max-1)}…`:clean;
  return `<span class="note-preview">${escapeHtml(short)}</span>`;
}
function perfCell(v){return `<td class="perf ${pnlClass(v)}">${formatPercent(v)}</td>`;}
const TABLE_SIZE_STEPS=[70,80,90,100,110,120,130,140,150,160];
function clampTableScale(v){return Math.max(70,Math.min(160,Math.round(Number(v||100)/5)*5));}
function tableSizeKey(section){return `myfinance_table_size_${section}`;}
function tableColumnWidthKey(section){return `myfinance_column_widths_${section}`;}
function tableScrollKey(section){return `myfinance_table_scroll_${section}`;}
function tableLayoutStatusElement(section){
  return section==='holdings'?els.holdLayoutSavedStatus:els.watchLayoutSavedStatus;
}
let tableLayoutStatusTimers={holdings:null,watchlist:null};
function showTableLayoutSaved(section,message='✓ Saved'){
  const el=tableLayoutStatusElement(section);
  if(!el)return;
  el.textContent=message;
  el.classList.toggle('saving',message.includes('Saving'));
  el.classList.toggle('saved',message.includes('Saved'));
  if(tableLayoutStatusTimers[section])clearTimeout(tableLayoutStatusTimers[section]);
  if(message.includes('Saving')){
    tableLayoutStatusTimers[section]=setTimeout(()=>showTableLayoutSaved(section,'✓ Saved'),350);
  }
}
function markTableLayoutSaving(section){showTableLayoutSaved(section,'Saving…');}
function loadTableScroll(section){
  const value=Number(localStorage.getItem(tableScrollKey(section))||0);
  return Number.isFinite(value)&&value>=0?value:0;
}
function saveTableScroll(section,value){
  try{localStorage.setItem(tableScrollKey(section),String(Math.max(0,Math.round(Number(value)||0))));}catch{}
}
function tableScrollWrap(section){
  return document.querySelector(`[data-layout-scroll="${section}"]`);
}
function restoreTableScroll(section){
  const wrap=tableScrollWrap(section);
  if(!wrap)return;
  const saved=loadTableScroll(section);
  requestAnimationFrame(()=>{wrap.scrollLeft=Math.min(saved,Math.max(0,wrap.scrollWidth-wrap.clientWidth));});
}
const tableScrollSaveTimers={holdings:null,watchlist:null};
function bindTableScrollPersistence(section){
  const wrap=tableScrollWrap(section);
  if(!wrap||wrap.dataset.scrollPersistenceBound==='1')return;
  wrap.dataset.scrollPersistenceBound='1';
  wrap.addEventListener('scroll',()=>{
    if(tableScrollSaveTimers[section])clearTimeout(tableScrollSaveTimers[section]);
    tableScrollSaveTimers[section]=setTimeout(()=>{
      saveTableScroll(section,wrap.scrollLeft);
      showTableLayoutSaved(section,'✓ Saved');
    },180);
  },{passive:true});
}

function loadTableSize(section){
  try{
    const raw=JSON.parse(localStorage.getItem(tableSizeKey(section))||'null');
    return{row:clampTableScale(raw?.row),width:clampTableScale(raw?.width)};
  }catch{return{row:100,width:100};}
}
function saveTableSize(section,size){
  try{localStorage.setItem(tableSizeKey(section),JSON.stringify({row:clampTableScale(size.row),width:clampTableScale(size.width)}));markTableLayoutSaving(section);}catch{}
}
function loadColumnWidths(section){
  try{
    const raw=JSON.parse(localStorage.getItem(tableColumnWidthKey(section))||'{}');
    return raw&&typeof raw==='object'?raw:{};
  }catch{return{};}
}
function saveColumnWidths(section,widths){
  try{localStorage.setItem(tableColumnWidthKey(section),JSON.stringify(widths||{}));markTableLayoutSaving(section);}catch{}
}
function tableSectionElement(section){
  return section==='holdings'?$('holdingsSection'):$('watchlistSection');
}
function tableElementFor(section){
  return tableSectionElement(section)?.querySelector(section==='holdings'?'.holdings-table':'.watchlist-details-table')||null;
}
function tableSliderElements(section){
  return section==='holdings'
    ?{row:els.holdRowSlider,width:els.holdWidthSlider,rowLabel:els.holdRowSizeLabel,widthLabel:els.holdWidthSizeLabel}
    :{row:els.watchRowSlider,width:els.watchWidthSlider,rowLabel:els.watchRowSizeLabel,widthLabel:els.watchWidthSizeLabel};
}
function applyTableSize(section){
  const size=loadTableSize(section);
  const sectionEl=tableSectionElement(section);
  if(!sectionEl)return;
  const baseWidth=section==='holdings'?2050:1850;
  const baseVertical=10;
  const baseHorizontal=11;
  const rowPad=Math.max(5,Math.round(baseVertical*size.row/100));
  const colPad=Math.max(6,Math.round(baseHorizontal*size.width/100));
  const tableWidth=Math.round(baseWidth*size.width/100);
  sectionEl.style.setProperty('--user-row-pad',`${rowPad}px`);
  sectionEl.style.setProperty('--user-col-pad',`${colPad}px`);
  sectionEl.style.setProperty('--user-table-width',`${tableWidth}px`);
  const controls=tableSliderElements(section);
  if(controls.rowLabel)controls.rowLabel.textContent=`${size.row}%`;
  if(controls.widthLabel)controls.widthLabel.textContent=`${size.width}%`;
  if(controls.row)controls.row.value=String(size.row);
  if(controls.width)controls.width.value=String(size.width);
  applyStoredColumnWidths(section);
  bindTableScrollPersistence(section);
  restoreTableScroll(section);
  showTableLayoutSaved(section,'✓ Saved');
  scheduleDashboardHScrollRefresh();
}
function changeTableSize(section,dimension,direction){
  const size=loadTableSize(section);
  size[dimension]=clampTableScale(Number(size[dimension]||100)+(direction>0?10:-10));
  saveTableSize(section,size);
  applyTableSize(section);
}
function setTableSizeFromSlider(section,dimension,value){
  const size=loadTableSize(section);
  size[dimension]=clampTableScale(value);
  saveTableSize(section,size);
  applyTableSize(section);
}
function columnResizeLimits(section,index){
  const table=tableElementFor(section);
  const th=table?.querySelector('thead tr')?.children[index]||null;
  const key=String(th?.dataset?.standardKey||'');
  const perfKeys=new Set(['d1','w1','m1','m6','y1','y3','y5','y10']);
  if(key==='asset')return {min:150,max:760};
  if(key==='investor'||key==='owner')return {min:86,max:220};
  if(key==='actions')return {min:145,max:320};
  if(key==='currentPrice')return {min:150,max:360};
  if(key==='currentValue')return {min:105,max:300};
  if(key==='gainLoss'||key==='realizedPnl'||key==='totalPnl')return {min:100,max:300};
  if(key==='gainPct'||key==='xirr')return {min:78,max:220};
  if(key==='note'||key==='notes')return {min:110,max:460};
  if(perfKeys.has(key))return {min:88,max:240};
  return {min:58,max:620};
}
function setColumnWidth(section,index,width){
  const table=tableElementFor(section);
  if(!table)return;
  const limits=columnResizeLimits(section,index);
  const safe=Math.max(limits.min,Math.min(limits.max,Math.round(width)));
  table.querySelectorAll('tr').forEach(row=>{
    const cell=row.children[index];
    if(!cell)return;
    // Use inline !important so the user's drag always beats historical CSS min-width rules.
    cell.style.setProperty('width',`${safe}px`,'important');
    cell.style.setProperty('min-width',`${safe}px`,'important');
    cell.style.setProperty('max-width',`${safe}px`,'important');
    cell.dataset.userWidth=String(safe);
  });
  const th=table.querySelector('thead tr')?.children[index];
  if(String(th?.dataset?.standardKey||'')==='asset'){
    table.querySelectorAll('.asset-col .asset-cell').forEach(assetCell=>{
      assetCell.style.setProperty('width','100%','important');
      assetCell.style.setProperty('min-width','0','important');
      assetCell.style.setProperty('max-width','100%','important');
    });
    table.querySelectorAll('.asset-col .asset-cell > div:last-child').forEach(textBox=>{
      // This explicitly cancels the older width:0!important rule that caused one-letter-per-line names.
      textBox.style.setProperty('width','auto','important');
      textBox.style.setProperty('min-width','0','important');
      textBox.style.setProperty('max-width','100%','important');
      textBox.style.setProperty('flex','1 1 auto','important');
    });
  }
  if(section==='holdings'&&index===0){
    const assetLeft=safe;
    table.querySelectorAll('.asset-col').forEach(cell=>cell.style.left=`${assetLeft}px`);
  }
}
function applyStoredColumnWidths(section){
  const widths=loadColumnWidths(section);
  Object.keys(widths).forEach(k=>setColumnWidth(section,Number(k),Number(widths[k])));
  if(section==='holdings'&&!Object.prototype.hasOwnProperty.call(widths,'0')){
    const table=tableElementFor(section);
    table?.querySelectorAll('.asset-col').forEach(cell=>cell.style.left='100px');
  }
}
function resetSingleColumnWidth(section,index){
  const widths=loadColumnWidths(section);
  delete widths[String(index)];
  saveColumnWidths(section,widths);
  const table=tableElementFor(section);
  if(!table)return;
  const key=String(table.querySelector('thead tr')?.children[index]?.dataset?.standardKey||'');
  table.querySelectorAll('tr').forEach(row=>{
    const cell=row.children[index];
    if(!cell)return;
    cell.style.removeProperty('width');
    cell.style.removeProperty('min-width');
    cell.style.removeProperty('max-width');
    delete cell.dataset.userWidth;
  });
  if(key==='asset'){
    // Restore a useful default width after double-click reset.
    setColumnWidth(section,index,280);
  }
  if(section==='holdings'&&index===0){
    table.querySelectorAll('.asset-col').forEach(cell=>cell.style.left='100px');
  }
  applyStoredColumnWidths(section);
  scheduleDashboardHScrollRefresh();
}
function installColumnResizers(section){
  const table=tableElementFor(section);
  if(!table)return;
  const headers=[...table.querySelectorAll('thead th')];
  headers.forEach((th,index)=>{
    if(th.querySelector('.column-resize-handle'))return;
    const handle=document.createElement('span');
    handle.className='column-resize-handle';
    const columnKey=String(th.dataset.standardKey||'');
    handle.title=columnKey==='asset'?'Drag left/right to resize Asset / Scheme column (150–760 px) · Double-click to reset':'Drag left/right to resize this column · Double-click to reset';
    handle.setAttribute('aria-hidden','true');
    th.appendChild(handle);

    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      const startX=event.clientX;
      const startWidth=th.getBoundingClientRect().width;
      document.body.classList.add('column-resize-active');
      markTableLayoutSaving(section);

      const onMove=e=>{
        const limits=columnResizeLimits(section,index);
        const width=Math.max(limits.min,Math.min(limits.max,startWidth+(e.clientX-startX)));
        setColumnWidth(section,index,width);
      };
      const onUp=e=>{
        handle.releasePointerCapture?.(event.pointerId);
        handle.removeEventListener('pointermove',onMove);
        handle.removeEventListener('pointerup',onUp);
        handle.removeEventListener('pointercancel',onUp);
        document.body.classList.remove('column-resize-active');
        const widths=loadColumnWidths(section);
        widths[String(index)]=Math.round(th.getBoundingClientRect().width);
        saveColumnWidths(section,widths);
        showTableLayoutSaved(section,'✓ Saved');
        scheduleDashboardHScrollRefresh();
      };
      handle.addEventListener('pointermove',onMove);
      handle.addEventListener('pointerup',onUp);
      handle.addEventListener('pointercancel',onUp);
    });

    handle.addEventListener('dblclick',event=>{
      event.preventDefault();
      event.stopPropagation();
      resetSingleColumnWidth(section,index);
      toast('Column width reset.','success');
    });
  });
  applyStoredColumnWidths(section);
}
function resetTableSize(section){
  saveTableSize(section,{row:100,width:100});
  saveColumnWidths(section,{});
  saveTableScroll(section,0);
  const table=tableElementFor(section);
  if(table){
    table.querySelectorAll('th,td').forEach(cell=>{
      cell.style.removeProperty('width');
      cell.style.removeProperty('min-width');
      cell.style.removeProperty('max-width');
    });
    if(section==='holdings')table.querySelectorAll('.asset-col').forEach(cell=>cell.style.left='100px');
  }
  applyTableSize(section);
  const wrap=tableScrollWrap(section);if(wrap)wrap.scrollLeft=0;
  showTableLayoutSaved(section,'✓ Saved');
  toast(`${section==='holdings'?'Holdings':'Watchlist'} saved table layout reset.`,'success');
}


function holdingSummarySubset(items,kind='ALL'){
  if(kind==='MF')return items.filter(h=>h.type==='MF');
  if(kind==='STOCKS')return items.filter(h=>h.type==='STOCK'||h.type==='ETF');
  if(kind==='GPF')return items.filter(h=>h.type==='GPF');
  return items;
}
function holdingsSummaryValues(items){
  const s=summarizeHoldings(items);
  return {
    invested:Number(s.invested||0),
    current:s.valuesComplete?Number(s.current||0):null,
    gain:s.valuesComplete?Number(s.gain||0):null,
    returnPct:s.valuesComplete?Number(s.returnPct||0):null,
    valuesComplete:s.valuesComplete,
    count:items.length
  };
}
function setHoldingValueGrowth(prefix,items){
  const v=holdingsSummaryValues(items);
  const investedEl=els[`${prefix}Invested`];
  const currentEl=els[`${prefix}Current`];
  const growthEl=els[`${prefix}Growth`];
  if(investedEl)investedEl.textContent=formatHoldingsSummaryAmount(v.invested);
  if(currentEl)currentEl.textContent=formatHoldingsSummaryAmount(v.current);
  if(growthEl){
    const gain=v.valuesComplete?`${v.gain>=0?'+':'-'}${formatHoldingsSummaryAmount(Math.abs(v.gain))}`:'Updating prices…';
    const pct=v.valuesComplete?`${v.returnPct>=0?'+':''}${v.returnPct.toFixed(2)}%`:'';
    growthEl.innerHTML=v.valuesComplete?`<span class="matrix-gain-amount">${escapeHtml(gain)}</span><small class="matrix-gain-percent">${escapeHtml(pct)}</small>`:escapeHtml(gain);
    growthEl.classList.remove('positive','negative','neutral');
    const growthState=!v.valuesComplete?'neutral':v.gain>0?'positive':v.gain<0?'negative':'neutral';
    growthEl.classList.add(growthState);
    const growthRow=growthEl.closest('.summary-metric,.matrix-value');
    if(growthRow){
      growthRow.classList.remove('gain-positive','gain-negative','gain-neutral');
      growthRow.classList.add(`gain-${growthState}`);
    }
  }
}
function gpfSummaryTotals(items){
  return (Array.isArray(items)?items:[]).filter(h=>h.type==='GPF').reduce((total,h)=>{
    const present=Math.max(0,Number(h.currentValue??h.investedAmount)||0);
    const monthly=Math.max(0,Number(h.monthlyContribution)||0);
    const annual=Math.max(0,Number(h.annualInterestRate)||0);
    let projected=Number(h.gpfProjection?.projectedBalance);
    let interest=Number(h.gpfProjection?.estimatedInterest);
    if(!Number.isFinite(projected)||!Number.isFinite(interest)){
      projected=present;
      const monthlyRate=annual/1200;
      for(let month=0;month<12;month++)projected=projected*(1+monthlyRate)+monthly;
      interest=Math.max(0,projected-present-monthly*12);
    }
    total.present+=present;
    total.monthly+=monthly;
    total.projected+=projected;
    total.interest+=interest;
    total.count++;
    return total;
  },{present:0,monthly:0,projected:0,interest:0,count:0});
}
function setGpfHoldingSummary(prefix,items){
  const total=gpfSummaryTotals(items);
  const present=$(`${prefix}Present`);
  const monthly=$(`${prefix}Monthly`);
  const projected=$(`${prefix}Projected`);
  const interest=$(`${prefix}Interest`);
  if(present)present.textContent=formatHoldingsSummaryAmount(total.present);
  if(monthly)monthly.textContent=formatHoldingsSummaryAmount(total.monthly);
  if(projected)projected.textContent=formatHoldingsSummaryAmount(total.projected);
  if(interest)interest.textContent=formatHoldingsSummaryAmount(total.interest);
  [present,monthly,projected,interest].filter(Boolean).forEach(el=>{
    const cell=el.closest('.matrix-value,.holdings-mini-card.gpf');
    if(!cell)return;
    cell.classList.toggle('gpf-empty',total.count===0);
    cell.title=total.count?`${total.count} GPF holding${total.count===1?'':'s'} included in this summary`:'No GPF holding added for this investor';
  });
}

const HOLDINGS_MATRIX_OWNER_KEY='myfinance_holdings_matrix_owner_v1';
function setHoldingsMatrixOwner(owner='combined',persist=true){
  const selected=['sarada','niharika','combined'].includes(String(owner).toLowerCase())?String(owner).toLowerCase():'combined';
  const wrap=document.querySelector('.holding-matrix-wrap');
  if(wrap)wrap.dataset.matrixOwnerView=selected;
  document.querySelectorAll('[data-matrix-owner]').forEach(button=>{
    const active=button.dataset.matrixOwner===selected;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    button.tabIndex=active?0:-1;
  });
  if(persist){try{localStorage.setItem(HOLDINGS_MATRIX_OWNER_KEY,selected);}catch{}}
}
function restoreHoldingsMatrixOwner(){
  let selected='combined';
  try{selected=localStorage.getItem(HOLDINGS_MATRIX_OWNER_KEY)||'combined';}catch{}
  setHoldingsMatrixOwner(selected,false);
}
function renderHoldingsSummary(){
  const all=[...state.holdings];
  const niharika=all.filter(h=>canonicalOwner(h.owner).toLowerCase().includes('niharika'));
  const sarada=all.filter(h=>canonicalOwner(h.owner).toLowerCase().includes('sarada'));

  setHoldingValueGrowth('holdSumCombinedTotal',all);
  setHoldingValueGrowth('holdSumCombinedMf',holdingSummarySubset(all,'MF'));
  setHoldingValueGrowth('holdSumCombinedStock',holdingSummarySubset(all,'STOCKS'));
  setGpfHoldingSummary('holdSumCombinedGpf',all);

  setHoldingValueGrowth('holdSumNiharikaTotal',niharika);
  setHoldingValueGrowth('holdSumNiharikaMf',holdingSummarySubset(niharika,'MF'));
  setHoldingValueGrowth('holdSumNiharikaStock',holdingSummarySubset(niharika,'STOCKS'));
  setGpfHoldingSummary('holdSumNiharikaGpf',niharika);

  setHoldingValueGrowth('holdSumSaradaTotal',sarada);
  setHoldingValueGrowth('holdSumSaradaMf',holdingSummarySubset(sarada,'MF'));
  setHoldingValueGrowth('holdSumSaradaStock',holdingSummarySubset(sarada,'STOCKS'));
  setGpfHoldingSummary('holdSumSaradaGpf',sarada);
}

const STANDARD_COLUMN_DEFS={
  HOLDINGS:[
    {key:'investor',label:'Investor',index:0,locked:true},{key:'asset',label:'Asset',index:1,locked:true},
    {key:'purchaseDates',label:'Purchase Date(s)',index:2},{key:'saleDates',label:'Sale Date(s)',index:3},
    {key:'units',label:'Qty / Units',index:4},{key:'avgBuy',label:'Avg Buy',index:5},{key:'invested',label:'Invested',index:6},
    {key:'currentPrice',label:'Current Price / NAV',index:7},{key:'currentValue',label:'Current Value',index:8},
    {key:'gainLoss',label:'P/L Till Today',index:9},{key:'realizedPnl',label:'Realised P/L',index:10},{key:'totalPnl',label:'Total P/L to Date',index:11},
    {key:'gainPct',label:'Gain %',index:12},{key:'xirr',label:'XIRR',index:13},
    {key:'d1',label:'1D',index:14},{key:'w1',label:'1W',index:15},{key:'m1',label:'1M',index:16},{key:'m6',label:'6M',index:17},
    {key:'y1',label:'1Y',index:18},{key:'y3',label:'3Y',index:19},{key:'y5',label:'5Y',index:20},{key:'y10',label:'10Y',index:21},
    {key:'note',label:'Personal Note',index:22},{key:'actions',label:'Actions',index:23,locked:true}
  ],
  WATCHLIST:[
    {key:'asset',label:'Asset',index:0,locked:true},{key:'livePrice',label:'Live Price/NAV',index:1},{key:'dayPct',label:'Sheet Day %',index:2},
    {key:'target',label:'Target',index:3},{key:'distance',label:'Distance',index:4},{key:'highLow',label:'52W H/L',index:5},
    {key:'valuation',label:'P/E or P/B',index:6},{key:'m1',label:'1M',index:7},{key:'y1',label:'1Y',index:8},{key:'y3',label:'3Y',index:9},
    {key:'y5',label:'5Y',index:10},{key:'y10',label:'10Y',index:11},{key:'remark',label:'Remark / Moat',index:12},
    {key:'note',label:'Personal Note',index:13},{key:'actions',label:'Actions',index:14,locked:true}
  ]
};

const HOLDINGS_VIEW_PRESETS={
  RESULT:['investor','asset','purchaseDates','saleDates','units','avgBuy','invested','currentPrice','currentValue','gainLoss','realizedPnl','totalPnl','gainPct','xirr','note','actions'],
  PERFORMANCE:['investor','asset','currentPrice','gainPct','xirr','d1','w1','m1','m6','y1','y3','y5','y10','note','actions'],
  COMPACT:['investor','asset','currentValue','gainLoss','totalPnl','gainPct','note','actions'],
  FULL:(STANDARD_COLUMN_DEFS.HOLDINGS||[]).map(x=>x.key)
};
const HOLDINGS_TRANSACTION_KEYS=new Set(['purchaseDates','saleDates']);
const HOLDINGS_RESULT_KEYS=new Set(['units','avgBuy','invested','currentPrice','currentValue','gainLoss','realizedPnl','totalPnl','gainPct','xirr']);
const HOLDINGS_PERFORMANCE_KEYS=new Set(['d1','w1','m1','m6','y1','y3','y5','y10']);

function holdingsDefaultViewKey(){return `myfinance_holdings_default_view_${state.username||'local'}`;}
function watchDefaultViewKey(){return `myfinance_watch_default_view_${state.username||'local'}`;}
function currentStandardSettingsSnapshot(section){return JSON.parse(JSON.stringify(loadStandardColumnSettings(section)||{}));}
function applyPresetSettings(section,visibleKeys){
  const defs=STANDARD_COLUMN_DEFS[section]||[],current=loadStandardColumnSettings(section),set=new Set(visibleKeys||[]);
  defs.forEach(def=>current[def.key]={...(current[def.key]||{}),visible:def.locked?true:set.has(def.key)});
  saveStandardColumnSettings(section,current);
}
function showAllStandardColumnsTemporarily(section){
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const current=loadStandardColumnSettings(section);
  defs.forEach(def=>{
    current[def.key]={...(current[def.key]||{}),visible:true};
  });
  saveStandardColumnSettings(section,current);
  if(section==='HOLDINGS'){
    renderHoldings();
    if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='Temporary: all columns shown';
  }else{
    renderWatchlist();
    if(els.watchDefaultViewStatus)els.watchDefaultViewStatus.textContent='Temporary: all columns shown';
  }
  toast('All standard columns shown temporarily. Your saved default is unchanged.','info');
}

function restoreSavedDefaultColumnsOnly(section){
  try{
    const key=section==='HOLDINGS'?holdingsDefaultViewKey():watchDefaultViewKey();
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved?.settings){
      saveStandardColumnSettings(section,saved.settings);
      if(saved.order)saveStandardColumnOrder(section,saved.order);
      if(section==='HOLDINGS')renderHoldings();else renderWatchlist();
      return true;
    }
  }catch{}
  return false;
}

function saveCurrentColumnsAsDefault(section){
  if(section==='HOLDINGS'){
    saveHoldingsDefaultView();
    renderStandardColumnsManager('HOLDINGS');
  }else{
    saveWatchDefaultView();
    renderStandardColumnsManager('WATCHLIST');
  }
}

function toggleAllColumnsButton(section){
  const restored=restoreSavedDefaultColumnsOnly(section);
  if(restored){
    if(section==='HOLDINGS'){
      if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='✓ Saved default columns restored';
    }else{
      if(els.watchDefaultViewStatus)els.watchDefaultViewStatus.textContent='✓ Saved default columns restored';
    }
    toast('Saved default columns restored.','success');
    return;
  }
  toast('No saved default yet. Open Columns, hide what you do not want, then Save as default.','info');
}

function holdingsPresetFromCurrent(){
  const settings=loadStandardColumnSettings('HOLDINGS'),defs=STANDARD_COLUMN_DEFS.HOLDINGS||[];
  const visible=defs.filter(d=>d.locked||settings[d.key]?.visible!==false).map(d=>d.key).sort().join('|');
  for(const [name,keys] of Object.entries(HOLDINGS_VIEW_PRESETS)){
    if([...keys].sort().join('|')===visible)return name;
  }
  return 'CUSTOM';
}
function resetHoldingsHorizontalScroll(){
  saveTableScroll('holdings',0);
  const wrap=tableScrollWrap('holdings');
  if(wrap){
    wrap.scrollLeft=0;
    requestAnimationFrame(()=>{
      wrap.scrollLeft=0;
      queueHScrollUiRefresh();
    });
  }
}

function setHoldingsViewPreset(name,{render=true}={}){
  const preset=HOLDINGS_VIEW_PRESETS[name];if(!preset)return;
  applyPresetSettings('HOLDINGS',preset);
  if(els.holdingsViewPreset)els.holdingsViewPreset.value=name;
  resetHoldingsHorizontalScroll();
  if(render)renderHoldings();
}
function holdingsViewSnapshot(){
  return {settings:currentStandardSettingsSnapshot('HOLDINGS'),order:loadStandardColumnOrder('HOLDINGS'),filters:{
    type:els.holdingTypeFilter?.value||'ALL',result:els.holdingResultFilter?.value||'ALL',
    notes:els.holdingNotesFilter?.value||'ALL',trade:els.holdingTradeFilter?.value||'ALL'
  },preset:holdingsPresetFromCurrent(),savedAt:Date.now()};
}
function saveHoldingsDefaultView(){
  try{
    localStorage.setItem(holdingsDefaultViewKey(),JSON.stringify(holdingsViewSnapshot()));
    if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='★ Default view saved';
    toast('Current Holdings columns and filters saved as your default view.','success');
  }catch{toast('Could not save the default Holdings view.','error');}
}
function applyHoldingsSnapshot(saved,{toastUser=false}={}){
  if(!saved||typeof saved!=='object')return false;
  if(saved.settings)saveStandardColumnSettings('HOLDINGS',saved.settings);if(saved.order)saveStandardColumnOrder('HOLDINGS',saved.order);
  const f=saved.filters||{};
  if(els.holdingTypeFilter)els.holdingTypeFilter.value=f.type||'ALL';
  if(els.holdingResultFilter)els.holdingResultFilter.value=f.result||'ALL';
  if(els.holdingNotesFilter)els.holdingNotesFilter.value=f.notes||'ALL';
  if(els.holdingTradeFilter)els.holdingTradeFilter.value=f.trade||'ALL';
  if(els.holdingsViewPreset)els.holdingsViewPreset.value=saved.preset||holdingsPresetFromCurrent();
  resetHoldingsHorizontalScroll();
  renderHoldings();
  if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='✓ Saved default applied';
  if(toastUser)toast('Saved Holdings default view restored.','success');
  return true;
}
function restoreHoldingsDefaultView(toastUser=true){
  try{
    const saved=JSON.parse(localStorage.getItem(holdingsDefaultViewKey())||'null');
    if(saved)return applyHoldingsSnapshot(saved,{toastUser});
  }catch{}
  if(!localStorage.getItem(standardColumnSettingsKey('HOLDINGS')))setHoldingsViewPreset('RESULT',{render:false});
  if(els.holdingsViewPreset)els.holdingsViewPreset.value=holdingsPresetFromCurrent();
  if(toastUser){renderHoldings();toast('No saved default yet. Recommended view is My Investment Result.','info');}
  return false;
}
function resetHoldingsView(){
  if(els.holdingSearch)els.holdingSearch.value='';
  if(els.holdingTypeFilter)els.holdingTypeFilter.value='ALL';
  if(els.holdingResultFilter)els.holdingResultFilter.value='ALL';
  if(els.holdingNotesFilter)els.holdingNotesFilter.value='ALL';
  if(els.holdingTradeFilter)els.holdingTradeFilter.value='ALL';
  setHoldingsViewPreset('RESULT',{render:false});renderHoldings();
  if(els.holdingsDefaultViewStatus)els.holdingsDefaultViewStatus.textContent='Recommended view active';
  toast('Holdings reset to My Investment Result view.','success');
}
function saveWatchDefaultView(){
  const payload={settings:currentStandardSettingsSnapshot('WATCHLIST'),filters:{
    type:els.watchTypeFilter?.value||'ALL',priority:els.watchPriorityFilter?.value||'ALL',
    target:els.watchTargetFilter?.value||'ALL',notes:els.watchNotesFilter?.value||'ALL'
  },savedAt:Date.now()};
  try{
    localStorage.setItem(watchDefaultViewKey(),JSON.stringify(payload));
    if(els.watchDefaultViewStatus)els.watchDefaultViewStatus.textContent='★ Default view saved';
    toast('Current Watchlist columns and filters saved as your default view.','success');
  }catch{toast('Could not save Watchlist default view.','error');}
}
function restoreWatchDefaultView(toastUser=true){
  try{
    const saved=JSON.parse(localStorage.getItem(watchDefaultViewKey())||'null');
    if(saved){
      if(saved.settings)saveStandardColumnSettings('WATCHLIST',saved.settings);if(saved.order)saveStandardColumnOrder('WATCHLIST',saved.order);
      const f=saved.filters||{};
      if(els.watchTypeFilter)els.watchTypeFilter.value=f.type||'ALL';
      if(els.watchPriorityFilter)els.watchPriorityFilter.value=f.priority||'ALL';
      if(els.watchTargetFilter)els.watchTargetFilter.value=f.target||'ALL';
      if(els.watchNotesFilter)els.watchNotesFilter.value=f.notes||'ALL';
      renderWatchlist();
      if(els.watchDefaultViewStatus)els.watchDefaultViewStatus.textContent='✓ Saved default applied';
      if(toastUser)toast('Saved Watchlist default view restored.','success');
      return true;
    }
  }catch{}
  return false;
}
function standardColumnSettingsKey(section){return `myfinance_standard_columns_${section}`;}
function standardColumnOrderKey(section){return `myfinance_standard_column_order_${section}`;}
function defaultStandardColumnOrder(section){
  return (STANDARD_COLUMN_DEFS[section]||[]).filter(d=>d.key!=='actions').map(d=>d.key);
}
function loadStandardColumnOrder(section){
  const defaults=defaultStandardColumnOrder(section);
  try{
    const raw=JSON.parse(localStorage.getItem(standardColumnOrderKey(section))||'[]');
    const saved=Array.isArray(raw)?raw.filter(k=>defaults.includes(k)):[];
    return [...saved,...defaults.filter(k=>!saved.includes(k))];
  }catch{return defaults;}
}
function saveStandardColumnOrder(section,order){
  const defaults=defaultStandardColumnOrder(section);
  const clean=(Array.isArray(order)?order:[]).filter(k=>defaults.includes(k));
  const final=[...clean,...defaults.filter(k=>!clean.includes(k))];
  try{localStorage.setItem(standardColumnOrderKey(section),JSON.stringify(final));}catch{}
}
function lockedLeadingKeys(section){
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const lead=[];
  for(const d of defs){
    if(d.key==='actions')break;
    if(d.locked)lead.push(d.key);
    else break;
  }
  return lead;
}
function moveStandardColumn(section,key,mode){
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const def=defs.find(d=>d.key===key);
  if(!def||def.key==='actions'||def.locked)return;

  const order=loadStandardColumnOrder(section);
  const i=order.indexOf(key);
  if(i<0)return;

  const lockedCount=lockedLeadingKeys(section).length;
  let target=i;
  if(mode==='LEFT')target=Math.max(lockedCount,i-1);
  if(mode==='RIGHT')target=Math.min(order.length-1,i+1);
  if(mode==='FRONT')target=lockedCount;
  if(mode==='END')target=order.length-1;
  if(target===i)return;

  order.splice(i,1);
  order.splice(target,0,key);
  saveStandardColumnOrder(section,order);

  // Old widths are position-based; clear them once so widths don't jump to another column.
  const tableSection=section.toLowerCase();
  saveColumnWidths(tableSection,{});
  saveTableScroll(tableSection,0);

  if(section==='HOLDINGS')renderHoldings();else renderWatchlist();
  renderStandardColumnsManager(section);
  toast(`${def.label} column moved.`, 'success');
}
function annotateStandardColumnKeys(section){
  const table=tableElementFor(section.toLowerCase());
  if(!table)return;
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const customCount=sectionCustomColumns(section).length;

  const head=table.querySelector('thead tr');
  if(head){
    const existing=[...head.children].some(c=>c.dataset.standardKey);
    if(!existing){
      defs.forEach(def=>{
        let index=def.index;
        if(def.key==='actions'&&customCount)index+=customCount;
        const cell=head.children[index];
        if(cell&&!cell.classList.contains('custom-column-head'))cell.dataset.standardKey=def.key;
      });
    }
  }

  table.querySelectorAll('tbody tr').forEach(row=>{
    if(row.children.length<=1)return; // direct-row editor uses one colspan cell.
    defs.forEach(def=>{
      let index=def.index;
      if(def.key==='actions'&&customCount)index+=customCount;
      const cell=row.children[index];
      if(cell&&!cell.dataset.customKey)cell.dataset.standardKey=def.key;
    });
  });
}
function applyStandardColumnOrder(section){
  const table=tableElementFor(section.toLowerCase());
  if(!table)return;
  annotateStandardColumnKeys(section);

  const order=loadStandardColumnOrder(section);
  const rows=table.querySelectorAll('thead tr, tbody tr');
  rows.forEach(row=>{
    if(row.children.length<=1)return;

    const standard=new Map();
    const custom=[];
    let actions=null;

    [...row.children].forEach(cell=>{
      if(cell.dataset.customKey)custom.push(cell);
      else if(cell.dataset.standardKey==='actions')actions=cell;
      else if(cell.dataset.standardKey)standard.set(cell.dataset.standardKey,cell);
    });

    order.forEach(key=>{
      const cell=standard.get(key);
      if(cell)row.appendChild(cell);
    });
    custom.forEach(cell=>row.appendChild(cell));
    if(actions)row.appendChild(actions);
  });
}

function loadStandardColumnSettings(section){
  try{
    const stored=localStorage.getItem(standardColumnSettingsKey(section));
    const raw=stored?JSON.parse(stored):{};
    if(raw&&typeof raw==='object'&&Object.keys(raw).length)return raw;
    if(section==='HOLDINGS'){
      const visible=new Set(HOLDINGS_VIEW_PRESETS.RESULT),settings={};
      (STANDARD_COLUMN_DEFS.HOLDINGS||[]).forEach(def=>settings[def.key]={visible:def.locked?true:visible.has(def.key)});
      return settings;
    }
    return {};
  }catch{return{};}
}
function saveStandardColumnSettings(section,settings){
  try{localStorage.setItem(standardColumnSettingsKey(section),JSON.stringify(settings||{}));}catch{}
}
function sectionCustomColumns(section){
  return state.customColumns.filter(c=>String(c.section).toUpperCase()===section).sort((a,b)=>Number(a.sortOrder||100)-Number(b.sortOrder||100)||String(a.label).localeCompare(String(b.label)));
}
function customValueFor(section,recordId,columnKey){
  return state.customValues.find(v=>String(v.section).toUpperCase()===section&&String(v.recordId)===String(recordId)&&String(v.columnKey)===String(columnKey))?.value||'';
}
function customColumnByKey(section,key){
  return sectionCustomColumns(section).find(c=>String(c.columnKey)===String(key))||null;
}
function formatCustomValuePlain(column,value){
  if(value==null||String(value)==='')return '—';
  const type=String(column?.dataType||'TEXT').toUpperCase();
  if(type==='CURRENCY')return formatCurrency(Number(value));
  if(type==='PERCENT')return `${Number(value)>=0?'+':''}${Number(value).toFixed(2)}%`;
  if(type==='NUMBER')return Number(value).toLocaleString('en-IN',{maximumFractionDigits:4});
  if(type==='DATE')return detailDate(value);
  return String(value);
}
function formatCustomValue(column,value){
  const plain=formatCustomValuePlain(column,value);
  return String(column?.dataType||'TEXT').toUpperCase()==='TEXT'?escapeHtml(plain):plain;
}
function customCellsHtml(section,recordId){
  return sectionCustomColumns(section).map(c=>{
    const raw=customValueFor(section,recordId,c.columnKey);
    const shown=formatCustomValue(c,raw);
    return `<td class="custom-value-cell" data-custom-cell="1" data-custom-section="${section}" data-custom-record="${escapeHtml(recordId)}" data-custom-key="${escapeHtml(c.columnKey)}" title="Click to edit ${escapeHtml(c.label)}"><span>${shown}</span><i>✎</i></td>`;
  }).join('');
}
function resetCustomHeaders(section){
  const row=$(section==='HOLDINGS'?'holdingsHeadRow':'watchHeadRow');
  row?.querySelectorAll('.custom-column-head').forEach(x=>x.remove());
}
function appendCustomHeaders(section){
  const row=$(section==='HOLDINGS'?'holdingsHeadRow':'watchHeadRow');
  if(!row)return;
  resetCustomHeaders(section);
  const actionHead=row.lastElementChild;
  sectionCustomColumns(section).forEach(c=>{
    const th=document.createElement('th');
    th.className='custom-column-head';
    th.dataset.customKey=c.columnKey;
    th.textContent=c.label;
    th.title=`Custom parameter · ${c.dataType}`;
    row.insertBefore(th,actionHead);
  });
}
function applyStandardColumnSettings(section){
  const table=tableElementFor(section.toLowerCase());
  if(!table)return;
  annotateStandardColumnKeys(section);
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const settings=loadStandardColumnSettings(section);

  defs.forEach(def=>{
    const cfg=settings[def.key]||{};
    const cells=[...table.querySelectorAll(`[data-standard-key="${def.key}"]`)];
    cells.forEach((cell,rowIndex)=>{
      cell.classList.toggle('column-user-hidden',cfg.visible===false&&!def.locked);
      if(rowIndex===0){
        const label=String(cfg.label||def.label);
        if(def.key!=='actions'){
          const firstText=[...cell.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
          if(firstText)firstText.nodeValue=label;
        }
      }
    });
  });
}

function applyHoldingsSemanticGroups(){
  const table=tableElementFor('holdings');if(!table)return;
  annotateStandardColumnKeys('HOLDINGS');
  (STANDARD_COLUMN_DEFS.HOLDINGS||[]).forEach(def=>{
    table.querySelectorAll(`[data-standard-key="${def.key}"]`).forEach(cell=>{
      cell.classList.remove('trade-history-column','my-result-column','asset-performance-column','group-start');
      if(HOLDINGS_TRANSACTION_KEYS.has(def.key))cell.classList.add('trade-history-column');
      if(HOLDINGS_RESULT_KEYS.has(def.key))cell.classList.add('my-result-column');
      if(HOLDINGS_PERFORMANCE_KEYS.has(def.key))cell.classList.add('asset-performance-column');
      if(['purchaseDates','units','d1'].includes(def.key))cell.classList.add('group-start');
    });
  });
}
function renderStandardColumnsManager(section){
  if(!els.standardColumnsList)return;
  const settings=loadStandardColumnSettings(section);
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const byKey=new Map(defs.map(d=>[d.key,d]));
  const ordered=loadStandardColumnOrder(section).map(k=>byKey.get(k)).filter(Boolean);

  els.standardColumnsList.innerHTML=ordered.map((def,position)=>{
    const cfg=settings[def.key]||{};
    const visible=def.locked?true:cfg.visible!==false;
    const locked=Boolean(def.locked);
    return `<div class="column-config-row ${locked?'locked':''}" data-standard-column="${escapeHtml(def.key)}">
      <label class="column-visible-toggle" title="${locked?'Fixed column':'Untick to hide this column from the dashboard/default view'}"><input type="checkbox" data-standard-visible="${escapeHtml(def.key)}" ${visible?'checked':''} ${locked?'disabled':''}><span>${locked?'Fixed':'Show'}</span></label>
      <input class="column-label-input" data-standard-label="${escapeHtml(def.key)}" value="${escapeHtml(String(cfg.label||def.label))}" maxlength="80">
      <div class="standard-column-move-actions">
        <button type="button" class="column-move-button" data-move-standard="FRONT" data-column-key="${escapeHtml(def.key)}" ${locked?'disabled':''} title="Move near front">⇤ Front</button>
        <button type="button" class="column-move-button icon" data-move-standard="LEFT" data-column-key="${escapeHtml(def.key)}" ${locked?'disabled':''} title="Move one column left">←</button>
        <button type="button" class="column-move-button icon" data-move-standard="RIGHT" data-column-key="${escapeHtml(def.key)}" ${locked?'disabled':''} title="Move one column right">→</button>
      </div>
    </div>`;
  }).join('');
}
function resetCustomColumnForm(section=els.customColumnSection?.value||'HOLDINGS'){
  if(!els.customColumnForm)return;
  els.customColumnForm.reset();
  els.customColumnId.value='';
  els.customColumnSection.value=section;
  els.customColumnType.value='TEXT';
  els.customColumnOrder.value=String((sectionCustomColumns(section).length+1)*10);
  els.customColumnKey.disabled=false;
  els.saveCustomColumnBtn.textContent='Add column';
}
function renderCustomColumnsManager(section){
  const items=sectionCustomColumns(section);
  if(els.customColumnCount)els.customColumnCount.textContent=`${items.length} custom`;
  els.customColumnsEmpty?.classList.toggle('hidden',items.length>0);
  if(els.customColumnsList)els.customColumnsList.innerHTML=items.map(c=>`<div class="column-config-row custom" data-custom-column-id="${escapeHtml(c.id)}">
    <div class="custom-column-info"><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.columnKey)} · ${escapeHtml(c.dataType)} · order ${Number(c.sortOrder||100)}</span></div>
    <div class="column-config-actions"><button type="button" class="small-button" data-edit-custom-column="${escapeHtml(c.id)}">Edit</button><button type="button" class="small-button danger" data-delete-custom-column="${escapeHtml(c.id)}">Delete</button></div>
  </div>`).join('');
}
function renderColumnManager(section=els.customColumnSection?.value||'HOLDINGS'){
  if(els.customColumnSection)els.customColumnSection.value=section;
  if(els.columnManagerTitle)els.columnManagerTitle.textContent=`Manage ${section==='HOLDINGS'?'Holdings':'Watchlist'} columns`;
  renderStandardColumnsManager(section);
  renderCustomColumnsManager(section);
}
function openColumnManager(section){
  resetCustomColumnForm(section);
  renderColumnManager(section);
  openModal('columnManagerModal');
}
function editCustomColumn(id){
  const c=state.customColumns.find(x=>x.id===id);
  if(!c)return;
  els.customColumnId.value=c.id;
  els.customColumnSection.value=c.section;
  els.customColumnLabel.value=c.label;
  els.customColumnKey.value=c.columnKey;
  els.customColumnKey.disabled=true;
  els.customColumnType.value=c.dataType||'TEXT';
  els.customColumnOrder.value=String(c.sortOrder||100);
  els.saveCustomColumnBtn.textContent='Update column';
  renderColumnManager(c.section);
  setTimeout(()=>els.customColumnLabel?.focus(),30);
}
async function saveCustomColumn(event){
  event.preventDefault();
  const button=els.saveCustomColumnBtn;
  setBusy(button,true,'Saving…');
  try{
    const result=await api('saveCustomColumn',{column:{
      id:els.customColumnId.value,
      section:els.customColumnSection.value,
      label:els.customColumnLabel.value.trim(),
      columnKey:els.customColumnKey.value.trim(),
      dataType:els.customColumnType.value,
      sortOrder:Number(els.customColumnOrder.value)||100
    }});
    const section=els.customColumnSection.value;
    saveColumnWidths(section.toLowerCase(),{});
    clearPrintLayout(section.toLowerCase());
    applyBootstrap(result.data);saveCache(result.data);
    resetCustomColumnForm(section);renderColumnManager(section);
    toast('Custom column saved. Column widths reset once so the new structure fits correctly.','success');
  }catch(e){toast(e.message,'error');}
  finally{setBusy(button,false);}
}
async function deleteCustomColumn(id){
  const c=state.customColumns.find(x=>x.id===id);
  if(!c||!confirm(`Delete custom column “${c.label}” and its saved values?`))return;
  try{
    const result=await api('deleteCustomColumn',{id});
    saveColumnWidths(c.section.toLowerCase(),{});
    clearPrintLayout(c.section.toLowerCase());
    applyBootstrap(result.data);saveCache(result.data);renderColumnManager(c.section);
    toast('Custom column deleted. Column widths reset once so the remaining columns align correctly.','success');
  }catch(e){toast(e.message,'error');}
}
function openCustomValueEditor(section,recordId,columnKey){
  const c=customColumnByKey(section,columnKey);
  if(!c)return;
  const record=section==='HOLDINGS'?state.holdings.find(x=>x.id===recordId):state.watchlist.find(x=>x.id===recordId);
  if(!record)return;
  els.customValueSection.value=section;
  els.customValueRecordId.value=recordId;
  els.customValueColumnKey.value=columnKey;
  els.customValueTitle.textContent=c.label;
  els.customValueRecord.textContent=record.assetName||record.code||'Selected row';
  els.customValueFieldLabel.firstChild.nodeValue=`${c.label} `;
  els.customValueInput.type=c.dataType==='DATE'?'date':(['NUMBER','CURRENCY','PERCENT'].includes(c.dataType)?'number':'text');
  els.customValueInput.step=['NUMBER','CURRENCY','PERCENT'].includes(c.dataType)?'any':'';
  els.customValueInput.value=customValueFor(section,recordId,columnKey);
  openModal('customValueModal');
  setTimeout(()=>els.customValueInput?.focus(),50);
}
async function saveCustomValue(event){
  event.preventDefault();
  const button=els.saveCustomValueBtn;
  setBusy(button,true,'Saving…');
  try{
    const result=await api('saveCustomValue',{
      section:els.customValueSection.value,
      recordId:els.customValueRecordId.value,
      columnKey:els.customValueColumnKey.value,
      value:els.customValueInput.value
    });
    closeModals();applyBootstrap(result.data);saveCache(result.data);
    toast('Custom value saved.','success');
  }catch(e){toast(e.message,'error');}
  finally{setBusy(button,false);}
}
function saveStandardColumnChange(section,key,patch){
  const defs=STANDARD_COLUMN_DEFS[section]||[];
  const def=defs.find(d=>d.key===key);
  if(!def)return;
  const settings=loadStandardColumnSettings(section);
  settings[key]={...(settings[key]||{}),...patch};
  if(def.locked)settings[key].visible=true;
  saveStandardColumnSettings(section,settings);
  if(section==='HOLDINGS')renderHoldings();else renderWatchlist();
  renderStandardColumnsManager(section);
}
function resetStandardColumns(section){
  try{localStorage.removeItem(standardColumnSettingsKey(section));localStorage.removeItem(standardColumnOrderKey(section));}catch{}
  saveColumnWidths(section.toLowerCase(),{});
  if(section==='HOLDINGS')renderHoldings();else renderWatchlist();
  renderStandardColumnsManager(section);
  toast('Standard column names, visibility and order reset.','success');
}


function exactDateList(values){
  return [...new Set((Array.isArray(values)?values:[]).map(x=>String(x||'').trim()).filter(Boolean))].sort();
}

function parseNavDate(value){
  if(!value)return null;
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
  const raw=String(value).trim();
  let d=null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))d=new Date(raw+'T00:00:00');
  else if(/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(raw)){
    const [dd,mon,yyyy]=raw.split('-');
    const months={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
    d=new Date(Number(yyyy),months[String(mon).toUpperCase()]??0,Number(dd),0,0,0);
  }else d=new Date(raw);
  return d&&Number.isFinite(d.getTime())?d:null;
}
function businessDayLag(value){
  const d=parseNavDate(value);
  if(!d)return null;
  const end=new Date();end.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  if(d>=end)return 0;
  let count=0,cursor=new Date(d);
  while(cursor<end&&count<40){
    cursor.setDate(cursor.getDate()+1);
    const day=cursor.getDay();
    if(day!==0&&day!==6)count++;
  }
  return count;
}
function mfNavStatus(item){
  if(String(item?.type||'').toUpperCase()!=='MF')return {cls:'',label:'',title:''};
  if(item.manualOverride||String(item.priceSource||'').toLowerCase().includes('manual')){
    return {cls:'manual',label:'MANUAL OVERRIDE',title:'A manual NAV is overriding the automatic AMFI NAV for this row.'};
  }
  if(item.currentPrice==null||!Number.isFinite(Number(item.currentPrice))){
    return {cls:'stale',label:'NAV PENDING',title:'No usable MF NAV is available yet. The backend automatically tries AMFI and then MFAPI fallback.'};
  }
  const lag=businessDayLag(item.priceDate);
  if(lag===null){
    return {cls:'stale',label:'DATE UNKNOWN',title:'NAV is present but the AMFI NAV date is missing.'};
  }
  if(lag>2){
    return {cls:'stale',label:`STALE NAV · ${lag} business days`,title:`Latest NAV date: ${detailDate(item.priceDate)}`};
  }
  return {cls:'fresh',label:`AMFI · ${detailDate(item.priceDate)}`,title:`Automatic AMFI NAV is current (${lag} business-day lag).`};
}
function priceCellHtml(item){
  const status=mfNavStatus(item);
  const source=escapeHtml(item.priceSource||'Pending');
  const date=item.priceDate?` · ${escapeHtml(detailDate(item.priceDate))}`:'';
  if(String(item.type||'').toUpperCase()!=='MF'){
    return `${formatCurrency(item.currentPrice)}<span class="price-note">${source}${date}</span>`;
  }
  return `${formatCurrency(item.currentPrice)}<span class="price-note">${source}${date}</span><span class="mf-nav-status ${status.cls}" title="${escapeHtml(status.title)}">${escapeHtml(status.label)}</span>`;
}
function renderMfNavHealth(){
  if(!els.mfNavHealthBadge)return;
  const all=[...(state.holdings||[]),...(state.watchlist||[])].filter(x=>String(x.type||'').toUpperCase()==='MF');
  if(!all.length){
    if(state.token&&!state.startupPortfolioLoaded){
      els.mfNavHealthBadge.textContent='Loading holdings…';
      els.mfNavHealthBadge.className='mf-nav-health neutral';
      return;
    }
    els.mfNavHealthBadge.textContent='No MF tracked';
    els.mfNavHealthBadge.className='mf-nav-health neutral';
    return;
  }
  let fresh=0,stale=0,manual=0,pending=0;
  all.forEach(x=>{
    const s=mfNavStatus(x);
    if(s.cls==='fresh')fresh++;
    else if(s.cls==='manual')manual++;
    else if(String(s.label).includes('PENDING'))pending++;
    else stale++;
  });
  const parts=[`${fresh} fresh`];
  if(stale)parts.push(`${stale} stale`);
  if(pending)parts.push(`${pending} pending`);
  if(manual)parts.push(`${manual} manual`);
  els.mfNavHealthBadge.textContent=`MF NAV · ${parts.join(' · ')}`;
  els.mfNavHealthBadge.className=`mf-nav-health ${(stale||pending)?'stale':manual?'manual':'fresh'}`;
}
function holdingPurchaseDatesHtml(h){
  if(h?.type==='GPF'){
    return h.balanceAsOfDate
      ? `<div class="trade-date-stack purchase"><strong>${escapeHtml(detailDate(h.balanceAsOfDate))}</strong><span>Balance as on</span></div>`
      : '<div class="trade-date-missing"><strong>Date not set</strong><span>Edit GPF balance date</span></div>';
  }
  const s=h?.transactionStats||{};
  const dates=exactDateList(s.purchaseDates);
  if(!dates.length&&h.buyDate)dates.push(String(h.buyDate));
  if(!dates.length){
    return `<div class="trade-date-missing"><strong>No transaction date</strong><span>${h.type==='MF'?'Import MF transaction statement':'Import broker tradebook'}</span></div>`;
  }
  const first=dates[0],latest=dates[dates.length-1];
  if(dates.length===1){
    return `<div class="trade-date-stack purchase"><strong>${escapeHtml(detailDate(first))}</strong><span>Exact BUY date</span></div>`;
  }
  return `<div class="trade-date-stack purchase" title="${escapeHtml(dates.map(detailDate).join(' · '))}">
    <strong>${escapeHtml(detailDate(first))}</strong><span>First BUY</span>
    <strong>${escapeHtml(detailDate(latest))}</strong><span>Latest BUY · ${dates.length} dates</span>
  </div>`;
}
function holdingSaleDatesHtml(h){
  if(h?.type==='GPF')return '<div class="trade-date-stack no-sale"><strong>—</strong><span>Not applicable to GPF</span></div>';
  const s=h?.transactionStats||{};
  const dates=exactDateList(s.saleDates);
  if(!dates.length)return `<div class="trade-date-stack no-sale"><strong>—</strong><span>No sale/redemption recorded</span></div>`;
  const latest=dates[dates.length-1];
  return `<div class="trade-date-stack sale" title="${escapeHtml(dates.map(detailDate).join(' · '))}">
    <strong>${escapeHtml(detailDate(latest))}</strong>
    <span>${dates.length===1?'Exact SALE date':`Latest SALE · ${dates.length} sale dates`}</span>
  </div>`;
}
function pnlMoneyHtml(value,options={}){
  const complete=options.complete!==false;
  if(value===null||value===undefined||!Number.isFinite(Number(value))){
    return `<span class="holding-pnl-pill neutral" title="${escapeHtml(options.title||'Value unavailable')}">—</span>`;
  }
  const n=Number(value),cls=n>0?'profit':n<0?'loss':'neutral';
  return `<span class="holding-pnl-pill ${cls}" ${complete?'':`title="Partial/incomplete transaction history"`}>${escapeHtml(formatHoldingValue(n))}${complete?'':' *'}</span>`;
}
function setPnlSummaryValue(el,value,complete=true){
  if(!el)return;
  el.classList.remove('profit','loss','neutral','partial');
  if(value===null||value===undefined||!Number.isFinite(Number(value))){
    el.textContent='—';el.classList.add('neutral');return;
  }
  const n=Number(value);
  el.textContent=formatHoldingValue(n)+(complete?'':' *');
  el.classList.add(n>0?'profit':n<0?'loss':'neutral');
  if(!complete)el.classList.add('partial');
}
function renderHoldingsPnlStrip(items){
  if(!els.holdCurrentPnlToday)return;
  const rows=Array.isArray(items)?items:[];
  if(!rows.length&&state.token&&!state.startupPortfolioLoaded){
    [els.holdCurrentPnlToday,els.holdRealizedPnl,els.holdTotalPnlToDate].forEach(el=>{
      if(el){el.textContent='Updating…';el.classList.remove('profit','loss','partial');el.classList.add('neutral');}
    });
    if(els.holdTradeDateCoverage)els.holdTradeDateCoverage.textContent='Updating…';
    if(els.holdPnlAsOf)els.holdPnlAsOf.textContent='Loading the complete portfolio; no zero value has been assumed.';
    return;
  }
  const pnlRows=rows.filter(h=>h.type!=='GPF');
  const currentKnown=pnlRows.filter(h=>h.gainLoss!==null&&h.gainLoss!==undefined&&Number.isFinite(Number(h.gainLoss)));
  const current=currentKnown.reduce((sum,h)=>sum+Number(h.gainLoss||0),0);
  let realised=0,realisedComplete=true,transactionDetailsPending=false;
  pnlRows.forEach(h=>{
    const s=h.transactionStats||{};
    if(s.partial===true)transactionDetailsPending=true;
    if(Number(s.saleCount||0)>0&&s.realizedPnlComplete===false)realisedComplete=false;
    if(h.realizedPnl!==null&&h.realizedPnl!==undefined&&Number.isFinite(Number(h.realizedPnl)))realised+=Number(h.realizedPnl);
  });
  realisedComplete=realisedComplete&&!transactionDetailsPending;
  const totalComplete=realisedComplete&&currentKnown.length===pnlRows.length;
  const total=totalComplete?current+realised:null;
  const covered=pnlRows.filter(h=>Number(h.transactionStats?.transactionCount||0)>0||h.buyDate).length;
  setPnlSummaryValue(els.holdCurrentPnlToday,currentKnown.length?current:null,currentKnown.length===pnlRows.length);
  setPnlSummaryValue(els.holdRealizedPnl,realisedComplete?realised:null,realisedComplete);
  setPnlSummaryValue(els.holdTotalPnlToDate,total,totalComplete);
  els.holdTradeDateCoverage.textContent=`${covered} / ${pnlRows.length}`;
  const priceDates=pnlRows.map(h=>String(h.priceDate||'')).filter(Boolean).sort();
  const latestPriceDate=priceDates.length?priceDates[priceDates.length-1]:'';
  els.holdPnlAsOf.textContent=latestPriceDate?`*Latest available price/NAV date: ${detailDate(latestPriceDate)}`:'*Using latest available price/NAV; some prices may be pending';
}
function drawerExactDatesBlock(label,dates,kind){
  const list=exactDateList(dates);
  if(!list.length)return `<div class="drawer-date-list ${kind}"><span>${escapeHtml(label)}</span><em>None recorded</em></div>`;
  return `<div class="drawer-date-list ${kind}"><span>${escapeHtml(label)}</span><div>${list.map(d=>`<b>${escapeHtml(detailDate(d))}</b>`).join('')}</div></div>`;
}

const HOLDINGS_SUMMARY_PREF_KEY='myfinance_holdings_summary_open_v1';

function holdingsSummaryOpenPreference(){
  // Default is hidden. Once the user chooses, remember the preference.
  try{return localStorage.getItem(HOLDINGS_SUMMARY_PREF_KEY)==='1';}catch{return false;}
}
function saveHoldingsSummaryPreference(open){
  try{localStorage.setItem(HOLDINGS_SUMMARY_PREF_KEY,open?'1':'0');}catch{}
}
function applyHoldingsSummaryState(open,{save=false,scroll=false}={}){
  const panel=els.holdingsSummaryPanel;
  const btn=els.toggleHoldingsSummaryBtn;
  if(!panel||!btn)return;

  panel.classList.toggle('is-collapsed',!open);
  panel.setAttribute('aria-hidden',open?'false':'true');

  btn.setAttribute('aria-expanded',open?'true':'false');
  btn.textContent=open?'▴ Hide Holding Summary':'▾ Show Holding Summary';
  btn.classList.toggle('active',open);

  if(save)saveHoldingsSummaryPreference(open);

  if(open&&scroll){
    requestAnimationFrame(()=>{
      const top=panel.getBoundingClientRect().top+window.scrollY-84;
      window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
    });
  }

  setTimeout(scheduleDashboardHScrollRefresh,180);
}
function toggleHoldingsSummary(){
  const open=els.holdingsSummaryPanel?.classList.contains('is-collapsed');
  applyHoldingsSummaryState(Boolean(open),{save:true,scroll:Boolean(open)});
}
function hideHoldingsSummary(){
  applyHoldingsSummaryState(false,{save:true});
}
function restoreHoldingsSummaryState(){
  // Requested default on both desktop and mobile: start collapsed every fresh page/login.
  // The existing Show/Hide button still works normally during the session.
  applyHoldingsSummaryState(false,{save:false});
}


function inlineHoldingEditorHtml(h){
  const owners=configuredOwners();
  const currentOwner=canonicalOwner(h.owner);
  const ownerList=owners.includes(currentOwner)?owners:[currentOwner,...owners].filter(Boolean);
  const ownerOptions=ownerList.map(o=>`<option value="${escapeHtml(o)}"${currentOwner===o?' selected':''}>${escapeHtml(shortOwner(o))}</option>`).join('');
  const typeOptions=['MF','STOCK','ETF','OTHER'].map(t=>`<option value="${t}"${h.type===t?' selected':''}>${t==='MF'?'Mutual Fund':t==='STOCK'?'Stock':t==='ETF'?'ETF':'Other'}</option>`).join('');

  return `<tr class="inline-holding-edit-row" data-inline-editor-row="${escapeHtml(h.id)}">
    <td colspan="99">
      <div class="inline-holding-editor">
        <div class="inline-editor-head">
          <div>
            <strong>Direct row edit</strong>
            <span>Edit the main investment fields here. The normal Edit button remains available for the full popup.</span>
          </div>
          <div class="inline-editor-head-actions">
            <button type="button" class="small-button" data-inline-cancel-holding="${escapeHtml(h.id)}">Cancel</button>
            <button type="button" class="primary-button inline-save-button" data-inline-save-holding="${escapeHtml(h.id)}">Save row</button>
          </div>
        </div>

        <div class="inline-editor-grid">
          <label>Investor
            <select data-inline-field="owner">${ownerOptions}</select>
          </label>

          <label>Type
            <select data-inline-field="type">${typeOptions}</select>
          </label>

          <label class="inline-wide">Asset / Scheme Name
            <input data-inline-field="assetName" type="text" maxlength="160" value="${escapeHtml(h.assetName||'')}">
          </label>

          <label>Code / AMFI
            <input data-inline-field="code" type="text" maxlength="80" value="${escapeHtml(h.code||'')}">
          </label>

          <label>Exchange
            <select data-inline-field="exchange">
              <option value=""${!h.exchange?' selected':''}>—</option>
              <option value="NSE"${h.exchange==='NSE'?' selected':''}>NSE</option>
              <option value="BSE"${h.exchange==='BSE'?' selected':''}>BSE</option>
            </select>
          </label>

          <label>Units / Qty
            <input data-inline-field="units" type="number" min="0.00000001" step="any" value="${escapeHtml(h.units??'')}">
          </label>

          <label>Invested Amount
            <input data-inline-field="investedAmount" type="number" min="0" step="0.01" value="${escapeHtml(h.investedAmount??'')}">
          </label>

          <label>Manual Price / NAV
            <input data-inline-field="manualPrice" type="number" min="0" step="any" value="${escapeHtml(h.manualPrice??'')}">
          </label>

          <label>Buy Date
            <input data-inline-field="buyDate" type="date" value="${escapeHtml(h.buyDate||'')}">
          </label>

          <label class="inline-note">Personal Note
            <textarea data-inline-field="notes" rows="2" maxlength="500">${escapeHtml(h.notes||'')}</textarea>
          </label>
        </div>
      </div>
    </td>
  </tr>`;
}

function inlineEditorRow(id){
  return Array.from(document.querySelectorAll('[data-inline-editor-row]'))
    .find(row=>String(row.dataset.inlineEditorRow)===String(id))||null;
}

function openInlineHoldingEdit(id){
  const wrap=tableScrollWrap('holdings');
  const left=wrap?.scrollLeft||0;
  state.inlineEditHoldingId=String(id||'');
  renderHoldings();
  requestAnimationFrame(()=>{
    const nextWrap=tableScrollWrap('holdings');
    if(nextWrap)nextWrap.scrollLeft=left;
    const row=inlineEditorRow(state.inlineEditHoldingId);
    row?.scrollIntoView({block:'nearest',behavior:'smooth'});
    row?.querySelector('[data-inline-field="assetName"]')?.focus();
  });
}

function closeInlineHoldingEdit(){
  const wrap=tableScrollWrap('holdings');
  const left=wrap?.scrollLeft||0;
  state.inlineEditHoldingId='';
  renderHoldings();
  requestAnimationFrame(()=>{
    const nextWrap=tableScrollWrap('holdings');
    if(nextWrap)nextWrap.scrollLeft=left;
  });
}

async function saveInlineHolding(id,button){
  const h=state.holdings.find(x=>String(x.id)===String(id));
  const row=inlineEditorRow(id);
  if(!h||!row)return;

  const value=name=>row.querySelector(`[data-inline-field="${name}"]`)?.value ?? '';
  const assetName=String(value('assetName')).trim();
  const code=String(value('code')).trim().toUpperCase();
  const units=Number(value('units'));
  const investedAmount=Number(value('investedAmount'));
  const manualRaw=value('manualPrice');
  const manualPrice=manualRaw===''?null:Number(manualRaw);

  if(!assetName){toast('Asset / Scheme Name is required.','error');return;}
  if(!code){toast('Code / AMFI is required.','error');return;}
  if(!Number.isFinite(units)||units<=0){toast('Units / Qty must be greater than zero.','error');return;}
  if(!Number.isFinite(investedAmount)||investedAmount<0){toast('Enter a valid Invested Amount.','error');return;}
  if(manualPrice!==null&&(!Number.isFinite(manualPrice)||manualPrice<0)){toast('Manual Price / NAV cannot be negative.','error');return;}

  setBusy(button,true,'Saving…');
  try{
    const type=String(value('type')||'').toUpperCase();
    const result=await api('saveHolding',{holding:{
      id:h.id,
      owner:value('owner'),
      type,
      assetName,
      code,
      exchange:['MF','OTHER'].includes(type)?'':value('exchange'),
      units,
      investedAmount,
      manualPrice,
      buyDate:value('buyDate'),
      notes:String(value('notes')).trim(),
      sourceCode:h.sourceCode||''
    }});

    state.inlineEditHoldingId='';
    applyBootstrap(result.data);
    saveCache(result.data);
    toast('Investment row saved.','success');
  }catch(error){
    toast(error.message,'error');
  }finally{
    setBusy(button,false);
  }
}

function renderHoldings(){
  renderHoldingsSummary();
  resetCustomHeaders('HOLDINGS');
  applyTableSize('holdings');
  const items=state.holdings.filter(holdingMatches);
  if(els.holdingsFilterCount)els.holdingsFilterCount.textContent=`${items.length} visible`;
  renderHoldingsPnlStrip(items);
  renderMfNavHealth();
  els.holdingsBody.innerHTML=items.map(h=>{
    const isGpf=h.type==='GPF';
    const avg=(!isGpf&&Number(h.units)>0?Number(h.investedAmount)/Number(h.units):null),p=h.performance||{},s=h.transactionStats||{};
    const realisedComplete=s.realizedPnlComplete!==false;
    const totalComplete=realisedComplete&&h.totalPnlToDate!==null&&h.totalPnlToDate!==undefined;
    const badge=h.type==='MF'?'MF':h.type==='ETF'?'ET':h.type==='GPF'?'GP':h.type==='OTHER'?'OT':'ST';
    const assetMeta=isGpf
      ? `${formatCurrency(h.monthlyContribution,true)} / month · ${Number(h.annualInterestRate||0).toFixed(2)}% p.a.`
      : `${h.exchange?`${h.exchange}:`:''}${h.code}${h.sourceCode?` · stmt ${h.sourceCode}`:''}`;
    const priceHtml=isGpf
      ? `<div class="price-main"><strong>${Number(h.annualInterestRate||0).toFixed(2)}%</strong><span>annual interest</span></div>`
      : priceCellHtml(h);
    const mainRow=`<tr class="holding-row" data-view-holding="${escapeHtml(h.id)}" tabindex="0" aria-label="View details for ${escapeHtml(h.assetName)}">
      <td class="sticky-col owner-col"><span class="owner-tag">${escapeHtml(shortOwner(h.owner))}</span></td>
      <td class="sticky-col asset-col"><div class="asset-cell"><div class="asset-badge ${String(h.type).toLowerCase()}">${escapeHtml(badge)}</div><div><strong>${escapeHtml(h.assetName)}</strong><span>${escapeHtml(assetMeta)}</span></div></div></td>
      <td class="holding-trade-date-cell purchase-date-cell">${holdingPurchaseDatesHtml(h)}</td>
      <td class="holding-trade-date-cell sale-date-cell">${holdingSaleDatesHtml(h)}</td>
      <td>${isGpf?'—':formatNumber(h.units)}</td><td>${isGpf?'—':formatCurrency(avg)}</td><td>${formatHoldingValue(h.investedAmount)}</td>
      <td class="price-cell">${priceHtml}</td>
      <td><strong>${formatHoldingValue(h.currentValue)}</strong></td>
      <td class="current-pnl-cell">${pnlMoneyHtml(h.gainLoss,{title:'Current market value minus current cost basis'})}</td>
      <td class="realised-pnl-cell">${pnlMoneyHtml(h.realizedPnl,{complete:realisedComplete,title:realisedComplete?'FIFO realised P/L from recorded sales':'Import complete buy history to calculate realised P/L'})}</td>
      <td class="total-pnl-cell">${pnlMoneyHtml(h.totalPnlToDate,{complete:totalComplete,title:totalComplete?'Current P/L + realised P/L':'Complete transaction history required'})}</td>
      <td class="${pnlClass(h.returnPct)}"><strong>${formatPercent(h.returnPct)}</strong></td><td class="${pnlClass(h.xirr)}">${formatPercent(h.xirr)}</td>
      ${perfCell(p.d1)}${perfCell(p.w1)}${perfCell(p.m1)}${perfCell(p.m6)}${perfCell(p.y1)}${perfCell(p.y3)}${perfCell(p.y5)}${perfCell(p.y10)}
      <td class="personal-note-cell" data-note-cell="${escapeHtml(h.id)}">${notePreview(h.notes)}</td>${customCellsHtml('HOLDINGS',h.id)}
      <td class="row-actions"><button class="small-button view-button" data-view-holding-button="${escapeHtml(h.id)}">View</button>${isGpf?'':`<button class="small-button quick-edit-button" data-inline-edit-holding="${escapeHtml(h.id)}">Row edit</button>`}<button class="small-button" data-edit-holding="${escapeHtml(h.id)}">Edit</button><button class="small-button danger" data-delete-holding="${escapeHtml(h.id)}">Delete</button></td>
    </tr>`;
    return mainRow+(state.inlineEditHoldingId===String(h.id)?inlineHoldingEditorHtml(h):'');
  }).join('');
  els.holdingsEmpty.classList.toggle('hidden',items.length>0);
  if(!items.length)els.holdingsEmpty.textContent=state.token&&!state.startupPortfolioLoaded?'Loading your holdings…':'No holdings match this view.';
  appendCustomHeaders('HOLDINGS');applyStandardColumnOrder('HOLDINGS');applyStandardColumnSettings('HOLDINGS');applyHoldingsSemanticGroups();if(els.holdingsViewPreset)els.holdingsViewPreset.value=holdingsPresetFromCurrent();installColumnResizers('holdings');applyStoredColumnWidths('holdings');bindTableScrollPersistence('holdings');restoreTableScroll('holdings');scheduleDashboardHScrollRefresh();
}
function transactionHoldingPeriod(days){
  const n=Number(days);
  if(!Number.isFinite(n)||n<0)return '—';
  if(n<31)return `${Math.round(n)} day${Math.round(n)===1?'':'s'}`;
  if(n<365)return `${Math.floor(n/30)}m ${Math.round(n%30)}d`;
  const y=Math.floor(n/365),m=Math.floor((n%365)/30);
  return `${y}y ${m}m`;
}
function visibleTransactions(){
  const q=String(els.transactionSearch?.value||'').trim().toLowerCase();
  const owner=els.transactionOwnerFilter?.value||'ALL';
  const asset=els.transactionAssetFilter?.value||'ALL';
  const side=els.transactionSideFilter?.value||'ALL';
  const from=els.transactionFromDate?.value||'';
  const to=els.transactionToDate?.value||'';

  return (state.transactions||[]).filter(t=>{
    if(owner!=='ALL'&&canonicalOwner(t.owner)!==canonicalOwner(owner))return false;
    if(asset!=='ALL'&&String(t.assetType||'').toUpperCase()!==asset)return false;
    if(side!=='ALL'&&String(t.side||'').toUpperCase()!==side)return false;
    const d=String(t.tradeDate||'');
    if(from&&d<from)return false;
    if(to&&d>to)return false;
    const hay=`${t.owner||''} ${t.assetType||''} ${t.assetName||''} ${t.code||''} ${t.side||''} ${t.transactionType||''} ${t.broker||''}`.toLowerCase();
    return !q||hay.includes(q);
  });
}
function refreshTransactionOwnerFilter(){
  if(!els.transactionOwnerFilter)return;
  const current=els.transactionOwnerFilter.value||'ALL';
  const owners=[...new Set((state.transactions||[]).map(t=>canonicalOwner(t.owner)).filter(Boolean))];
  els.transactionOwnerFilter.innerHTML='<option value="ALL">All investors</option>'+owners.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(shortOwner(o))}</option>`).join('');
  if(current==='ALL'||owners.includes(current))els.transactionOwnerFilter.value=current;
}
function renderTransactions(){
  if(!els.transactionBody)return;
  refreshTransactionOwnerFilter();
  const items=visibleTransactions();

  const buys=items.filter(t=>t.side==='BUY');
  const sells=items.filter(t=>t.side==='SELL');
  const buyTotal=buys.reduce((s,t)=>s+(Number(t.amount)||0),0);
  const saleTotal=sells.reduce((s,t)=>s+(Number(t.amount)||0),0);
  const realized=items.reduce((s,t)=>s+(Number.isFinite(Number(t.realizedPnl))?Number(t.realizedPnl):0),0);
  const realizedCount=items.filter(t=>t.realizedPnl!==null&&t.realizedPnl!==undefined&&Number.isFinite(Number(t.realizedPnl))).length;

  if(els.transactionBuyTotal)els.transactionBuyTotal.textContent=formatCurrency(buyTotal,true);
  if(els.transactionSaleTotal)els.transactionSaleTotal.textContent=formatCurrency(saleTotal,true);
  if(els.transactionRealizedPnl){
    els.transactionRealizedPnl.textContent=realizedCount?formatCurrency(realized,true):'—';
    els.transactionRealizedPnl.className=pnlClass(realized);
  }
  if(els.transactionCount)els.transactionCount.textContent=String(items.length);
  if(els.transactionFilterCount)els.transactionFilterCount.textContent=`${items.length} visible`;

  els.transactionBody.innerHTML=items.map(t=>{
    const sale=t.side==='SELL',buy=t.side==='BUY';
    const sideClass=sale?'sale':buy?'buy':'other';
    const realizedClass=pnlClass(t.realizedPnl);
    return `<tr class="transaction-row ${sideClass}">
      <td>${detailDate(t.tradeDate)}</td>
      <td><span class="owner-tag">${escapeHtml(shortOwner(t.owner))}</span></td>
      <td><span class="transaction-asset-badge ${String(t.assetType||'').toLowerCase()}">${escapeHtml(t.assetType||'—')}</span></td>
      <td><div class="transaction-asset"><strong>${escapeHtml(t.assetName||t.code||'—')}</strong><span>${escapeHtml(t.code||'')}</span></div></td>
      <td><strong class="transaction-side ${sideClass}">${sale?'SALE':buy?'BUY':escapeHtml(t.side||'OTHER')}</strong><span class="transaction-type-detail">${escapeHtml(t.transactionType||'')}</span></td>
      <td>${formatNumber(t.units,6)}</td>
      <td>${formatCurrency(t.price)}</td>
      <td><strong>${formatCurrency(t.amount)}</strong></td>
      <td class="${realizedClass}"><strong>${t.realizedPnl==null?'—':formatCurrency(t.realizedPnl)}</strong></td>
      <td>${transactionHoldingPeriod(t.holdingDays)}</td>
      <td>${escapeHtml(t.broker||t.source||'—')}</td>
    </tr>`;
  }).join('');
  els.transactionEmpty.classList.toggle('hidden',items.length>0);
  scheduleDashboardHScrollRefresh();
}
function printTransactionsView(){
  const items=visibleTransactions();
  if(!items.length){toast('No transactions to print.','error');return;}
  const rows=items.map(t=>`<tr>
    <td>${escapeHtml(detailDate(t.tradeDate))}</td><td>${escapeHtml(shortOwner(t.owner))}</td><td>${escapeHtml(t.assetType||'')}</td>
    <td>${escapeHtml(t.assetName||t.code||'')}</td><td class="${t.side==='SELL'?'negative':t.side==='BUY'?'positive':''}">${escapeHtml(t.side==='SELL'?'SALE':t.side||'')}</td>
    <td>${escapeHtml(formatNumber(t.units,6))}</td><td>${escapeHtml(formatCurrency(t.price))}</td><td>${escapeHtml(formatCurrency(t.amount))}</td>
    <td class="${pnlClass(t.realizedPnl)}">${escapeHtml(t.realizedPnl==null?'—':formatCurrency(t.realizedPnl))}</td><td>${escapeHtml(transactionHoldingPeriod(t.holdingDays))}</td>
  </tr>`).join('');
  openPrintPreview(
    'Transactions',
    `${items.length} filtered transactions · sale rows shown in red`,
    `<table><thead><tr><th>Date</th><th>Investor</th><th>Type</th><th>Asset</th><th>Buy/Sale</th><th>Qty/Units</th><th>Price</th><th>Amount</th><th>Realised P/L</th><th>Holding period</th></tr></thead><tbody>${rows}</tbody></table>`,
    'landscape'
  );
}

function sourcePerfCell(v){return `<td class="perf ${pnlClass(v)}">${formatPercent(v)}</td>`;}
function compactText(value,max=74){const c=String(value||'').replace(/\s+/g,' ').trim();if(!c)return '—';return c.length>max?`${c.slice(0,max-1)}…`:c;}
function renderWatchlist(){
  resetCustomHeaders('WATCHLIST');
  applyTableSize('watchlist');
  const items=visibleWatchlist();
  if(els.watchFilterCount)els.watchFilterCount.textContent=`${items.length} visible`;
  els.watchBody.innerHTML=items.map(x=>{
    const s=x.sourceDetails||{};
    const hl=(s.high52!=null||s.low52!=null)?`${formatCurrency(s.high52)} / ${formatCurrency(s.low52)}`:'—';
    return `<tr class="watch-row" data-view-watch="${escapeHtml(x.id)}" tabindex="0" aria-label="View watchlist details for ${escapeHtml(x.assetName)}">
      <td class="sticky-col asset-col"><div class="asset-cell"><div class="asset-badge ${String(x.type).toLowerCase()}">${escapeHtml(x.type==='MF'?'MF':x.type==='ETF'?'ET':x.type==='STOCK'?'ST':'OT')}</div><div><strong>${escapeHtml(x.assetName)}</strong><span>${escapeHtml(x.exchange?`${x.exchange}:`:'')}${escapeHtml(x.code)}</span></div></div></td>
      <td class="price-cell">${priceCellHtml(x)}</td>
      <td class="${pnlClass(s.snapshotChangePct)}">${formatPercent(s.snapshotChangePct)}</td>
      <td>${formatCurrency(x.targetPrice)}</td>
      <td class="${Number(x.distancePct)<=0?'positive':'neutral'}">${formatPercent(x.distancePct)}</td>
      <td>${hl}</td>
      <td>${escapeHtml(s.valuation||'—')}</td>
      ${sourcePerfCell(s.perf1M)}${sourcePerfCell(s.perf1Y)}${sourcePerfCell(s.perf3Y)}${sourcePerfCell(s.perf5Y)}${sourcePerfCell(s.perf10Y)}
      <td class="watch-source-remark" title="${escapeHtml(s.moatRemark||'')}">${escapeHtml(compactText(s.moatRemark,72))}</td>
      <td class="personal-note-cell" data-watch-note-cell="${escapeHtml(x.id)}">${notePreview(x.notes)}</td>
      ${customCellsHtml('WATCHLIST',x.id)}<td class="row-actions"><button class="small-button" data-view-watch-button="${escapeHtml(x.id)}">View</button><button class="small-button note-button" data-watch-note-button="${escapeHtml(x.id)}">📝 Note</button><button class="small-button" data-edit-watch="${escapeHtml(x.id)}">Edit</button><button class="small-button danger" data-delete-watch="${escapeHtml(x.id)}">Delete</button></td>
    </tr>`;
  }).join('');
  els.watchEmpty.classList.toggle('hidden',items.length>0);
  appendCustomHeaders('WATCHLIST');
  applyStandardColumnOrder('WATCHLIST');
  applyStandardColumnSettings('WATCHLIST');
  installColumnResizers('watchlist');
  applyStoredColumnWidths('watchlist');
  bindTableScrollPersistence('watchlist');
  restoreTableScroll('watchlist');
  scheduleDashboardHScrollRefresh();
}

/* V16.5 restored functions accidentally removed in V16.3 */
function renderUsers(){
  if(!els.usersBody)return;
  const current=String(state.user?.username||state.username||'').toLowerCase();

  els.usersBody.innerHTML=(state.users||[]).map(u=>{
    const username=String(u.username||'');
    const isSelf=username.toLowerCase()===current;
    const role=String(u.role||'USER').toUpperCase();
    const statusClass=u.active?'active':'disabled';

    return `<tr class="user-row ${isSelf?'is-current-user':''}">
      <td><strong>${escapeHtml(username)}</strong>${isSelf?'<span class="self-user-badge">You</span>':''}</td>
      <td>${escapeHtml(u.displayName||'—')}</td>
      <td><span class="user-role-badge ${role.toLowerCase()}">${escapeHtml(role)}</span></td>
      <td><span class="user-status-badge ${statusClass}">${u.active?'Active':'Disabled'}</span></td>
      <td>${escapeHtml(u.lastLogin||'—')}</td>
      <td class="row-actions user-row-actions">
        <button class="small-button user-edit-button" data-edit-user="${escapeHtml(username)}">Edit</button>
        <button class="small-button" data-reset-user="${escapeHtml(username)}">Reset password</button>
        <button class="small-button" data-toggle-user="${escapeHtml(username)}" data-active="${u.active?'false':'true'}" ${isSelf&&u.active?'title="Your own account cannot be disabled"':''}>${u.active?'Disable':'Enable'}</button>
        <button class="small-button danger user-delete-button" data-delete-user="${escapeHtml(username)}" ${isSelf?'disabled title="You cannot delete the account you are using"':''}>Delete</button>
      </td>
    </tr>`;
  }).join('');
}
function detailDate(value){
  if(!value)return '—';
  const raw=String(value);
  const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T00:00:00'):new Date(raw);
  return Number.isNaN(d.getTime())
    ? escapeHtml(raw)
    : new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(d);
}

function drawerMetric(label,value,valueClass=''){
  return `<div class="drawer-metric"><span>${escapeHtml(label)}</span><strong class="${valueClass}">${value}</strong></div>`;
}

function openHoldingDrawer(item){
  if(!item)return;
  state.drawerHoldingId=item.id;
  state.drawerWatchId='';
  state.drawerMode='HOLDING';
  if(els.drawerEyebrow)els.drawerEyebrow.textContent='INVESTMENT DETAILS';
  els.drawerEditBtn.textContent='Edit investment';
  const p=item.performance||{};
  const avg=Number(item.units)>0?Number(item.investedAmount)/Number(item.units):null;
  const isMf=item.type==='MF';
  const isGpf=item.type==='GPF';
  const priceLabel=isMf?'Current NAV':'Current price';
  const avgLabel=isMf?'Average cost / unit':'Avg buy price';
  const badge=isMf?'MF':item.type==='ETF'?'ETF':item.type==='STOCK'?'ST':isGpf?'GP':'₹';
  els.drawerAssetBadge.textContent=badge;
  els.drawerTitle.textContent=item.assetName||'Investment';
  els.drawerSubtitle.textContent=[shortOwner(item.owner),item.type,item.exchange?`${item.exchange}:${item.code}`:item.code].filter(Boolean).join(' · ');
  const perf=[['1D',p.d1],['1W',p.w1],['1M',p.m1],['6M',p.m6],['1Y',p.y1],['3Y',p.y3],['5Y',p.y5],['10Y',p.y10]];
  if(isGpf){
    const projection=item.gpfProjection||{};
    const present=Number(item.currentValue??item.investedAmount)||0;
    const monthly=Number(item.monthlyContribution)||0;
    const rate=Number(item.annualInterestRate)||0;
    els.drawerContent.innerHTML=`
      <section class="drawer-value-card gpf-drawer-value">
        <span class="drawer-value-label">Present GPF balance</span>
        <strong class="drawer-current-value">${formatCurrency(present,true)}</strong>
        <div class="drawer-gain-line"><span>${formatCurrency(monthly,true)} monthly payment</span><span class="drawer-gain-chip positive">${rate.toFixed(2)}% p.a.</span></div>
      </section>
      <section class="drawer-section gpf-projection-section">
        <div class="drawer-section-head"><h3 class="drawer-section-title">12-month projection</h3><span class="tiny muted">Estimate using monthly compounding</span></div>
        <div class="drawer-metric-grid">
          ${drawerMetric('Present balance',formatCurrency(present,true))}
          ${drawerMetric('Monthly payment',formatCurrency(monthly,true))}
          ${drawerMetric('Payments in 12 months',formatCurrency(projection.contributions||monthly*12,true))}
          ${drawerMetric('Estimated interest',formatCurrency(projection.estimatedInterest||0,true),'positive')}
          ${drawerMetric('Projected balance',formatCurrency(projection.projectedBalance||present+monthly*12,true),'positive')}
          ${drawerMetric('Annual interest rate',`${rate.toFixed(2)}%`)}
        </div>
        <p class="gpf-projection-note">Projection is an estimate. Actual GPF credit depends on the applicable government rate, contribution timing and account rules.</p>
      </section>
      <section class="drawer-section">
        <h3 class="drawer-section-title">Investment information</h3>
        <div class="drawer-info-list">
          <div class="drawer-info-row"><span>Investor</span><strong>${escapeHtml(shortOwner(item.owner))}</strong></div>
          <div class="drawer-info-row"><span>Asset type</span><strong>General Provident Fund</strong></div>
          <div class="drawer-info-row"><span>Balance as on</span><strong>${detailDate(item.balanceAsOfDate)}</strong></div>
          <div class="drawer-info-row"><span>Included in holding summary</span><strong>Yes · present balance</strong></div>
        </div>
      </section>
      <section class="drawer-section"><h3 class="drawer-section-title">Personal Note</h3><div class="drawer-notes ${item.notes?'':'drawer-notes-empty'}">${item.notes?escapeHtml(item.notes):'No personal note added yet. Use Edit investment to add one.'}</div></section>
    `;
    els.holdingDrawer.classList.add('open');
    els.holdingDrawerBackdrop.classList.add('open');
    els.holdingDrawer.setAttribute('aria-hidden','false');
    els.holdingDrawerBackdrop.setAttribute('aria-hidden','false');
    document.body.classList.add('drawer-open');
    setTimeout(()=>els.drawerCloseBtn?.focus(),50);
    return;
  }
  els.drawerContent.innerHTML=`
    <section class="drawer-value-card">
      <span class="drawer-value-label">Current value</span>
      <strong class="drawer-current-value">${formatCurrency(item.currentValue??item.investedAmount,true)}</strong>
      <div class="drawer-gain-line">
        <span class="${pnlClass(item.gainLoss)}">${item.gainLoss==null?'Current P/L pending':`${formatCurrency(item.gainLoss,true)} current P/L`}</span>
        <span class="drawer-gain-chip ${pnlClass(item.returnPct)}">${formatPercent(item.returnPct)}</span>
      </div>
    </section>
    <section class="drawer-section">
      <h3 class="drawer-section-title">Holding summary</h3>
      <div class="drawer-metric-grid">
        ${drawerMetric('Invested / cost value',formatCurrency(item.investedAmount,true))}
        ${drawerMetric('Units / quantity',formatNumber(item.units,6))}
        ${drawerMetric(avgLabel,formatCurrency(avg))}
        ${drawerMetric(priceLabel,formatCurrency(item.currentPrice))}
        ${drawerMetric('Current P/L till today',formatCurrency(item.gainLoss,true),pnlClass(item.gainLoss))}
        ${drawerMetric('Realised P/L',item.realizedPnl==null?'—':formatCurrency(item.realizedPnl,true),pnlClass(item.realizedPnl))}
        ${drawerMetric('Total P/L to date',item.totalPnlToDate==null?'—':formatCurrency(item.totalPnlToDate,true),pnlClass(item.totalPnlToDate))}
        ${drawerMetric('Total return',formatPercent(item.returnPct),pnlClass(item.returnPct))}
        ${isMf?drawerMetric('XIRR',formatPercent(item.xirr),pnlClass(item.xirr)):''}
        ${drawerMetric('Price source',escapeHtml(item.priceSource||'Pending'))}
      </div>
    </section>
    <section class="drawer-section">
      <h3 class="drawer-section-title">Performance</h3>
      <div class="drawer-performance">${perf.map(([label,value])=>`<div class="drawer-perf-item"><span>${label}</span><strong class="${pnlClass(value)}">${formatPercent(value)}</strong></div>`).join('')}</div>
    </section>
    <section class="drawer-section">
      <h3 class="drawer-section-title">Investment information</h3>
      <div class="drawer-info-list">
        <div class="drawer-info-row"><span>Investor</span><strong>${escapeHtml(shortOwner(item.owner))}</strong></div>
        <div class="drawer-info-row"><span>Asset type</span><strong>${escapeHtml(item.type||'—')}</strong></div>
        <div class="drawer-info-row"><span>${isMf?'AMFI code':'Symbol'}</span><strong>${escapeHtml(item.code||'—')}</strong></div>
        ${item.sourceCode?`<div class="drawer-info-row"><span>Statement code</span><strong>${escapeHtml(item.sourceCode)}</strong></div>`:''}
        ${item.exchange?`<div class="drawer-info-row"><span>Exchange</span><strong>${escapeHtml(item.exchange)}</strong></div>`:''}
        <div class="drawer-info-row"><span>Price date</span><strong>${detailDate(item.priceDate)}</strong></div>
        ${item.buyDate?`<div class="drawer-info-row"><span>Manual purchase date</span><strong>${detailDate(item.buyDate)}</strong></div>`:''}
        ${item.transactionStats?.firstPurchaseDate?`<div class="drawer-info-row"><span>First transaction purchase</span><strong>${detailDate(item.transactionStats.firstPurchaseDate)}</strong></div>`:''}
        ${item.transactionStats?.latestPurchaseDate?`<div class="drawer-info-row"><span>Latest purchase</span><strong>${detailDate(item.transactionStats.latestPurchaseDate)}</strong></div>`:''}
        ${item.transactionStats?.latestSaleDate?`<div class="drawer-info-row"><span>Latest sale</span><strong class="negative">${detailDate(item.transactionStats.latestSaleDate)}</strong></div>`:''}
        ${item.transactionStats?.transactionCount?`<div class="drawer-info-row"><span>Transactions recorded</span><strong>${item.transactionStats.transactionCount}</strong></div>`:''}
      </div>
    </section>
    <section class="drawer-section exact-trade-dates-section">
      <h3 class="drawer-section-title">Exact purchase &amp; sale dates</h3>
      <p class="tiny muted">For MF SIPs and multiple stock buys, all recorded dates are listed below.</p>
      ${drawerExactDatesBlock('Purchase / BUY dates',item.transactionStats?.purchaseDates?.length?item.transactionStats.purchaseDates:(item.buyDate?[item.buyDate]:[]),'purchase')}
      ${drawerExactDatesBlock('Sale / redemption dates',item.transactionStats?.saleDates||[],'sale')}
      ${item.transactionStats?.saleCount&&item.transactionStats?.realizedPnlComplete===false?`<div class="drawer-history-warning">Realised P/L is incomplete because the recorded sale does not have enough earlier BUY history. Import the complete broker/MF transaction history.</div>`:''}
    </section>
    <section class="drawer-section"><h3 class="drawer-section-title">Personal Note</h3><div class="drawer-notes ${item.notes?'':'drawer-notes-empty'}">${item.notes?escapeHtml(item.notes):'No personal note added yet. Use Edit investment to add one.'}</div></section>
  `;
  els.holdingDrawer.classList.add('open');
  els.holdingDrawerBackdrop.classList.add('open');
  els.holdingDrawer.setAttribute('aria-hidden','false');
  els.holdingDrawerBackdrop.setAttribute('aria-hidden','false');
  document.body.classList.add('drawer-open');
  setTimeout(()=>els.drawerCloseBtn?.focus(),50);
}

function watchTargetStatus(item){
  const d=item.distancePct;
  if(d===null||d===undefined||!Number.isFinite(Number(d)))return {text:'Target status pending',cls:'neutral'};
  const n=Number(d);
  if(n<=0)return {text:'At / below target price',cls:'positive'};
  if(n<=5)return {text:`${formatPercent(n)} above target · near target`,cls:'neutral'};
  return {text:`${formatPercent(n)} above target`,cls:'neutral'};
}

function openWatchDrawer(item){
  if(!item)return;
  state.drawerWatchId=item.id;state.drawerHoldingId='';state.drawerMode='WATCH';
  const isMf=item.type==='MF',currentLabel=isMf?'Current NAV':'Current price',targetLabel=isMf?'Target NAV':'Target buy price';
  const badge=isMf?'MF':item.type==='ETF'?'ETF':item.type==='STOCK'?'ST':'☆',status=watchTargetStatus(item),s=item.sourceDetails||{};
  if(els.drawerEyebrow)els.drawerEyebrow.textContent='WATCHLIST DETAILS · MASTER SHEET';
  els.drawerEditBtn.textContent='Edit watch item';els.drawerAssetBadge.textContent=badge;els.drawerTitle.textContent=item.assetName||'Watchlist item';
  els.drawerSubtitle.textContent=[item.type,item.exchange?`${item.exchange}:${item.code}`:item.code,`${item.priority||'MEDIUM'} priority`].filter(Boolean).join(' · ');
  els.drawerContent.innerHTML=`<section class="drawer-value-card watch-drawer-value"><span class="drawer-value-label">${currentLabel}</span><strong class="drawer-current-value">${formatCurrency(item.currentPrice)}</strong><div class="drawer-gain-line"><span>${targetLabel}: ${formatCurrency(item.targetPrice)}</span><span class="drawer-gain-chip ${status.cls}">${escapeHtml(status.text)}</span></div></section>
  <section class="drawer-section"><h3 class="drawer-section-title">Live watch summary</h3><div class="drawer-metric-grid">${drawerMetric(currentLabel,formatCurrency(item.currentPrice))}${drawerMetric(targetLabel,formatCurrency(item.targetPrice))}${drawerMetric('Distance from target',formatPercent(item.distancePct),Number(item.distancePct)<=0?'positive':'neutral')}${drawerMetric('Priority',escapeHtml(item.priority||'MEDIUM'))}${drawerMetric('Price source',escapeHtml(item.priceSource||'Pending'))}${drawerMetric('Price date',detailDate(item.priceDate))}</div></section>
  <section class="drawer-section master-sheet-detail-section"><div class="drawer-section-head"><h3 class="drawer-section-title">Uploaded master-sheet details</h3><span class="tiny muted">${escapeHtml(s.sourceSheet||'Workbook')}</span></div><div class="drawer-metric-grid">${drawerMetric('Sheet price / NAV',formatCurrency(s.snapshotPrice))}${drawerMetric('Sheet day change',formatCurrency(s.snapshotChange),pnlClass(s.snapshotChange))}${drawerMetric('Sheet day %',formatPercent(s.snapshotChangePct),pnlClass(s.snapshotChangePct))}${drawerMetric('Day high',formatCurrency(s.dayHigh))}${drawerMetric('Day low',formatCurrency(s.dayLow))}${drawerMetric('Volume',s.volume==null?'—':formatNumber(s.volume,0))}${drawerMetric('52W high',formatCurrency(s.high52))}${drawerMetric('52W low',formatCurrency(s.low52))}${drawerMetric('P/E or P/B',escapeHtml(s.valuation||'—'))}${drawerMetric('Market cap / assets / debt',escapeHtml(s.marketCap||'—'))}</div>
  <div class="drawer-performance source-performance-grid">${[['1M',s.perf1M],['1Y',s.perf1Y],['3Y',s.perf3Y],['5Y',s.perf5Y],['10Y',s.perf10Y]].map(([label,value])=>`<div class="drawer-perf-item"><span>${label}</span><strong class="${pnlClass(value)}">${formatPercent(value)}</strong></div>`).join('')}</div>
  <div class="drawer-info-list source-info-list"><div class="drawer-info-row"><span>Company / scheme</span><strong>${escapeHtml(s.companyName||item.assetName||'—')}</strong></div><div class="drawer-info-row"><span>Sales growth</span><strong>${escapeHtml(s.salesGrowth||'—')}</strong></div><div class="drawer-info-row"><span>Profit growth</span><strong>${escapeHtml(s.profitGrowth||'—')}</strong></div><div class="drawer-info-row"><span>Remark / moat / management</span><strong>${escapeHtml(s.moatRemark||'—')}</strong></div><div class="drawer-info-row"><span>Final remark</span><strong>${escapeHtml(s.finalRemark||'—')}</strong></div></div></section>
  <section class="drawer-section"><h3 class="drawer-section-title">Watchlist information</h3><div class="drawer-info-list"><div class="drawer-info-row"><span>Asset type</span><strong>${escapeHtml(item.type||'—')}</strong></div><div class="drawer-info-row"><span>${isMf?'AMFI code':'Symbol / code'}</span><strong>${escapeHtml(item.code||'—')}</strong></div>${item.exchange?`<div class="drawer-info-row"><span>Exchange</span><strong>${escapeHtml(item.exchange)}</strong></div>`:''}<div class="drawer-info-row"><span>Priority</span><strong><span class="priority ${String(item.priority||'MEDIUM').toLowerCase()}">${escapeHtml(item.priority||'MEDIUM')}</span></strong></div><div class="drawer-info-row"><span>Target status</span><strong class="${status.cls}">${escapeHtml(status.text)}</strong></div></div></section>
  <section class="drawer-section watch-note-editor-section"><div class="drawer-section-head"><h3 class="drawer-section-title">Personal Note</h3><span class="tiny muted">Your editable note</span></div><textarea id="drawerWatchNote" class="drawer-note-textarea" rows="6" maxlength="500" placeholder="Add your personal note for this watchlist item…">${escapeHtml(item.notes||'')}</textarea><div class="drawer-note-actions"><span id="drawerWatchNoteStatus" class="tiny muted">${item.notes?'Existing note shown above.':'No note yet.'}</span><button id="drawerSaveWatchNoteBtn" class="primary-button compact-button" type="button">Save Note</button></div></section>`;
  els.holdingDrawer.classList.add('open');els.holdingDrawerBackdrop.classList.add('open');els.holdingDrawer.setAttribute('aria-hidden','false');els.holdingDrawerBackdrop.setAttribute('aria-hidden','false');document.body.classList.add('drawer-open');
  const noteBtn=$('drawerSaveWatchNoteBtn');if(noteBtn)noteBtn.addEventListener('click',saveWatchDrawerNote);setTimeout(()=>els.drawerCloseBtn?.focus(),50);
}

async function saveWatchDrawerNote(){
  const item=state.watchlist.find(x=>x.id===state.drawerWatchId);
  const textarea=$('drawerWatchNote');
  const button=$('drawerSaveWatchNoteBtn');
  const status=$('drawerWatchNoteStatus');
  if(!item||!textarea||!button)return;
  const note=textarea.value.trim();
  setBusy(button,true,'Saving…');
  if(status)status.textContent='Saving note…';
  try{
    const result=await api('saveWatchItem',{item:{
      id:item.id,
      type:item.type,
      assetName:item.assetName,
      code:item.code,
      exchange:['MF','OTHER'].includes(item.type)?'':(item.exchange||'NSE'),
      targetPrice:item.targetPrice===null||item.targetPrice===undefined?null:Number(item.targetPrice),
      manualPrice:item.manualPrice===null||item.manualPrice===undefined?null:Number(item.manualPrice),
      priority:item.priority||'MEDIUM',
      notes:note
    }});
    applyBootstrap(result.data);
    saveCache(result.data);
    const fresh=state.watchlist.find(x=>x.id===item.id);
    if(status)status.textContent=note?'Note saved.':'Note cleared.';
    toast('Watchlist note saved.','success');
    if(fresh){
      state.drawerWatchId=fresh.id;
      setTimeout(()=>{
        const t=$('drawerWatchNote');
        if(t)t.value=fresh.notes||'';
      },0);
    }
  }catch(e){
    if(status)status.textContent='Could not save note.';
    toast(e.message,'error');
  }finally{
    setBusy(button,false);
  }
}

function closeHoldingDrawer(){
  els.holdingDrawer?.classList.remove('open');
  els.holdingDrawerBackdrop?.classList.remove('open');
  els.holdingDrawer?.setAttribute('aria-hidden','true');
  els.holdingDrawerBackdrop?.setAttribute('aria-hidden','true');
  document.body.classList.remove('drawer-open');
  state.drawerHoldingId='';
  state.drawerWatchId='';
  state.drawerMode='';
}

function editDrawerHolding(){
  const mode=state.drawerMode;
  const holding=mode==='HOLDING'?state.holdings.find(x=>x.id===state.drawerHoldingId):null;
  const watch=mode==='WATCH'?state.watchlist.find(x=>x.id===state.drawerWatchId):null;
  closeHoldingDrawer();
  if(holding)openInvestment(holding);
  else if(watch)openWatch(watch);
}

function notesHoldingItems(){
  return els.notesScope?.value==='CURRENT' ? visibleHoldings() : state.holdings;
}

function notesWatchItems(){
  return state.watchlist;
}

function noteRecordHolding(h){
  return {
    source:'HOLDINGS', id:h.id, owner:h.owner||'', type:h.type||'', assetName:h.assetName||'',
    code:h.code||'', exchange:h.exchange||'', notes:h.notes||'', currentValue:Number(h.currentValue)||0,
    currentPrice:Number(h.currentPrice)||0, targetPrice:null, priority:''
  };
}

function noteRecordWatch(w){
  return {
    source:'WATCHLIST', id:w.id, owner:'', type:w.type||'', assetName:w.assetName||'',
    code:w.code||'', exchange:w.exchange||'', notes:w.notes||'', currentValue:null,
    currentPrice:Number(w.currentPrice)||0, targetPrice:Number(w.targetPrice)||0, priority:w.priority||''
  };
}

function notesBaseItems(){
  const source=els.notesSource?.value||'BOTH';
  const items=[];
  if(source==='BOTH'||source==='HOLDINGS')items.push(...notesHoldingItems().map(noteRecordHolding));
  if(source==='BOTH'||source==='WATCHLIST')items.push(...notesWatchItems().map(noteRecordWatch));
  return items;
}

function renderNotesModal(){
  if(!els.notesList)return;
  const q=String(els.notesSearch?.value||'').trim().toLowerCase();
  const filter=els.notesFilter?.value||'ALL';
  let items=notesBaseItems().filter(x=>{
    const has=Boolean(String(x.notes||'').trim());
    if(filter==='WITH_NOTES'&&!has)return false;
    if(filter==='WITHOUT_NOTES'&&has)return false;
    const hay=`${x.source} ${x.owner} ${x.type} ${x.assetName} ${x.code} ${x.priority} ${x.notes||''}`.toLowerCase();
    return !q||hay.includes(q);
  });
  items=[...items].sort((a,b)=>{
    const an=Boolean(String(a.notes||'').trim()),bn=Boolean(String(b.notes||'').trim());
    if(an!==bn)return an?-1:1;
    if(a.source!==b.source)return a.source.localeCompare(b.source);
    return String(a.assetName||'').localeCompare(String(b.assetName||''));
  });

  const withNotes=items.filter(x=>String(x.notes||'').trim()).length;
  const holdingCount=items.filter(x=>x.source==='HOLDINGS').length;
  const watchCount=items.filter(x=>x.source==='WATCHLIST').length;
  if(els.notesSummary){
    let scope='Entire portfolio';
    if(els.notesScope?.value==='CURRENT'){
      scope=`${state.selectedOwner==='ALL'?'Combined':shortOwner(state.selectedOwner)} · ${assetViewLabel()}`;
    }
    els.notesSummary.textContent=`${scope} · ${items.length} item${items.length===1?'':'s'} · ${holdingCount} investments · ${watchCount} watchlist · ${withNotes} with notes`;
  }

  els.notesList.innerHTML=items.map(x=>{
    const note=String(x.notes||'').trim();
    const isWatch=x.source==='WATCHLIST';
    const sourceLabel=isWatch?'Watchlist':'Investment';
    const meta=isWatch
      ? `${escapeHtml(x.type)} · ${escapeHtml(x.exchange?`${x.exchange}:`:'')}${escapeHtml(x.code)} · ${escapeHtml(x.priority||'')} priority`
      : `${escapeHtml(shortOwner(x.owner))} · ${escapeHtml(x.type)} · ${escapeHtml(x.exchange?`${x.exchange}:`:'')}${escapeHtml(x.code)}`;
    const valueLabel=isWatch
      ? `Target ${formatCurrency(x.targetPrice)}`
      : formatCurrency(x.currentValue,true);
    const actionAttr=isWatch?`data-watch-note-edit="${escapeHtml(x.id)}"`:`data-note-edit="${escapeHtml(x.id)}"`;
    const viewButton=isWatch
      ? `<button type="button" class="small-button" data-watch-note-view="${escapeHtml(x.id)}">View watch item</button>`
      : `<button type="button" class="small-button" data-note-view="${escapeHtml(x.id)}">View investment</button>`;
    return `<article class="investment-note-card ${note?'has-note':'no-note'} ${isWatch?'watch-note-card':''}">
      <div class="note-card-top">
        <div class="asset-cell">
          <div class="asset-badge ${String(x.type).toLowerCase()}">${escapeHtml(x.type==='MF'?'MF':x.type==='ETF'?'ET':x.type==='STOCK'?'ST':'OT')}</div>
          <div><strong>${escapeHtml(x.assetName)}</strong><span><b class="note-source-badge ${isWatch?'watch':'holding'}">${sourceLabel}</b> · ${meta}</span></div>
        </div>
        <strong class="note-card-value">${valueLabel}</strong>
      </div>
      <div class="note-card-body ${note?'':'empty'}">${note?escapeHtml(note):'No personal note added yet.'}</div>
      <div class="note-card-actions">
        ${viewButton}
        <button type="button" class="small-button" ${actionAttr}>${note?'Edit note':'Add note'}</button>
      </div>
    </article>`;
  }).join('');
  els.notesEmpty.classList.toggle('hidden',items.length>0);
}

function openAllNotes(source='HOLDINGS'){
  if(els.notesSearch)els.notesSearch.value='';
  if(els.notesSource)els.notesSource.value=source;
  if(els.notesScope)els.notesScope.value='ALL';
  if(els.notesFilter)els.notesFilter.value='ALL';
  if(els.notesModalTitle){
    els.notesModalTitle.textContent=source==='WATCHLIST'?'All watchlist notes':source==='HOLDINGS'?'All investment notes':'All personal notes';
  }
  renderNotesModal();
  openModal('notesModal');
}

/* V15.4 FREEZE FIX — restored core dashboard/import/modal functions. */
function openModal(id){els.modalBackdrop.classList.remove('hidden');els.modalBackdrop.setAttribute('aria-hidden','false');$$('.modal').forEach(m=>m.classList.add('hidden'));$(id).classList.remove('hidden');}
function closeModals(){els.modalBackdrop.classList.add('hidden');els.modalBackdrop.setAttribute('aria-hidden','true');$$('.modal').forEach(m=>m.classList.add('hidden'));}
function updateGpfProjectionPreview(){
  const preview=$('gpfProjectionPreview');
  if(!preview)return;
  const present=Math.max(0,Number($('gpfPresentBalance')?.value)||0);
  const monthly=Math.max(0,Number($('gpfMonthlyContribution')?.value)||0);
  const annual=Math.max(0,Number($('gpfAnnualInterestRate')?.value)||0);
  const monthlyRate=annual/1200;
  let projected=present;
  for(let month=0;month<12;month++)projected=projected*(1+monthlyRate)+monthly;
  const contributions=monthly*12;
  const interest=Math.max(0,projected-present-contributions);
  preview.innerHTML=`<span><small>12-month payments</small><strong>${formatCurrency(contributions,true)}</strong></span><span><small>Estimated interest</small><strong>${formatCurrency(interest,true)}</strong></span><span class="gpf-projected-total"><small>Projected balance</small><strong>${formatCurrency(projected,true)}</strong></span>`;
}

function updateAssetForm(type,prefix){
  const isMf=type==='MF',isOther=type==='OTHER',isGpf=prefix==='holding'&&type==='GPF';
  const codeLabel=$(prefix==='holding'?'holdingCodeLabel':'watchCodeLabel');
  const exchangeLabel=$(prefix==='holding'?'exchangeLabel':'watchExchangeLabel');
  const help=$(prefix==='holding'?'mfHelp':'watchMfHelp');
  if(codeLabel)codeLabel.textContent=isMf?'AMFI scheme code':isOther?'Code / label':'Ticker symbol';
  exchangeLabel?.classList.toggle('hidden',isMf||isOther||isGpf);
  help?.classList.toggle('hidden',!isMf);
  if(prefix!=='holding')return;

  $('gpfFields')?.classList.toggle('hidden',!isGpf);
  ['holdingCodeField','holdingUnitsField','holdingInvestedField','holdingManualPriceField','holdingBuyDateField'].forEach(id=>$(id)?.classList.toggle('hidden',isGpf));
  [els.holdingCode,els.holdingUnits,els.holdingInvested].forEach(input=>{if(input)input.required=!isGpf;});
  const present=$('gpfPresentBalance'),monthly=$('gpfMonthlyContribution'),rate=$('gpfAnnualInterestRate');
  if(present)present.required=isGpf;
  if(monthly)monthly.required=isGpf;
  if(rate)rate.required=isGpf;
  if(isGpf){
    if(!els.holdingName.value.trim())els.holdingName.value='General Provident Fund (GPF)';
    els.holdingCode.value='GPF';
    els.holdingUnits.value='1';
    updateGpfProjectionPreview();
  }else{
    if(els.holdingCode.value==='GPF')els.holdingCode.value='';
    if(els.holdingName.value==='General Provident Fund (GPF)')els.holdingName.value='';
  }
}

function openInvestment(item=null){
  refreshOwnerControls();
  els.investmentForm.reset();
  els.holdingId.value=item?.id||'';
  $('investmentModalTitle').textContent=item?'Edit investment':'Add investment';
  if(item){
    els.holdingOwner.value=canonicalOwner(item.owner);
    els.holdingType.value=item.type;
    els.holdingName.value=item.assetName;
    els.holdingCode.value=item.code;
    els.holdingExchange.value=item.exchange||'NSE';
    els.holdingUnits.value=item.units;
    els.holdingInvested.value=item.investedAmount;
    els.holdingManualPrice.value=item.manualPrice??'';
    els.holdingBuyDate.value=item.buyDate||'';
    els.holdingNotes.value=item.notes||'';
    if(item.type==='GPF'){
      $('gpfPresentBalance').value=item.currentValue??item.investedAmount??'';
      $('gpfMonthlyContribution').value=item.monthlyContribution??'';
      $('gpfAnnualInterestRate').value=item.annualInterestRate??'7.10';
      $('gpfBalanceAsOfDate').value=item.balanceAsOfDate||localIsoDate();
    }
  }else{
    els.holdingOwner.value=state.selectedOwner!=='ALL'?state.selectedOwner:(configuredOwners()[0]||'Sarada');
    els.holdingType.value=state.selectedAssetView==='GPF'?'GPF':'STOCK';
    $('gpfAnnualInterestRate').value='7.10';
    $('gpfBalanceAsOfDate').value=localIsoDate();
  }
  updateAssetForm(els.holdingType.value,'holding');
  openModal('investmentModal');
}
function openWatch(item=null){els.watchForm.reset();els.watchId.value=item?.id||'';if(item){els.watchType.value=item.type;els.watchName.value=item.assetName;els.watchCode.value=item.code;els.watchExchange.value=item.exchange||'NSE';els.watchTarget.value=item.targetPrice??'';els.watchManualPrice.value=item.manualPrice??'';els.watchPriority.value=item.priority||'MEDIUM';els.watchNotes.value=item.notes||'';}updateAssetForm(els.watchType.value,'watch');openModal('watchModal');}

async function saveInvestment(event){
  event.preventDefault();
  const button=$('saveInvestmentBtn');
  const isGpf=els.holdingType.value==='GPF';
  const present=isGpf?Number($('gpfPresentBalance').value):Number(els.holdingInvested.value);
  const holding={
    id:els.holdingId.value,
    owner:els.holdingOwner.value,
    type:els.holdingType.value,
    assetName:els.holdingName.value.trim(),
    code:isGpf?'GPF':els.holdingCode.value.trim().toUpperCase(),
    exchange:['MF','OTHER','GPF'].includes(els.holdingType.value)?'':els.holdingExchange.value,
    units:isGpf?1:Number(els.holdingUnits.value),
    investedAmount:present,
    manualPrice:isGpf?present:(els.holdingManualPrice.value===''?null:Number(els.holdingManualPrice.value)),
    buyDate:isGpf?'':els.holdingBuyDate.value,
    notes:els.holdingNotes.value.trim()
  };
  if(isGpf){
    holding.presentBalance=present;
    holding.monthlyContribution=Number($('gpfMonthlyContribution').value);
    holding.annualInterestRate=Number($('gpfAnnualInterestRate').value);
    holding.balanceAsOfDate=$('gpfBalanceAsOfDate').value;
  }
  setBusy(button,true,'Saving…');
  try{
    const result=await api('saveHolding',{holding});
    closeModals();
    applyBootstrap(result.data);
    saveCache(result.data);
    toast(isGpf?'GPF holding and projection saved.':'Investment saved.','success');
  }catch(e){toast(e.message,'error');}
  finally{setBusy(button,false);}
}
async function saveWatch(event){event.preventDefault();const button=$('saveWatchBtn');setBusy(button,true,'Saving…');try{const result=await api('saveWatchItem',{item:{id:els.watchId.value,type:els.watchType.value,assetName:els.watchName.value.trim(),code:els.watchCode.value.trim().toUpperCase(),exchange:['MF','OTHER'].includes(els.watchType.value)?'':els.watchExchange.value,targetPrice:els.watchTarget.value===''?null:Number(els.watchTarget.value),manualPrice:els.watchManualPrice.value===''?null:Number(els.watchManualPrice.value),priority:els.watchPriority.value,notes:els.watchNotes.value.trim()}});closeModals();applyBootstrap(result.data);saveCache(result.data);toast('Watchlist item saved.','success');}catch(e){toast(e.message,'error');}finally{setBusy(button,false);}}
async function deleteItem(action,id,label){if(!confirm(`Delete this ${label}?`))return;try{const result=await api(action,{id});applyBootstrap(result.data);saveCache(result.data);toast(`${label} deleted.`,'success');}catch(e){toast(e.message,'error');}}

function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(quoted&&n==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];field='';}else field+=c;}
  row.push(field);if(row.some(v=>String(v).trim()!==''))rows.push(row);return rows;
}

async function loadSheetJs(){
  if(window.XLSX)return window.XLSX;
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Could not load the Excel reader. Save the file as CSV and try again.'));document.head.appendChild(script);});
  if(!window.XLSX)throw new Error('Excel reader did not load. Save the file as CSV and try again.');
  return window.XLSX;
}
async function fileToRows(file){
  const name=String(file?.name||'').toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    const XLSX=await loadSheetJs();const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const sheet=workbook.Sheets[workbook.SheetNames[0]];return XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  }
  return parseCsv(await file.text());
}
function trimToDetectedHeader(rows,mode){
  const max=Math.min(rows.length,30);
  for(let i=0;i<max;i++){
    const h=(rows[i]||[]).map(normalizeHeader);
    if(mode==='MF_STATEMENT'){
      if(h.includes('investorname')&&h.includes('productcode')&&h.includes('schemename')&&h.includes('tradedate'))return rows.slice(i);
    }else if(mode==='MF_SNAPSHOT'){
      const hasName=['schemename','assetname','name'].some(x=>h.includes(x));
      const hasIsin=h.includes('isin');
      const hasUnits=['unitsheld','units','quantity','qty'].some(x=>h.includes(x));
      if(hasName&&hasIsin&&hasUnits)return rows.slice(i);
    }else if(mode==='STOCK_TRADES'){
      const hasSymbol=['stocksymbol','symbol','tradingsymbol','instrument','scrip'].some(x=>h.includes(x));
      const hasQty=['quantity','qty','tradedquantity'].some(x=>h.includes(x));
      const hasDate=['tradedate','date','orderexecutiontime','orderexecutiondate'].some(x=>h.includes(x));
      const hasSide=['tradetype','transactiontype','buysell','side','type'].some(x=>h.includes(x));
      if(hasSymbol&&hasQty&&hasDate&&hasSide)return rows.slice(i);
    }else{
      const hasSymbol=['stocksymbol','symbol','tradingsymbol','instrument','scrip'].some(x=>h.includes(x));
      const hasQty=['quantity','qty'].some(x=>h.includes(x));
      if(hasSymbol&&hasQty)return rows.slice(i);
    }
  }
  return rows;
}

function normalizeHeader(v){return String(v||'').replace(/^\ufeff/,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function parseNum(v){const s=String(v??'').replace(/[₹,%\s]/g,'').replace(/,/g,'').trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:NaN;}
function normalizeDate(v){
  const raw=String(v||'').trim();if(!raw)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  let m=raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m=raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);if(m){const months={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};const mm=months[m[2].toLowerCase()];if(mm)return `${m[3]}-${mm}-${String(m[1]).padStart(2,'0')}`;}
  return null;
}
function detectIndex(headers,aliases){for(const a of aliases){const i=headers.indexOf(normalizeHeader(a));if(i>=0)return i;}return -1;}
function cell(cells,i){return i>=0?String(cells[i]??'').trim():'';}
function isFinancialMfTransaction(type,amount,units){const t=String(type||'').toLowerCase();if(/address|nominee|contact|mandate|registered|registration|updation|correction|cancelled|invalid|kyc|bank/.test(t))return false;return (Number.isFinite(amount)&&Math.abs(amount)>0.000001)||(Number.isFinite(units)&&Math.abs(units)>0.000001);}
function rowsToMfTransactions(rows){
  if(rows.length<2)throw new Error('The CSV has no transaction rows.');const h=rows[0].map(normalizeHeader);
  const idx={amc:detectIndex(h,['MF_NAME','AMC','Fund House']),owner:detectIndex(h,['INVESTOR_NAME','Investor Name','Owner']),product:detectIndex(h,['PRODUCT_CODE','Product Code']),scheme:detectIndex(h,['SCHEME_NAME','Scheme Name']),date:detectIndex(h,['TRADE_DATE','Trade Date','Date']),tx:detectIndex(h,['TRANSACTION_TYPE','Transaction Type']),amount:detectIndex(h,['AMOUNT','Amount']),units:detectIndex(h,['UNITS','Units']),price:detectIndex(h,['PRICE','NAV','Price']),broker:detectIndex(h,['BROKER','Broker'])};
  const required=['owner','product','scheme','date','tx'];const missing=required.filter(k=>idx[k]<0);if(missing.length)throw new Error(`MF statement columns not recognised: ${missing.join(', ')}.`);
  const out=[],errors=[];rows.slice(1).forEach((r,n)=>{const owner=canonicalOwner(cell(r,idx.owner)),productCode=cell(r,idx.product).toUpperCase(),schemeName=cell(r,idx.scheme),tradeDate=normalizeDate(cell(r,idx.date)),transactionType=cell(r,idx.tx),amount=parseNum(cell(r,idx.amount)),units=parseNum(cell(r,idx.units)),price=parseNum(cell(r,idx.price));if(!isFinancialMfTransaction(transactionType,amount,units))return;if(!owner||!productCode||!schemeName||!tradeDate||!transactionType){errors.push(`Row ${n+2}: missing investor/product/scheme/date/type.`);return;}if([amount,units,price].some(v=>Number.isNaN(v))){errors.push(`Row ${n+2}: invalid amount/units/price.`);return;}out.push({owner,amc:cell(r,idx.amc),productCode,schemeName,tradeDate,transactionType,amount:amount??0,units,price,broker:cell(r,idx.broker)});});
  if(errors.length)throw new Error(errors.slice(0,6).join(' ')+(errors.length>6?` Plus ${errors.length-6} more.`:''));if(!out.length)throw new Error('No purchase/SIP/redemption rows were found.');if(out.length>5000)throw new Error('More than 5,000 MF transactions detected. Split the file.');return out;
}
function classifyAsset(symbol,explicit=''){const e=String(explicit||'').toUpperCase().replace(/[^A-Z]/g,'');if(e.includes('ETF'))return'ETF';if(e.includes('STOCK')||e.includes('EQUITY'))return'STOCK';const s=String(symbol||'').toUpperCase();return /(BEES$|ETF$|MAFANG|MON100|HNGSNGBEES|ITBEES|CPSEETF|MOM100)/.test(s)?'ETF':'STOCK';}
function rowsToMfSnapshotHoldings(rows){
  if(rows.length<2)throw new Error('The file has no mutual-fund holding rows.');
  const h=rows[0].map(normalizeHeader);
  const idx={
    owner:detectIndex(h,['Investor Name','INVESTOR_NAME','Owner']),
    name:detectIndex(h,['Scheme Name','SCHEME_NAME','Asset Name','Name']),
    isin:detectIndex(h,['ISIN']),
    units:detectIndex(h,['Units Held','Units','Quantity','Qty']),
    avg:detectIndex(h,['Avg NAV','Average NAV','Average Price']),
    invested:detectIndex(h,['Invested Amount','Investment Amount','Invested Value','Cost Value']),
    currentNav:detectIndex(h,['Current NAV','NAV','Current Price']),
    notes:detectIndex(h,['Personal Note','Notes','Note'])
  };
  if(idx.name<0||idx.isin<0||idx.units<0||(idx.invested<0&&idx.avg<0)){
    throw new Error('MF holdings file needs Scheme Name, ISIN, Units Held and Invested Amount or Avg NAV.');
  }
  const selected=canonicalOwner(els.importOwner.value||configuredOwners()[0]||'Niharika');
  const out=[],errors=[];
  rows.slice(1).forEach((r,n)=>{
    const schemeName=cell(r,idx.name);
    const isin=cell(r,idx.isin).toUpperCase().replace(/\s+/g,'');
    if(!schemeName&&!isin)return;
    const units=parseNum(cell(r,idx.units));
    const avg=parseNum(cell(r,idx.avg));
    const investedRaw=parseNum(cell(r,idx.invested));
    const invested=Number.isFinite(investedRaw)?investedRaw:(Number.isFinite(units)&&Number.isFinite(avg)?units*avg:null);
    const currentNav=parseNum(cell(r,idx.currentNav));
    const owner=idx.owner>=0&&cell(r,idx.owner)?canonicalOwner(cell(r,idx.owner)):selected;
    if(!schemeName||!/^[A-Z0-9]{12}$/.test(isin)||!Number.isFinite(units)||units<=0||!Number.isFinite(invested)||invested<0){
      errors.push(`Row ${n+2}: check Scheme Name, 12-character ISIN, Units Held and Invested Amount.`);
      return;
    }
    out.push({
      owner,
      schemeName,
      isin,
      units,
      investedAmount:invested,
      avgNav:Number.isFinite(avg)?avg:null,
      currentNav:Number.isFinite(currentNav)?currentNav:null,
      notes:idx.notes>=0?cell(r,idx.notes):''
    });
  });
  if(errors.length)throw new Error(errors.slice(0,6).join(' '));
  if(!out.length)throw new Error('No MF current holdings found.');
  return out;
}


function rowsToStockTransactions(rows){
  if(rows.length<2)throw new Error('The tradebook has no trade rows.');
  const h=rows[0].map(normalizeHeader);
  const idx={
    owner:detectIndex(h,['Investor Name','INVESTOR_NAME','Owner']),
    type:detectIndex(h,['Asset Type','Instrument Type','Type']),
    symbol:detectIndex(h,['Stock Symbol','Symbol','Tradingsymbol','Trading Symbol','Instrument','Scrip']),
    name:detectIndex(h,['Company Name','Asset Name','Name','Instrument']),
    exchange:detectIndex(h,['Exchange']),
    date:detectIndex(h,['Trade Date','trade_date','Date','Order Execution Time','Order Execution Date']),
    side:detectIndex(h,['Trade Type','trade_type','Transaction Type','Buy/Sell','Side','Type']),
    qty:detectIndex(h,['Quantity','Qty','Traded Quantity']),
    price:detectIndex(h,['Price','Trade Price','Average Price']),
    amount:detectIndex(h,['Amount','Trade Value','Value']),
    broker:detectIndex(h,['Broker'])
  };
  if(idx.symbol<0||idx.date<0||idx.side<0||idx.qty<0||idx.price<0){
    throw new Error('Tradebook needs Symbol/Instrument, Trade Date, Trade Type (buy/sell), Quantity and Price.');
  }

  const selected=canonicalOwner(els.importOwner.value||configuredOwners()[0]||'Niharika');
  const out=[],errors=[];
  rows.slice(1).forEach((r,n)=>{
    const symbol=cell(r,idx.symbol).toUpperCase().replace(/\s+/g,'');
    if(!symbol)return;
    const rawSide=cell(r,idx.side).toUpperCase();
    const side=/SELL|SALE/.test(rawSide)?'SELL':/BUY|PURCHASE/.test(rawSide)?'BUY':'';
    const tradeDate=normalizeDate(cell(r,idx.date).split(' ')[0]);
    const units=parseNum(cell(r,idx.qty));
    const price=parseNum(cell(r,idx.price));
    const amountRaw=parseNum(cell(r,idx.amount));
    const owner=idx.owner>=0&&cell(r,idx.owner)?canonicalOwner(cell(r,idx.owner)):selected;
    const assetType=classifyAsset(symbol,cell(r,idx.type));
    const assetName=cell(r,idx.name)||symbol;
    const broker=cell(r,idx.broker)||'Zerodha / Tradebook';

    if(!tradeDate||!side||!Number.isFinite(units)||Math.abs(units)<=0||!Number.isFinite(price)||price<0){
      errors.push(`Row ${n+2}: check date, BUY/SELL, quantity and price.`);
      return;
    }
    const amount=Number.isFinite(amountRaw)?Math.abs(amountRaw):Math.abs(units*price);
    out.push({owner,assetType,assetName,code:symbol,tradeDate,side,units:Math.abs(units),price:Math.abs(price),amount,broker});
  });
  if(errors.length)throw new Error(errors.slice(0,6).join(' ')+(errors.length>6?` Plus ${errors.length-6} more.`:''));
  if(!out.length)throw new Error('No BUY/SELL trades found.');
  if(out.length>10000)throw new Error('More than 10,000 trades detected. Split the file.');
  return out;
}

function rowsToStockHoldings(rows){
  if(rows.length<2)throw new Error('The CSV has no stock rows.');const h=rows[0].map(normalizeHeader);
  const idx={owner:detectIndex(h,['INVESTOR_NAME','Investor Name','Owner']),type:detectIndex(h,['Asset Type','Type','Instrument Type']),symbol:detectIndex(h,['Stock Symbol','Symbol','Tradingsymbol','Trading Symbol','Instrument','Scrip']),exchange:detectIndex(h,['Exchange']),qty:detectIndex(h,['Quantity','Qty','Qty.','QTY']),avg:detectIndex(h,['Avg Buy Price','Average Buy Price','Avg. cost','Avg Cost','Average price','Buy Average']),invested:detectIndex(h,['Invested Amount','Invested Value','Cost Value','Investment Value']),name:detectIndex(h,['Company Name','Asset Name','Name'])};
  if(idx.symbol<0||idx.qty<0||(idx.avg<0&&idx.invested<0))throw new Error('Stock file needs Symbol/Instrument, Quantity and Avg Buy Price or Invested Amount.');
  const out=[],errors=[];const selected=canonicalOwner(els.importOwner.value||configuredOwners()[0]||'Niharika');rows.slice(1).forEach((r,n)=>{const symbol=cell(r,idx.symbol).toUpperCase().replace(/\s+/g,'');if(!symbol)return;const qty=parseNum(cell(r,idx.qty)),avg=parseNum(cell(r,idx.avg)),invRaw=parseNum(cell(r,idx.invested));const invested=Number.isFinite(invRaw)?invRaw:(Number.isFinite(qty)&&Number.isFinite(avg)?qty*avg:null);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(invested)||invested<0){errors.push(`Row ${n+2}: invalid quantity/invested amount.`);return;}const owner=idx.owner>=0&&cell(r,idx.owner)?canonicalOwner(cell(r,idx.owner)):selected;const exchange=(cell(r,idx.exchange)||'NSE').toUpperCase()==='BSE'?'BOM':(cell(r,idx.exchange)||'NSE').toUpperCase();const type=classifyAsset(symbol,cell(r,idx.type));out.push({owner,type,assetName:cell(r,idx.name)||symbol,code:symbol,exchange,units:qty,investedAmount:invested,manualPrice:null,buyDate:'',notes:'Imported stock holding'});});if(errors.length)throw new Error(errors.slice(0,6).join(' '));if(!out.length)throw new Error('No stock holdings found.');return out;
}
function setImportMode(mode){
  state.importMode=mode;
  $$('.import-mode').forEach(b=>b.classList.toggle('active',b.dataset.importMode===mode));
  els.mfImportHelp.classList.toggle('hidden',mode!=='MF_STATEMENT');
  els.mfSnapshotImportHelp.classList.toggle('hidden',mode!=='MF_SNAPSHOT');
  els.stockImportHelp.classList.toggle('hidden',mode!=='STOCK_HOLDINGS');
  els.stockTradeImportHelp?.classList.toggle('hidden',mode!=='STOCK_TRADES');
  els.stockOwnerLabel.classList.toggle('hidden',!['MF_SNAPSHOT','STOCK_HOLDINGS','STOCK_TRADES'].includes(mode));
  if(mode==='MF_STATEMENT')els.importFileHint.textContent='Up to 5,000 MF transaction rows. PAN and folio are ignored. CSV/XLSX supported.';
  else if(mode==='MF_SNAPSHOT')els.importFileHint.textContent='Current MF holdings snapshot. CSV/XLSX supported.';
  else if(mode==='STOCK_TRADES')els.importFileHint.textContent='Stock/ETF tradebook with BUY/SELL dates. Zerodha CSV/XLSX and similar formats supported.';
  else els.importFileHint.textContent='Current stock/ETF holdings. Zerodha XLSX/CSV supported.';
  els.bulkCsvFile.value='';
  state.pendingImport=[];
  els.bulkImportStatus.textContent='No file selected.';
  els.bulkImportStatus.className='import-status muted';
  els.runBulkImportBtn.disabled=true;
}
function openBulkImport(){refreshOwnerControls();setImportMode('MF_STATEMENT');openModal('bulkImportModal');}
function downloadImportTemplate(){
  let headers,examples,name;
  if(state.importMode==='MF_STATEMENT'){
    headers=['MF_NAME','INVESTOR_NAME','PRODUCT_CODE','SCHEME_NAME','Type','TRADE_DATE','TRANSACTION_TYPE','DIVIDEND_RATE','AMOUNT','UNITS','PRICE','BROKER'];
    examples=[['PPFAS Mutual Fund','Sarada','PP001ZG','Parag Parikh Flexi Cap - Dir Plan Growth','Equity','2026-07-05','Purchase Systematic','','12999.35','140.000','92.8525','Direct']];
    name='mf-statement-import-template.csv';
  }else if(state.importMode==='MF_SNAPSHOT'){
    headers=['Investor Name','Scheme Name','ISIN','Units Held','Avg NAV','Invested Amount','Current NAV','Personal Note'];
    examples=[['Niharika','Parag Parikh Flexi Cap Fund - Direct Plan Growth','INF879O01027','1865.091','42.89','80000','91.75','']];
    name='mf-current-holdings-template.csv';
  }else if(state.importMode==='STOCK_TRADES'){
    headers=['Investor Name','Asset Type','Stock Symbol','Exchange','Trade Date','Trade Type','Quantity','Price','Amount','Broker'];
    examples=[['Niharika','STOCK','HDFCBANK','NSE','2026-07-05','BUY','10','1680','16800','Zerodha'],['Niharika','STOCK','HDFCBANK','NSE','2026-08-10','SELL','5','1750','8750','Zerodha']];
    name='stock-tradebook-import-template.csv';
  }else{
    headers=['Investor Name','Asset Type','Stock Symbol','Exchange','Quantity','Avg Buy Price','Invested Amount'];
    examples=[['Niharika','STOCK','DMART','NSE','20','3923.85','78477'],['Niharika','ETF','GOLDBEES','NSE','1123','91.37','102614']];
    name='stock-holdings-import-template.csv';
  }
  const csv=[headers,...examples].map(r=>r.map(csvCell).join(',')).join('\n');
  const blob=new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function handleBulkFile(){
  state.pendingImport=[];
  els.runBulkImportBtn.disabled=true;
  const file=els.bulkCsvFile.files?.[0];
  if(!file){els.bulkImportStatus.textContent='No file selected.';return;}
  try{
    const rows=trimToDetectedHeader(await fileToRows(file),state.importMode);
    let data;
    if(state.importMode==='MF_STATEMENT')data=rowsToMfTransactions(rows);
    else if(state.importMode==='MF_SNAPSHOT')data=rowsToMfSnapshotHoldings(rows);
    else if(state.importMode==='STOCK_TRADES')data=rowsToStockTransactions(rows);
    else data=rowsToStockHoldings(rows);
    state.pendingImport=data;
    const owners=[...new Set(data.map(x=>x.owner).filter(Boolean))];
    const label=state.importMode==='MF_STATEMENT'?'MF transaction':state.importMode==='MF_SNAPSHOT'?'MF holding':state.importMode==='STOCK_TRADES'?'stock/ETF trade':'stock/ETF holding';
    els.bulkImportStatus.textContent=`${data.length} ${label} row${data.length===1?'':'s'} ready · ${owners.map(shortOwner).join(', ')}`;
    els.bulkImportStatus.className='import-status success';
    els.runBulkImportBtn.disabled=false;
  }catch(e){
    els.bulkImportStatus.textContent=e.message;
    els.bulkImportStatus.className='import-status error';
  }
}
async function runBulkImport(event){
  event.preventDefault();
  if(!state.pendingImport.length)return;
  const b=els.runBulkImportBtn;
  setBusy(b,true,'Importing…');
  try{
    let action,payload;
    if(state.importMode==='MF_STATEMENT'){
      action='bulkImportMfTransactions';payload={transactions:state.pendingImport};
    }else if(state.importMode==='MF_SNAPSHOT'){
      action='bulkImportMfSnapshot';payload={mfHoldings:state.pendingImport};
    }else if(state.importMode==='STOCK_TRADES'){
      action='bulkImportStockTransactions';payload={transactions:state.pendingImport};
    }else{
      action='bulkImportHoldings';payload={holdings:state.pendingImport};
    }
    const result=await api(action,payload);
    closeModals();
    state.pendingImport=[];
    applyBootstrap(result.data);
    saveCache(result.data);
    switchSection(['MF_STATEMENT','STOCK_TRADES'].includes(state.importMode)?'transactions':'holdings');
    if(state.importMode==='MF_STATEMENT')toast(`${result.imported} new MF transactions imported; ${result.skipped||0} duplicates skipped. Purchase/redemption dates are now in Transactions.`,'success');
    else if(state.importMode==='STOCK_TRADES')toast(`${result.imported} stock/ETF BUY/SELL trades imported; ${result.skipped||0} duplicates skipped.`,'success');
    else if(state.importMode==='MF_SNAPSHOT')toast(`${result.imported} MF holdings imported and mapped to AMFI. NAV will update automatically; XIRR needs transaction history.`,'success');
    else toast(`${result.imported} stock/ETF holdings imported. Click Refresh for performance.`,'success');
  }catch(e){
    toast(e.message,'error');
    els.bulkImportStatus.textContent=e.message;
    els.bulkImportStatus.className='import-status error';
  }finally{
    setBusy(b,false);
  }
}

async function replaceMasterPortfolioData(){
  const msg=['This will REPLACE the current investment and watchlist data for this login.','','It deletes earlier Holdings, Watchlist and MF transaction rows, then loads:','• 35 consolidated holdings','• 17 cleaned watchlist items','','Daily Diary, Monthly Diary, users and passwords are NOT deleted.','A backend backup is attempted first.','','Continue?'].join('\n');
  if(!confirm(msg))return;
  setBusy(els.replaceMasterDataBtn,true,'Replacing…');setSyncStatus('syncing','Loading master spreadsheet data…');
  try{
    const result=await api('replaceMasterPortfolioData',{}, {timeoutMs:180000});
    if(!result.data||result.data.holdings?.length!==35||result.data.watchlist?.length!==17){
      throw new Error(`Master replacement verification failed. Found ${result.data?.holdings?.length??0} holdings and ${result.data?.watchlist?.length??0} watchlist items.`);
    }
    applyBootstrap(result.data);saveCache(result.data);state.selectedOwner='ALL';state.selectedAssetView='ALL';
    if(els.holdingSearch)els.holdingSearch.value='';if(els.holdingTypeFilter)els.holdingTypeFilter.value='ALL';
    refreshOwnerControls();
    applyTableSize('holdings');
    applyTableSize('watchlist');renderAll();switchSection('holdings');setSyncStatus('','Master data loaded');
    if(els.masterLoadBanner)els.masterLoadBanner.classList.add('hidden');
    toast(`Master sheet loaded: ${result.importedHoldings} holdings and ${result.importedWatchlist} watchlist items.`,'success');
  }catch(e){setSyncStatus('error','Master load failed');toast(e.message,'error');}
  finally{setBusy(els.replaceMasterDataBtn,false);}
}

function printEscape(value){return escapeHtml(value==null?'':String(value));}
function printLayoutKey(section){return `myfinance_print_layout_${section||'generic'}`;}
function loadPrintLayout(section){
  try{
    const raw=JSON.parse(localStorage.getItem(printLayoutKey(section))||'null');
    if(!raw||typeof raw!=='object')return null;
    return {
      row:Math.max(70,Math.min(160,Number(raw.row)||100)),
      widths:Array.isArray(raw.widths)?raw.widths.map(Number).filter(Number.isFinite):null
    };
  }catch{return null;}
}
function savePrintLayout(section,layout){
  if(!section)return;
  try{
    localStorage.setItem(printLayoutKey(section),JSON.stringify({
      row:Math.max(70,Math.min(160,Number(layout?.row)||100)),
      widths:Array.isArray(layout?.widths)?layout.widths.map(v=>Number(v)||0):null
    }));
  }catch{}
}
function clearPrintLayout(section){
  if(!section)return;
  try{localStorage.removeItem(printLayoutKey(section));}catch{}
}
function normalizePrintWidths(widths,count){
  const list=Array.from({length:count},(_,i)=>Math.max(3,Number(widths?.[i])||1));
  const total=list.reduce((a,b)=>a+b,0)||count;
  return list.map(v=>v/total*100);
}
function dashboardWidthsForPrint(section,map){
  const table=tableElementFor(section);
  if(!table||!Array.isArray(map)||!map.length)return null;
  const heads=[...table.querySelectorAll('thead th')];
  const values=map.map(sourceIndex=>{
    if(sourceIndex==null)return 90;
    const th=heads[sourceIndex];
    return th?Math.max(58,th.getBoundingClientRect().width):90;
  });
  return normalizePrintWidths(values,map.length);
}
function dashboardPrintLayout(section,map){
  const size=section?loadTableSize(section):{row:100,width:100};
  return {
    row:Math.max(70,Math.min(160,Number(size?.row)||100)),
    widths:dashboardWidthsForPrint(section,map)
  };
}
function printColgroup(widths){
  if(!Array.isArray(widths)||!widths.length)return '';
  return `<colgroup>${widths.map(v=>`<col style="width:${Math.max(2,Number(v)||0).toFixed(3)}%">`).join('')}</colgroup>`;
}
function applyPrintFrameLayout(frame,layout){
  const doc=frame?.contentDocument;
  if(!doc)return;
  const row=Math.max(70,Math.min(160,Number(layout?.row)||100));
  doc.documentElement.style.setProperty('--print-row-scale',String(row/100));
  const table=doc.querySelector('table');
  if(table&&Array.isArray(layout?.widths)&&layout.widths.length){
    const widths=normalizePrintWidths(layout.widths,table.querySelectorAll('thead th').length);
    let colgroup=table.querySelector('colgroup');
    if(!colgroup){
      colgroup=doc.createElement('colgroup');
      table.insertBefore(colgroup,table.firstChild);
    }
    colgroup.innerHTML=widths.map(v=>`<col style="width:${v.toFixed(3)}%">`).join('');
    table.style.tableLayout='fixed';
    table.style.whiteSpace='normal';
    table.querySelectorAll('th,td').forEach(cell=>{
      cell.style.whiteSpace=cell.classList.contains('num')?'nowrap':'normal';
      if(!cell.classList.contains('num')){
        cell.style.overflowWrap='anywhere';
        cell.style.wordBreak='break-word';
      }
    });
  }
}
function installPrintColumnResizers(frame,section,layout,onChange){
  const doc=frame?.contentDocument;
  if(!doc)return;
  const table=doc.querySelector('table');
  if(!table)return;
  const headers=[...table.querySelectorAll('thead th')];
  if(!headers.length)return;
  layout.widths=normalizePrintWidths(layout.widths,headers.length);
  applyPrintFrameLayout(frame,layout);

  headers.forEach((th,index)=>{
    if(th.querySelector('.print-col-resizer'))return;
    const handle=doc.createElement('span');
    handle.className='print-col-resizer';
    handle.title='Drag left/right to resize this print column';
    th.appendChild(handle);

    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture?.(event.pointerId);
      const tableRect=table.getBoundingClientRect();
      const startX=event.clientX;
      const startPct=layout.widths[index];
      const next=index<headers.length-1?index+1:index-1;
      const nextStart=layout.widths[next];
      doc.body.classList.add('print-column-resizing');

      const move=e=>{
        const deltaPct=(e.clientX-startX)/Math.max(1,tableRect.width)*100;
        const minPct=3;
        let newCurrent=Math.max(minPct,startPct+deltaPct);
        let newNext=Math.max(minPct,nextStart-deltaPct);
        const pairTotal=startPct+nextStart;
        if(newCurrent+newNext!==pairTotal){
          if(newCurrent<=minPct)newNext=pairTotal-minPct;
          if(newNext<=minPct)newCurrent=pairTotal-minPct;
        }
        layout.widths[index]=newCurrent;
        layout.widths[next]=newNext;
        applyPrintFrameLayout(frame,layout);
        onChange?.(true);
      };
      const up=()=>{
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',up);
        handle.removeEventListener('pointercancel',up);
        doc.body.classList.remove('print-column-resizing');
        layout.widths=normalizePrintWidths(layout.widths,headers.length);
        applyPrintFrameLayout(frame,layout);
        if(section)savePrintLayout(section,layout);
        onChange?.(false);
      };
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',up);
      handle.addEventListener('pointercancel',up);
    });
  });
}
function closePrintPreview(){
  const overlay=$('printPreviewOverlay');
  if(overlay)overlay.remove();
  document.body.classList.remove('print-preview-open');
}
function buildPrintableDocument(title,subtitle,bodyHtml,orientation='portrait'){
  const generated=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
  return `<!doctype html><html><head><meta charset="utf-8"><title>${printEscape(title)}</title><style>
    @page{size:${orientation};margin:10mm}
    :root{--print-row-scale:1}
    *{box-sizing:border-box}
    html,body{background:#fff}
    body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;font-size:10px}
    .print-head{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #303f8f;padding-bottom:8px;margin-bottom:10px}
    h1{margin:0;font-size:18px;color:#24326c} h2{font-size:13px;margin:14px 0 7px}
    .sub{margin-top:4px;color:#606b80;font-size:9px}.meta{text-align:right;color:#7b8495;font-size:8px;white-space:nowrap}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{position:relative;border:1px solid #d9dee8;padding:calc(5px * var(--print-row-scale)) 6px;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere;word-break:normal;hyphens:auto}
    th{background:#eef1fb;color:#26336e;font-size:8px;text-transform:uppercase;line-height:1.25}
    tr:nth-child(even) td{background:#fafbfe}
    .num{text-align:right;white-space:nowrap}.pos{color:#087b5d}.neg{color:#be4051}
    td:not(.num),td:not(.num) *{max-width:100%;overflow-wrap:anywhere;word-break:break-word}
    small{font-size:7px;color:#748096;white-space:normal;overflow-wrap:anywhere}
    .print-col-resizer{position:absolute;top:0;right:-4px;bottom:0;width:9px;z-index:5;cursor:col-resize;touch-action:none}
    .print-col-resizer::after{content:"";position:absolute;top:18%;bottom:18%;left:4px;width:2px;background:transparent;border-radius:2px}
    th:hover .print-col-resizer::after,.print-col-resizer:hover::after{background:#5e68d6}
    .print-column-resizing,.print-column-resizing *{cursor:col-resize!important;user-select:none!important}
    .entry{border:1px solid #dfe4ed;border-radius:6px;padding:calc(9px * var(--print-row-scale));margin:0 0 calc(8px * var(--print-row-scale));break-inside:avoid}
    .entry h3{font-size:11px;margin:4px 0}.entry-date{font-size:8px;color:#5e60b7;font-weight:bold}.entry-text{white-space:pre-wrap;line-height:1.45;color:#404b5e}
    .monthly-type{font-size:7px;font-weight:bold;text-transform:uppercase;color:#5d59bc}
    .status{font-size:8px;font-weight:bold}
    .print-footer{margin-top:10px;color:#8a93a3;font-size:7.5px}
    @media print{
      html,body{width:auto!important;height:auto!important;overflow:visible!important}
      .print-col-resizer{display:none!important}
      thead{display:table-header-group}
      tr{break-inside:avoid}
    }
  </style></head><body><div class="print-head"><div><h1>${printEscape(title)}</h1><div class="sub">${printEscape(subtitle||'')}</div></div><div class="meta">My Finance · Frontend v${APP_VERSION}<br>Prepared ${printEscape(generated)}</div></div>${bodyHtml}<div class="print-footer">Prepared from the current filtered dashboard view.</div></body></html>`;
}
function openPrintPreview(title,subtitle,bodyHtml,orientation='portrait',options={}){
  closePrintPreview();
  const section=options.section||'';
  const dashboardLayout=options.dashboardLayout||{row:100,widths:null};
  let layout=section?(loadPrintLayout(section)||dashboardLayout):dashboardLayout;
  layout={
    row:Math.max(70,Math.min(160,Number(layout?.row)||100)),
    widths:Array.isArray(layout?.widths)?layout.widths.slice():null
  };

  const overlay=document.createElement('div');
  overlay.id='printPreviewOverlay';
  overlay.className='print-preview-overlay';
  overlay.innerHTML=`<section class="print-preview-shell" role="dialog" aria-modal="true" aria-label="Print preview">
    <header class="print-preview-toolbar">
      <div class="print-preview-copy">
        <strong>Print Preview</strong>
        <span>${printEscape(title)}</span>
      </div>
      <div class="print-layout-controls">
        <span class="print-control-label">Row height</span>
        <button type="button" id="printRowMinusBtn" class="print-size-step">−</button>
        <span id="printRowLabel" class="print-size-value">${Math.round(layout.row)}%</span>
        <button type="button" id="printRowPlusBtn" class="print-size-step">+</button>
        <input id="printRowSlider" class="print-size-slider" type="range" min="70" max="160" step="5" value="${Math.round(layout.row)}" aria-label="Adjust print row height">
        ${section?`<span class="print-drag-help">↔ Drag column heading edges</span><button type="button" id="printUseDashboardBtn" class="print-layout-button">Use dashboard widths</button>`:''}
        <span id="printLayoutSaved" class="print-layout-saved">${section?'✓ Print layout saved':'Preview'}</span>
      </div>
      <div class="print-preview-actions">
        <button type="button" id="printPreviewPrintBtn" class="print-preview-primary">⎙ Print now</button>
        <button type="button" id="printPreviewCloseBtn" class="print-preview-close">✕ Close</button>
      </div>
    </header>
    <div class="print-preview-frame-wrap">
      <iframe id="printPreviewFrame" class="print-preview-frame" title="Printable preview"></iframe>
    </div>
  </section>`;

  document.body.appendChild(overlay);
  document.body.classList.add('print-preview-open');
  const frame=$('printPreviewFrame');
  frame.srcdoc=buildPrintableDocument(title,subtitle,bodyHtml,orientation);

  const status=$('printLayoutSaved');
  let statusTimer=null;
  const showStatus=(saving=false)=>{
    if(!status)return;
    status.textContent=saving?'Saving…':section?'✓ Print layout saved':'Preview';
    status.classList.toggle('saving',saving);
    if(statusTimer)clearTimeout(statusTimer);
    if(saving)statusTimer=setTimeout(()=>showStatus(false),350);
  };
  const saveCurrent=()=>{
    if(section)savePrintLayout(section,layout);
    showStatus(true);
  };
  const applyRow=value=>{
    layout.row=Math.max(70,Math.min(160,Math.round(Number(value)||100)));
    $('printRowLabel').textContent=`${layout.row}%`;
    $('printRowSlider').value=String(layout.row);
    applyPrintFrameLayout(frame,layout);
    saveCurrent();
  };

  $('printRowMinusBtn')?.addEventListener('click',()=>applyRow(layout.row-10));
  $('printRowPlusBtn')?.addEventListener('click',()=>applyRow(layout.row+10));
  $('printRowSlider')?.addEventListener('input',e=>applyRow(e.target.value));

  $('printPreviewCloseBtn')?.addEventListener('click',closePrintPreview);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closePrintPreview();});

  $('printUseDashboardBtn')?.addEventListener('click',()=>{
    layout={
      row:Math.max(70,Math.min(160,Number(dashboardLayout?.row)||100)),
      widths:Array.isArray(dashboardLayout?.widths)?dashboardLayout.widths.slice():null
    };
    if(section)clearPrintLayout(section);
    applyPrintFrameLayout(frame,layout);
    installPrintColumnResizers(frame,section,layout,showStatus);
    $('printRowLabel').textContent=`${Math.round(layout.row)}%`;
    $('printRowSlider').value=String(Math.round(layout.row));
    if(section)savePrintLayout(section,layout);
    showStatus(false);
  });

  $('printPreviewPrintBtn')?.addEventListener('click',()=>{
    try{
      if(section)savePrintLayout(section,layout);
      applyPrintFrameLayout(frame,layout);
      const target=frame?.contentWindow;
      if(!target)throw new Error('Print preview is not ready.');
      target.focus();
      target.print();
    }catch(e){
      toast(`Could not start printing: ${e.message}`,'error');
    }
  });

  frame.addEventListener('load',()=>{
    applyPrintFrameLayout(frame,layout);
    if(section)installPrintColumnResizers(frame,section,layout,showStatus);
  },{once:true});
  setTimeout(()=>frame?.focus(),80);
}
function printDocument(title,subtitle,bodyHtml,orientation='portrait',options={}){
  openPrintPreview(title,subtitle,bodyHtml,orientation,options);
}

function holdingsFilterDescription(items){
  const owner=state.selectedOwner==='ALL'?'Combined':shortOwner(state.selectedOwner);
  const asset=assetViewLabel();
  const type=els.holdingTypeFilter?.value||'ALL';
  const q=els.holdingSearch?.value.trim()||'';
  return `${items.length} visible · Investor: ${owner} · View: ${asset} · Type: ${type==='ALL'?'All assets':type}${q?` · Search: ${q}`:''}`;
}
function printHoldingsView(){
  const items=state.holdings.filter(holdingMatches),custom=sectionCustomColumns('HOLDINGS');
  const rows=items.map(h=>{
    const p=h.performance||{},s=h.transactionStats||{};
    const purchaseDates=exactDateList(s.purchaseDates?.length?s.purchaseDates:(h.buyDate?[h.buyDate]:[]));
    const saleDates=exactDateList(s.saleDates||[]);
    const customCells=custom.map(c=>`<td>${printEscape(formatCustomValuePlain(c,customValueFor('HOLDINGS',h.id,c.columnKey)))}</td>`).join('');
    return `<tr><td>${printEscape(shortOwner(h.owner))}</td><td>${printEscape(h.assetName)}<br><small>${printEscape(h.type)} ${printEscape(h.code||'')}</small></td>
      <td>${purchaseDates.length?purchaseDates.map(d=>printEscape(detailDate(d))).join('<br>'):'—'}</td>
      <td class="${saleDates.length?'neg':''}">${saleDates.length?saleDates.map(d=>printEscape(detailDate(d))).join('<br>'):'—'}</td>
      <td class="num">${printEscape(formatNumber(h.units))}</td><td class="num">${printEscape(formatCurrency(h.investedAmount))}</td><td class="num">${printEscape(formatCurrency(h.currentValue))}</td>
      <td class="num ${Number(h.gainLoss)>=0?'pos':'neg'}">${printEscape(formatCurrency(h.gainLoss))}</td>
      <td class="num ${h.realizedPnl!=null&&Number(h.realizedPnl)>=0?'pos':'neg'}">${h.realizedPnl==null?'—':printEscape(formatCurrency(h.realizedPnl))}</td>
      <td class="num ${h.totalPnlToDate!=null&&Number(h.totalPnlToDate)>=0?'pos':'neg'}">${h.totalPnlToDate==null?'—':printEscape(formatCurrency(h.totalPnlToDate))}</td>
      <td class="num ${Number(h.returnPct)>=0?'pos':'neg'}">${printEscape(formatPercent(h.returnPct))}</td><td class="num">${printEscape(formatPercent(h.xirr))}</td>
      <td class="num">${printEscape(formatPercent(p.m1))}</td><td class="num">${printEscape(formatPercent(p.y1))}</td><td class="num">${printEscape(formatPercent(p.y3))}</td><td>${printEscape(h.notes||'')}</td>${customCells}</tr>`;
  }).join('');
  const map=[0,1,2,3,4,6,8,9,10,11,12,13,16,18,19,22,...custom.map((c,i)=>23+i)];
  const dashboardLayout=dashboardPrintLayout('holdings',map),activeLayout=loadPrintLayout('holdings')||dashboardLayout;
  const customHeads=custom.map(c=>`<th>${printEscape(c.label)}</th>`).join(''),colCount=16+custom.length;
  const body=`<table>${printColgroup(activeLayout.widths)}<thead><tr><th>Investor</th><th>Investment</th><th>Purchase Date(s)</th><th>Sale Date(s)</th><th>Qty/Units</th><th>Invested</th><th>Current</th><th>Current P/L</th><th>Realised P/L</th><th>Total P/L</th><th>Return</th><th>XIRR</th><th>1M</th><th>1Y</th><th>3Y</th><th>Note</th>${customHeads}</tr></thead><tbody>${rows||`<tr><td colspan="${colCount}">No matching investments.</td></tr>`}</tbody></table>`;
  printDocument('Investment Portfolio — Exact Dates & P/L',holdingsFilterDescription(items),body,'landscape',{section:'holdings',dashboardLayout});
}
function watchFilterDescription(items){
  const parts=[`${items.length} visible`];
  if(els.watchTypeFilter?.value!=='ALL')parts.push(`Type: ${els.watchTypeFilter.value}`);
  if(els.watchPriorityFilter?.value!=='ALL')parts.push(`Priority: ${els.watchPriorityFilter.value}`);
  if(els.watchTargetFilter?.value!=='ALL')parts.push(`Target: ${els.watchTargetFilter.options[els.watchTargetFilter.selectedIndex]?.text||els.watchTargetFilter.value}`);
  if(els.watchSearch?.value.trim())parts.push(`Search: ${els.watchSearch.value.trim()}`);
  return parts.join(' · ');
}
function printWatchlistView(){
  const items=visibleWatchlist();
  const custom=sectionCustomColumns('WATCHLIST');
  const rows=items.map(x=>{const s=x.sourceDetails||{};const customCells=custom.map(c=>`<td>${printEscape(formatCustomValuePlain(c,customValueFor('WATCHLIST',x.id,c.columnKey)))}</td>`).join('');return `<tr><td>${printEscape(x.assetName)}<br><small>${printEscape(x.type)} ${printEscape(x.code||'')}</small></td><td class="num">${printEscape(formatCurrency(x.currentPrice))}</td><td class="num">${printEscape(formatCurrency(x.targetPrice))}</td><td class="num">${printEscape(formatPercent(x.distancePct))}</td><td>${printEscape(x.priority||'')}</td><td class="num">${printEscape(formatPercent(s.perf1M))}</td><td class="num">${printEscape(formatPercent(s.perf1Y))}</td><td class="num">${printEscape(formatPercent(s.perf3Y))}</td><td>${printEscape(s.valuation||'')}</td><td>${printEscape(s.moatRemark||'')}</td><td>${printEscape(x.notes||'')}</td>${customCells}</tr>`;}).join('');
  const map=[0,1,3,4,null,7,8,9,6,12,13,...custom.map((c,i)=>14+i)];
  const dashboardLayout=dashboardPrintLayout('watchlist',map);
  const activeLayout=loadPrintLayout('watchlist')||dashboardLayout;
  const customHeads=custom.map(c=>`<th>${printEscape(c.label)}</th>`).join('');
  const colCount=11+custom.length;
  const body=`<table>${printColgroup(activeLayout.widths)}<thead><tr><th>Asset</th><th>Live Price/NAV</th><th>Target</th><th>Distance</th><th>Priority</th><th>1M</th><th>1Y</th><th>3Y</th><th>P/E or P/B</th><th>Remark/Moat</th><th>Personal Note</th>${customHeads}</tr></thead><tbody>${rows||`<tr><td colspan="${colCount}">No matching watchlist items.</td></tr>`}</tbody></table>`;
  printDocument('Investment Watchlist — Filtered View',watchFilterDescription(items),body,'landscape',{section:'watchlist',dashboardLayout});
}
function printDiaryView(){
  const items=diaryVisibleItems();
  const subtitle=els.diarySummary?.textContent||`${items.length} entries`;
  const body=items.map(item=>`<article class="entry"><div class="entry-date">${printEscape(diaryDateLabel(item.entryDate))}</div><h3>${printEscape(item.title?.trim()||'Untitled entry')}</h3><div class="entry-text">${printEscape(item.text||'')}</div></article>`).join('')||'<p>No diary entries match this filter.</p>';
  printDocument('Daily Diary — Filtered View',subtitle,body,'portrait');
}
function printMonthlyView(){
  const items=monthlyVisibleItems();
  const y=els.monthlyYearFilter?.value||'ALL',m=els.monthlyMonthFilter?.value||'ALL';
  const filters=[y==='ALL'?'All years':y,m==='ALL'?'All months':els.monthlyMonthFilter.options[els.monthlyMonthFilter.selectedIndex]?.text];
  if(els.monthlyTypeFilter?.value!=='ALL')filters.push(els.monthlyTypeFilter.value);
  if(els.monthlyStatusFilter?.value!=='ALL')filters.push(els.monthlyStatusFilter.value);
  if(els.monthlySearch?.value.trim())filters.push(`Search: ${els.monthlySearch.value.trim()}`);
  const body=items.map(item=>`<article class="entry"><div class="entry-date">${printEscape(monthKeyLabel(item.monthKey))} · <span class="monthly-type">${printEscape(item.entryType)}</span>${item.entryType==='TARGET'?` · <span class="status">${printEscape(item.status==='COMPLETED'?'Achieved':'Open target')}</span>`:''}</div><h3>${printEscape(item.title?.trim()||item.entryType)}</h3><div class="entry-text">${printEscape(item.text||'')}</div></article>`).join('')||'<p>No monthly records match this filter.</p>';
  printDocument('Monthly Diary / Plan / Experience — Filtered View',`${items.length} items · ${filters.join(' · ')}`,body,'portrait');
}

function exportCsv(){
  const headers=['Investor','Type','Asset','Code','Exchange','All Purchase Dates','All Sale Dates','Units','Avg Buy','Invested / Present Balance','Current Price','Current Value','GPF Monthly Payment','GPF Annual Interest %','GPF Balance As On','GPF 12M Payments','GPF Est. 12M Interest','GPF Projected 12M Balance','Current P/L Till Today','Realised P/L','Total P/L To Date','Gain %','XIRR','1D','1W','1M','6M','1Y','3Y','5Y','10Y','Personal Note'];
  const rows=visibleHoldings().map(h=>{
    const p=h.performance||{},s=h.transactionStats||{};
    const purchaseDates=exactDateList(s.purchaseDates?.length?s.purchaseDates:(h.buyDate?[h.buyDate]:[])).join(' | ');
    const saleDates=exactDateList(s.saleDates||[]).join(' | ');
    const g=h.type==='GPF'?(h.gpfProjection||{}):{};
    return[shortOwner(h.owner),h.type,h.assetName,h.code,h.exchange,purchaseDates,saleDates,h.type==='GPF'?'':h.units,h.type==='GPF'?'':Number(h.units)>0?Number(h.investedAmount)/Number(h.units):'',h.investedAmount,h.type==='GPF'?'':h.currentPrice,h.currentValue,h.type==='GPF'?h.monthlyContribution:'',h.type==='GPF'?h.annualInterestRate:'',h.type==='GPF'?h.balanceAsOfDate:'',h.type==='GPF'?g.contributions:'',h.type==='GPF'?g.estimatedInterest:'',h.type==='GPF'?g.projectedBalance:'',h.gainLoss,h.realizedPnl,h.totalPnlToDate,h.returnPct,h.xirr,p.d1,p.w1,p.m1,p.m6,p.y1,p.y3,p.y5,p.y10,h.notes||''];
  });
  const csv=[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),blob=new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`my-finance-${state.selectedOwner==='ALL'?'combined':shortOwner(state.selectedOwner)}-${state.selectedAssetView.toLowerCase()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function changePassword(event){event.preventDefault();if(els.newPassword.value!==els.confirmPassword.value){toast('New passwords do not match.','error');return;}const b=event.submitter;setBusy(b,true,'Updating…');try{await api('changePassword',{currentPassword:els.currentPassword.value,newPassword:els.newPassword.value});closeModals();els.passwordForm.reset();toast('Password changed.','success');}catch(e){toast(e.message,'error');}finally{setBusy(b,false);}}

function dateShiftIso(value,days){
  const base=/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?new Date(`${value}T12:00:00`):new Date();
  base.setDate(base.getDate()+days);
  return localIsoDate(base);
}
function monthShiftIso(value,months){
  const valid=/^\d{4}-\d{2}$/.test(String(value||''))?String(value):localIsoMonth();
  const [y,m]=valid.split('-').map(Number);
  const d=new Date(y,m-1+months,1,12,0,0);
  return localIsoMonth(d);
}
function autosizeDiaryTextarea(el){
  if(!el)return;
  el.style.height='auto';
  el.style.height=`${Math.min(Math.max(el.scrollHeight,150),520)}px`;
}
function diaryDraftKey(){return `myfinance_daily_draft_${state.username||'guest'}_${els.diaryDate?.value||localIsoDate()}`;}
function monthlyDraftKey(){return `myfinance_monthly_draft_${state.username||'guest'}_${els.monthlyEntryMonth?.value||localIsoMonth()}_${els.monthlyEntryType?.value||'DIARY'}`;}
function updateDiaryWritingMeta(){
  if(els.diaryCharCount)els.diaryCharCount.textContent=`${els.diaryText?.value.length||0} / 5000`;
  const diaryWords=String(els.diaryText?.value||'').trim().split(/\s+/).filter(Boolean).length;
  const wordCount=$('diaryWordCount'),readTime=$('diaryReadTime');
  if(wordCount)wordCount.textContent=`${diaryWords} ${diaryWords===1?'word':'words'}`;
  if(readTime)readTime.textContent=diaryWords?`${Math.max(1,Math.ceil(diaryWords/200))} min read`:'Ready to write';
  if(els.monthlyCharCount)els.monthlyCharCount.textContent=`${els.monthlyText?.value.length||0} / 5000`;
  autosizeDiaryTextarea(els.diaryText);autosizeDiaryTextarea(els.monthlyText);
}
function insertDiaryStarter(kind){
  if(!els.diaryText)return;
  const starters={
    highlight:'Today’s highlight:\n',
    gratitude:'I am grateful for:\n',
    lesson:'What I learned today:\n',
    tomorrow:'Tomorrow’s main focus:\n'
  };
  const starter=starters[String(kind||'')];
  if(!starter)return;
  const text=els.diaryText.value||'';
  const start=Number.isFinite(els.diaryText.selectionStart)?els.diaryText.selectionStart:text.length;
  const end=Number.isFinite(els.diaryText.selectionEnd)?els.diaryText.selectionEnd:start;
  const prefix=start>0&&!text.slice(0,start).endsWith('\n\n')?'\n\n':'';
  els.diaryText.value=text.slice(0,start)+prefix+starter+text.slice(end);
  const cursor=start+prefix.length+starter.length;
  els.diaryText.focus();
  els.diaryText.setSelectionRange(cursor,cursor);
  scheduleDailyDraft();
}
function saveDailyDraft(){
  if(!els.diaryText)return;
  const payload={title:els.diaryTitle.value||'',text:els.diaryText.value||'',savedAt:Date.now()};
  if(payload.title||payload.text)localStorage.setItem(diaryDraftKey(),JSON.stringify(payload));else localStorage.removeItem(diaryDraftKey());
  if(els.diaryDraftStatus)els.diaryDraftStatus.textContent=payload.title||payload.text?'Draft saved locally':'Draft ready';
}
function restoreDailyDraft(){
  if(els.diaryId?.value)return;
  const raw=localStorage.getItem(diaryDraftKey());
  if(!raw){if(els.diaryDraftStatus)els.diaryDraftStatus.textContent='Draft ready';updateDiaryWritingMeta();return;}
  try{const d=JSON.parse(raw);if(!els.diaryTitle.value)els.diaryTitle.value=d.title||'';if(!els.diaryText.value)els.diaryText.value=d.text||'';if(els.diaryDraftStatus)els.diaryDraftStatus.textContent='Local draft restored';}catch{}
  updateDiaryWritingMeta();
}
function clearDailyDraft(){localStorage.removeItem(diaryDraftKey());if(els.diaryDraftStatus)els.diaryDraftStatus.textContent='Saved';}
function scheduleDailyDraft(){clearTimeout(state.diaryDraftTimer);if(els.diaryDraftStatus)els.diaryDraftStatus.textContent='Saving draft…';state.diaryDraftTimer=setTimeout(saveDailyDraft,450);updateDiaryWritingMeta();}
function saveMonthlyDraft(){
  if(!els.monthlyText)return;
  const payload={title:els.monthlyTitle.value||'',text:els.monthlyText.value||'',savedAt:Date.now()};
  if(payload.title||payload.text)localStorage.setItem(monthlyDraftKey(),JSON.stringify(payload));else localStorage.removeItem(monthlyDraftKey());
  if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent=payload.title||payload.text?'Draft saved locally':'Draft ready';
}
function restoreMonthlyDraft(){
  if(els.monthlyId?.value)return;
  const raw=localStorage.getItem(monthlyDraftKey());
  if(!raw){if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent='Draft ready';updateDiaryWritingMeta();return;}
  try{const d=JSON.parse(raw);if(!els.monthlyTitle.value)els.monthlyTitle.value=d.title||'';if(!els.monthlyText.value)els.monthlyText.value=d.text||'';if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent='Local draft restored';}catch{}
  updateDiaryWritingMeta();
}
function clearMonthlyDraft(){localStorage.removeItem(monthlyDraftKey());if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent='Saved';}
function scheduleMonthlyDraft(){clearTimeout(state.monthlyDraftTimer);if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent='Saving draft…';state.monthlyDraftTimer=setTimeout(saveMonthlyDraft,450);updateDiaryWritingMeta();}
function setDailyDiaryDate(value,{syncBrowse=true,restore=true}={}){
  if(!value)return;els.diaryDate.value=value;if(syncBrowse){els.diaryBrowseDate.value=value;state.diaryView='DAILY';}
  if(!els.diaryId.value){els.diaryTitle.value='';els.diaryText.value='';}renderDiary();if(restore)restoreDailyDraft();updateDiaryWritingMeta();
}
function setMonthlyEntryMonth(value,{syncFilter=true,restore=true}={}){
  if(!value)return;els.monthlyEntryMonth.value=value;
  if(syncFilter){refreshMonthlyYearFilter();els.monthlyYearFilter.value=value.slice(0,4);els.monthlyMonthFilter.value=value.slice(5,7);}
  if(!els.monthlyId.value){els.monthlyTitle.value='';els.monthlyText.value='';}renderMonthlyDiary();if(restore)restoreMonthlyDraft();updateDiaryWritingMeta();
}
function activeHorizontalScrollTarget(){
  if(state.activeSection==='holdings')return document.querySelector('#holdingsSection .table-wrap');
  if(state.activeSection==='transactions')return document.querySelector('#transactionsSection .table-wrap');
  if(state.activeSection==='watchlist')return document.querySelector('#watchlistSection .table-wrap');
  return null;
}
function horizontalSectionLabel(){
  if(state.activeSection==='holdings')return 'Holdings · smooth left / right';
  if(state.activeSection==='transactions')return 'Transactions · smooth left / right';
  if(state.activeSection==='watchlist')return 'Watchlist · smooth left / right';
  return 'Horizontal scroll';
}
function refreshDashboardHScroll(){
  if(!els.dashboardHScroll||!els.dashboardHScrollRange)return;
  const target=activeHorizontalScrollTarget();
  state.hScrollTarget=target;

  // V15.9: show the fixed controller whenever Holdings or Watchlist is active.
  // Do not hide it based on early scrollWidth measurements; some browsers calculate
  // table dimensions a moment after a hidden section becomes visible.
  const shouldShow=Boolean(target&&['holdings','transactions','watchlist'].includes(state.activeSection));
  els.dashboardHScroll.classList.toggle('hidden',!shouldShow);
  if(!shouldShow)return;

  const maxScroll=Math.max(0,target.scrollWidth-target.clientWidth);
  const pct=maxScroll>0?Math.round((target.scrollLeft/maxScroll)*100):0;
  els.dashboardHScrollRange.disabled=maxScroll<=0;
  els.dashboardHScrollRange.value=maxScroll>0?String(Math.round((target.scrollLeft/maxScroll)*1000)):'0';
  if(els.dashboardHScrollPct)els.dashboardHScrollPct.textContent=`${pct}%`;
  if(els.dashboardHScrollLabel)els.dashboardHScrollLabel.textContent=horizontalSectionLabel();

  els.dashboardHScrollLeft.disabled=maxScroll<=0||target.scrollLeft<=1;
  els.dashboardHScrollRight.disabled=maxScroll<=0||target.scrollLeft>=maxScroll-1;
}
let hScrollRangeRaf=0;
let hScrollUiRaf=0;

function queueHScrollUiRefresh(){
  if(hScrollUiRaf)return;
  hScrollUiRaf=requestAnimationFrame(()=>{
    hScrollUiRaf=0;
    refreshDashboardHScroll();
  });
}
function syncHScrollFromRange(){
  const target=state.hScrollTarget||activeHorizontalScrollTarget();
  if(!target||!els.dashboardHScrollRange)return;
  const value=Number(els.dashboardHScrollRange.value||0);
  if(hScrollRangeRaf)cancelAnimationFrame(hScrollRangeRaf);
  hScrollRangeRaf=requestAnimationFrame(()=>{
    hScrollRangeRaf=0;
    const maxScroll=Math.max(0,target.scrollWidth-target.clientWidth);
    animateHorizontalScroll(target,maxScroll*(value/1000),150);
    queueHScrollUiRefresh();
  });
}
let hScrollAnimRaf=0;
function animateHorizontalScroll(target,to,duration=360){
  if(!target)return;
  if(hScrollAnimRaf)cancelAnimationFrame(hScrollAnimRaf);
  const start=target.scrollLeft;
  const max=Math.max(0,target.scrollWidth-target.clientWidth);
  const end=Math.max(0,Math.min(max,to));
  const delta=end-start;
  if(Math.abs(delta)<1)return;
  const began=performance.now();
  const ease=t=>1-Math.pow(1-t,3);
  const frame=now=>{
    const t=Math.min(1,(now-began)/duration);
    target.scrollLeft=start+delta*ease(t);
    queueHScrollUiRefresh();
    if(t<1)hScrollAnimRaf=requestAnimationFrame(frame);
    else hScrollAnimRaf=0;
  };
  hScrollAnimRaf=requestAnimationFrame(frame);
}
function scrollDashboardHorizontal(direction,ratio=.52){
  const target=state.hScrollTarget||activeHorizontalScrollTarget();
  if(!target)return;
  const step=Math.max(160,Math.min(520,target.clientWidth*ratio));
  animateHorizontalScroll(target,target.scrollLeft+(direction*step),360);
}
function shouldIgnoreHorizontalKeys(target){
  if(!target)return false;
  const tag=String(target.tagName||'').toUpperCase();
  return ['INPUT','TEXTAREA','SELECT'].includes(tag)||target.isContentEditable;
}
function handleDashboardHorizontalKeydown(e){
  if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
  if(shouldIgnoreHorizontalKeys(e.target))return;
  if(!['holdings','transactions','watchlist'].includes(state.activeSection))return;
  const target=state.hScrollTarget||activeHorizontalScrollTarget();
  if(!target||target.scrollWidth<=target.clientWidth+2)return;

  e.preventDefault();
  const dir=e.key==='ArrowRight'?1:-1;
  // Normal press = smaller smooth movement; Shift = larger movement.
  scrollDashboardHorizontal(dir,e.shiftKey?.58:.24);
}
function bindSmoothHorizontalTable(wrap){
  if(!wrap||wrap.dataset.smoothHorizontalBound==='1')return;
  wrap.dataset.smoothHorizontalBound='1';
  wrap.classList.add('keyboard-smooth-ready');

  // Shift + mouse-wheel becomes smooth horizontal movement.
  wrap.addEventListener('wheel',e=>{
    const max=Math.max(0,wrap.scrollWidth-wrap.clientWidth);
    if(max<=0)return;
    if(e.shiftKey&&Math.abs(e.deltaY)>0){
      e.preventDefault();
      animateHorizontalScroll(wrap,wrap.scrollLeft+(e.deltaY*.62),190);
      queueHScrollUiRefresh();
    }
  },{passive:false});

  // Coalesce the UI-controller refresh to one animation frame.
  wrap.addEventListener('scroll',()=>{
    if(wrap===state.hScrollTarget)queueHScrollUiRefresh();
  },{passive:true});
}
function scheduleDashboardHScrollRefresh(){
  requestAnimationFrame(()=>{
    refreshDashboardHScroll();
    setTimeout(refreshDashboardHScroll,80);
    setTimeout(refreshDashboardHScroll,300);
    setTimeout(refreshDashboardHScroll,700);
  });
}

function openQuickDiary(mode='DAILY'){
  state.quickDiaryMode=mode==='MONTHLY'?'MONTHLY':'DAILY';
  renderQuickDiaryMode();
  if(!els.quickDailyDate.value)els.quickDailyDate.value=localIsoDate();
  if(!els.quickMonthlyMonth.value)els.quickMonthlyMonth.value=localIsoMonth();
  els.quickDiaryPanel.classList.add('open');
  els.quickDiaryPanel.setAttribute('aria-hidden','false');
  setTimeout(()=>state.quickDiaryMode==='DAILY'?els.quickDailyText?.focus():els.quickMonthlyText?.focus(),80);
}
function closeQuickDiary(){
  els.quickDiaryPanel.classList.remove('open');
  els.quickDiaryPanel.setAttribute('aria-hidden','true');
}
function renderQuickDiaryMode(){
  const monthly=state.quickDiaryMode==='MONTHLY';
  els.quickDailyForm.classList.toggle('hidden',monthly);
  els.quickMonthlyForm.classList.toggle('hidden',!monthly);
  $$('[data-quick-diary-mode]').forEach(b=>b.classList.toggle('active',b.dataset.quickDiaryMode===state.quickDiaryMode));
}
function updateQuickDiaryCounts(){
  els.quickDailyCount.textContent=`${els.quickDailyText.value.length} / 5000`;
  els.quickMonthlyCount.textContent=`${els.quickMonthlyText.value.length} / 5000`;
  autosizeDiaryTextarea(els.quickDailyText);
  autosizeDiaryTextarea(els.quickMonthlyText);
}
async function saveQuickDaily(event){
  event.preventDefault();
  if(!els.quickDailyDate.value||!els.quickDailyText.value.trim()){toast('Choose a date and write the daily entry.','error');return;}
  setBusy(els.quickDailySaveBtn,true,'Saving…');els.quickDailyStatus.textContent='Saving…';
  try{
    const result=await api('saveDiaryEntry',{entry:{id:'',entryDate:els.quickDailyDate.value,title:els.quickDailyTitle.value.trim(),text:els.quickDailyText.value.trim()}});
    applyBootstrap(result.data);saveCache(result.data);els.quickDailyTitle.value='';els.quickDailyText.value='';updateQuickDiaryCounts();els.quickDailyStatus.textContent='Saved';toast('Daily diary saved.','success');
  }catch(e){els.quickDailyStatus.textContent='Save failed';toast(e.message,'error');}
  finally{setBusy(els.quickDailySaveBtn,false);}
}
async function saveQuickMonthly(event){
  event.preventDefault();
  if(!els.quickMonthlyMonth.value||!els.quickMonthlyText.value.trim()){toast('Choose a month and write the monthly item.','error');return;}
  setBusy(els.quickMonthlySaveBtn,true,'Saving…');els.quickMonthlyStatus.textContent='Saving…';
  try{
    const result=await api('saveMonthlyItem',{item:{id:'',monthKey:els.quickMonthlyMonth.value,entryType:els.quickMonthlyType.value,title:els.quickMonthlyTitle.value.trim(),text:els.quickMonthlyText.value.trim()}});
    applyBootstrap(result.data);saveCache(result.data);els.quickMonthlyTitle.value='';els.quickMonthlyText.value='';updateQuickDiaryCounts();els.quickMonthlyStatus.textContent='Saved';toast('Monthly diary item saved.','success');
  }catch(e){els.quickMonthlyStatus.textContent='Save failed';toast(e.message,'error');}
  finally{setBusy(els.quickMonthlySaveBtn,false);}
}

function diaryDateLabel(value){
  if(!value)return 'No date';
  const d=new Date(`${String(value).slice(0,10)}T00:00:00`);
  return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(d);
}
function resetDiaryForm(dateValue=''){
  els.diaryForm?.reset();
  els.diaryId.value='';
  els.diaryDate.value=dateValue||els.diaryBrowseDate?.value||localIsoDate();
  els.diarySaveStatus.textContent='New entry';
  restoreDailyDraft();
  updateDiaryWritingMeta();
}
function openDiaryEntry(item){
  if(!item)return;
  switchSection('diary');
  els.diaryId.value=item.id||'';
  els.diaryDate.value=item.entryDate||localIsoDate();
  els.diaryTitle.value=item.title||'';
  els.diaryText.value=item.text||'';
  els.diarySaveStatus.textContent=`Editing ${diaryDateLabel(item.entryDate)}`;
  if(els.diaryDraftStatus)els.diaryDraftStatus.textContent='Editing saved entry';
  updateDiaryWritingMeta();
  setTimeout(()=>els.diaryText?.focus(),50);
}
function diaryVisibleItems(){
  const q=String(els.diarySearch?.value||'').trim().toLowerCase();
  let items=[...state.diary];
  if(q){
    items=items.filter(x=>`${x.entryDate||''} ${x.title||''} ${x.text||''}`.toLowerCase().includes(q));
  }else if(state.diaryView==='DAILY'){
    const day=els.diaryBrowseDate?.value||localIsoDate();
    items=items.filter(x=>String(x.entryDate||'').slice(0,10)===day);
  }else if(state.diaryView==='MONTHLY'){
    const month=els.diaryBrowseMonth?.value||localIsoMonth();
    items=items.filter(x=>String(x.entryDate||'').slice(0,7)===month);
  }else if(state.diaryView==='RANGE'){
    const from=els.diaryFromDate?.value||'0000-01-01';
    const to=els.diaryToDate?.value||'9999-12-31';
    items=items.filter(x=>{
      const d=String(x.entryDate||'').slice(0,10);
      return d>=from&&d<=to;
    });
  }
  return items.sort((a,b)=>{
    const byDate=String(b.entryDate||'').localeCompare(String(a.entryDate||''));
    return byDate!==0?byDate:String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
  });
}

function recentDiaryTextPreview(text,max=118){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  return clean.length>max?`${clean.slice(0,max).trim()}…`:clean;
}
function recentDailyItems(){
  const q=String(els.recentDailySearch?.value||'').trim().toLowerCase();
  const limit=Math.max(3,Math.min(10,Number(els.recentDailyLimit?.value||5)));
  return [...state.diary]
    .filter(item=>!q||`${item.entryDate||''} ${item.title||''} ${item.text||''}`.toLowerCase().includes(q))
    .sort((a,b)=>{
      const byDate=String(b.entryDate||'').localeCompare(String(a.entryDate||''));
      return byDate!==0?byDate:String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
    })
    .slice(0,limit);
}
function renderRecentDailyEntries(){
  if(!els.recentDailyList)return;
  const items=recentDailyItems();
  if(els.recentDailyCount)els.recentDailyCount.textContent=`${items.length} entr${items.length===1?'y':'ies'}`;
  if(els.recentDailyMobileCount)els.recentDailyMobileCount.textContent=String(items.length);
  els.recentDailyEmpty?.classList.toggle('hidden',items.length>0);
  els.recentDailyList.innerHTML=items.map(item=>{
    const id=escapeHtml(item.id);
    const title=escapeHtml(item.title?.trim()||'Untitled entry');
    const full=escapeHtml(item.text||'');
    return `<article class="recent-diary-card" data-recent-diary-card="${id}">
      <div class="recent-diary-card-top">
        <span class="recent-diary-date">${escapeHtml(diaryDateLabel(item.entryDate))}</span>
        <div class="recent-diary-card-actions">
          <button type="button" class="recent-link-button" data-recent-diary-view="${id}" aria-expanded="false">View</button>
          <button type="button" class="recent-link-button edit" data-edit-diary="${id}">Edit</button>
        </div>
      </div>
      <strong>${title}</strong>
      <p class="recent-diary-preview">${escapeHtml(recentDiaryTextPreview(item.text))}</p>
      <div class="recent-diary-full">${full}</div>
    </article>`;
  }).join('');
}
function recentMonthlyItems(){
  const q=String(els.recentMonthlySearch?.value||'').trim().toLowerCase();
  const limit=Math.max(3,Math.min(10,Number(els.recentMonthlyLimit?.value||5)));
  return [...state.monthlyDiary]
    .filter(item=>!q||`${item.monthKey||''} ${item.entryType||''} ${item.title||''} ${item.text||''}`.toLowerCase().includes(q))
    .sort((a,b)=>{
      const updated=String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
      if(updated!==0)return updated;
      return String(b.monthKey||'').localeCompare(String(a.monthKey||''));
    })
    .slice(0,limit);
}
function renderRecentMonthlyEntries(){
  if(!els.recentMonthlyList)return;
  const items=recentMonthlyItems();
  if(els.recentMonthlyCount)els.recentMonthlyCount.textContent=`${items.length} item${items.length===1?'':'s'}`;
  if(els.recentMonthlyMobileCount)els.recentMonthlyMobileCount.textContent=String(items.length);
  els.recentMonthlyEmpty?.classList.toggle('hidden',items.length>0);
  const typeLabel={DIARY:'Diary',PLAN:'Plan',EXPERIENCE:'Experience',TARGET:'Target'};
  els.recentMonthlyList.innerHTML=items.map(item=>{
    const id=escapeHtml(item.id);
    const kind=typeLabel[item.entryType]||item.entryType||'Monthly';
    const full=escapeHtml(item.text||'');
    return `<article class="recent-diary-card recent-monthly-card" data-recent-monthly-card="${id}">
      <div class="recent-diary-card-top">
        <span class="recent-monthly-meta"><b>${escapeHtml(kind)}</b> · ${escapeHtml(monthKeyLabel(item.monthKey))}</span>
        <div class="recent-diary-card-actions">
          <button type="button" class="recent-link-button" data-recent-monthly-view="${id}" aria-expanded="false">View</button>
          <button type="button" class="recent-link-button edit" data-edit-monthly="${id}">Edit</button>
        </div>
      </div>
      <strong>${escapeHtml(item.title?.trim()||kind)}</strong>
      <p class="recent-diary-preview">${escapeHtml(recentDiaryTextPreview(item.text))}</p>
      <div class="recent-diary-full">${full}</div>
    </article>`;
  }).join('');
}
function toggleRecentEntryCard(button,card){
  if(!button||!card)return;
  const expanded=card.classList.toggle('expanded');
  button.textContent=expanded?'Collapse':'View';
  button.setAttribute('aria-expanded',expanded?'true':'false');
}
function toggleRecentRail(kind,button){
  const rail=kind==='monthly'?els.recentMonthlyRail:els.recentDailyRail;
  if(!rail)return;
  const collapsed=rail.classList.toggle('mobile-collapsed');
  if(button)button.setAttribute('aria-expanded',collapsed?'false':'true');
}

function renderDiary(){
  if(!els.diaryList)return;
  const q=String(els.diarySearch?.value||'').trim();
  const items=diaryVisibleItems();
  els.diaryDayControl.classList.toggle('hidden',state.diaryView!=='DAILY'||Boolean(q));
  els.diaryMonthControl.classList.toggle('hidden',state.diaryView!=='MONTHLY'||Boolean(q));
  if(els.diaryRangeControl)els.diaryRangeControl.classList.toggle('hidden',state.diaryView!=='RANGE'||Boolean(q));
  $$('[data-diary-view]').forEach(b=>b.classList.toggle('active',b.dataset.diaryView===state.diaryView));

  if(q)els.diarySummary.textContent=`Search results · ${items.length} entr${items.length===1?'y':'ies'}`;
  else if(state.diaryView==='DAILY')els.diarySummary.textContent=`${diaryDateLabel(els.diaryBrowseDate.value||localIsoDate())} · ${items.length} entr${items.length===1?'y':'ies'}`;
  else if(state.diaryView==='MONTHLY'){
    const month=els.diaryBrowseMonth.value||localIsoMonth(),d=new Date(`${month}-01T00:00:00`);
    const label=Number.isNaN(d.getTime())?month:new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric'}).format(d);
    els.diarySummary.textContent=`${label} · ${items.length} entr${items.length===1?'y':'ies'}`;
  }else{
    const from=els.diaryFromDate.value||'Start',to=els.diaryToDate.value||'Today';
    els.diarySummary.textContent=`${from} → ${to} · ${items.length} entr${items.length===1?'y':'ies'}`;
  }

  let lastDate='';
  els.diaryList.innerHTML=items.map(item=>{
    const date=String(item.entryDate||'').slice(0,10);
    const dateHeader=state.diaryView==='MONTHLY'&&!q&&date!==lastDate?`<div class="diary-date-divider"><span>${escapeHtml(diaryDateLabel(date))}</span></div>`:'';
    lastDate=date;
    return `${dateHeader}<article class="diary-card" data-diary-view-entry="${escapeHtml(item.id)}">
      <div class="diary-card-head">
        <div><span class="diary-date-pill">${escapeHtml(diaryDateLabel(date))}</span><h4>${escapeHtml(item.title?.trim()||'Untitled entry')}</h4></div>
        <div class="diary-card-actions">
          <button type="button" class="small-button" data-edit-diary="${escapeHtml(item.id)}">Edit</button>
          <button type="button" class="small-button danger" data-delete-diary="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>
      <div class="diary-card-text">${escapeHtml(item.text||'')}</div>
      <div class="diary-card-foot"><span>Updated ${escapeHtml(dateLabel(item.updatedAt))}</span></div>
    </article>`;
  }).join('');
  els.diaryEmpty.classList.toggle('hidden',items.length>0);
  renderRecentDailyEntries();
}
async function saveDiaryEntry(event){
  event.preventDefault();
  if(!els.diaryDate.value||!els.diaryText.value.trim()){toast('Choose a date and write a diary entry.','error');return;}
  setBusy(els.saveDiaryBtn,true,'Saving…');
  els.diarySaveStatus.textContent='Saving…';
  try{
    const result=await api('saveDiaryEntry',{entry:{
      id:els.diaryId.value,
      entryDate:els.diaryDate.value,
      title:els.diaryTitle.value.trim(),
      text:els.diaryText.value.trim()
    }});
    applyBootstrap(result.data);
    saveCache(result.data);
    els.diaryBrowseDate.value=els.diaryDate.value;
    els.diaryBrowseMonth.value=els.diaryDate.value.slice(0,7);
    state.diaryView='DAILY';
    clearDailyDraft();
    resetDiaryForm(els.diaryBrowseDate.value);
    renderDiary();
    toast('Diary entry saved.','success');
  }catch(e){els.diarySaveStatus.textContent='Save failed';toast(e.message,'error');}
  finally{setBusy(els.saveDiaryBtn,false);}
}
async function deleteDiaryEntry(id){
  if(!id||!confirm('Delete this diary entry?'))return;
  try{
    const result=await api('deleteDiaryEntry',{id});
    applyBootstrap(result.data);saveCache(result.data);renderDiary();toast('Diary entry deleted.','success');
  }catch(e){toast(e.message,'error');}
}


function monthKeyLabel(monthKey){
  if(!/^\d{4}-\d{2}$/.test(String(monthKey||'')))return String(monthKey||'');
  const d=new Date(`${monthKey}-01T00:00:00`);
  return new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric'}).format(d);
}
function currentMonthlyFilterKey(){
  const year=els.monthlyYearFilter?.value||String(new Date().getFullYear());
  const month=els.monthlyMonthFilter?.value||String(new Date().getMonth()+1).padStart(2,'0');
  return year!=='ALL'&&month!=='ALL'?`${year}-${month}`:'';
}
function refreshMonthlyYearFilter(){
  if(!els.monthlyYearFilter)return;
  const current=String(new Date().getFullYear());
  const years=new Set([current]);
  state.monthlyDiary.forEach(x=>{const y=String(x.monthKey||'').slice(0,4);if(/^\d{4}$/.test(y))years.add(y);});
  state.monthStatus.forEach(x=>{const y=String(x.monthKey||'').slice(0,4);if(/^\d{4}$/.test(y))years.add(y);});
  const previous=els.monthlyYearFilter.value||current;
  const sorted=[...years].sort((a,b)=>Number(b)-Number(a));
  els.monthlyYearFilter.innerHTML='<option value="ALL">All years</option>'+sorted.map(y=>`<option value="${y}">${y}</option>`).join('');
  els.monthlyYearFilter.value=[...sorted,'ALL'].includes(previous)?previous:current;
}
function resetMonthlyForm(monthValue=''){
  els.monthlyForm?.reset();
  els.monthlyId.value='';
  els.monthlyEntryMonth.value=monthValue||currentMonthlyFilterKey()||localIsoMonth();
  els.monthlyEntryType.value='DIARY';
  els.monthlySaveStatus.textContent='New monthly item';
  updateMonthlyTargetHelp();
  restoreMonthlyDraft();
  updateDiaryWritingMeta();
}
function updateMonthlyTargetHelp(){
  if(!els.monthlyTargetHelp)return;
  const isTarget=els.monthlyEntryType.value==='TARGET';
  els.monthlyTargetHelp.innerHTML=isTarget
    ? 'Save the target first. When achieved, use <strong>Mark completed</strong>. The month can be completed after all its targets are achieved.'
    : 'Use this space for a monthly diary, plan or experience. It remains saved with the selected month.';
}
function openMonthlyItem(item){
  if(!item)return;
  state.diaryWorkspace='MONTHLY';
  renderDiaryWorkspace();
  els.monthlyId.value=item.id||'';
  els.monthlyEntryMonth.value=item.monthKey||localIsoMonth();
  els.monthlyEntryType.value=item.entryType||'DIARY';
  els.monthlyTitle.value=item.title||'';
  els.monthlyText.value=item.text||'';
  els.monthlySaveStatus.textContent=`Editing ${monthKeyLabel(item.monthKey)}`;
  if(els.monthlyDraftStatus)els.monthlyDraftStatus.textContent='Editing saved item';
  updateDiaryWritingMeta();
  updateMonthlyTargetHelp();
  setTimeout(()=>els.monthlyText?.focus(),50);
}
function monthlyVisibleItems(){
  const y=els.monthlyYearFilter?.value||'ALL';
  const m=els.monthlyMonthFilter?.value||'ALL';
  const type=els.monthlyTypeFilter?.value||'ALL';
  const status=els.monthlyStatusFilter?.value||'ALL';
  const q=String(els.monthlySearch?.value||'').trim().toLowerCase();
  return [...state.monthlyDiary].filter(item=>{
    const key=String(item.monthKey||'');
    if(y!=='ALL'&&key.slice(0,4)!==y)return false;
    if(m!=='ALL'&&key.slice(5,7)!==m)return false;
    if(type!=='ALL'&&item.entryType!==type)return false;
    if(status!=='ALL'){
      if(item.entryType!=='TARGET')return false;
      if(status==='OPEN'&&item.status==='COMPLETED')return false;
      if(status==='COMPLETED'&&item.status!=='COMPLETED')return false;
    }
    if(q&&!`${item.monthKey||''} ${item.entryType||''} ${item.title||''} ${item.text||''}`.toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>{
    const byMonth=String(b.monthKey||'').localeCompare(String(a.monthKey||''));
    if(byMonth!==0)return byMonth;
    const targetOrder=(a.entryType==='TARGET'?0:1)-(b.entryType==='TARGET'?0:1);
    if(targetOrder!==0)return targetOrder;
    return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
  });
}
function monthStatusFor(monthKey){
  return state.monthStatus.find(x=>x.monthKey===monthKey)||null;
}
function monthTargets(monthKey){
  return state.monthlyDiary.filter(x=>x.monthKey===monthKey&&x.entryType==='TARGET');
}
function renderMonthCompletion(){
  if(!els.monthCompletionPanel)return;
  const key=currentMonthlyFilterKey();
  if(!key){
    els.monthCompletionPanel.classList.add('year-mode');
    els.monthCompletionTitle.textContent='Year / multi-month view';
    els.monthCompletionText.textContent='Choose one specific year and month to manage target completion and close the month.';
    els.monthProgressBar.style.width='0%';
    els.monthProgressLabel.textContent='Select a month';
    els.completeMonthBtn.disabled=true;
    els.completeMonthBtn.textContent='✓ Complete month';
    return;
  }
  els.monthCompletionPanel.classList.remove('year-mode');
  const targets=monthTargets(key);
  const completed=targets.filter(x=>x.status==='COMPLETED').length;
  const pct=targets.length?Math.round(completed/targets.length*100):0;
  const status=monthStatusFor(key);
  const monthDone=status?.status==='COMPLETED';
  els.monthCompletionTitle.textContent=monthKeyLabel(key);
  els.monthCompletionText.textContent=monthDone
    ? `Month completed and saved${status.completedAt?` · ${dateLabel(status.completedAt)}`:''}.`
    : targets.length
      ? `${targets.length-completed} target${targets.length-completed===1?'':'s'} still open.`
      : 'No targets yet. You can still save diary, plan and experiences, or add a target.';
  els.monthProgressBar.style.width=`${monthDone?100:pct}%`;
  els.monthProgressLabel.textContent=monthDone?'Month completed':`${completed} / ${targets.length} targets completed`;
  els.completeMonthBtn.disabled=!monthDone&&targets.length>0&&completed<targets.length;
  els.completeMonthBtn.textContent=monthDone?'↺ Reopen month':'✓ Complete month';
}
function renderCompletedMonthArchive(){
  if(!els.completedMonthArchive)return;
  const y=els.monthlyYearFilter?.value||'ALL';
  const m=els.monthlyMonthFilter?.value||'ALL';
  const completed=state.monthStatus
    .filter(x=>x.status==='COMPLETED')
    .filter(x=>y==='ALL'||String(x.monthKey).slice(0,4)===y)
    .filter(x=>m==='ALL'||String(x.monthKey).slice(5,7)===m)
    .sort((a,b)=>String(b.monthKey).localeCompare(String(a.monthKey)));
  els.completedMonthArchive.innerHTML=completed.length
    ? `<div class="completed-archive-head"><strong>Completed months</strong><span>${completed.length} saved</span></div><div class="completed-month-chips">${completed.map(x=>`<button type="button" data-open-completed-month="${escapeHtml(x.monthKey)}">✓ ${escapeHtml(monthKeyLabel(x.monthKey))}</button>`).join('')}</div>`
    : '';
}
function renderMonthlyDiary(){
  if(!els.monthlyList)return;
  const items=monthlyVisibleItems();
  const y=els.monthlyYearFilter.value||'ALL',m=els.monthlyMonthFilter.value||'ALL';
  const key=y!=='ALL'&&m!=='ALL'?`${y}-${m}`:'';
  els.monthlyListTitle.textContent=key?monthKeyLabel(key):y!=='ALL'?`${y} monthly records`:'All monthly records';
  els.monthlyResultCount.textContent=`${items.length} item${items.length===1?'':'s'}`;
  renderMonthCompletion();
  renderCompletedMonthArchive();

  let lastMonth='';
  els.monthlyList.innerHTML=items.map(item=>{
    const monthHeader=item.monthKey!==lastMonth?`<div class="monthly-month-divider"><span>${escapeHtml(monthKeyLabel(item.monthKey))}</span>${monthStatusFor(item.monthKey)?.status==='COMPLETED'?'<b>✓ Completed month</b>':''}</div>`:'';
    lastMonth=item.monthKey;
    const typeLabel={DIARY:'Diary',PLAN:'Plan',EXPERIENCE:'Experience',TARGET:'Target'}[item.entryType]||item.entryType;
    const isTarget=item.entryType==='TARGET';
    const isDone=item.status==='COMPLETED';
    return `${monthHeader}<article class="monthly-item-card type-${escapeHtml(String(item.entryType||'').toLowerCase())} ${isTarget&&isDone?'completed-target':''}">
      <div class="monthly-item-head">
        <div><span class="monthly-type-badge">${escapeHtml(typeLabel)}</span><h4>${escapeHtml(item.title?.trim()||typeLabel)}</h4></div>
        <div class="monthly-item-actions">
          ${isTarget?`<button type="button" class="small-button ${isDone?'completed-button':''}" data-toggle-monthly-target="${escapeHtml(item.id)}">${isDone?'✓ Completed':'Mark completed'}</button>`:''}
          <button type="button" class="small-button" data-edit-monthly="${escapeHtml(item.id)}">Edit</button>
          <button type="button" class="small-button danger" data-delete-monthly="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>
      <div class="monthly-item-text">${escapeHtml(item.text||'')}</div>
      <div class="monthly-item-foot"><span>${escapeHtml(monthKeyLabel(item.monthKey))}</span>${isTarget?`<span class="${isDone?'target-done':'target-open'}">${isDone?'Achieved':'Open target'}</span>`:''}</div>
    </article>`;
  }).join('');
  els.monthlyEmpty.classList.toggle('hidden',items.length>0);
  renderRecentMonthlyEntries();
}
function renderDiaryWorkspace(){
  const monthly=state.diaryWorkspace==='MONTHLY';
  els.dailyDiaryWorkspace.classList.toggle('hidden',monthly);
  els.monthlyDiaryWorkspace.classList.toggle('hidden',!monthly);
  $$('[data-diary-workspace]').forEach(b=>b.classList.toggle('active',b.dataset.diaryWorkspace===state.diaryWorkspace));
  els.newDiaryEntryBtn.textContent=monthly?'+ New monthly item':'+ New daily entry';
  if(monthly){refreshMonthlyYearFilter();renderMonthlyDiary();}
  else renderDiary();
}
async function saveMonthlyItem(event){
  event.preventDefault();
  const monthKey=els.monthlyEntryMonth.value;
  const text=els.monthlyText.value.trim();
  if(!monthKey||!text){toast('Choose a month and enter details.','error');return;}
  setBusy(els.saveMonthlyBtn,true,'Saving…');
  els.monthlySaveStatus.textContent='Saving…';
  try{
    const result=await api('saveMonthlyItem',{item:{
      id:els.monthlyId.value,
      monthKey,
      entryType:els.monthlyEntryType.value,
      title:els.monthlyTitle.value.trim(),
      text
    }});
    applyBootstrap(result.data);saveCache(result.data);
    els.monthlyYearFilter.value=monthKey.slice(0,4);
    els.monthlyMonthFilter.value=monthKey.slice(5,7);
    clearMonthlyDraft();
    resetMonthlyForm(monthKey);
    renderMonthlyDiary();
    toast('Monthly item saved.','success');
  }catch(e){els.monthlySaveStatus.textContent='Save failed';toast(e.message,'error');}
  finally{setBusy(els.saveMonthlyBtn,false);}
}
async function deleteMonthlyItem(id){
  if(!id||!confirm('Delete this monthly item?'))return;
  try{
    const result=await api('deleteMonthlyItem',{id});
    applyBootstrap(result.data);saveCache(result.data);renderMonthlyDiary();toast('Monthly item deleted.','success');
  }catch(e){toast(e.message,'error');}
}
async function toggleMonthlyTarget(id){
  const item=state.monthlyDiary.find(x=>x.id===id);
  if(!item)return;
  const completed=item.status!=='COMPLETED';
  try{
    const result=await api('toggleMonthlyTarget',{id,completed});
    applyBootstrap(result.data);saveCache(result.data);renderMonthlyDiary();
    toast(completed?'Target marked completed.':'Target reopened.','success');
  }catch(e){toast(e.message,'error');}
}
async function toggleMonthCompletion(){
  const key=currentMonthlyFilterKey();
  if(!key){toast('Select one specific month first.','error');return;}
  const current=monthStatusFor(key);
  const completed=current?.status!=='COMPLETED';
  try{
    const result=await api('setMonthStatus',{monthKey:key,completed});
    applyBootstrap(result.data);saveCache(result.data);renderMonthlyDiary();
    toast(completed?`${monthKeyLabel(key)} completed and saved.`:`${monthKeyLabel(key)} reopened.`,'success');
  }catch(e){toast(e.message,'error');}
}

function updateDataFullscreenButtons(){
  const mode=state.dataFullscreenSection;
  if(els.holdingsFullscreenBtn){
    const active=mode==='holdings';
    els.holdingsFullscreenBtn.setAttribute('aria-pressed',active?'true':'false');
    els.holdingsFullscreenBtn.textContent=active?'✕ Exit full screen':'⛶ Full screen';
    els.holdingsFullscreenBtn.title=active?'Return Holdings to normal dashboard view':'Expand Holdings to full browser area';
  }
  if(els.watchlistFullscreenBtn){
    const active=mode==='watchlist';
    els.watchlistFullscreenBtn.setAttribute('aria-pressed',active?'true':'false');
    els.watchlistFullscreenBtn.textContent=active?'✕ Exit full screen':'⛶ Full screen';
    els.watchlistFullscreenBtn.title=active?'Return Watchlist to normal dashboard view':'Expand Watchlist to full browser area';
  }
}
function enterDataFullscreen(section){
  if(!['holdings','watchlist'].includes(section))return;
  if(state.activeSection!==section)switchSection(section);
  closeUtilityDrawer();
  state.dataFullscreenSection=section;
  document.body.classList.add('data-fullscreen-open');
  const target=$(section==='holdings'?'holdingsSection':'watchlistSection');
  const other=$(section==='holdings'?'watchlistSection':'holdingsSection');
  target?.classList.add('data-fullscreen-active');
  other?.classList.remove('data-fullscreen-active');
  updateDataFullscreenButtons();
  if(els.dashboardHScroll)els.dashboardHScroll.classList.add('hidden');
  setTimeout(()=>{
    const wrap=target?.querySelector('.table-wrap');
    if(wrap)wrap.focus?.({preventScroll:true});
  },50);
}
function exitDataFullscreen(){
  if(!state.dataFullscreenSection)return;
  $('holdingsSection')?.classList.remove('data-fullscreen-active');
  $('watchlistSection')?.classList.remove('data-fullscreen-active');
  document.body.classList.remove('data-fullscreen-open');
  state.dataFullscreenSection='';
  updateDataFullscreenButtons();
  scheduleDashboardHScrollRefresh();
}
function toggleDataFullscreen(section){
  if(state.dataFullscreenSection===section)exitDataFullscreen();
  else enterDataFullscreen(section);
}

function switchSection(section){
  if(state.dataFullscreenSection&&state.dataFullscreenSection!==section)exitDataFullscreen();
  state.activeSection=section;
  document.body.classList.remove('section-overview','section-holdings','section-transactions','section-watchlist','section-sip','section-expenditure','section-diary','section-users');
  document.body.classList.add(`section-${section}`);
  const titles={overview:state.overviewMode==='INVESTMENT'?'Investment overview':'My dashboard',holdings:'Holdings & performance',transactions:'Transactions',watchlist:'Watchlist',sip:'SIP Planner & Future Investment',expenditure:'Expenditure',diary:'Diary',users:'User administration'};
  if(els.pageTitle)els.pageTitle.textContent=titles[section]||'My Finance';
  ['overview','holdings','transactions','watchlist','sip','expenditure','diary','users'].forEach(name=>{
    const sec=$(`${name}Section`);
    if(sec)sec.classList.toggle('hidden',name!==section);
  });
  $$('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===section));
  if(section==='diary'){
    if(els.diaryBrowseDate&&!els.diaryBrowseDate.value)els.diaryBrowseDate.value=localIsoDate();
    if(els.diaryBrowseMonth&&!els.diaryBrowseMonth.value)els.diaryBrowseMonth.value=localIsoMonth();
    if(els.diaryDate&&!els.diaryDate.value)els.diaryDate.value=els.diaryBrowseDate?.value||localIsoDate();
    if(els.dailyDiaryWorkspace&&els.monthlyDiaryWorkspace)renderDiaryWorkspace();
  }
  if(section==='sip')renderSipPlanner();
  if(section==='expenditure')renderExpenditure();
  if(section==='users'&&state.user?.role==='ADMIN'&&els.usersBody)loadUsers();
  if(section==='overview')setOverviewMode('PERSONAL');
  if(lifeQuoteAutoContextVisible())startLifeQuoteShuffle();else if(!(state.utilityDrawerOpen&&state.utilityDrawerTab==='QUOTE'))stopLifeQuoteShuffle();
  scheduleDashboardHScrollRefresh();
}
async function loadUsers(){
  try{
    const r=await api('adminListUsers');
    state.users=r.users||[];
    renderUsers();
  }catch(e){
    toast(e.message,'error');
  }
}

function generateStrongUserPassword(){
  const upper='ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower='abcdefghijkmnopqrstuvwxyz';
  const nums='23456789';
  const symbols='!@#$%&*?';
  const all=upper+lower+nums+symbols;
  const pick=s=>s[Math.floor(Math.random()*s.length)];
  let chars=[pick(upper),pick(lower),pick(nums),pick(symbols)];
  for(let i=chars.length;i<14;i++)chars.push(pick(all));
  for(let i=chars.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [chars[i],chars[j]]=[chars[j],chars[i]];
  }
  return chars.join('');
}

function userPasswordIsStrong(password){
  const p=String(password||'');
  return p.length>=10&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9]/.test(p);
}

function setUserFormStatus(message,type=''){
  if(!els.userFormStatus)return;
  els.userFormStatus.textContent=message||'';
  els.userFormStatus.className=`user-form-status ${type}`.trim();
}

function openCreateUserModal(){
  els.userForm?.reset();
  if(els.userFormMode)els.userFormMode.value='CREATE';
  if(els.editOriginalUsername)els.editOriginalUsername.value='';
  if(els.userModalTitle)els.userModalTitle.textContent='Create user';
  if(els.newUsername){els.newUsername.disabled=false;els.newUsername.readOnly=false;}
  if(els.usernameEditHelp)els.usernameEditHelp.textContent='3–60 characters: letters, numbers, dot, underscore or hyphen.';
  if(els.newUserActiveLabel)els.newUserActiveLabel.classList.add('hidden');
  if(els.userPasswordGroup)els.userPasswordGroup.classList.remove('hidden');
  if(els.newUserPassword)els.newUserPassword.value=generateStrongUserPassword();
  if(els.saveUserBtn)els.saveUserBtn.textContent='Create user';
  setUserFormStatus('A strong temporary password has been generated. Copy it before giving it to the user.','info');
  openModal('userModal');
  setTimeout(()=>els.newUsername?.focus(),50);
}

function openEditUserModal(username){
  const item=(state.users||[]).find(u=>String(u.username).toLowerCase()===String(username).toLowerCase());
  if(!item){toast('User not found.','error');return;}

  els.userForm?.reset();
  if(els.userFormMode)els.userFormMode.value='EDIT';
  if(els.editOriginalUsername)els.editOriginalUsername.value=item.username;
  if(els.userModalTitle)els.userModalTitle.textContent='Edit user';
  if(els.newUsername){
    els.newUsername.value=item.username;
    els.newUsername.disabled=false;
    els.newUsername.readOnly=true;
  }
  if(els.usernameEditHelp)els.usernameEditHelp.textContent='Username is fixed after creation so existing account data remains linked correctly.';
  if(els.newDisplayName)els.newDisplayName.value=item.displayName||'';
  if(els.newUserRole)els.newUserRole.value=String(item.role||'USER').toUpperCase();
  if(els.newUserActive)els.newUserActive.value=item.active?'true':'false';
  if(els.newUserActiveLabel)els.newUserActiveLabel.classList.remove('hidden');
  if(els.userPasswordGroup)els.userPasswordGroup.classList.add('hidden');
  if(els.newUserPassword)els.newUserPassword.value='';
  if(els.saveUserBtn)els.saveUserBtn.textContent='Save changes';
  setUserFormStatus('Edit display name, role or account status. Use Reset password separately to change the password.','info');
  openModal('userModal');
  setTimeout(()=>els.newDisplayName?.focus(),50);
}

async function copyUserPassword(){
  const value=String(els.newUserPassword?.value||'');
  if(!value){toast('No temporary password to copy.','error');return;}
  try{
    await navigator.clipboard.writeText(value);
    toast('Temporary password copied.','success');
  }catch{
    els.newUserPassword?.select();
    toast('Select and copy the temporary password.','info');
  }
}

async function saveUserForm(event){
  event.preventDefault();

  const mode=String(els.userFormMode?.value||'CREATE').toUpperCase();
  const button=event.submitter||els.saveUserBtn;
  setUserFormStatus('');

  if(mode==='CREATE'){
    const username=String(els.newUsername?.value||'').trim().toLowerCase();
    const displayName=String(els.newDisplayName?.value||'').trim();
    const role=String(els.newUserRole?.value||'USER').toUpperCase();
    const password=String(els.newUserPassword?.value||'');

    if(!/^[a-z0-9._-]{3,60}$/.test(username)){
      setUserFormStatus('Username must be 3–60 characters using letters, numbers, dot, underscore or hyphen.','error');
      els.newUsername?.focus();
      return;
    }
    if(!displayName){
      setUserFormStatus('Display name is required.','error');
      els.newDisplayName?.focus();
      return;
    }
    if(password&&!userPasswordIsStrong(password)){
      setUserFormStatus('Password needs at least 10 characters with uppercase, lowercase, number and symbol. Click Generate for a valid password.','error');
      els.newUserPassword?.focus();
      return;
    }

    setBusy(button,true,'Creating…');
    try{
      const r=await api('adminCreateUser',{username,displayName,role,password});
      state.users=r.users||state.users;
      renderUsers();

      const temp=r.temporaryPassword||password;
      closeModals();
      els.userForm?.reset();

      if(temp){
        try{await navigator.clipboard.writeText(temp);}catch{}
        toast(`User ${username} created. Temporary password copied.`, 'success');
      }else{
        toast(`User ${username} created.`, 'success');
      }
    }catch(e){
      setUserFormStatus(e.message||'Could not create user.','error');
      toast(e.message||'Could not create user.','error');
    }finally{
      setBusy(button,false);
    }
    return;
  }

  const username=String(els.editOriginalUsername?.value||'').trim().toLowerCase();
  const displayName=String(els.newDisplayName?.value||'').trim();
  const role=String(els.newUserRole?.value||'USER').toUpperCase();
  const active=String(els.newUserActive?.value||'true')==='true';

  if(!displayName){
    setUserFormStatus('Display name is required.','error');
    els.newDisplayName?.focus();
    return;
  }

  setBusy(button,true,'Saving…');
  try{
    const r=await api('adminUpdateUser',{username,displayName,role,active});
    state.users=r.users||state.users;
    renderUsers();
    closeModals();
    toast(`User ${username} updated.`, 'success');
  }catch(e){
    setUserFormStatus(e.message||'Could not update user.','error');
    toast(e.message||'Could not update user.','error');
  }finally{
    setBusy(button,false);
  }
}

async function resetUserPassword(username){
  const generated=generateStrongUserPassword();
  const password=prompt(
    `Enter a new temporary password for ${username}.\n\nRequirements: 10+ characters, uppercase, lowercase, number and symbol.\n\nSuggested password:\n${generated}`,
    generated
  );
  if(!password)return;
  if(!userPasswordIsStrong(password)){
    toast('Password is not strong enough. Use 10+ characters with uppercase, lowercase, number and symbol.','error');
    return;
  }

  try{
    await api('adminResetPassword',{username,password});
    try{await navigator.clipboard.writeText(password);}catch{}
    toast(`Password reset for ${username}. New temporary password copied.`, 'success');
  }catch(e){
    toast(e.message,'error');
  }
}

async function toggleUser(username,active){
  try{
    const item=(state.users||[]).find(u=>String(u.username).toLowerCase()===String(username).toLowerCase());
    if(!item)throw new Error('User not found.');

    const r=await api('adminUpdateUser',{
      username,
      displayName:item.displayName||username,
      role:item.role||'USER',
      active
    });
    state.users=r.users||state.users;
    renderUsers();
    toast(`User ${active?'enabled':'disabled'}.`,'success');
  }catch(e){
    toast(e.message,'error');
  }
}

async function deleteUserAccount(username){
  const item=(state.users||[]).find(u=>String(u.username).toLowerCase()===String(username).toLowerCase());
  if(!item){toast('User not found.','error');return;}

  const ok=confirm(
    `Delete login account "${username}"?\n\n`+
    `This removes the user account and active sessions only.\n`+
    `Portfolio/transaction/diary data is retained to prevent accidental data loss.`
  );
  if(!ok)return;

  try{
    const r=await api('adminDeleteUser',{username});
    state.users=r.users||state.users.filter(u=>String(u.username).toLowerCase()!==String(username).toLowerCase());
    renderUsers();
    toast(`User account ${username} deleted.`, 'success');
  }catch(e){
    toast(e.message,'error');
  }
}

function safeOn(el,event,handler,options){
  if(!el||typeof handler!=='function')return false;
  try{el.addEventListener(event,handler,options);return true;}catch(e){console.warn('Event bind skipped:',event,e);return false;}
}
function showRuntimeWarning(message){
  if(!els.runtimeWarning)return;
  els.runtimeWarning.textContent=message;
  els.runtimeWarning.classList.remove('hidden');
}
function clearRuntimeWarning(){
  if(!els.runtimeWarning)return;
  els.runtimeWarning.textContent='';
  els.runtimeWarning.classList.add('hidden');
}

function bindEvents(){
  safeOn(els.expenseSubcategoryToggle,'click',toggleExpenseSubcategoryVisibility);
  safeOn(window,'resize',clampPinnedStickyCards);
  document.addEventListener('click',event=>{const reset=event.target.closest('[data-sticky-reset-layout]');if(reset){event.preventDefault();resetStickyLayout(reset.dataset.stickyResetLayout);}});
  safeOn(els.expenseSubcategoryFilter,'change',renderExpenditure);
  safeOn(els.expenseCategory,'change',()=>setExpenseSubcategoryOptions(els.expenseCategory.value));
  safeOn(els.repairBrowserBtn,'click',manualRepairBrowser);safeOn(els.staySignedInBtn,'click',()=>{setLastActivity(nowMs(),{forceWrite:true});hideIdleWarning();sessionHeartbeat();});safeOn(els.portfolioStartupRetryBtn,'click',retryStartupPortfolioLoad);safeOn(els.addExpenseBtn,'click',()=>openExpenseEditor('ACTUAL'));safeOn(els.addExpensePlanBtn,'click',()=>openExpenseEditor('PLANNED'));safeOn(els.addRecurringExpenseBtn,'click',()=>openExpenseEditor('REGULAR'));safeOn(els.expenseForm,'submit',saveExpenseForm);safeOn(els.expensePaymentForm,'submit',confirmExpensePayment);safeOn(els.addExpenseCategoryBtn,'click',()=>openExpenseCategoryEditor());safeOn(els.expenseCategoryForm,'submit',saveExpenseCategory);safeOn(els.expenseSearch,'input',renderExpenditure);safeOn(els.expenseFromDate,'change',renderExpenditure);safeOn(els.expenseToDate,'change',renderExpenditure);safeOn(els.expenseCategoryFilter,'change',()=>{if(els.expenseSubcategoryFilter)els.expenseSubcategoryFilter.value='ALL';renderExpenditure();});safeOn(els.expenseAccountFilter,'change',renderExpenditure);safeOn(els.expenseSort,'change',renderExpenditure);safeOn(els.expenseResetFiltersBtn,'click',resetExpenseFilters);safeOn(els.expensePrintBtn,'click',openExpensePrint);safeOn(els.expensePrintColumns,'change',renderExpensePrintPreview);safeOn(els.expensePrintAllColumnsBtn,'click',()=>{els.expensePrintColumns?.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=true);renderExpensePrintPreview();});safeOn(els.runExpensePrintBtn,'click',runExpensePrint);safeOn(els.addSipPlanBtn,'click',()=>openSipPlan());safeOn(els.sipPlanForm,'submit',saveSipPlan);safeOn(els.sipOwnerFilter,'change',renderSipPlanner);safeOn(els.sipStatusFilter,'change',renderSipPlanner);safeOn(els.sipHorizonSelect,'change',()=>{state.sipHorizonMonths=Number(els.sipHorizonSelect.value)||12;renderSipPlanner();});safeOn(els.manageHoldingsColumnsBtn,'click',()=>openColumnManager('HOLDINGS'));safeOn(els.manageWatchlistColumnsBtn,'click',()=>openColumnManager('WATCHLIST'));safeOn(els.showAllHoldingColumnsBtn,'click',()=>showAllStandardColumnsTemporarily('HOLDINGS'));safeOn(els.showAllWatchColumnsBtn,'click',()=>showAllStandardColumnsTemporarily('WATCHLIST'));safeOn(els.saveColumnsAsDefaultBtn,'click',()=>saveCurrentColumnsAsDefault(els.customColumnSection.value));safeOn(els.showAllColumnsTempBtn,'click',()=>showAllStandardColumnsTemporarily(els.customColumnSection.value));safeOn(els.customColumnForm,'submit',saveCustomColumn);safeOn(els.clearCustomColumnBtn,'click',()=>resetCustomColumnForm(els.customColumnSection.value));safeOn(els.customColumnSection,'change',()=>{resetCustomColumnForm(els.customColumnSection.value);renderColumnManager(els.customColumnSection.value);});safeOn(els.customValueForm,'submit',saveCustomValue);safeOn(els.resetStandardColumnsBtn,'click',()=>resetStandardColumns(els.customColumnSection.value));safeOn(els.standardColumnsList,'change',e=>{const key=e.target.dataset.standardVisible;if(key)saveStandardColumnChange(els.customColumnSection.value,key,{visible:e.target.checked});});safeOn(els.standardColumnsList,'input',e=>{const key=e.target.dataset.standardLabel;if(key){const section=els.customColumnSection.value;const settings=loadStandardColumnSettings(section);settings[key]={...(settings[key]||{}),label:e.target.value};saveStandardColumnSettings(section,settings);if(section==='HOLDINGS')renderHoldings();else renderWatchlist();}});safeOn(els.standardColumnsList,'click',e=>{const btn=e.target.closest('[data-move-standard]');if(!btn)return;moveStandardColumn(els.customColumnSection.value,btn.dataset.columnKey,btn.dataset.moveStandard);});safeOn(els.customColumnsList,'click',e=>{const edit=e.target.closest('[data-edit-custom-column]');const del=e.target.closest('[data-delete-custom-column]');if(edit){editCustomColumn(edit.dataset.editCustomColumn);return;}if(del){deleteCustomColumn(del.dataset.deleteCustomColumn);}});
  safeOn(els.holdRowSlider,'input',e=>setTableSizeFromSlider('holdings','row',e.target.value));safeOn(els.holdWidthSlider,'input',e=>setTableSizeFromSlider('holdings','width',e.target.value));safeOn(els.watchRowSlider,'input',e=>setTableSizeFromSlider('watchlist','row',e.target.value));safeOn(els.watchWidthSlider,'input',e=>setTableSizeFromSlider('watchlist','width',e.target.value));
  safeOn(els.holdRowMinusBtn,'click',()=>changeTableSize('holdings','row',-1));safeOn(els.holdRowPlusBtn,'click',()=>changeTableSize('holdings','row',1));safeOn(els.holdWidthMinusBtn,'click',()=>changeTableSize('holdings','width',-1));safeOn(els.holdWidthPlusBtn,'click',()=>changeTableSize('holdings','width',1));safeOn(els.holdSizeResetBtn,'click',()=>resetTableSize('holdings'));safeOn(els.watchRowMinusBtn,'click',()=>changeTableSize('watchlist','row',-1));safeOn(els.watchRowPlusBtn,'click',()=>changeTableSize('watchlist','row',1));safeOn(els.watchWidthMinusBtn,'click',()=>changeTableSize('watchlist','width',-1));safeOn(els.watchWidthPlusBtn,'click',()=>changeTableSize('watchlist','width',1));safeOn(els.watchSizeResetBtn,'click',()=>resetTableSize('watchlist'));
  safeOn(els.personalHomeModeBtn,'click',()=>setOverviewMode('PERSONAL'));safeOn(els.investmentHomeModeBtn,'click',()=>switchSection('holdings'));safeOn(els.overviewSetDefaultBtn,'click',setCurrentOverviewAsDefault);safeOn(els.homeDailyWriteBtn,'click',()=>openQuickDiary('DAILY'));safeOn(els.homeMonthlyWriteBtn,'click',()=>openQuickDiary('MONTHLY'));safeOn(els.homeAddTargetBtn,'click',()=>openStickyNote());safeOn(els.homeDiaryQuickBtn,'click',()=>openQuickDiary('DAILY'));safeOn(els.homeFullDiaryBtn,'click',()=>switchSection('diary'));safeOn(els.homeTargetAddBtn,'click',()=>openStickyNote());safeOn(els.homeTargetsOpenBtn,'click',()=>openUtilityDrawer('STICKY'));safeOn(els.homeQuoteNextBtn,'click',nextLifeQuote);safeOn(els.homeQuotesOpenBtn,'click',()=>openUtilityDrawer('QUOTE'));safeOn(els.homeShowInvestmentsBtn,'click',()=>switchSection('holdings'));
  safeOn(els.utilityDrawerOpenBtn,'click',toggleUtilityDrawer);safeOn(els.utilityDrawerCloseBtn,'click',closeUtilityDrawer);safeOn(els.utilityDrawerScrim,'click',closeUtilityDrawer);safeOn(els.overviewStickyShortcut,'click',()=>openUtilityDrawer('STICKY'));safeOn(els.overviewQuoteShortcut,'click',()=>openUtilityDrawer('QUOTE'));
  safeOn(els.lifeQuoteNextBtn,'click',nextLifeQuote);safeOn(els.lifeQuotePauseBtn,'click',toggleLifeQuoteShuffle);safeOn(els.lifeQuoteLibraryBtn,'click',openLifeQuoteLibrary);safeOn(els.lifeQuoteForm,'submit',saveLifeQuote);safeOn(els.lifeQuoteSearch,'input',renderLifeQuoteLibrary);safeOn(els.clearLifeQuoteBtn,'click',resetLifeQuoteForm);
  
  safeOn(els.autoRefreshSelect,'change',changeAutoRefresh);safeOn(els.rememberUsername,'change',()=>{if(!els.rememberUsername.checked)localStorage.removeItem('portfolio_saved_username');});safeOn(els.diaryForm,'submit',saveDiaryEntry);safeOn(els.clearDiaryBtn,'click',()=>{clearDailyDraft();resetDiaryForm();updateDiaryWritingMeta();});safeOn(els.newDiaryEntryBtn,'click',()=>{switchSection('diary');if(state.diaryWorkspace==='MONTHLY'){resetMonthlyForm(currentMonthlyFilterKey()||localIsoMonth());setTimeout(()=>els.monthlyTitle?.focus(),30);}else{resetDiaryForm(els.diaryBrowseDate.value||localIsoDate());setTimeout(()=>els.diaryTitle?.focus(),30);}});safeOn(els.diarySearch,'input',renderDiary);safeOn(els.recentDailySearch,'input',renderRecentDailyEntries);safeOn(els.recentDailyLimit,'change',renderRecentDailyEntries);safeOn(els.recentMonthlySearch,'input',renderRecentMonthlyEntries);safeOn(els.recentMonthlyLimit,'change',renderRecentMonthlyEntries);safeOn(els.diaryBrowseDate,'change',()=>{if(!els.diaryId.value)els.diaryDate.value=els.diaryBrowseDate.value;renderDiary();});safeOn(els.diaryBrowseMonth,'change',renderDiary);safeOn(els.diaryFromDate,'change',renderDiary);safeOn(els.diaryToDate,'change',renderDiary);safeOn(els.printDiaryBtn,'click',printDiaryView);
  safeOn(els.monthlyForm,'submit',saveMonthlyItem);
  safeOn(els.clearMonthlyBtn,'click',()=>{clearMonthlyDraft();resetMonthlyForm();updateDiaryWritingMeta();});
  safeOn(els.monthlyEntryType,'change',updateMonthlyTargetHelp);
  safeOn(els.monthlyYearFilter,'change',renderMonthlyDiary);
  safeOn(els.monthlyMonthFilter,'change',renderMonthlyDiary);
  safeOn(els.monthlyTypeFilter,'change',renderMonthlyDiary);
  safeOn(els.monthlyStatusFilter,'change',renderMonthlyDiary);
  safeOn(els.monthlySearch,'input',renderMonthlyDiary);safeOn(els.printMonthlyBtn,'click',printMonthlyView);
  safeOn(els.completeMonthBtn,'click',toggleMonthCompletion);
  safeOn(els.diaryPrevDayBtn,'click',()=>setDailyDiaryDate(dateShiftIso(els.diaryDate.value,-1)));
  safeOn(els.diaryTodayBtn,'click',()=>setDailyDiaryDate(localIsoDate()));
  safeOn(els.diaryNextDayBtn,'click',()=>setDailyDiaryDate(dateShiftIso(els.diaryDate.value,1)));
  safeOn(els.monthlyPrevMonthBtn,'click',()=>setMonthlyEntryMonth(monthShiftIso(els.monthlyEntryMonth.value,-1)));
  safeOn(els.monthlyThisMonthBtn,'click',()=>setMonthlyEntryMonth(localIsoMonth()));
  safeOn(els.monthlyNextMonthBtn,'click',()=>setMonthlyEntryMonth(monthShiftIso(els.monthlyEntryMonth.value,1)));
  safeOn(els.diarySearchClearBtn,'click',()=>{els.diarySearch.value='';renderDiary();els.diarySearch.focus();});
  safeOn(els.diaryDate,'change',()=>{if(!els.diaryId.value){els.diaryBrowseDate.value=els.diaryDate.value;restoreDailyDraft();}updateDiaryWritingMeta();});
  safeOn(els.monthlyEntryMonth,'change',()=>{if(!els.monthlyId.value)restoreMonthlyDraft();updateDiaryWritingMeta();});
  safeOn(els.diaryTitle,'input',scheduleDailyDraft);safeOn(els.diaryText,'input',scheduleDailyDraft);
  safeOn(els.monthlyTitle,'input',scheduleMonthlyDraft);safeOn(els.monthlyText,'input',scheduleMonthlyDraft);
  safeOn(els.monthlyEntryType,'change',()=>{updateMonthlyTargetHelp();if(!els.monthlyId.value)restoreMonthlyDraft();});
  [els.diaryTitle,els.diaryText].forEach(el=>safeOn(el,'keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();els.diaryForm.requestSubmit();}}));
  [els.monthlyTitle,els.monthlyText].forEach(el=>safeOn(el,'keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();els.monthlyForm.requestSubmit();}}));
  safeOn(els.dashboardHScrollRange,'input',syncHScrollFromRange);
  safeOn(els.dashboardHScrollLeft,'click',()=>scrollDashboardHorizontal(-1));safeOn(els.dashboardHScrollRight,'click',()=>scrollDashboardHorizontal(1));
  safeOn(els.quickDiaryBtn,'click',()=>openQuickDiary('DAILY'));
  safeOn(els.quickDiaryMobileBtn,'click',()=>openQuickDiary('DAILY'));
  safeOn(els.quickDiaryCloseBtn,'click',closeQuickDiary);
  safeOn(els.quickDailyForm,'submit',saveQuickDaily);
  safeOn(els.quickMonthlyForm,'submit',saveQuickMonthly);
  safeOn(els.quickDailyText,'input',updateQuickDiaryCounts);
  safeOn(els.quickMonthlyText,'input',updateQuickDiaryCounts);
  safeOn(els.openFullDiaryBtn,'click',()=>{closeQuickDiary();switchSection('diary');});
  document.addEventListener('click',e=>{
    const starter=e.target.closest('[data-diary-starter]');
    if(starter)insertDiaryStarter(starter.dataset.diaryStarter);
  });
  document.addEventListener('click',e=>{
    const matrixTab=e.target.closest('[data-matrix-owner]');
    if(matrixTab)setHoldingsMatrixOwner(matrixTab.dataset.matrixOwner);
  });
  ['gpfPresentBalance','gpfMonthlyContribution','gpfAnnualInterestRate'].forEach(id=>safeOn($(id),'input',updateGpfProjectionPreview));
  safeOn($('headerLogoutBtn'),'click',logout);
  window.addEventListener('keydown',handleDashboardHorizontalKeydown,{passive:false});
  window.addEventListener('resize',scheduleDashboardHScrollRefresh);
  document.querySelectorAll('.table-wrap').forEach(bindSmoothHorizontalTable);safeOn(els.loginForm,'submit',login);safeOn(els.logoutBtn,'click',logout);safeOn(els.mobileLogoutBtn,'click',logout);safeOn(els.mobileChangePasswordBtn,'click',()=>openModal('passwordModal'));safeOn(els.replaceMasterDataBtn,'click',replaceMasterPortfolioData);safeOn(els.masterLoadNowBtn,'click',replaceMasterPortfolioData);safeOn(els.showAllInvestmentsBtn,'click',showAllInvestments);safeOn(els.viewAllNotesBtn,'click',()=>openAllNotes('HOLDINGS'));safeOn(els.watchAllNotesBtn,'click',()=>openAllNotes('WATCHLIST'));safeOn(els.notesSearch,'input',renderNotesModal);safeOn(els.notesSource,'change',renderNotesModal);safeOn(els.notesScope,'change',renderNotesModal);safeOn(els.notesFilter,'change',renderNotesModal);safeOn(els.drawerCloseBtn,'click',closeHoldingDrawer);safeOn(els.drawerDoneBtn,'click',closeHoldingDrawer);safeOn(els.drawerEditBtn,'click',editDrawerHolding);safeOn(els.holdingDrawerBackdrop,'click',closeHoldingDrawer);safeOn(els.refreshBtn,'click',async()=>{await loadDashboard(true);resetAutoRefreshClock();});safeOn(els.addInvestmentBtn,'click',()=>openInvestment());safeOn(els.addInvestmentTableBtn,'click',()=>openInvestment());safeOn(els.importBtn,'click',openBulkImport);safeOn(els.bulkImportBtn,'click',openBulkImport);safeOn(els.downloadImportTemplateBtn,'click',downloadImportTemplate);safeOn(els.bulkCsvFile,'change',handleBulkFile);safeOn(els.bulkImportForm,'submit',runBulkImport);safeOn(els.exportBtn,'click',exportCsv);safeOn(els.investmentForm,'submit',saveInvestment);safeOn(els.watchForm,'submit',saveWatch);safeOn(els.passwordForm,'submit',changePassword);safeOn(els.userForm,'submit',saveUserForm);safeOn(els.addStickyNoteBtn,'click',()=>openStickyNote());safeOn(els.stickyNoteForm,'submit',saveStickyNote);safeOn(els.holdingType,'change',()=>updateAssetForm(els.holdingType.value,'holding'));safeOn(els.watchType,'change',()=>updateAssetForm(els.watchType.value,'watch'));safeOn(els.transactionSearch,'input',renderTransactions);safeOn(els.transactionOwnerFilter,'change',renderTransactions);safeOn(els.transactionAssetFilter,'change',renderTransactions);safeOn(els.transactionSideFilter,'change',renderTransactions);safeOn(els.transactionFromDate,'change',renderTransactions);safeOn(els.transactionToDate,'change',renderTransactions);safeOn(els.transactionImportBtn,'click',()=>{refreshOwnerControls();setImportMode('STOCK_TRADES');openModal('bulkImportModal');});safeOn(els.printTransactionsBtn,'click',printTransactionsView);safeOn(els.toggleHoldingsSummaryBtn,'click',toggleHoldingsSummary);document.addEventListener('click',e=>{if(e.target.closest('[data-hide-holdings-summary]'))hideHoldingsSummary();});safeOn(els.holdingSearch,'input',renderHoldings);safeOn(els.holdingTypeFilter,'change',renderHoldings);safeOn(els.holdingResultFilter,'change',renderHoldings);safeOn(els.holdingNotesFilter,'change',renderHoldings);safeOn(els.holdingTradeFilter,'change',renderHoldings);safeOn(els.holdingsViewPreset,'change',e=>{if(e.target.value!=='CUSTOM')setHoldingsViewPreset(e.target.value);});safeOn(els.saveHoldingsDefaultViewBtn,'click',saveHoldingsDefaultView);safeOn(els.restoreHoldingsDefaultViewBtn,'click',()=>restoreHoldingsDefaultView(true));safeOn(els.resetHoldingsViewBtn,'click',resetHoldingsView);safeOn(els.printHoldingsBtn,'click',printHoldingsView);safeOn(els.holdingsFullscreenBtn,'click',()=>toggleDataFullscreen('holdings'));safeOn(els.watchSearch,'input',renderWatchlist);safeOn(els.watchTypeFilter,'change',renderWatchlist);safeOn(els.watchPriorityFilter,'change',renderWatchlist);safeOn(els.watchTargetFilter,'change',renderWatchlist);safeOn(els.watchNotesFilter,'change',renderWatchlist);safeOn(els.saveWatchDefaultViewBtn,'click',saveWatchDefaultView);safeOn(els.restoreWatchDefaultViewBtn,'click',()=>restoreWatchDefaultView(true));safeOn(els.printWatchlistBtn,'click',printWatchlistView);safeOn(els.watchlistFullscreenBtn,'click',()=>toggleDataFullscreen('watchlist'));safeOn($('addWatchBtn'),'click',()=>openWatch());safeOn($('changePasswordBtn'),'click',()=>openModal('passwordModal'));safeOn($('addUserBtn'),'click',openCreateUserModal);safeOn(els.generateUserPasswordBtn,'click',()=>{els.newUserPassword.value=generateStrongUserPassword();setUserFormStatus('New strong temporary password generated.','success');});safeOn(els.copyUserPasswordBtn,'click',copyUserPassword);safeOn(els.modalBackdrop,'click',e=>{if(e.target===els.modalBackdrop)closeModals();});$$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModals));$$('[data-section]').forEach(b=>b.addEventListener('click',()=>switchSection(b.dataset.section)));$$('[data-section-link]').forEach(b=>b.addEventListener('click',()=>switchSection(b.dataset.sectionLink)));$$('[data-toggle-password]').forEach(b=>b.addEventListener('click',()=>{const input=$(b.dataset.togglePassword),show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'Hide':'Show';}));$$('.import-mode').forEach(b=>b.addEventListener('click',()=>setImportMode(b.dataset.importMode)));
  document.addEventListener('change',e=>{const category=e.target.closest('[data-expense-inline-category]');if(category)updateInlineExpenseSubcategories(category);});
  document.addEventListener('click',e=>{const inlineExpenseEdit=e.target.closest('[data-inline-edit-expense]');if(inlineExpenseEdit){openInlineExpenseEdit(inlineExpenseEdit.dataset.inlineExpenseView,inlineExpenseEdit.dataset.inlineEditExpense);return;}const inlineExpenseSave=e.target.closest('[data-save-inline-expense]');if(inlineExpenseSave){saveInlineExpense(inlineExpenseSave);return;}const inlineExpenseCancel=e.target.closest('[data-cancel-inline-expense]');if(inlineExpenseCancel){closeInlineExpenseEdit();return;}const expenseViewBtn=e.target.closest('[data-expense-view]');if(expenseViewBtn){setExpenseView(expenseViewBtn.dataset.expenseView);return;}const ee=e.target.closest('[data-edit-expense]');if(ee){const x=state.expenses.find(r=>String(r.id)===String(ee.dataset.editExpense));if(x)openExpenseEditor('ACTUAL',x);return;}const de=e.target.closest('[data-delete-expense]');if(de){deleteExpenseRecord('ACTUAL',de.dataset.deleteExpense);return;}const ep=e.target.closest('[data-edit-plan]');if(ep){const x=state.expensePlans.find(r=>String(r.id)===String(ep.dataset.editPlan));if(x)openExpenseEditor('PLANNED',x);return;}const dp=e.target.closest('[data-delete-plan]');if(dp){deleteExpenseRecord('PLANNED',dp.dataset.deletePlan);return;}const pp=e.target.closest('[data-mark-plan-paid]');if(pp){openExpensePayment('PLAN',pp.dataset.markPlanPaid);return;}const er=e.target.closest('[data-edit-regular]');if(er){const x=state.recurringExpenses.find(r=>String(r.id)===String(er.dataset.editRegular));if(x)openExpenseEditor('REGULAR',x);return;}const dr=e.target.closest('[data-delete-regular]');if(dr){deleteExpenseRecord('REGULAR',dr.dataset.deleteRegular);return;}const pr=e.target.closest('[data-mark-regular-paid]');if(pr){openExpensePayment('REGULAR',pr.dataset.markRegularPaid);return;}const tr=e.target.closest('[data-toggle-regular]');if(tr){toggleRecurringStatus(tr.dataset.toggleRegular,tr.dataset.nextStatus);return;}const ec=e.target.closest('[data-edit-expense-category]');if(ec){const x=state.expenseCategories.find(r=>String(r.id)===String(ec.dataset.editExpenseCategory));if(x)openExpenseCategoryEditor(x);return;}const dc=e.target.closest('[data-delete-expense-category]');if(dc){deleteExpenseCategory(dc.dataset.deleteExpenseCategory);return;}const recentDailyView=e.target.closest('[data-recent-diary-view]');if(recentDailyView){toggleRecentEntryCard(recentDailyView,recentDailyView.closest('[data-recent-diary-card]'));return;}const recentMonthlyView=e.target.closest('[data-recent-monthly-view]');if(recentMonthlyView){toggleRecentEntryCard(recentMonthlyView,recentMonthlyView.closest('[data-recent-monthly-card]'));return;}const recentRailToggle=e.target.closest('[data-recent-rail-toggle]');if(recentRailToggle){toggleRecentRail(recentRailToggle.dataset.recentRailToggle,recentRailToggle);return;}const sipEdit=e.target.closest('[data-edit-sip]');if(sipEdit){const p=state.sipPlans.find(x=>String(x.id)===String(sipEdit.dataset.editSip));if(p)openSipPlan(p);return;}const sipDelete=e.target.closest('[data-delete-sip]');if(sipDelete){deleteSipPlan(sipDelete.dataset.deleteSip);return;}const sipStatus=e.target.closest('[data-sip-status]');if(sipStatus){updateSipPlanStatus(sipStatus.dataset.sipStatus,sipStatus.dataset.nextStatus);return;}const sipInvest=e.target.closest('[data-mark-sip-invested]');if(sipInvest){setSipScheduleEvent(sipInvest.dataset.markSipInvested,sipInvest.dataset.dueDate,sipInvest.dataset.amount,'INVESTED');return;}const sipSkip=e.target.closest('[data-mark-sip-skipped]');if(sipSkip){setSipScheduleEvent(sipSkip.dataset.markSipSkipped,sipSkip.dataset.dueDate,sipSkip.dataset.amount,'SKIPPED');return;}const sipUndo=e.target.closest('[data-clear-sip-event]');if(sipUndo){clearSipScheduleEvent(sipUndo.dataset.clearSipEvent,sipUndo.dataset.dueDate);return;}const customCell=e.target.closest('[data-custom-cell]');if(customCell){e.preventDefault();e.stopPropagation();openCustomValueEditor(customCell.dataset.customSection,customCell.dataset.customRecord,customCell.dataset.customKey);return;}const homeSticky=e.target.closest('[data-home-open-sticky]');if(homeSticky){openUtilityDrawer('STICKY');return;}const utilityTab=e.target.closest('[data-utility-tab]');if(utilityTab){state.utilityDrawerTab=utilityTab.dataset.utilityTab==='QUOTE'?'QUOTE':'STICKY';renderUtilityDrawerTab();if(lifeQuoteAutoContextVisible())startLifeQuoteShuffle();else stopLifeQuoteShuffle();return;}const quoteEdit=e.target.closest('[data-life-quote-edit]');if(quoteEdit){editLifeQuote(quoteEdit.dataset.lifeQuoteEdit);return;}const quoteDelete=e.target.closest('[data-life-quote-delete]');if(quoteDelete){deleteLifeQuote(quoteDelete.dataset.lifeQuoteDelete);return;}const stickyPin=e.target.closest('[data-sticky-pin]');if(stickyPin){toggleStickyPin(stickyPin.dataset.stickyPin);return;}const stickyDone=e.target.closest('[data-sticky-done]');if(stickyDone){completeStickyNote(stickyDone.dataset.stickyDone);return;}const stickyEdit=e.target.closest('[data-sticky-edit]');if(stickyEdit){const item=state.stickyNotes.find(x=>x.id===stickyEdit.dataset.stickyEdit);if(item)openStickyNote(item);return;}const stickyDelete=e.target.closest('[data-sticky-delete]');if(stickyDelete){deleteStickyNote(stickyDelete.dataset.stickyDelete);return;}const qmode=e.target.closest('[data-quick-diary-mode]');if(qmode){state.quickDiaryMode=qmode.dataset.quickDiaryMode;renderQuickDiaryMode();setTimeout(()=>state.quickDiaryMode==='DAILY'?els.quickDailyText?.focus():els.quickMonthlyText?.focus(),30);return;}const workspace=e.target.closest('[data-diary-workspace]');if(workspace){state.diaryWorkspace=workspace.dataset.diaryWorkspace;renderDiaryWorkspace();return;}const openCompleted=e.target.closest('[data-open-completed-month]');if(openCompleted){const key=openCompleted.dataset.openCompletedMonth;state.diaryWorkspace='MONTHLY';renderDiaryWorkspace();els.monthlyYearFilter.value=key.slice(0,4);els.monthlyMonthFilter.value=key.slice(5,7);renderMonthlyDiary();return;}const monthlyEdit=e.target.closest('[data-edit-monthly]');if(monthlyEdit){const item=state.monthlyDiary.find(x=>x.id===monthlyEdit.dataset.editMonthly);if(item)openMonthlyItem(item);return;}const monthlyDelete=e.target.closest('[data-delete-monthly]');if(monthlyDelete){deleteMonthlyItem(monthlyDelete.dataset.deleteMonthly);return;}const monthlyTarget=e.target.closest('[data-toggle-monthly-target]');if(monthlyTarget){toggleMonthlyTarget(monthlyTarget.dataset.toggleMonthlyTarget);return;}const diaryView=e.target.closest('[data-diary-view]');if(diaryView){state.diaryView=diaryView.dataset.diaryView;renderDiary();return;}const diaryEdit=e.target.closest('[data-edit-diary]');if(diaryEdit){const item=state.diary.find(x=>x.id===diaryEdit.dataset.editDiary);if(item)openDiaryEntry(item);return;}const diaryDelete=e.target.closest('[data-delete-diary]');if(diaryDelete){deleteDiaryEntry(diaryDelete.dataset.deleteDiary);return;}const diaryCard=e.target.closest('[data-diary-view-entry]');if(diaryCard&&!e.target.closest('button')){const item=state.diary.find(x=>x.id===diaryCard.dataset.diaryViewEntry);if(item)openDiaryEntry(item);return;}const gr=e.target.closest('[data-growth-range]');if(gr){state.growthRange=gr.dataset.growthRange;$$('[data-growth-range]').forEach(b=>b.classList.toggle('active',b.dataset.growthRange===state.growthRange));renderGrowthDashboard();return;}const owner=e.target.closest('[data-owner-view]');if(owner){state.selectedOwner=owner.dataset.ownerView;refreshOwnerControls();renderAll();return;}const assetView=e.target.closest('[data-asset-view]');if(assetView){state.selectedAssetView=assetView.dataset.assetView;els.holdingTypeFilter.value='ALL';renderAll();return;}const inlineEdit=e.target.closest('[data-inline-edit-holding]'),inlineSave=e.target.closest('[data-inline-save-holding]'),inlineCancel=e.target.closest('[data-inline-cancel-holding]'),noteView=e.target.closest('[data-note-view]'),noteEdit=e.target.closest('[data-note-edit]'),watchNoteView=e.target.closest('[data-watch-note-view]'),watchNoteEdit=e.target.closest('[data-watch-note-edit]'),holdingViewButton=e.target.closest('[data-view-holding-button]'),watchViewButton=e.target.closest('[data-view-watch-button]'),watchNoteButton=e.target.closest('[data-watch-note-button]'),edit=e.target.closest('[data-edit-holding]'),del=e.target.closest('[data-delete-holding]'),ew=e.target.closest('[data-edit-watch]'),dw=e.target.closest('[data-delete-watch]'),eu=e.target.closest('[data-edit-user]'),du=e.target.closest('[data-delete-user]'),ru=e.target.closest('[data-reset-user]'),tu=e.target.closest('[data-toggle-user]');if(inlineEdit){openInlineHoldingEdit(inlineEdit.dataset.inlineEditHolding);return;}if(inlineSave){saveInlineHolding(inlineSave.dataset.inlineSaveHolding,inlineSave);return;}if(inlineCancel){closeInlineHoldingEdit();return;}if(noteView){const item=state.holdings.find(x=>x.id===noteView.dataset.noteView);closeModals();if(item)openHoldingDrawer(item);return;}if(noteEdit){const item=state.holdings.find(x=>x.id===noteEdit.dataset.noteEdit);closeModals();if(item)openInvestment(item);return;}if(watchNoteView){const item=state.watchlist.find(x=>x.id===watchNoteView.dataset.watchNoteView);closeModals();if(item)openWatchDrawer(item);return;}if(holdingViewButton){const item=state.holdings.find(x=>x.id===holdingViewButton.dataset.viewHoldingButton);if(item)openHoldingDrawer(item);return;}if(watchViewButton){const item=state.watchlist.find(x=>x.id===watchViewButton.dataset.viewWatchButton);if(item)openWatchDrawer(item);return;}if(watchNoteButton){const item=state.watchlist.find(x=>x.id===watchNoteButton.dataset.watchNoteButton);if(item){openWatchDrawer(item);setTimeout(()=>{const t=$('drawerWatchNote');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},80);}return;}if(watchNoteEdit){const item=state.watchlist.find(x=>x.id===watchNoteEdit.dataset.watchNoteEdit);closeModals();if(item){openWatchDrawer(item);setTimeout(()=>{const t=$('drawerWatchNote');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},80);}return;}if(edit){openInvestment(state.holdings.find(x=>x.id===edit.dataset.editHolding));return;}if(del){deleteItem('deleteHolding',del.dataset.deleteHolding,'investment');return;}if(ew){openWatch(state.watchlist.find(x=>x.id===ew.dataset.editWatch));return;}if(dw){deleteItem('deleteWatchItem',dw.dataset.deleteWatch,'watchlist item');return;}if(eu){openEditUserModal(eu.dataset.editUser);return;}if(du){deleteUserAccount(du.dataset.deleteUser);return;}if(ru){resetUserPassword(ru.dataset.resetUser);return;}if(tu){toggleUser(tu.dataset.toggleUser,tu.dataset.active==='true');return;}const watchNoteCell=e.target.closest('[data-watch-note-cell]');if(watchNoteCell){const item=state.watchlist.find(x=>x.id===watchNoteCell.dataset.watchNoteCell);if(item){openWatchDrawer(item);setTimeout(()=>{const t=$('drawerWatchNote');if(t)t.focus();},80);}return;}const noteCell=e.target.closest('[data-note-cell]');if(noteCell){const item=state.holdings.find(x=>x.id===noteCell.dataset.noteCell);if(item)openHoldingDrawer(item);return;}const watchView=e.target.closest('[data-view-watch]');if(watchView){const item=state.watchlist.find(x=>x.id===watchView.dataset.viewWatch);if(item)openWatchDrawer(item);return;}const view=e.target.closest('[data-view-holding]');if(view){openHoldingDrawer(state.holdings.find(x=>x.id===view.dataset.viewHolding));}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.autoRefreshMinutes&&Date.now()>=state.autoRefreshNextAt&&!state.syncing){resetAutoRefreshClock();loadDashboard(true);}});
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-custom-cell]')){e.preventDefault();openCustomValueEditor(e.target.dataset.customSection,e.target.dataset.customRecord,e.target.dataset.customKey);return;}if(e.key==='Escape'){if($('printPreviewOverlay')){closePrintPreview();return;}if(state.dataFullscreenSection){exitDataFullscreen();return;}if(els.holdingDrawer?.classList.contains('open'))closeHoldingDrawer();else closeModals();return;}if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-view-holding]')){e.preventDefault();openHoldingDrawer(state.holdings.find(x=>x.id===e.target.dataset.viewHolding));return;}if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-view-watch]')){e.preventDefault();openWatchDrawer(state.watchlist.find(x=>x.id===e.target.dataset.viewWatch));}});
}

async function refreshMobileFromBackend(reason='resume'){
  if(!state.token||state.syncing||!isConfigured())return;
  const age=Date.now()-Number(state.lastServerSyncAt||0);
  if(reason!=='pageshow'&&age<30000&&!holdingAmountsMissing())return;
  try{
    const coreLoaded=await loadPortfolioCore({silent:true});
    if(!coreLoaded&&!state.holdings.length){
      setTimeout(()=>{if(state.token)loadPortfolioCore({silent:true,forceShared:true});},5000);
    }
  }catch(e){console.warn('Device resync failed:',e);}
}



function applyAllDeviceValueParityMigration(){
  const key='myfinance_1929_all_device_value_parity_1';
  try{
    if(localStorage.getItem(key)==='1')return;
    Object.keys(localStorage).forEach(k=>{
      if(k.startsWith('portfolio_cache_'))localStorage.removeItem(k);
    });
    state.mobileAmountRepairTried=false;
    localStorage.setItem(key,'1');
  }catch{}
}

function applyPerformanceVisibilityMigration(){
  const key='myfinance_1929_performance_visibility_fix_1';
  try{
    if(localStorage.getItem(key)==='1')return;
    // Position-based saved widths from older versions can leave 1D/1W/etc.
    // too narrow after switching presets. Reset widths once; preserve all
    // filters, hidden columns, column order and default-view choices.
    saveColumnWidths('holdings',{});
    saveTableScroll('holdings',0);
    localStorage.setItem(key,'1');
  }catch{}
}

function applyAssetResizeMigration(){
  const key='myfinance_1929_asset_resize_final_fix_2';
  try{
    if(localStorage.getItem(key)==='1')return;
    saveColumnWidths('holdings',{});
    saveColumnWidths('watchlist',{});
    saveTableScroll('holdings',0);
    saveTableScroll('watchlist',0);
    localStorage.setItem(key,'1');
  }catch{}
}

function applyProperLayoutMigration(){
  const key='myfinance_1929_proper_layout_fix_1';
  try{
    if(localStorage.getItem(key)==='1')return;
    // Clear only the old position-based pixel widths once.
    // Saved filters, hidden columns, moved order and table-size % remain.
    saveColumnWidths('holdings',{});
    saveColumnWidths('watchlist',{});
    saveTableScroll('holdings',0);
    saveTableScroll('watchlist',0);
    localStorage.setItem(key,'1');
  }catch{}
}

async function init(){
  try{
    if(window.__MYFINANCE_CACHE_HEAL_PENDING__||window.__MYFINANCE_NATIVE_REDIRECT__)return;
    if(BROWSER_STORAGE_REPAIRED_ON_LOAD)purgeAppManagedBrowserCaches();
    state.expenseView=localStorage.getItem('myfinance_expense_view')||'ACTUAL';
    applyAllDeviceValueParityMigration();
    applyPerformanceVisibilityMigration();
    applyAssetResizeMigration();
    applyProperLayoutMigration();
    bindEvents();
    updateVersionLabels();

    if(els.diaryBrowseDate)els.diaryBrowseDate.value=localIsoDate();
    if(els.diaryBrowseMonth)els.diaryBrowseMonth.value=localIsoMonth();
    if(els.diaryDate)els.diaryDate.value=localIsoDate();
    if(els.diaryFromDate)els.diaryFromDate.value=`${localIsoMonth()}-01`;
    if(els.diaryToDate)els.diaryToDate.value=localIsoDate();
    if(els.monthlyEntryMonth)els.monthlyEntryMonth.value=localIsoMonth();
    if(els.quickDailyDate)els.quickDailyDate.value=localIsoDate();
    if(els.quickMonthlyMonth)els.quickMonthlyMonth.value=localIsoMonth();

    if(els.quickDailyText&&els.quickMonthlyText)updateQuickDiaryCounts();
    if(els.monthlyYearFilter&&els.monthlyMonthFilter){
      refreshMonthlyYearFilter();
      els.monthlyYearFilter.value=String(new Date().getFullYear());
      els.monthlyMonthFilter.value=String(new Date().getMonth()+1).padStart(2,'0');
    }

    loadSavedUsername();
    restoreHoldingsDefaultView(false);
    restoreWatchDefaultView(false);
    restoreHoldingsSummaryState();
    restoreHoldingsMatrixOwner();
    state.overviewMode='PERSONAL';
    localStorage.setItem('portfolio_overview_default','PERSONAL');
    document.body.classList.add('section-overview');
    refreshOwnerControls();
    if(els.diaryText&&els.monthlyText)updateDiaryWritingMeta();

    setTimeout(()=>{
      try{
        if(els.diaryText)restoreDailyDraft();
        if(els.monthlyText)restoreMonthlyDraft();
        installColumnResizers('holdings');
        installColumnResizers('watchlist');
        scheduleDashboardHScrollRefresh();
      }catch(e){console.warn('Deferred UI init:',e);}
    },80);

    startAutoRefresh();

    if(!isConfigured()){
      if(els.loginMessage)els.loginMessage.textContent='Setup required: paste the Apps Script /exec URL into config.js.';
      return;
    }

    if(!state.token)showLoggedOutUi();

    if(state.token&&locallySessionExpired()){
      clearSession();
      showLoggedOutUi();
      if(els.loginMessage)els.loginMessage.textContent='Your previous session was logged out after 5 minutes of inactivity.';
    }

    if(state.token){
      showApp();
      state.holdingViewChecked=false;
      const saved=loadCache();
      if(saved)applyBootstrap(saved,true);
      else{
        setPortfolioStartupLoading(false);
        refreshOwnerControls();
        renderAll();
        if(els.lastUpdatedText)els.lastUpdatedText.textContent='Session restored · holdings are updating quietly';
      }
      beginBackgroundHydration(state.token,{hasSaved:Boolean(saved)});
      restoreHoldingsSummaryState();
      resetAutoRefreshClock();
    }

    if(!window.__myFinanceMobileParityBound){
      window.__myFinanceMobileParityBound=true;
      window.addEventListener('pageshow',event=>{
        if(event.persisted)refreshMobileFromBackend('pageshow');
      });
      window.addEventListener('online',()=>refreshMobileFromBackend('online'));
      window.addEventListener('focus',()=>refreshMobileFromBackend('focus'));
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden){
          markPageHidden();
        }else{
          markPageVisible();
          if(state.token)refreshMobileFromBackend('visible');
        }
      });
      window.addEventListener('pagehide',markPageHidden);
      window.addEventListener('pageshow',()=>{if(state.token)markPageVisible();});
    }

    clearRuntimeWarning();
  }catch(e){
    console.error('MyFinance init error',e);
    showRuntimeWarning(`A dashboard component could not start: ${e.message}. Core navigation has been protected.`);
    try{loadSavedUsername();}catch{}
  }
}
console.info('MyFinance v19.4.24 loaded — editable expenditure categories and subcategories enabled');
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.utilityDrawerOpen)closeUtilityDrawer();});
window.addEventListener('error',event=>{
  const message=String(event.message||'');
  if(message==='Script error.'&&!event.error){
    console.warn('Ignored generic cross-origin Script error.');
    return;
  }
  console.error('MyFinance runtime error',event.error||event.message);
  showRuntimeWarning(`Dashboard script error: ${message||'Unknown error'}.`);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.utilityDrawerOpen&&state.utilityDrawerTab==='QUOTE'&&!state.lifeQuotePaused)startLifeQuoteShuffle();});
window.addEventListener('unhandledrejection',event=>{
  console.error('MyFinance promise error',event.reason);
  const msg=event.reason?.message||String(event.reason||'Unknown error');
  showRuntimeWarning(`Dashboard request error: ${msg}`);
});
init();
