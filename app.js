"use strict";

const CONFIG = window.FAMILY_DASHBOARD_CONFIG || {};
const PLACEHOLDER_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
const FRONTEND_VERSION = "1.0.9";
const SAVED_USERNAME_KEY = "familyDashboardUsername";
const state = {
  token: localStorage.getItem("familyDashboardToken") || "",
  data: null,
  view: "home",
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  pendingPhoto: null,
  stickyView: "active",
  stickyDrag: null,
  stickyHighestZ: 100,
  stickyLayoutTimers: new Map()
};
const pendingRequests = new Map();
const viewTitles = {
  home: "Family overview", expenses: "Expenditure", income: "Income", targets: "Family targets",
  dates: "Reminders", calendar: "Family calendar", diary: "Family diary", photos: "Family photos",
  experiences: "Family experiences", admin: "Administration"
};
const viewModules = { expenses: "EXPENSES", income: "INCOME", targets: "TARGETS", dates: "DATES", calendar: "CALENDAR", diary: "DIARY", photos: "PHOTOS", experiences: "EXPERIENCES" };
const currencySymbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("message", receiveApiMessage);

function $(id) { return document.getElementById(id); }
function all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
function h(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
  });
}
function todayIso() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function currentMonth() { return todayIso().slice(0, 7); }
function memberName(id) {
  const member = (state.data && state.data.members || []).find(function (item) { return item.id === id; });
  return member ? member.name : "Family member";
}
function isAdmin() { return !!(state.data && state.data.user && state.data.user.role === "ADMIN"); }
function hasModuleAccess(module) { return isAdmin() || !!(state.data && state.data.user && (state.data.user.permissions || []).indexOf(module) >= 0); }
function mayDelete(item) { return isAdmin() || (item && item.createdBy === state.data.user.id); }
function formatDate(iso) {
  if (!iso) return "—";
  const parts = String(iso).slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Number(parts[2]) + " " + months[Number(parts[1]) - 1] + " " + parts[0];
}
function dayParts(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return { day: Number(p[2]) || "—", month: months[(Number(p[1]) || 1) - 1] };
}
function money(value) {
  const code = (state.data && state.data.settings && state.data.settings.currency) || "INR";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch (e) { return (currencySymbols[code] || "") + (Number(value) || 0).toLocaleString("en-IN"); }
}
function plural(count, singular, pluralWord) { return count + " " + (count === 1 ? singular : (pluralWord || singular + "s")); }
function normalize(value) { return String(value || "").toLowerCase().trim(); }

function init() {
  const now = new Date();
  $("loginVersion").textContent = "Version " + FRONTEND_VERSION;
  $("sidebarVersion").textContent = "v" + FRONTEND_VERSION;
  loadSavedUsername();
  $("todayLabel").textContent = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  $("expenseMonth").value = currentMonth();
  $("expensePrintFrom").value = currentMonth() + "-01";
  $("expensePrintTo").value = todayIso();
  $("incomeMonth").value = currentMonth();
  $("diaryMonth").value = currentMonth();
  bindNavigation();
  bindDialogs();
  bindForms();
  bindFilters();
  bindActions();
  bindStickyBoard();
  const configured = CONFIG.API_URL && CONFIG.API_URL !== PLACEHOLDER_URL && /^https:\/\/script\.google\.com\//.test(CONFIG.API_URL);
  if (!configured) {
    $("setupHint").classList.remove("hidden");
    state.token = "";
    localStorage.removeItem("familyDashboardToken");
    return;
  }
  if (state.token) restoreSession();
}

async function restoreSession() {
  showLoading("Opening your family dashboard…");
  try {
    state.data = normalizeBootstrapData(await api("bootstrap", {}));
    showApp();
  } catch (error) {
    state.token = "";
    localStorage.removeItem("familyDashboardToken");
    showLogin();
    toast(error.message || "Please sign in again.", "error");
  } finally { hideLoading(); }
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  renderAll();
}
function showLogin() {
  $("stickyBoard").classList.add("hidden");
  $("stickyBoardShade").classList.add("hidden");
  $("stickyLauncher").classList.add("hidden");
  $("stickyPinnedLayer").classList.add("hidden");
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  loadSavedUsername();
}
function loadSavedUsername() { const saved = localStorage.getItem(SAVED_USERNAME_KEY) || ""; $("loginUsername").value = saved; $("rememberUsername").checked = !!saved || $("rememberUsername").checked; }
function normalizeBootstrapData(data) { const result = data || {}; ["members","expenses","recurringExpenses","income","targets","importantDates","photos","experiences","diary","stickyNotes"].forEach(function (key) { if (!Array.isArray(result[key])) result[key] = []; }); if (!result.settings) result.settings = {}; return result; }

function bindNavigation() {
  all(".nav-button").forEach(function (button) {
    button.addEventListener("click", function () { goTo(button.dataset.view); closeSidebar(); });
  });
  all("[data-go]").forEach(function (button) { button.addEventListener("click", function () { goTo(button.dataset.go); }); });
  $("menuButton").addEventListener("click", function () { $("sidebar").classList.toggle("open"); $("sidebarShade").classList.toggle("show"); });
  $("sidebarShade").addEventListener("click", closeSidebar);
  $("logoutButton").addEventListener("click", logout);
  $("globalSearchButton").addEventListener("click", function () { openDialog("searchDialog"); setTimeout(function () { $("globalSearch").focus(); }, 50); });
  $("calendarPrev").addEventListener("click", function () { state.calendarCursor.setMonth(state.calendarCursor.getMonth() - 1); renderCalendar(); });
  $("calendarNext").addEventListener("click", function () { state.calendarCursor.setMonth(state.calendarCursor.getMonth() + 1); renderCalendar(); });
  $("calendarToday").addEventListener("click", function () { state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(); });
}
function closeSidebar() { $("sidebar").classList.remove("open"); $("sidebarShade").classList.remove("show"); }
function goTo(view) {
  if (view === "admin" && !isAdmin()) return;
  if (viewModules[view] && !hasModuleAccess(viewModules[view])) return toast("Your administrator has not enabled this section for your account.", "error");
  state.view = view;
  all(".view").forEach(function (el) { el.classList.toggle("active", el.id === "view-" + view); });
  all(".nav-button").forEach(function (el) { el.classList.toggle("active", el.dataset.view === view); });
  $("viewTitle").textContent = viewTitles[view] || "Family Dashboard";
  if (view === "calendar") renderCalendar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindDialogs() {
  all("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () { prepareNewDialog(button.dataset.open); openDialog(button.dataset.open); });
  });
  all("[data-close]").forEach(function (button) { button.addEventListener("click", function () { button.closest("dialog").close(); }); });
  all("dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (event) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });
  $("togglePin").addEventListener("click", function () { $("loginPin").type = $("loginPin").type === "password" ? "text" : "password"; });
  $("notifyEveryone").addEventListener("change", function () { $("recipientChecks").classList.toggle("hidden", $("notifyEveryone").checked); });
  $("recurringNotifyEveryone").addEventListener("change", function () { $("recurringRecipientChecks").classList.toggle("hidden", $("recurringNotifyEveryone").checked); });
  $("photoFile").addEventListener("change", previewPhoto);
}
function openDialog(id) { const dialog = $(id); if (dialog && !dialog.open) dialog.showModal(); }
function prepareNewDialog(id) {
  const defaults = {
    expenseDialog: ["expenseForm", "expenseId", "expenseDate"], recurringExpenseDialog: ["recurringExpenseForm", "recurringExpenseId", "recurringExpenseDueDate"], incomeDialog: ["incomeForm", "incomeId", "incomeDate"],
    dateDialog: ["dateForm", "importantDateId", "importantDateValue"], memberDialog: ["memberForm", "memberId", null],
    experienceDialog: ["experienceForm", "experienceId", "experienceDate"], diaryDialog: ["diaryForm", "diaryId", "diaryDate"]
  };
  if (defaults[id]) {
    $(defaults[id][0]).reset();
    $(defaults[id][1]).value = "";
    if (defaults[id][2]) $(defaults[id][2]).value = todayIso();
  }
  if (id === "expenseDialog") { $("expenseRecurringId").value = ""; $("expenseRecurringNote").textContent = ""; $("expenseRecurringNote").classList.add("hidden"); $("expenseDialogTitle").textContent = "Add expenditure"; }
  if (id === "recurringExpenseDialog") { $("recurringExpenseDialogTitle").textContent = "Add regular payment"; $("recurringNotifyEveryone").checked = true; $("recurringRecipientChecks").classList.add("hidden"); renderRecurringRecipientChecks([]); }
  if (id === "bulkExpenseDialog") $("bulkExpenseForm").reset();
  if (id === "incomeDialog") { $("incomeDialogTitle").textContent = "Add income"; fillMemberSelect($("incomeReceivedBy"), state.data.user.id); }
  if (id === "targetDialog") { $("targetForm").reset(); $("targetDueDate").value = todayIso(); fillMemberSelect($("targetOwner"), state.data.user.id, true); }
  if (id === "contributionDialog") { $("contributionForm").reset(); $("contributionDate").value = todayIso(); }
  if (id === "dateDialog") { $("dateDialogTitle").textContent = "Add important date"; $("notifyEveryone").checked = true; $("recipientChecks").classList.add("hidden"); renderRecipientChecks([]); }
  if (id === "photoDialog") { $("photoForm").reset(); $("photoTakenDate").value = todayIso(); $("photoPreview").classList.add("hidden"); state.pendingPhoto = null; }
  if (id === "memberDialog") { $("memberDialogTitle").textContent = "Add family member"; $("memberActive").checked = true; $("memberPin").required = true; setMemberPermissions(["EXPENSES","INCOME","TARGETS","DATES","CALENDAR","PHOTOS","EXPERIENCES","DIARY"]); syncMemberAccessRole(); }
  if (id === "experienceDialog") $("experienceDialogTitle").textContent = "Add experience";
  if (id === "diaryDialog") $("diaryDialogTitle").textContent = "Write diary entry";
}

function bindForms() {
  $("loginForm").addEventListener("submit", login);
  $("expenseForm").addEventListener("submit", saveExpense);
  $("recurringExpenseForm").addEventListener("submit", saveRecurringExpense);
  $("bulkExpenseForm").addEventListener("submit", importOldExpenses);
  $("expensePrintForm").addEventListener("submit", printExpenseRange);
  $("viewExpenseReport").addEventListener("click", viewExpenseRange);
  $("incomeForm").addEventListener("submit", saveIncome);
  $("targetForm").addEventListener("submit", saveTarget);
  $("contributionForm").addEventListener("submit", saveContribution);
  $("dateForm").addEventListener("submit", saveImportantDate);
  $("photoForm").addEventListener("submit", savePhoto);
  $("experienceForm").addEventListener("submit", saveExperience);
  $("diaryForm").addEventListener("submit", saveDiary);
  $("memberForm").addEventListener("submit", saveMember);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("stickyNoteForm").addEventListener("submit", saveStickyNote);
  $("stickyQuickForm").addEventListener("submit", saveQuickStickyNote);
  $("createBackupNow").addEventListener("click", createBackupNow);
  $("memberRole").addEventListener("change", syncMemberAccessRole);
}

function bindFilters() {
  ["expenseMonth", "expenseSendToFilter", "expenseAccountFilter", "expenseSearch"].forEach(function (id) { $(id).addEventListener("input", renderExpenses); });
  ["incomeMonth", "incomeCategoryFilter", "incomeMemberFilter", "incomeSearch"].forEach(function (id) { $(id).addEventListener("input", renderIncome); });
  ["dateTypeFilter", "dateSearch"].forEach(function (id) { $(id).addEventListener("input", renderDates); });
  $("photoSearch").addEventListener("input", renderPhotos);
  ["experienceYear", "experienceSearch"].forEach(function (id) { $(id).addEventListener("input", renderExperiences); });
  ["diaryMonth", "diaryWriterFilter", "diarySearch"].forEach(function (id) { $(id).addEventListener("input", renderDiary); });
  $("globalSearch").addEventListener("input", renderGlobalSearch);
  $("exportExpenses").addEventListener("click", function () { exportCsv("family-expenditure.csv", filteredExpenses(), ["amount", "date", "sentTo", "fromAccount", "reason"], ["Amt (Rs.)", "Date Paid", "Send to", "From Acct", "Reason"]); });
  $("exportIncome").addEventListener("click", function () { exportCsv("family-income.csv", filteredIncome(), ["date", "source", "category", "receivedByName", "receivingMode", "amount"]); });
  $("printExpenses").addEventListener("click", function () { prepareExpensePrintDialog(); openDialog("expensePrintDialog"); });
  $("printIncome").addEventListener("click", function () { window.print(); });
}

function bindActions() {
  document.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === "edit-expense") editExpense(id);
    if (action === "delete-expense") confirmDelete("deleteExpense", id, "Delete this expenditure entry?");
    if (action === "pay-recurring-expense") openRecurringPayment(id);
    if (action === "edit-recurring-expense") editRecurringExpense(id);
    if (action === "delete-recurring-expense") confirmDelete("deleteRecurringExpense", id, "Remove this regular payment schedule? Past paid expenditure will remain.");
    if (action === "edit-income") editIncome(id);
    if (action === "delete-income") confirmDelete("deleteIncome", id, "Delete this income entry?");
    if (action === "contribute") openContribution(id);
    if (action === "delete-target") confirmDelete("deleteTarget", id, "Delete this target and its contribution history?");
    if (action === "edit-date") editImportantDate(id);
    if (action === "delete-date") confirmDelete("deleteImportantDate", id, "Delete this reminder?");
    if (action === "view-photo") viewPhoto(id);
    if (action === "delete-photo") { event.stopPropagation(); confirmDelete("deletePhoto", id, "Delete this shared photo from Google Drive?"); }
    if (action === "edit-experience") editExperience(id);
    if (action === "delete-experience") confirmDelete("deleteExperience", id, "Delete this experience?");
    if (action === "edit-diary") editDiary(id);
    if (action === "delete-diary") confirmDelete("deleteDiary", id, "Delete this diary entry?");
    if (action === "edit-member") editMember(id);
    if (action === "reset-pin") resetMemberPin(id);
    if (action === "edit-sticky") editStickyNote(id);
    if (action === "delete-sticky") confirmDelete("deleteStickyNote", id, "Delete this sticky note permanently?");
    if (action === "complete-sticky") completeStickyNote(id);
    if (action === "restore-sticky") mutate("restoreStickyNote", { id: id }, "Sticky note restored.");
    if (action === "collapse-sticky") changeStickyLayout(id, "collapse");
    if (action === "pin-sticky") changeStickyLayout(id, "pin");
    if (action === "grow-sticky") changeStickyLayout(id, "grow");
    if (action === "shrink-sticky") changeStickyLayout(id, "shrink");
  });
}

function bindStickyBoard() {
  $("stickyLauncher").addEventListener("click", function () { openStickyBoard("active"); });
  $("stickyMinimize").addEventListener("click", closeStickyBoard);
  $("stickyBoardShade").addEventListener("click", closeStickyBoard);
  all("[data-sticky-close]").forEach(function (button) { button.addEventListener("click", closeStickyBoard); });
  $("stickyTabActive").addEventListener("click", function () { state.stickyView = "active"; renderStickyNotes(); });
  $("stickyTabCompleted").addEventListener("click", function () { state.stickyView = "completed"; renderStickyNotes(); });
  $("stickyCanvas").addEventListener("pointerdown", startStickyDrag);
  $("stickyPinnedCanvas").addEventListener("pointerdown", startStickyDrag);
  window.addEventListener("pointermove", moveStickyDrag);
  window.addEventListener("pointerup", endStickyDrag);
  window.addEventListener("pointercancel", endStickyDrag);
}

function openStickyBoard(view) {
  if (!canUseStickyNotes()) return;
  if (view) state.stickyView = view;
  $("stickyBoard").classList.remove("hidden");
  $("stickyBoardShade").classList.remove("hidden");
  $("stickyPinnedLayer").classList.add("hidden");
  $("stickyLauncher").classList.add("hidden");
  $("stickyLauncher").setAttribute("aria-expanded", "true");
  renderStickyNotes();
}

function closeStickyBoard() {
  $("stickyBoard").classList.add("hidden");
  $("stickyBoardShade").classList.add("hidden");
  $("stickyLauncher").classList.toggle("hidden", !canUseStickyNotes());
  $("stickyLauncher").setAttribute("aria-expanded", "false");
  renderStickyPinnedLayer();
}

function canUseStickyNotes() { return hasModuleAccess("TARGETS") || hasModuleAccess("DATES"); }

async function login(event) {
  event.preventDefault();
  if (!CONFIG.API_URL || CONFIG.API_URL === PLACEHOLDER_URL) return toast("Paste the Apps Script Web App URL in config.js first.", "error");
  showLoading("Signing you in…");
  try {
    const username = $("loginUsername").value.trim();
    const result = await api("login", { username: username, pin: $("loginPin").value });
    if ($("rememberUsername").checked) localStorage.setItem(SAVED_USERNAME_KEY, username); else localStorage.removeItem(SAVED_USERNAME_KEY);
    state.token = result.token;
    state.data = normalizeBootstrapData(result.bootstrap);
    localStorage.setItem("familyDashboardToken", state.token);
    $("loginForm").reset();
    showApp();
  } catch (error) { toast(error.message, "error"); }
  finally { hideLoading(); }
}
async function logout() {
  try { if (state.token) await api("logout", {}); } catch (e) { /* local logout still succeeds */ }
  state.token = ""; state.data = null; state.stickyView = "active"; localStorage.removeItem("familyDashboardToken"); showLogin();
}

async function saveExpense(event) {
  event.preventDefault();
  const recurringId = $("expenseRecurringId").value;
  const action = recurringId ? "markRecurringExpensePaid" : $("expenseId").value ? "updateExpense" : "createExpense";
  await mutate(action, {
    id: recurringId || $("expenseId").value, date: $("expenseDate").value, amount: $("expenseAmount").value,
    sentTo: $("expenseSendTo").value.trim(), fromAccount: $("expenseFromAccount").value.trim(),
    reason: $("expenseReason").value.trim(), entryType: recurringId ? "RECURRING" : "REGULAR"
  }, recurringId ? "Payment recorded and the next due date was calculated." : "Expenditure saved.", "expenseDialog");
}

async function saveRecurringExpense(event) {
  event.preventDefault();
  const everyone = $("recurringNotifyEveryone").checked;
  const recipients = everyone ? ["ALL"] : all("input[name='recurringRecipient']:checked").map(function (el) { return el.value; });
  if (!recipients.length) return toast("Choose at least one email recipient.", "error");
  const id = $("recurringExpenseId").value;
  await mutate(id ? "updateRecurringExpense" : "createRecurringExpense", {
    id: id, title: $("recurringExpenseTitle").value.trim(), estimatedAmount: $("recurringExpenseAmount").value,
    frequency: $("recurringExpenseFrequency").value, nextDueDate: $("recurringExpenseDueDate").value,
    sentTo: $("recurringExpenseSendTo").value.trim(), fromAccount: $("recurringExpenseFromAccount").value.trim(),
    reason: $("recurringExpenseReason").value.trim(), remindDays: $("recurringExpenseRemind").value,
    recipientIds: recipients.join(",")
  }, id ? "Regular payment updated." : "Regular payment added.", "recurringExpenseDialog");
}

async function importOldExpenses(event) {
  event.preventDefault();
  let entries;
  try { entries = parseOldExpenseRows($("bulkExpenseText").value); }
  catch (error) { return toast(error.message, "error"); }
  const result = await mutate("bulkCreateExpenses", { entries: entries }, plural(entries.length, "old expenditure") + " imported.", "bulkExpenseDialog", "Importing old expenditure…");
  if (result) { $("expenseMonth").value = ""; renderExpenses(); }
}

function prepareExpensePrintDialog() {
  const month = $("expenseMonth").value;
  if (month) {
    const parts = month.split("-").map(Number);
    const lastDay = new Date(parts[0], parts[1], 0).getDate();
    $("expensePrintFrom").value = month + "-01";
    $("expensePrintTo").value = month === currentMonth() ? todayIso() : month + "-" + String(lastDay).padStart(2, "0");
  } else if (state.data.expenses.length) {
    const dates = state.data.expenses.map(function (item) { return String(item.date).slice(0,10); }).filter(Boolean).sort();
    $("expensePrintFrom").value = dates[0] || currentMonth() + "-01";
    $("expensePrintTo").value = dates[dates.length - 1] || todayIso();
  }
}

function viewExpenseRange() { openExpenseRangeOutput(false); }
function printExpenseRange(event) { event.preventDefault(); openExpenseRangeOutput(true); }

function openExpenseRangeOutput(autoPrint) {
  const from = $("expensePrintFrom").value, to = $("expensePrintTo").value;
  if (!from || !to) return toast("Choose both From date and To date.", "error");
  if (from > to) return toast("From date cannot be later than To date.", "error");
  const items = state.data.expenses.map(normalizeExpense).filter(function (item) {
    const date = String(item.date || "").slice(0,10); return date >= from && date <= to;
  }).sort(function (a,b) { return String(a.date).localeCompare(String(b.date)); });
  if (!items.length) return toast("No expenditure was found in the selected period.", "error");

  const total = items.reduce(function (sum,item) { return sum + Number(item.amount || 0); }, 0);
  const familyName = (state.data.settings && state.data.settings.familyName) || "Our Family Hub";
  const rows = items.map(function (item,index) {
    return "<tr><td class='serial'>"+(index+1)+"</td><td class='number'>"+h(money(item.amount))+"</td><td>"+h(formatDate(item.date))+"</td><td><strong>"+h(item.sentTo)+"</strong></td><td>"+h(item.fromAccount)+"</td><td class='reason'>"+h(item.reason)+"</td></tr>";
  }).join("");
  const reportWindow = window.open("", "familyExpenseReport", "width=1150,height=820");
  if (!reportWindow) return toast("Allow pop-ups for this page to view or print the selected expenditure.", "error");
  const autoPrintScript = autoPrint ? "<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},200)};<\/script>" : "";
  reportWindow.document.open();
  reportWindow.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Expenditure "+h(from)+" to "+h(to)+"</title><style>"+
    "@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#25243b;background:#f5f3fb;font:13px Arial,sans-serif}.report{max-width:1200px;margin:0 auto;padding:28px;background:white;min-height:100vh}.screen-actions{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;margin:-12px -12px 18px;padding:10px;background:rgba(255,255,255,.94);border-bottom:1px solid #e5e2ee}.screen-actions button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer}.screen-actions .print{color:white;background:#6752c7}.screen-actions .close{color:#4d4e67;background:#efedf5}h1{margin:0 0 5px;font-size:24px}.family{color:#6752c7;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.period{margin:0;color:#66687d}.summary{display:flex;gap:14px;margin:16px 0;padding:11px 14px;border:1px solid #dedbe9;border-radius:10px;background:#f7f5ff;font-weight:700}.summary strong{color:#4b389e}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:9px 8px;border:1px solid #dddce7;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{color:#3e3a62;background:#e9e4fb;font-size:11px;text-transform:uppercase}tbody tr:nth-child(even){background:#f7f5ff}.serial{width:5%;text-align:center}.number{width:12%;text-align:right;font-variant-numeric:tabular-nums}.reason{width:32%;line-height:1.45}.foot{margin-top:12px;color:#858699;font-size:10px;text-align:right}@media print{body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{max-width:none;padding:0}.screen-actions{display:none}}"+
    "</style></head><body><main class='report'><div class='screen-actions'><button class='close' type='button' onclick='window.close()'>Close view</button><button class='print' type='button' onclick='window.print()'>Print this report</button></div><div class='family'>"+h(familyName)+"</div><h1>Expenditure statement</h1><p class='period'>From "+h(formatDate(from))+" to "+h(formatDate(to))+"</p><div class='summary'><span>"+h(plural(items.length,"entry","entries"))+"</span><span>Total: <strong>"+h(money(total))+"</strong></span></div><table><thead><tr><th class='serial'>Sl.</th><th class='number'>Amt (Rs.)</th><th>Date Paid</th><th>Send to</th><th>From Acct</th><th class='reason'>Reason</th></tr></thead><tbody>"+rows+"</tbody></table><p class='foot'>Prepared "+h(new Date().toLocaleString("en-IN"))+" · Family Dashboard v"+h(FRONTEND_VERSION)+"</p></main>"+autoPrintScript+"</body></html>");
  reportWindow.document.close();
  $("expensePrintDialog").close();
}

function parseOldExpenseRows(text) {
  const source = String(text || "").replace(/\r/g, "").trim();
  if (!source) throw new Error("Paste at least one expenditure row.");
  const firstLine = source.split("\n").filter(function (line) { return line.trim(); })[0] || "";
  const parsedRows = /^\s*\|/.test(firstLine) ? source.split("\n").filter(function (line) { return line.trim(); }).map(parseMarkdownRow) : parseDelimitedRows(source, source.indexOf("\t") >= 0 ? "\t" : ",");
  let rows = parsedRows.map(function (columns, index) { return { rowNumber: index + 1, columns: columns }; }).filter(function (row) { return row.columns.some(function (value) { return String(value).trim(); }) && !isImportedHeading(row.columns) && !isMarkdownDivider(row.columns); });
  if (!rows.length) throw new Error("No expenditure rows were found below the heading.");
  if (rows.length > 500) throw new Error("Import no more than 500 records at a time.");
  return rows.map(function (row) {
    const rowNumber = row.rowNumber, columns = normalizeImportedColumns(row.columns);
    const amount = Number(String(columns[0]).replace(/₹|rs\.?/ig, "").replace(/,/g, "").trim());
    if (!isFinite(amount) || amount <= 0) throw new Error("Row " + rowNumber + " has an invalid amount: " + String(columns[0] || "blank") + ".");
    const date = parseImportedDate(columns[1]);
    if (!date) throw new Error("Row " + rowNumber + " has an invalid date: " + String(columns[1] || "blank") + ". Use DD/MM/YYYY, DD-MMM-YYYY or YYYY-MM-DD.");
    const sentTo = String(columns[2] || "Not specified").trim().slice(0,100) || "Not specified";
    const fromAccount = String(columns[3] || "Not specified").trim().slice(0,100) || "Not specified";
    const reason = String(columns[4] || "Old expenditure").trim().slice(0,500) || "Old expenditure";
    return { amount: amount, date: date, sentTo: sentTo, fromAccount: fromAccount, reason: reason, entryType: "OLD" };
  });
}

function parseMarkdownRow(line) { const text=String(line||"").trim(); return (text.charAt(0)==="|"?text.slice(1):text).replace(/\|\s*$/,"").split("|").map(function(value){return value.trim();}); }

function parseDelimitedRows(text, delimiter) {
  const rows=[]; let row=[],value="",quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}
    else if(char==='"')quoted=!quoted;
    else if(char===delimiter&&!quoted){row.push(value);value="";}
    else if(char==='\n'&&!quoted){row.push(value);rows.push(row);row=[];value="";}
    else value+=char;
  }
  row.push(value);rows.push(row);return rows;
}

function normalizeImportedColumns(columns) {
  const values = columns.map(function (value) { return String(value == null ? "" : value).replace(/\u00a0/g," ").trim(); });
  if (values.length > 5 && /^\d+$/.test(values[0]) && /^\d{3}(?:\.\d+)?$/.test(values[1]) && parseImportedDate(values[2])) values.splice(0,2,values[0]+","+values[1]);
  while (values.length > 5 && !values[values.length - 1]) values.pop();
  if (values.length > 5) return values.slice(0,4).concat([values.slice(4).filter(Boolean).join(" · ")]);
  while (values.length < 5) values.push("");
  return values;
}

function isImportedHeading(columns) { const first=normalize(columns[0]),second=normalize(columns[1]); return (/amt|amount/.test(first)&&/date/.test(second)) || (first==="sl no"&&/amt|amount/.test(second)); }
function isMarkdownDivider(columns) { return columns.length > 1 && columns.every(function (value) { return /^\s*:?-{3,}:?\s*$/.test(String(value)); }); }

function parseCsvLine(line) {
  return parseDelimitedRows(String(line || ""), ",")[0].map(function(value){return value.trim();});
}

function parseImportedDate(value) {
  const text = String(value || "").trim().replace(/,/g, ""); let match;
  if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return validIsoDate(match[1], match[2], match[3]);
  if ((match = text.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/))) return validIsoDate(match[1], match[2], match[3]);
  if ((match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) return validIsoDate(normalizeImportedYear(match[3]), match[2], match[1]);
  if ((match = text.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})[\s\-\/]+(\d{2}|\d{4})$/))) { const month=importedMonthNumber(match[2]); return month ? validIsoDate(normalizeImportedYear(match[3]),month,match[1]) : ""; }
  if (/^\d{5}(?:\.\d+)?$/.test(text)) { const serial=Number(text); if (serial>=20000&&serial<=80000) { const date=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000); return date.toISOString().slice(0,10); } }
  return "";
}

function normalizeImportedYear(year) { const number=Number(year); return number<100 ? 2000+number : number; }
function importedMonthNumber(value) { const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12}; return months[normalize(value)]||0; }

function validIsoDate(year, month, day) {
  const iso = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  const date = new Date(iso + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
}
async function saveIncome(event) {
  event.preventDefault();
  await mutate($("incomeId").value ? "updateIncome" : "createIncome", {
    id: $("incomeId").value, date: $("incomeDate").value, amount: $("incomeAmount").value,
    source: $("incomeSource").value.trim(), category: $("incomeCategory").value,
    receivedBy: $("incomeReceivedBy").value, receivingMode: $("incomeMode").value
  }, "Income saved.", "incomeDialog");
}
async function saveTarget(event) {
  event.preventDefault();
  await mutate("createTarget", { title: $("targetTitle").value.trim(), targetAmount: $("targetAmount").value, dueDate: $("targetDueDate").value, category: $("targetCategory").value, ownerId: $("targetOwner").value, notes: $("targetNotes").value.trim() }, "Target created.", "targetDialog");
}
async function saveContribution(event) {
  event.preventDefault();
  await mutate("addContribution", { targetId: $("contributionTargetId").value, date: $("contributionDate").value, amount: $("contributionAmount").value, note: $("contributionNote").value.trim() }, "Progress added to the target.", "contributionDialog");
}
async function saveImportantDate(event) {
  event.preventDefault();
  const everyone = $("notifyEveryone").checked;
  const recipients = everyone ? ["ALL"] : all("input[name='dateRecipient']:checked").map(function (el) { return el.value; });
  if (!recipients.length) return toast("Choose at least one email recipient.", "error");
  await mutate($("importantDateId").value ? "updateImportantDate" : "createImportantDate", {
    id: $("importantDateId").value, title: $("importantDateTitle").value.trim(), eventDate: $("importantDateValue").value,
    eventType: $("importantDateType").value, repeatYearly: $("importantDateRepeat").checked,
    remindDays: $("importantDateRemind").value, recipientIds: recipients.join(","), notes: $("importantDateNotes").value.trim()
  }, "Reminder saved.", "dateDialog");
}

async function saveStickyNote(event) {
  event.preventDefault();
  const id = $("stickyNoteId").value;
  const selectedColour = document.querySelector("input[name='stickyColor']:checked");
  const active = state.data.stickyNotes.filter(function (note) { return note.status !== "COMPLETED"; });
  const slot = active.length;
  const payload = {
    id: id,
    noteType: $("stickyNoteType").value,
    title: $("stickyNoteTitle").value.trim(),
    body: $("stickyNoteBody").value.trim(),
    dueDate: $("stickyNoteDueDate").value,
    color: selectedColour ? selectedColour.value : "yellow"
  };
  if (!id) {
    payload.positionX = 24 + (slot % 3) * 300;
    payload.positionY = 24 + Math.floor(slot / 3) * 238;
    payload.width = 280;
    payload.height = 220;
    payload.collapsed = false;
    payload.pinned = false;
  }
  const result = await mutate(id ? "updateStickyNote" : "createStickyNote", payload, id ? "Sticky note updated." : "Sticky note added.", "stickyNoteDialog");
  if (result) openStickyBoard("active");
}

async function saveQuickStickyNote(event) {
  event.preventDefault();
  const title = $("quickStickyTitle").value.trim();
  const selectedColour = document.querySelector("input[name='quickStickyColor']:checked");
  const active = state.data.stickyNotes.filter(function (note) { return note.status !== "COMPLETED"; });
  const slot = active.length;
  const result = await mutate("createStickyNote", {
    noteType: $("quickStickyType").value,
    title: title,
    body: $("quickStickyBody").value.trim() || title,
    dueDate: $("quickStickyDueDate").value,
    color: selectedColour ? selectedColour.value : "yellow",
    positionX: 18 + (slot % 3) * 300,
    positionY: 18 + Math.floor(slot / 3) * 238,
    width: 280,
    height: 220,
    collapsed: false,
    pinned: false
  }, "Sticky note added.");
  if (result) {
    $("quickStickyTitle").value = ""; $("quickStickyBody").value = ""; $("quickStickyDueDate").value = "";
    const yellow = document.querySelector("input[name='quickStickyColor'][value='yellow']"); if (yellow) yellow.checked = true;
    state.stickyView = "active"; renderStickyNotes(); $("quickStickyTitle").focus();
  }
}

function prepareStickyNoteDialog(noteType) {
  const type = noteType === "REMINDER" ? "REMINDER" : "TARGET";
  $("stickyNoteForm").reset();
  $("stickyNoteId").value = "";
  $("stickyNoteType").value = type;
  configureStickyTypeChoices();
  setStickyColour("yellow");
  $("stickyNoteDialogTitle").textContent = type === "TARGET" ? "Add target note" : "Add reminder note";
  openDialog("stickyNoteDialog");
}

function configureStickyTypeChoices() {
  [$("stickyNoteType"), $("quickStickyType")].forEach(function (select) {
    all("option", select).forEach(function (option) {
      const allowed = option.value === "TARGET" ? hasModuleAccess("TARGETS") : hasModuleAccess("DATES");
      option.disabled = !allowed; option.hidden = !allowed;
    });
    if (select.selectedOptions[0] && select.selectedOptions[0].disabled) select.value = hasModuleAccess("DATES") ? "REMINDER" : "TARGET";
  });
}

function setStickyColour(colour) {
  const input = document.querySelector("input[name='stickyColor'][value='" + String(colour || "yellow").replace(/[^a-z]/g, "") + "']");
  if (input) input.checked = true;
}
async function savePhoto(event) {
  event.preventDefault();
  if (!state.pendingPhoto) return toast("Choose a photo first.", "error");
  await mutate("uploadPhoto", { title: $("photoTitle").value.trim(), caption: $("photoCaption").value.trim(), takenDate: $("photoTakenDate").value, fileName: state.pendingPhoto.name, fullData: state.pendingPhoto.fullData, thumbData: state.pendingPhoto.thumbData }, "Photo shared with the family.", "photoDialog", "Uploading and saving your photo…");
}
async function saveExperience(event) {
  event.preventDefault();
  await mutate($("experienceId").value ? "updateExperience" : "createExperience", { id: $("experienceId").value, title: $("experienceTitle").value.trim(), experienceDate: $("experienceDate").value, place: $("experiencePlace").value.trim(), story: $("experienceStory").value.trim(), tags: $("experienceTags").value.trim() }, "Experience saved.", "experienceDialog");
}
async function saveDiary(event) {
  event.preventDefault();
  await mutate($("diaryId").value ? "updateDiary" : "createDiary", { id: $("diaryId").value, diaryDate: $("diaryDate").value, mood: $("diaryMood").value, title: $("diaryTitle").value.trim(), body: $("diaryBody").value.trim(), tags: $("diaryTags").value.trim() }, "Diary entry saved.", "diaryDialog");
}
async function saveMember(event) {
  event.preventDefault();
  const id = $("memberId").value;
  const permissions = all("input[name='memberPermission']:checked").map(function (el) { return el.value; });
  const payload = { id: id, name: $("memberName").value.trim(), username: $("memberUsername").value.trim(), email: $("memberEmail").value.trim(), role: $("memberRole").value, pin: $("memberPin").value, active: $("memberActive").checked, permissions: permissions };
  if (!id && !payload.pin) return toast("Enter a 6-digit PIN for the new member.", "error");
  await mutate("saveMember", payload, id ? "Member updated." : "Family member added.", "memberDialog");
}
async function saveSettings(event) {
  event.preventDefault();
  await mutate("saveSettings", { familyName: $("settingFamilyName").value.trim(), currency: $("settingCurrency").value, timezone: $("settingTimezone").value.trim() }, "Family settings updated.");
}
async function createBackupNow() {
  const result = await mutate("createBackupNow", {}, "Dashboard backup created.", null, "Creating a private Drive backup…");
  if (result && result.url && window.confirm("Backup created successfully. Open the backup copy now?")) window.open(result.url, "_blank", "noopener");
}

async function mutate(action, payload, successMessage, closeId, loadingMessage) {
  showLoading(loadingMessage || "Saving changes…");
  try {
    const result = await api(action, payload);
    if (closeId && $(closeId).open) $(closeId).close();
    await refreshData();
    toast(successMessage || (result && result.message) || "Saved.", "success");
    return result;
  } catch (error) { toast(friendlyApiError(error), "error"); return null; }
  finally { hideLoading(); }
}
async function refreshData() { state.data = normalizeBootstrapData(await api("bootstrap", {})); renderAll(); }
async function confirmDelete(action, id, message) { if (window.confirm(message)) await mutate(action, { id: id }, "Deleted."); }

function editExpense(id) {
  const item = state.data.expenses.find(function (x) { return x.id === id; }); if (!item) return;
  const expense = normalizeExpense(item); prepareNewDialog("expenseDialog"); $("expenseId").value = expense.id; $("expenseDate").value = expense.date; $("expenseAmount").value = expense.amount; $("expenseSendTo").value = expense.sentTo; $("expenseFromAccount").value = expense.fromAccount; $("expenseReason").value = expense.reason; $("expenseDialogTitle").textContent = "Edit expenditure"; openDialog("expenseDialog");
}
function openRecurringPayment(id) {
  const item = state.data.recurringExpenses.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("expenseDialog"); $("expenseRecurringId").value = item.id; $("expenseDate").value = todayIso(); $("expenseAmount").value = Number(item.estimatedAmount || 0) || ""; $("expenseSendTo").value = item.sentTo; $("expenseFromAccount").value = item.fromAccount; $("expenseReason").value = item.reason; $("expenseDialogTitle").textContent = "Mark “" + item.title + "” as paid"; $("expenseRecurringNote").textContent = "Due " + formatDate(item.nextDueDate) + ". You can change the actual amount or payment details before saving."; $("expenseRecurringNote").classList.remove("hidden"); openDialog("expenseDialog");
}
function editRecurringExpense(id) {
  const item = state.data.recurringExpenses.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("recurringExpenseDialog"); $("recurringExpenseId").value = item.id; $("recurringExpenseTitle").value = item.title; $("recurringExpenseAmount").value = Number(item.estimatedAmount || 0) || ""; $("recurringExpenseFrequency").value = item.frequency; $("recurringExpenseDueDate").value = item.nextDueDate; $("recurringExpenseSendTo").value = item.sentTo; $("recurringExpenseFromAccount").value = item.fromAccount; $("recurringExpenseReason").value = item.reason; $("recurringExpenseRemind").value = item.remindDays || "7,1,0";
  const ids = String(item.recipientIds || "ALL").split(","); const everyone = ids.indexOf("ALL") >= 0; $("recurringNotifyEveryone").checked = everyone; $("recurringRecipientChecks").classList.toggle("hidden", everyone); renderRecurringRecipientChecks(ids); $("recurringExpenseDialogTitle").textContent = "Edit regular payment"; openDialog("recurringExpenseDialog");
}
function editIncome(id) {
  const item = state.data.income.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("incomeDialog"); $("incomeId").value = item.id; $("incomeDate").value = item.date; $("incomeAmount").value = item.amount; $("incomeSource").value = item.source; $("incomeCategory").value = item.category; fillMemberSelect($("incomeReceivedBy"), item.receivedBy); $("incomeMode").value = item.receivingMode; $("incomeDialogTitle").textContent = "Edit income"; openDialog("incomeDialog");
}
function openContribution(id) { const target = state.data.targets.find(function (x) { return x.id === id; }); if (!target) return; prepareNewDialog("contributionDialog"); $("contributionTargetId").value = id; $("contributionTitle").textContent = "Add to “" + target.title + "”"; openDialog("contributionDialog"); }
function editImportantDate(id) {
  const item = state.data.importantDates.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("dateDialog"); $("importantDateId").value = item.id; $("importantDateTitle").value = item.title; $("importantDateValue").value = item.eventDate; $("importantDateType").value = item.eventType; $("importantDateRepeat").checked = item.repeatYearly; $("importantDateRemind").value = item.remindDays; $("importantDateNotes").value = item.notes || "";
  const ids = String(item.recipientIds || "").split(","); const everyone = ids.indexOf("ALL") >= 0; $("notifyEveryone").checked = everyone; $("recipientChecks").classList.toggle("hidden", everyone); renderRecipientChecks(ids); $("dateDialogTitle").textContent = "Edit reminder"; openDialog("dateDialog");
}
function editStickyNote(id) {
  const item = state.data.stickyNotes.find(function (note) { return note.id === id; }); if (!item) return;
  $("stickyNoteForm").reset(); $("stickyNoteId").value = item.id; $("stickyNoteType").value = item.noteType; configureStickyTypeChoices();
  $("stickyNoteTitle").value = item.title; $("stickyNoteBody").value = item.body; $("stickyNoteDueDate").value = item.dueDate || ""; setStickyColour(item.color);
  $("stickyNoteDialogTitle").textContent = "Edit " + (item.noteType === "REMINDER" ? "reminder" : "target") + " note"; openDialog("stickyNoteDialog");
}
async function completeStickyNote(id) {
  if (!window.confirm("Mark this sticky note complete? It will move to the saved Completed list.")) return;
  await mutate("completeStickyNote", { id: id }, "Completed and saved in the sticky-note archive.");
}
function changeStickyLayout(id, change) {
  const note = state.data.stickyNotes.find(function (item) { return item.id === id; }); if (!note) return;
  if (change === "collapse" && note.pinned) return toast("This note is pinned open. Unpin it before collapsing.", "error");
  if (change === "collapse") note.collapsed = !note.collapsed;
  if (change === "pin") { note.pinned = !note.pinned; if (note.pinned) note.collapsed = false; }
  if (change === "grow") { note.width = Math.min(520, Number(note.width || 280) + 40); note.height = Math.min(500, Number(note.height || 220) + 35); }
  if (change === "shrink") { note.width = Math.max(220, Number(note.width || 280) - 40); note.height = Math.max(160, Number(note.height || 220) - 35); }
  renderStickyNotes();
  queueStickyLayoutSave(note);
  if (change === "pin") toast(note.pinned ? "Pinned open above the dashboard." : "Note unpinned; it can now be collapsed.", "success");
}
function queueStickyLayoutSave(note) {
  const oldTimer = state.stickyLayoutTimers.get(note.id); if (oldTimer) clearTimeout(oldTimer);
  state.stickyLayoutTimers.set(note.id, setTimeout(async function () {
    state.stickyLayoutTimers.delete(note.id);
    try {
      await api("updateStickyLayout", { id: note.id, positionX: note.positionX, positionY: note.positionY, width: note.width, height: note.height, collapsed: !!note.collapsed, pinned: !!note.pinned });
    } catch (error) { toast(friendlyApiError(error), "error"); }
  }, 220));
}
function editExperience(id) {
  const item = state.data.experiences.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("experienceDialog"); $("experienceId").value = item.id; $("experienceTitle").value = item.title; $("experienceDate").value = item.experienceDate; $("experiencePlace").value = item.place || ""; $("experienceStory").value = item.story; $("experienceTags").value = item.tags || ""; $("experienceDialogTitle").textContent = "Edit experience"; openDialog("experienceDialog");
}
function editDiary(id) {
  const item = state.data.diary.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("diaryDialog"); $("diaryId").value = item.id; $("diaryDate").value = item.diaryDate; $("diaryMood").value = item.mood; $("diaryTitle").value = item.title; $("diaryBody").value = item.body; $("diaryTags").value = item.tags || ""; $("diaryDialogTitle").textContent = "Edit diary entry"; openDialog("diaryDialog");
}
function editMember(id) {
  const item = (state.data.adminMembers || []).find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("memberDialog"); $("memberId").value = item.id; $("memberName").value = item.name; $("memberUsername").value = item.username; $("memberEmail").value = item.email || ""; $("memberRole").value = item.role; setMemberPermissions(item.permissions || []); syncMemberAccessRole(); $("memberActive").checked = item.active; $("memberPin").value = ""; $("memberPin").required = false; $("memberDialogTitle").textContent = "Edit family member"; openDialog("memberDialog");
}
function setMemberPermissions(permissions) { all("input[name='memberPermission']").forEach(function (el) { el.checked = permissions.indexOf(el.value) >= 0; }); }
function syncMemberAccessRole() { const admin = $("memberRole").value === "ADMIN"; if (admin) setMemberPermissions(["EXPENSES","INCOME","TARGETS","DATES","CALENDAR","PHOTOS","EXPERIENCES","DIARY"]); all("input[name='memberPermission']").forEach(function (el) { el.disabled = admin; }); }
async function resetMemberPin(id) {
  if (!window.confirm("Generate a new 6-digit PIN for this member? Their old PIN will stop working.")) return;
  showLoading("Generating a new PIN…");
  try { const result = await api("resetMemberPin", { id: id }); await refreshData(); window.alert("New PIN: " + result.newPin + "\n\nPlease give this PIN privately to the family member."); }
  catch (error) { toast(error.message, "error"); } finally { hideLoading(); }
}

function renderAll() {
  const settings = state.data.settings || {};
  document.title = (settings.familyName || "Our Family Hub") + " · Family Dashboard";
  $("sidebarFamilyName").textContent = settings.familyName || "Our Family Hub";
  $("loginFamilyName").textContent = settings.familyName || "Our Family Hub";
  $("userName").textContent = state.data.user.name;
  $("userRole").textContent = state.data.user.role === "ADMIN" ? "Administrator" : "Family member";
  $("userAvatar").textContent = state.data.user.name.charAt(0).toUpperCase();
  $("adminNav").classList.toggle("hidden", !isAdmin());
  if (!isAdmin() && state.view === "admin") goTo("home");
  applyAccessUI();
  populateFilters(); renderHome(); renderExpenses(); renderRecurringExpenses(); renderIncome(); renderTargets(); renderDates(); renderPhotos(); renderExperiences(); renderDiary(); renderCalendar(); renderStickyNotes(); if (isAdmin()) renderAdmin();
}
function applyAccessUI() {
  all("[data-module]").forEach(function (el) { el.classList.toggle("hidden", !hasModuleAccess(el.dataset.module)); });
  if (viewModules[state.view] && !hasModuleAccess(viewModules[state.view])) goTo("home");
  configureStickyTypeChoices();
  if (!canUseStickyNotes()) { $("stickyBoard").classList.add("hidden"); $("stickyBoardShade").classList.add("hidden"); $("stickyLauncher").classList.add("hidden"); $("stickyPinnedLayer").classList.add("hidden"); }
  else if ($("stickyBoard").classList.contains("hidden")) $("stickyLauncher").classList.remove("hidden");
}
function populateFilters() {
  fillMemberFilter($("incomeMemberFilter")); fillMemberFilter($("diaryWriterFilter"));
  const recipients = Array.from(new Set(state.data.expenses.map(function (x) { return normalizeExpense(x).sentTo; }).filter(Boolean))).sort();
  const accounts = Array.from(new Set(state.data.expenses.map(function (x) { return normalizeExpense(x).fromAccount; }).filter(Boolean))).sort();
  const incomeCats = Array.from(new Set(state.data.income.map(function (x) { return x.category; }))).sort();
  fillOptions($("expenseSendToFilter"), recipients, "All recipients"); fillOptions($("expenseAccountFilter"), accounts, "All accounts"); fillOptions($("incomeCategoryFilter"), incomeCats, "All categories");
  fillMemberSelect($("incomeReceivedBy"), $("incomeReceivedBy").value || state.data.user.id); fillMemberSelect($("targetOwner"), $("targetOwner").value || state.data.user.id, true);
  renderRecipientChecks([]); renderRecurringRecipientChecks([]);
  const years = Array.from(new Set(state.data.experiences.map(function (x) { return String(x.experienceDate).slice(0,4); }))).filter(Boolean).sort().reverse(); const selectedYear = $("experienceYear").value; fillOptions($("experienceYear"), years, "All years"); $("experienceYear").value = years.indexOf(selectedYear) >= 0 ? selectedYear : "";
}
function fillOptions(select, values, allLabel) { const current = select.value; select.innerHTML = '<option value="">' + h(allLabel) + "</option>" + values.map(function (x) { return '<option value="' + h(x) + '">' + h(x) + "</option>"; }).join(""); if (values.indexOf(current) >= 0) select.value = current; }
function fillMemberSelect(select, selected, allowAll) { select.innerHTML = (allowAll ? '<option value="ALL">Whole family</option>' : "") + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = selected || (allowAll ? "ALL" : state.data.user.id); }
function fillMemberFilter(select) { const current = select.value; select.innerHTML = '<option value="">All family members</option>' + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = current; }
function renderRecipientChecks(selected) { if (!state.data) return; $("recipientChecks").innerHTML = state.data.members.map(function (m) { return '<label class="check-row"><input type="checkbox" name="dateRecipient" value="' + h(m.id) + '" ' + (selected.indexOf(m.id) >= 0 ? "checked" : "") + "> " + h(m.name) + "</label>"; }).join(""); }
function renderRecurringRecipientChecks(selected) { if (!state.data) return; $("recurringRecipientChecks").innerHTML = state.data.members.map(function (m) { return '<label class="check-row"><input type="checkbox" name="recurringRecipient" value="' + h(m.id) + '" ' + (selected.indexOf(m.id) >= 0 ? "checked" : "") + "> " + h(m.name) + "</label>"; }).join(""); }

function renderHome() {
  const prefix = currentMonth();
  const monthExpenses = state.data.expenses.filter(function (x) { return String(x.date).slice(0,7) === prefix; });
  const monthIncome = state.data.income.filter(function (x) { return String(x.date).slice(0,7) === prefix; });
  const expenseTotal = monthExpenses.reduce(function (sum,x) { return sum + Number(x.amount || 0); }, 0);
  const incomeTotal = monthIncome.reduce(function (sum,x) { return sum + Number(x.amount || 0); }, 0);
  const targetTotal = state.data.targets.reduce(function (sum,x) { return sum + Number(x.targetAmount || 0); }, 0);
  const targetSaved = state.data.targets.reduce(function (sum,x) { return sum + Number(x.currentAmount || 0); }, 0);
  const targetPct = targetTotal ? Math.min(100, Math.round(targetSaved / targetTotal * 100)) : 0;
  const upcoming = upcomingDates(30);
  const hour = new Date().getHours(); const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  $("welcomeHeading").textContent = greeting + ", " + state.data.user.name.split(" ")[0] + ".";
  $("monthSpend").textContent = money(expenseTotal); $("monthExpenseCount").textContent = plural(monthExpenses.length, "entry", "entries");
  $("monthIncome").textContent = money(incomeTotal); $("monthIncomeCount").textContent = plural(monthIncome.length, "entry", "entries");
  $("targetProgress").textContent = targetPct + "%"; $("targetCaption").textContent = state.data.targets.length ? plural(state.data.targets.length, "active target") : "No active targets";
  $("reminderCount").textContent = plural(state.data.importantDates.length, "reminder"); $("upcomingCount").textContent = upcoming.length + " in next 30 days"; $("photoCount").textContent = plural(state.data.photos.length, "photo"); $("experienceCount").textContent = plural(state.data.experiences.length, "story", "stories");
  renderFamilyMembers(); renderCategoryBars(monthExpenses); renderUpcoming(upcoming); renderActivity();
}
function renderFamilyMembers() { const members=state.data.members||[]; $("homeMemberCount").textContent=plural(members.length,"member"); $("homeMemberList").innerHTML=members.map(function(member){return '<span class="family-chip"><i>'+h(String(member.name||"?").charAt(0).toUpperCase())+'</i>'+h(member.name||"Family member")+'</span>';}).join(""); }
function renderCategoryBars(items) {
  const totals = {}; items.forEach(function (x) { const label = normalizeExpense(x).sentTo || x.category || "Other"; totals[label] = (totals[label] || 0) + Number(x.amount || 0); });
  const rows = Object.keys(totals).map(function (key) { return [key, totals[key]]; }).sort(function (a,b) { return b[1] - a[1]; }).slice(0,6); const max = rows.length ? rows[0][1] : 1;
  $("categoryBars").classList.toggle("empty-block", !rows.length); $("categoryBars").innerHTML = rows.length ? rows.map(function (row) { return '<div class="category-row"><span>' + h(row[0]) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4,row[1]/max*100) + '%"></div></div><strong>' + h(money(row[1])) + "</strong></div>"; }).join("") : "No expenditure added this month.";
}
function upcomingDates(days) { return state.data.importantDates.filter(function (x) { return Number(x.daysUntil) >= 0 && Number(x.daysUntil) <= days; }).sort(function (a,b) { return Number(a.daysUntil)-Number(b.daysUntil); }); }
function renderUpcoming(items) {
  $("upcomingList").classList.toggle("empty-block", !items.length); $("upcomingList").innerHTML = items.length ? items.slice(0,5).map(function (x) { const p=dayParts(x.nextOccurrence); return '<div class="mini-item"><div class="mini-date"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.eventType)+' · '+(Number(x.daysUntil)===0?'Today':plural(Number(x.daysUntil),"day")+" away")+'</small></p></div>'; }).join("") : (state.data.importantDates.length ? plural(state.data.importantDates.length,"saved reminder")+" · none falls within the next 30 days. Use View all to see every reminder." : "No important dates have been added yet.");
}
function renderActivity() {
  let items = [];
  state.data.expenses.slice(0,4).forEach(function (x) { const expense=normalizeExpense(x); items.push({date:x.createdAt,icon:"₹",title:expense.reason||expense.sentTo,meta:money(x.amount)+" sent to "+expense.sentTo+" · "+memberName(x.createdBy)}); });
  state.data.income.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"↗",title:x.source,meta:money(x.amount)+" income · "+memberName(x.createdBy)}); });
  state.data.photos.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"▧",title:x.title,meta:"Photo shared by "+memberName(x.uploadedBy)}); });
  state.data.diary.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"☷",title:x.title,meta:"Diary by "+memberName(x.createdBy)}); });
  items.sort(function(a,b){return String(b.date).localeCompare(String(a.date));}); items=items.slice(0,7);
  $("activityList").classList.toggle("empty-block", !items.length); $("activityList").innerHTML = items.length ? items.map(function(x){return '<div class="activity-item"><span class="activity-icon">'+h(x.icon)+'</span><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.meta)+'</small></p></div>';}).join("") : "Your family's latest additions will appear here.";
}

function normalizeExpense(item) { return Object.assign({}, item, { sentTo: item.sentTo || item.description || "", fromAccount: item.fromAccount || item.paymentMode || "", reason: item.reason || item.description || "" }); }
function filteredExpenses() { const month=$("expenseMonth").value,recipient=$("expenseSendToFilter").value,account=$("expenseAccountFilter").value,q=normalize($("expenseSearch").value); return state.data.expenses.map(normalizeExpense).filter(function(x){return (!month||String(x.date).slice(0,7)===month)&&(!recipient||x.sentTo===recipient)&&(!account||x.fromAccount===account)&&(!q||normalize([x.sentTo,x.fromAccount,x.reason,x.date].join(" ")).includes(q));}); }
function renderExpenses() { const items=filteredExpenses(),total=items.reduce(function(s,x){return s+Number(x.amount||0);},0); $("expenseTotals").innerHTML='<span class="total-pill">'+plural(items.length,"entry","entries")+'</span><span class="total-pill">Total '+h(money(total))+'</span>'; $("expenseRows").innerHTML=items.map(function(x){return '<tr><td class="number"><strong>'+h(money(x.amount))+'</strong></td><td>'+h(formatDate(x.date))+'</td><td><strong>'+h(x.sentTo)+'</strong></td><td>'+h(x.fromAccount)+'</td><td class="expense-reason">'+h(x.reason)+'</td><td><div class="row-actions"><button class="tiny-button" data-action="edit-expense" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-expense" data-id="'+h(x.id)+'">×</button>':"")+'</div></td></tr>';}).join(""); $("expenseEmpty").classList.toggle("hidden",items.length>0); }
function renderRecurringExpenses() {
  const items = state.data.recurringExpenses || [];
  const overdue = items.filter(function (item) { return Number(item.daysUntil) < 0; }).length;
  $("recurringExpenseCount").textContent = plural(items.length, "payment") + (overdue ? " · " + overdue + " overdue" : "");
  $("recurringExpenseList").innerHTML = items.map(function (item) {
    const days = Number(item.daysUntil); let statusClass = "scheduled", statusText = formatDate(item.nextDueDate);
    if (days < 0) { statusClass = "overdue"; statusText = plural(Math.abs(days), "day") + " overdue"; }
    else if (days === 0) { statusClass = "due"; statusText = "Due today"; }
    else if (days === 1) { statusClass = "soon"; statusText = "Due tomorrow"; }
    else if (days <= 7) { statusClass = "soon"; statusText = "Due in " + days + " days"; }
    const amount = Number(item.estimatedAmount || 0) > 0 ? money(item.estimatedAmount) : "Enter amount when paid";
    return '<div class="recurring-card '+statusClass+'"><div class="recurring-card-top"><div><span class="frequency-chip">↻ '+h(item.frequency === "YEARLY" ? "Yearly" : "Monthly")+'</span><h4>'+h(item.title)+'</h4></div><span class="due-chip">'+h(statusText)+'</span></div><strong class="recurring-amount">'+h(amount)+'</strong><p>'+h(item.sentTo)+' · '+h(item.fromAccount)+'</p><small>'+h(item.reason)+'</small>'+(item.lastPaidDate?'<em>Last paid '+h(formatDate(item.lastPaidDate))+'</em>':'')+'<div class="recurring-actions"><button class="primary-button" data-action="pay-recurring-expense" data-id="'+h(item.id)+'">✓ Mark as paid</button><button class="tiny-button" data-action="edit-recurring-expense" data-id="'+h(item.id)+'">Edit</button>'+(mayDelete(item)?'<button class="danger-button" data-action="delete-recurring-expense" data-id="'+h(item.id)+'">Remove</button>':'')+'</div></div>';
  }).join("");
  $("recurringExpenseEmpty").innerHTML = "No regular payment added. Choose <strong>Add regular payment</strong> to add one now or later.";
  $("recurringExpenseEmpty").classList.toggle("hidden", items.length > 0);
}
function filteredIncome() { const month=$("incomeMonth").value,cat=$("incomeCategoryFilter").value,member=$("incomeMemberFilter").value,q=normalize($("incomeSearch").value); return state.data.income.filter(function(x){return (!month||String(x.date).slice(0,7)===month)&&(!cat||x.category===cat)&&(!member||x.receivedBy===member)&&(!q||normalize([x.source,x.category,x.receivingMode,memberName(x.receivedBy)].join(" ")).includes(q));}).map(function(x){return Object.assign({},x,{receivedByName:memberName(x.receivedBy)});}); }
function renderIncome() { const items=filteredIncome(),total=items.reduce(function(s,x){return s+Number(x.amount||0);},0); $("incomeTotals").innerHTML='<span class="total-pill green">'+plural(items.length,"entry","entries")+'</span><span class="total-pill green">Total '+h(money(total))+'</span>'; $("incomeRows").innerHTML=items.map(function(x){return '<tr><td>'+h(formatDate(x.date))+'</td><td><strong>'+h(x.source)+'</strong></td><td>'+h(x.category)+'</td><td>'+h(x.receivedByName)+'</td><td>'+h(x.receivingMode)+'</td><td class="number"><strong>'+h(money(x.amount))+'</strong></td><td><div class="row-actions"><button class="tiny-button" data-action="edit-income" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-income" data-id="'+h(x.id)+'">×</button>':"")+'</div></td></tr>';}).join(""); $("incomeEmpty").classList.toggle("hidden",items.length>0); }

function renderTargets() { const items=state.data.targets,total=items.reduce(function(s,x){return s+Number(x.targetAmount||0);},0),saved=items.reduce(function(s,x){return s+Number(x.currentAmount||0);},0); $("targetSummary").innerHTML=items.length?'<span class="total-pill">Total goal '+h(money(total))+'</span><span class="total-pill green">Progress '+h(money(saved))+'</span>':""; $("targetGrid").innerHTML=items.map(function(x){const pct=Number(x.targetAmount)?Math.min(100,Math.round(Number(x.currentAmount)/Number(x.targetAmount)*100)):0;return '<article class="target-card"><div class="target-top"><div><small>'+h(x.category)+' · '+h(x.ownerId==="ALL"?"Whole family":memberName(x.ownerId))+'</small><h3>'+h(x.title)+'</h3><small>Due '+h(formatDate(x.dueDate))+'</small></div><span class="target-icon">◎</span></div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div><div class="target-numbers"><span><strong>'+h(money(x.currentAmount))+'</strong> saved</span><span>'+pct+'% of '+h(money(x.targetAmount))+'</span></div><div class="target-actions"><button class="primary-button" data-action="contribute" data-id="'+h(x.id)+'">＋ Add progress</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-target" data-id="'+h(x.id)+'">Delete</button>':"")+'</div></article>';}).join(""); $("targetEmpty").classList.toggle("hidden",items.length>0); }
function renderDates() { const type=$("dateTypeFilter").value,q=normalize($("dateSearch").value); const items=state.data.importantDates.filter(function(x){return (!type||x.eventType===type)&&(!q||normalize([x.title,x.eventType,x.notes].join(" ")).includes(q));}); $("dateGrid").innerHTML=items.map(function(x){const p=dayParts(x.nextOccurrence||x.eventDate); return '<article class="date-card"><div class="date-tile"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><div><h3>'+h(x.title)+'</h3><p>'+h(x.eventType)+' · '+h(formatDate(x.nextOccurrence||x.eventDate))+'</p><p>Email: '+h(reminderText(x.remindDays))+'</p>'+(x.repeatYearly?'<span class="repeat-chip">↻ Every year</span>':"")+'</div><div class="row-actions"><button class="tiny-button" data-action="edit-date" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-date" data-id="'+h(x.id)+'">×</button>':"")+'</div></article>';}).join(""); $("dateEmpty").classList.toggle("hidden",items.length>0); }
function reminderText(days) { return String(days||"").split(",").map(function(d){return Number(d)===0?"same day":d+"d before";}).join(", "); }

function renderPhotos() { const q=normalize($("photoSearch").value); const items=state.data.photos.filter(function(x){return !q||normalize([x.title,x.caption,memberName(x.uploadedBy)].join(" ")).includes(q);}); $("photoGrid").innerHTML=items.map(function(x){return '<article class="photo-card"><figure data-action="view-photo" data-id="'+h(x.id)+'"><img src="'+h(x.thumbData)+'" alt="'+h(x.title)+'" loading="lazy">'+(mayDelete({createdBy:x.uploadedBy})?'<button class="photo-delete" data-action="delete-photo" data-id="'+h(x.id)+'" aria-label="Delete photo">×</button>':"")+'</figure><figcaption><h3>'+h(x.title)+'</h3>'+(x.caption?'<p>'+h(x.caption)+'</p>':"")+'<div class="photo-meta"><span>'+h(formatDate(x.takenDate||x.createdAt))+'</span><span>by '+h(memberName(x.uploadedBy))+'</span></div></figcaption></article>';}).join(""); $("photoEmpty").classList.toggle("hidden",items.length>0); }
async function viewPhoto(id) { const item=state.data.photos.find(function(x){return x.id===id;}); if(!item)return; $("viewerTitle").textContent=item.title; $("viewerMeta").textContent=formatDate(item.takenDate||item.createdAt)+" · by "+memberName(item.uploadedBy); $("viewerText").textContent=item.caption||""; $("viewerImage").classList.add("hidden"); $("viewerLoading").classList.remove("hidden"); openDialog("photoViewer"); try{const result=await api("getPhoto",{id:id}); $("viewerImage").src=result.dataUrl; $("viewerImage").classList.remove("hidden"); $("viewerLoading").classList.add("hidden");}catch(error){$("viewerLoading").textContent=error.message;} }

function renderExperiences() { const year=$("experienceYear").value,q=normalize($("experienceSearch").value); const items=state.data.experiences.filter(function(x){return (!year||String(x.experienceDate).slice(0,4)===year)&&(!q||normalize([x.title,x.place,x.story,x.tags,memberName(x.createdBy)].join(" ")).includes(q));}); $("experienceGrid").innerHTML=items.map(function(x){const tags=String(x.tags||"").split(",").map(function(t){return t.trim();}).filter(Boolean);return '<article class="experience-card"><div class="experience-meta"><span>'+h(formatDate(x.experienceDate))+'</span>'+(x.place?'<span>⌖ '+h(x.place)+'</span>':"")+'</div><h3>'+h(x.title)+'</h3><p class="story">'+h(x.story)+'</p><div class="tag-list">'+tags.map(function(t){return '<span class="tag">'+h(t)+'</span>';}).join("")+'</div><div class="experience-footer"><span class="writer">Written by '+h(memberName(x.createdBy))+'</span><div class="row-actions"><button class="tiny-button" data-action="edit-experience" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-experience" data-id="'+h(x.id)+'">×</button>':"")+'</div></div></article>';}).join(""); $("experienceEmpty").classList.toggle("hidden",items.length>0); }
function renderDiary() { const month=$("diaryMonth").value,writer=$("diaryWriterFilter").value,q=normalize($("diarySearch").value); const items=state.data.diary.filter(function(x){return (!month||String(x.diaryDate).slice(0,7)===month)&&(!writer||x.createdBy===writer)&&(!q||normalize([x.title,x.body,x.mood,x.tags,memberName(x.createdBy)].join(" ")).includes(q));}); $("diaryTimeline").innerHTML=items.map(function(x){const p=dayParts(x.diaryDate),tags=String(x.tags||"").split(",").map(function(t){return t.trim();}).filter(Boolean);return '<article class="diary-entry"><div class="diary-date-badge"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><div class="diary-entry-top"><div><h3>'+h(x.title)+'</h3><span class="writer">Written by '+h(memberName(x.createdBy))+'</span></div><span class="diary-mood">'+h(x.mood)+'</span></div><p class="diary-body">'+h(x.body)+'</p><div class="diary-entry-footer"><div class="tag-list">'+tags.map(function(t){return '<span class="tag">'+h(t)+'</span>';}).join("")+'</div><div class="row-actions"><button class="tiny-button" data-action="edit-diary" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-diary" data-id="'+h(x.id)+'">×</button>':"")+'</div></div></article>';}).join(""); $("diaryEmpty").classList.toggle("hidden",items.length>0); }

function renderCalendar() {
  if (!state.data) return;
  const year=state.calendarCursor.getFullYear(),month=state.calendarCursor.getMonth(); $("calendarMonthLabel").textContent=state.calendarCursor.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const first=new Date(year,month,1),start=new Date(year,month,1-first.getDay()),today=todayIso(),cells=[];
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");const events=[];
    state.data.importantDates.forEach(function(x){let eventIso=x.eventDate;if(x.repeatYearly)eventIso=String(d.getFullYear())+String(x.eventDate).slice(4,10);if(eventIso===iso)events.push({type:"reminder",title:x.title});});
    state.data.recurringExpenses.forEach(function(x){if(x.nextDueDate===iso)events.push({type:"recurring",title:"Payment: "+x.title});});
    state.data.experiences.forEach(function(x){if(x.experienceDate===iso)events.push({type:"experience",title:x.title});}); state.data.diary.forEach(function(x){if(x.diaryDate===iso)events.push({type:"diary",title:x.title});});
    cells.push('<div class="calendar-cell '+(d.getMonth()!==month?'other-month ':'')+(iso===today?'today':'')+'"><span class="calendar-day">'+d.getDate()+'</span><div class="calendar-events">'+events.slice(0,4).map(function(e){return '<button class="calendar-event '+e.type+'" title="'+h(e.title)+'">'+h(e.title)+'</button>';}).join("")+(events.length>4?'<span class="calendar-event">+'+(events.length-4)+' more</span>':"")+'</div></div>');
  } $("calendarGrid").innerHTML=cells.join("");
}

function renderAdmin() {
  $("settingFamilyName").value=state.data.settings.familyName||""; $("settingCurrency").value=state.data.settings.currency||"INR"; $("settingTimezone").value=state.data.settings.timezone||"Asia/Kolkata";
  const backup=state.data.backupStatus||{}; $("automaticBackupStatus").textContent=backup.automatic?"● Monthly backup enabled":"● Monthly backup needs setup"; $("automaticBackupStatus").classList.toggle("success",!!backup.automatic); $("lastBackupText").textContent=backup.lastBackupAt?("Last backup: "+new Date(backup.lastBackupAt).toLocaleString("en-IN")+(backup.lastBackupName?" · "+backup.lastBackupName:"")):"No backup created yet."; $("backupFolderLink").classList.toggle("hidden",!backup.folderUrl); if(backup.folderUrl)$("backupFolderLink").href=backup.folderUrl;
  const labels={EXPENSES:"Exp",INCOME:"Income",TARGETS:"Targets",DATES:"Reminders",CALENDAR:"Calendar",PHOTOS:"Photos",EXPERIENCES:"Experiences",DIARY:"Diary"}; const items=state.data.adminMembers||[]; $("memberCount").textContent=plural(items.length,"person","people"); $("memberList").innerHTML=items.map(function(x){const access=x.role==="ADMIN"?"All sections":(x.permissions||[]).map(function(key){return labels[key]||key;}).join(", ")||"No sections";return '<div class="member-row"><span class="avatar">'+h(x.name.charAt(0).toUpperCase())+'</span><div><strong>'+h(x.name)+'</strong><small>@'+h(x.username)+'</small></div><div><strong>'+h(x.email||"No email")+'</strong><small>Access: '+h(access)+'</small></div><span class="role-chip">'+(x.role==="ADMIN"?"ADMIN":"MEMBER")+'</span><span class="active-chip '+(!x.active?'inactive':'')+'">'+(x.active?'● Active':'● Inactive')+'</span><div class="member-actions"><button class="tiny-button" data-action="edit-member" data-id="'+h(x.id)+'">Edit</button><button class="tiny-button" data-action="reset-pin" data-id="'+h(x.id)+'">New PIN</button></div></div>';}).join("");
}

function renderStickyNotes() {
  if (!state.data || !canUseStickyNotes()) return;
  const notes = state.data.stickyNotes || [];
  const active = notes.filter(function (note) { return note.status !== "COMPLETED"; });
  const completed = notes.filter(function (note) { return note.status === "COMPLETED"; });
  $("stickyActiveCount").textContent = active.length;
  $("stickySectionTitle").textContent = state.stickyView === "active" ? "Active" : "Completed history";
  $("stickyBoardSummary").textContent = state.stickyView === "active" ? plural(active.length, "active note") : plural(completed.length, "completed note");
  $("stickyTabActive").classList.toggle("active", state.stickyView === "active");
  $("stickyTabCompleted").classList.toggle("active", state.stickyView === "completed");
  $("stickyCanvas").classList.toggle("hidden", state.stickyView !== "active");
  $("stickyCompletedList").classList.toggle("hidden", state.stickyView !== "completed");

  $("stickyCanvas").innerHTML = active.map(function (note, index) { return stickyNoteMarkup(note, index, false); }).join("");

  $("stickyCompletedList").innerHTML = completed.map(function (note) {
    const completedText = note.completedAt ? formatDate(note.completedAt) : "Completed";
    return '<article class="sticky-completed-card sticky-'+h(note.color||"yellow")+'" data-sticky-id="'+h(note.id)+'"><span class="sticky-completed-colour"></span><div><small>'+h(note.noteType==="REMINDER"?"REMINDER":"TARGET")+'</small><h4>'+h(note.title)+'</h4><p>'+h(note.body)+'</p><em>'+h(completedText)+' by '+h(memberName(note.completedBy))+(note.dueDate?' · Due '+h(formatDate(note.dueDate)):'')+'</em></div><div class="sticky-archive-actions"><button type="button" data-action="restore-sticky" data-id="'+h(note.id)+'">↶ Restore</button>'+(mayDelete(note)?'<button class="delete" type="button" data-action="delete-sticky" data-id="'+h(note.id)+'">Delete</button>':'')+'</div></article>';
  }).join("");

  const empty = state.stickyView === "active" ? !active.length : !completed.length;
  $("stickyEmpty").classList.toggle("hidden", !empty);
  $("stickyEmpty").querySelector("strong").textContent = state.stickyView === "active" ? "No active sticky notes" : "No completed sticky notes";
  $("stickyEmpty").querySelector("p").textContent = state.stickyView === "active" ? "Add a target or reminder. You can move, resize, pin and collapse it." : "Completed notes are saved here and can be restored.";
  renderStickyPinnedLayer(active);
}

function stickyNoteMarkup(note, index, pinnedOverlay) {
  const width = Math.max(220, Math.min(520, Number(note.width || 280)));
  const height = Math.max(160, Math.min(500, Number(note.height || 220)));
  let x = Math.max(0, Math.min(2000, Number(note.positionX || 20)));
  let y = Math.max(0, Math.min(2000, Number(note.positionY || 20)));
  if (pinnedOverlay && window.matchMedia("(max-width: 640px)").matches) { x = 0; y = 8 + index * 30; }
  const dueClass = note.dueDate && note.dueDate < todayIso() ? " overdue" : "";
  const dueText = note.dueDate ? ((dueClass ? "Overdue · " : "Due · ") + formatDate(note.dueDate)) : "No due date";
  const z = note.pinned ? 5000 + index : 20 + index;
  const collapseControl = note.pinned ? '<button class="sticky-locked-open" type="button" disabled title="Pinned notes stay open">🔒</button>' : '<button type="button" data-action="collapse-sticky" data-id="'+h(note.id)+'" title="'+(note.collapsed?'Open note':'Collapse note')+'">'+(note.collapsed?'▾':'▴')+'</button>';
  const titleControl = note.pinned ? '<strong class="sticky-note-title" title="This pinned note stays open">'+h(note.title)+'</strong>' : '<button class="sticky-note-title" type="button" data-action="collapse-sticky" data-id="'+h(note.id)+'" title="Open or collapse this note">'+h(note.title)+'</button>';
  return '<article class="sticky-note sticky-'+h(note.color||"yellow")+(!note.pinned&&note.collapsed?' collapsed':'')+(note.pinned?' pinned':'')+(pinnedOverlay?' pinned-overlay-note':'')+'" data-sticky-id="'+h(note.id)+'" style="left:'+x+'px;top:'+y+'px;--overlay-top:'+y+'px;width:'+width+'px;height:'+height+'px;z-index:'+z+'">'+
    '<header class="sticky-note-head sticky-drag-handle"><span class="sticky-type">'+(note.noteType==="REMINDER"?'REMINDER':'TARGET')+'</span>'+titleControl+'<div class="sticky-head-actions">'+collapseControl+'</div></header>'+
    '<div class="sticky-note-content"><span class="sticky-pinned-label '+(note.pinned?'':'hidden')+'">📌 PINNED OPEN</span><p>'+h(note.body)+'</p><small class="sticky-due'+dueClass+'">'+h(dueText)+'</small><small>Added by '+h(memberName(note.createdBy))+'</small></div>'+
    '<footer class="sticky-note-actions"><button class="pin-action" type="button" data-action="pin-sticky" data-id="'+h(note.id)+'">'+(note.pinned?'📌 Kept open':'📌 Keep open')+'</button><button type="button" data-action="edit-sticky" data-id="'+h(note.id)+'">Edit</button><button class="complete" type="button" data-action="complete-sticky" data-id="'+h(note.id)+'">✓ Completed</button>'+(mayDelete(note)?'<button class="delete" type="button" data-action="delete-sticky" data-id="'+h(note.id)+'">Delete</button>':'')+'<span class="sticky-size-actions"><button type="button" data-action="shrink-sticky" data-id="'+h(note.id)+'" title="Decrease note size">−</button><button type="button" data-action="grow-sticky" data-id="'+h(note.id)+'" title="Increase note size">＋</button></span></footer></article>';
}

function renderStickyPinnedLayer(activeNotes) {
  if (!state.data || !canUseStickyNotes()) { $("stickyPinnedLayer").classList.add("hidden"); return; }
  const notes = activeNotes || (state.data.stickyNotes || []).filter(function (note) { return note.status !== "COMPLETED"; });
  const pinned = notes.filter(function (note) { return note.pinned; });
  const boardOpen = !$("stickyBoard").classList.contains("hidden");
  $("stickyPinnedCanvas").innerHTML = pinned.map(function (note, index) { return stickyNoteMarkup(note, index, true); }).join("");
  $("stickyPinnedLayer").classList.toggle("hidden", boardOpen || !pinned.length);
}

function startStickyDrag(event) {
  if (window.matchMedia("(max-width: 640px)").matches || event.button !== 0 || event.target.closest("button")) return;
  const handle = event.target.closest(".sticky-drag-handle"); if (!handle) return;
  const element = handle.closest(".sticky-note"), note = state.data.stickyNotes.find(function (item) { return item.id === element.dataset.stickyId; }); if (!note) return;
  event.preventDefault();
  state.stickyHighestZ += 1; element.style.zIndex = note.pinned ? 3000 + state.stickyHighestZ : 300 + state.stickyHighestZ;
  element.classList.add("dragging");
  state.stickyDrag = { element: element, container: element.parentElement, note: note, startClientX: event.clientX, startClientY: event.clientY, startX: parseFloat(element.style.left) || 0, startY: parseFloat(element.style.top) || 0 };
}
function moveStickyDrag(event) {
  const drag = state.stickyDrag; if (!drag) return;
  event.preventDefault();
  const canvas = drag.container, maxX = Math.max(canvas.clientWidth, canvas.scrollWidth) - drag.element.offsetWidth, maxY = Math.max(canvas.clientHeight, canvas.scrollHeight) - drag.element.offsetHeight;
  const x = Math.max(0, Math.min(maxX, drag.startX + event.clientX - drag.startClientX));
  const y = Math.max(0, Math.min(maxY, drag.startY + event.clientY - drag.startClientY));
  drag.element.style.left = Math.round(x) + "px"; drag.element.style.top = Math.round(y) + "px";
}
function endStickyDrag() {
  const drag = state.stickyDrag; if (!drag) return;
  drag.element.classList.remove("dragging"); drag.note.positionX = Math.round(parseFloat(drag.element.style.left) || 0); drag.note.positionY = Math.round(parseFloat(drag.element.style.top) || 0);
  state.stickyDrag = null; queueStickyLayoutSave(drag.note);
}

function renderGlobalSearch() {
  const q=normalize($("globalSearch").value); if(q.length<2){$("globalSearchResults").innerHTML='<p class="muted">Type at least 2 characters to search all family records.</p>';return;} let results=[];
  state.data.expenses.forEach(function(x){const expense=normalizeExpense(x);if(normalize([expense.sentTo,expense.fromAccount,expense.reason].join(" ")).includes(q))results.push({view:"expenses",icon:"₹",title:expense.reason||expense.sentTo,meta:money(x.amount)+" · "+formatDate(x.date)});});
  state.data.recurringExpenses.forEach(function(x){if(normalize([x.title,x.sentTo,x.fromAccount,x.reason,x.frequency].join(" ")).includes(q))results.push({view:"expenses",icon:"↻",title:x.title,meta:(x.frequency==="YEARLY"?"Yearly":"Monthly")+" payment · due "+formatDate(x.nextDueDate)});});
  state.data.income.forEach(function(x){if(normalize([x.source,x.category,memberName(x.receivedBy)].join(" ")).includes(q))results.push({view:"income",icon:"↗",title:x.source,meta:money(x.amount)+" · "+formatDate(x.date)});});
  state.data.targets.forEach(function(x){if(normalize([x.title,x.category,x.notes].join(" ")).includes(q))results.push({view:"targets",icon:"◎",title:x.title,meta:"Target · "+money(x.targetAmount)});});
  state.data.importantDates.forEach(function(x){if(normalize([x.title,x.eventType,x.notes].join(" ")).includes(q))results.push({view:"dates",icon:"◫",title:x.title,meta:x.eventType+" · "+formatDate(x.nextOccurrence)});});
  state.data.photos.forEach(function(x){if(normalize([x.title,x.caption,memberName(x.uploadedBy)].join(" ")).includes(q))results.push({view:"photos",icon:"▧",title:x.title,meta:"Photo by "+memberName(x.uploadedBy)});});
  state.data.experiences.forEach(function(x){if(normalize([x.title,x.place,x.story,x.tags].join(" ")).includes(q))results.push({view:"experiences",icon:"✦",title:x.title,meta:formatDate(x.experienceDate)+" · "+memberName(x.createdBy)});});
  state.data.diary.forEach(function(x){if(normalize([x.title,x.body,x.mood,x.tags].join(" ")).includes(q))results.push({view:"diary",icon:"☷",title:x.title,meta:formatDate(x.diaryDate)+" · "+memberName(x.createdBy)});});
  state.data.stickyNotes.forEach(function(x){if(normalize([x.title,x.body,x.noteType,x.color].join(" ")).includes(q))results.push({view:"home",icon:"🗒",title:x.title,meta:(x.noteType==="REMINDER"?"Reminder":"Target")+" sticky note · "+(x.status==="COMPLETED"?"Completed":"Active"),stickyId:x.id,stickyStatus:x.status});});
  results=results.slice(0,30); $("globalSearchResults").innerHTML=results.length?results.map(function(x){return '<button class="search-result" data-search-view="'+h(x.view)+'"'+(x.stickyId?' data-search-sticky="'+h(x.stickyId)+'" data-search-status="'+h(x.stickyStatus)+'"':'')+'><span>'+h(x.icon)+'</span><div><strong>'+h(x.title)+'</strong><small>'+h(x.meta)+'</small></div></button>';}).join(""):'<p class="muted">No matching family records.</p>'; all("[data-search-view]",$("globalSearchResults")).forEach(function(btn){btn.addEventListener("click",function(){ $("searchDialog").close(); goTo(btn.dataset.searchView); if(btn.dataset.searchSticky){openStickyBoard(btn.dataset.searchStatus==="COMPLETED"?"completed":"active");setTimeout(function(){const note=all("[data-sticky-id]").find(function(item){return item.dataset.stickyId===btn.dataset.searchSticky;});if(note){note.classList.add("sticky-highlight");note.scrollIntoView({block:"center",inline:"center"});setTimeout(function(){note.classList.remove("sticky-highlight");},1800);}},80);} });});
}

async function previewPhoto() {
  const file=$("photoFile").files[0]; if(!file)return; if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Choose a JPG, PNG or WebP image.","error");
  showLoading("Preparing photo…"); try { const full=await resizeImage(file,1600,.82),thumb=await resizeImage(file,280,.55); state.pendingPhoto={name:file.name.replace(/[^A-Za-z0-9._-]/g,"_"),fullData:full,thumbData:thumb}; $("photoPreview").src=full; $("photoPreview").classList.remove("hidden"); if(!$("photoTitle").value)$("photoTitle").value=file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," "); } catch(e){toast("This photo could not be prepared.","error");} finally{hideLoading();}
}
function resizeImage(file,maxDimension,quality){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onerror=reject;reader.onload=function(){const img=new Image();img.onerror=reject;img.onload=function(){let w=img.width,hgt=img.height;if(Math.max(w,hgt)>maxDimension){const scale=maxDimension/Math.max(w,hgt);w=Math.round(w*scale);hgt=Math.round(hgt*scale);}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=hgt;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,hgt);ctx.drawImage(img,0,0,w,hgt);resolve(canvas.toDataURL("image/jpeg",quality));};img.src=reader.result;};reader.readAsDataURL(file);});}
function exportCsv(filename,items,fields,headers){if(!items.length)return toast("There is no filtered data to export.","error");const lines=[(headers||fields).join(",")].concat(items.map(function(item){return fields.map(function(field){return '"'+String(item[field]==null?"":item[field]).replace(/"/g,'""')+'"';}).join(",");}));const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}

function api(action,payload) {
  return new Promise(function (resolve,reject) {
    const requestId="fd_"+Date.now()+"_"+Math.random().toString(36).slice(2),frameName="family_api_"+requestId;
    const iframe=document.createElement("iframe"); iframe.name=frameName; iframe.hidden=true; iframe.setAttribute("aria-hidden","true"); document.body.appendChild(iframe);
    const form=document.createElement("form"); form.method="POST"; form.action=CONFIG.API_URL; form.target=frameName; form.style.display="none";
    const body=Object.assign({},payload||{}); if(action!=="login")body.token=state.token;
    [["action",action],["requestId",requestId],["payload",JSON.stringify(body)]].forEach(function(pair){const input=document.createElement("textarea");input.name=pair[0];input.value=pair[1];form.appendChild(input);}); document.body.appendChild(form);
    const timeout=setTimeout(function(){cleanupRequest(requestId);reject(new Error("The server took too long to respond. Please try again."));},Number(CONFIG.REQUEST_TIMEOUT_MS)||60000);
    pendingRequests.set(requestId,{resolve:resolve,reject:reject,iframe:iframe,form:form,timeout:timeout}); form.submit();
  });
}
function receiveApiMessage(event) {
  let message=event.data; if(typeof message==="string"){try{message=JSON.parse(message);}catch(e){return;}} if(!message||message.familyDashboardResponse!==true||!message.requestId)return;
  const request=pendingRequests.get(message.requestId); if(!request)return; cleanupRequest(message.requestId); if(message.ok)request.resolve(message.data);else request.reject(new Error(message.error||"The request failed."));
}
function cleanupRequest(id){const req=pendingRequests.get(id);if(!req)return;clearTimeout(req.timeout);req.form.remove();req.iframe.remove();pendingRequests.delete(id);}
function showLoading(text){$("loadingText").textContent=text||"Working…";$("loadingOverlay").classList.remove("hidden");}
function hideLoading(){$("loadingOverlay").classList.add("hidden");}
function toast(message,type){const el=document.createElement("div");el.className="toast "+(type||"");el.textContent=message;$("toastRegion").appendChild(el);setTimeout(function(){el.remove();},4200);}
function friendlyApiError(error){const message=(error&&error.message)||"The change could not be saved.";return /Unknown dashboard action/i.test(message)?"Backend update required. Deploy the latest Code.gs as a New version, then refresh this page.":message;}
