"use strict";

const CONFIG = window.FAMILY_DASHBOARD_CONFIG || {};
const PLACEHOLDER_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
const state = {
  token: localStorage.getItem("familyDashboardToken") || "",
  data: null,
  view: "home",
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  pendingPhoto: null
};
const pendingRequests = new Map();
const viewTitles = {
  home: "Family overview", expenses: "Expenditure", income: "Income", targets: "Family targets",
  dates: "Reminders", calendar: "Family calendar", diary: "Family diary", photos: "Family photos",
  experiences: "Family experiences", admin: "Administration"
};
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
  $("todayLabel").textContent = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  $("expenseMonth").value = currentMonth();
  $("incomeMonth").value = currentMonth();
  $("diaryMonth").value = currentMonth();
  bindNavigation();
  bindDialogs();
  bindForms();
  bindFilters();
  bindActions();
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
    state.data = await api("bootstrap", {});
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
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}

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
  $("photoFile").addEventListener("change", previewPhoto);
}
function openDialog(id) { const dialog = $(id); if (dialog && !dialog.open) dialog.showModal(); }
function prepareNewDialog(id) {
  const defaults = {
    expenseDialog: ["expenseForm", "expenseId", "expenseDate"], incomeDialog: ["incomeForm", "incomeId", "incomeDate"],
    dateDialog: ["dateForm", "importantDateId", "importantDateValue"], memberDialog: ["memberForm", "memberId", null],
    experienceDialog: ["experienceForm", "experienceId", "experienceDate"], diaryDialog: ["diaryForm", "diaryId", "diaryDate"]
  };
  if (defaults[id]) {
    $(defaults[id][0]).reset();
    $(defaults[id][1]).value = "";
    if (defaults[id][2]) $(defaults[id][2]).value = todayIso();
  }
  if (id === "expenseDialog") { $("expenseDialogTitle").textContent = "Add expenditure"; fillMemberSelect($("expensePaidBy"), state.data.user.id); }
  if (id === "incomeDialog") { $("incomeDialogTitle").textContent = "Add income"; fillMemberSelect($("incomeReceivedBy"), state.data.user.id); }
  if (id === "targetDialog") { $("targetForm").reset(); $("targetDueDate").value = todayIso(); fillMemberSelect($("targetOwner"), state.data.user.id, true); }
  if (id === "contributionDialog") { $("contributionForm").reset(); $("contributionDate").value = todayIso(); }
  if (id === "dateDialog") { $("dateDialogTitle").textContent = "Add important date"; $("notifyEveryone").checked = true; $("recipientChecks").classList.add("hidden"); renderRecipientChecks([]); }
  if (id === "photoDialog") { $("photoForm").reset(); $("photoTakenDate").value = todayIso(); $("photoPreview").classList.add("hidden"); state.pendingPhoto = null; }
  if (id === "memberDialog") { $("memberDialogTitle").textContent = "Add family member"; $("memberActive").checked = true; $("memberPin").required = true; }
  if (id === "experienceDialog") $("experienceDialogTitle").textContent = "Add experience";
  if (id === "diaryDialog") $("diaryDialogTitle").textContent = "Write diary entry";
}

function bindForms() {
  $("loginForm").addEventListener("submit", login);
  $("expenseForm").addEventListener("submit", saveExpense);
  $("incomeForm").addEventListener("submit", saveIncome);
  $("targetForm").addEventListener("submit", saveTarget);
  $("contributionForm").addEventListener("submit", saveContribution);
  $("dateForm").addEventListener("submit", saveImportantDate);
  $("photoForm").addEventListener("submit", savePhoto);
  $("experienceForm").addEventListener("submit", saveExperience);
  $("diaryForm").addEventListener("submit", saveDiary);
  $("memberForm").addEventListener("submit", saveMember);
  $("settingsForm").addEventListener("submit", saveSettings);
}

function bindFilters() {
  ["expenseMonth", "expenseCategoryFilter", "expenseMemberFilter", "expenseSearch"].forEach(function (id) { $(id).addEventListener("input", renderExpenses); });
  ["incomeMonth", "incomeCategoryFilter", "incomeMemberFilter", "incomeSearch"].forEach(function (id) { $(id).addEventListener("input", renderIncome); });
  ["dateTypeFilter", "dateSearch"].forEach(function (id) { $(id).addEventListener("input", renderDates); });
  $("photoSearch").addEventListener("input", renderPhotos);
  ["experienceYear", "experienceSearch"].forEach(function (id) { $(id).addEventListener("input", renderExperiences); });
  ["diaryMonth", "diaryWriterFilter", "diarySearch"].forEach(function (id) { $(id).addEventListener("input", renderDiary); });
  $("globalSearch").addEventListener("input", renderGlobalSearch);
  $("exportExpenses").addEventListener("click", function () { exportCsv("family-expenditure.csv", filteredExpenses(), ["date", "description", "category", "paidByName", "paymentMode", "amount"]); });
  $("exportIncome").addEventListener("click", function () { exportCsv("family-income.csv", filteredIncome(), ["date", "source", "category", "receivedByName", "receivingMode", "amount"]); });
  $("printExpenses").addEventListener("click", function () { window.print(); });
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
  });
}

async function login(event) {
  event.preventDefault();
  if (!CONFIG.API_URL || CONFIG.API_URL === PLACEHOLDER_URL) return toast("Paste the Apps Script Web App URL in config.js first.", "error");
  showLoading("Signing you in…");
  try {
    const result = await api("login", { username: $("loginUsername").value.trim(), pin: $("loginPin").value });
    state.token = result.token;
    state.data = result.bootstrap;
    localStorage.setItem("familyDashboardToken", state.token);
    $("loginForm").reset();
    showApp();
  } catch (error) { toast(error.message, "error"); }
  finally { hideLoading(); }
}
async function logout() {
  try { if (state.token) await api("logout", {}); } catch (e) { /* local logout still succeeds */ }
  state.token = ""; state.data = null; localStorage.removeItem("familyDashboardToken"); showLogin();
}

async function saveExpense(event) {
  event.preventDefault();
  await mutate($("expenseId").value ? "updateExpense" : "createExpense", {
    id: $("expenseId").value, date: $("expenseDate").value, amount: $("expenseAmount").value,
    description: $("expenseDescription").value.trim(), category: $("expenseCategory").value,
    paidBy: $("expensePaidBy").value, paymentMode: $("expenseMode").value
  }, "Expenditure saved.", "expenseDialog");
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
  const payload = { id: id, name: $("memberName").value.trim(), username: $("memberUsername").value.trim(), email: $("memberEmail").value.trim(), role: $("memberRole").value, pin: $("memberPin").value, active: $("memberActive").checked };
  if (!id && !payload.pin) return toast("Enter a 6-digit PIN for the new member.", "error");
  await mutate("saveMember", payload, id ? "Member updated." : "Family member added.", "memberDialog");
}
async function saveSettings(event) {
  event.preventDefault();
  await mutate("saveSettings", { familyName: $("settingFamilyName").value.trim(), currency: $("settingCurrency").value, timezone: $("settingTimezone").value.trim() }, "Family settings updated.");
}

async function mutate(action, payload, successMessage, closeId, loadingMessage) {
  showLoading(loadingMessage || "Saving changes…");
  try {
    const result = await api(action, payload);
    if (closeId && $(closeId).open) $(closeId).close();
    await refreshData();
    toast(successMessage || (result && result.message) || "Saved.", "success");
    return result;
  } catch (error) { toast(error.message || "The change could not be saved.", "error"); return null; }
  finally { hideLoading(); }
}
async function refreshData() { state.data = await api("bootstrap", {}); renderAll(); }
async function confirmDelete(action, id, message) { if (window.confirm(message)) await mutate(action, { id: id }, "Deleted."); }

function editExpense(id) {
  const item = state.data.expenses.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("expenseDialog"); $("expenseId").value = item.id; $("expenseDate").value = item.date; $("expenseAmount").value = item.amount; $("expenseDescription").value = item.description; $("expenseCategory").value = item.category; fillMemberSelect($("expensePaidBy"), item.paidBy); $("expenseMode").value = item.paymentMode; $("expenseDialogTitle").textContent = "Edit expenditure"; openDialog("expenseDialog");
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
  prepareNewDialog("memberDialog"); $("memberId").value = item.id; $("memberName").value = item.name; $("memberUsername").value = item.username; $("memberEmail").value = item.email || ""; $("memberRole").value = item.role; $("memberActive").checked = item.active; $("memberPin").value = ""; $("memberPin").required = false; $("memberDialogTitle").textContent = "Edit family member"; openDialog("memberDialog");
}
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
  populateFilters(); renderHome(); renderExpenses(); renderIncome(); renderTargets(); renderDates(); renderPhotos(); renderExperiences(); renderDiary(); renderCalendar(); if (isAdmin()) renderAdmin();
}
function populateFilters() {
  fillMemberFilter($("expenseMemberFilter")); fillMemberFilter($("incomeMemberFilter")); fillMemberFilter($("diaryWriterFilter"));
  const expenseCats = Array.from(new Set(state.data.expenses.map(function (x) { return x.category; }))).sort();
  const incomeCats = Array.from(new Set(state.data.income.map(function (x) { return x.category; }))).sort();
  fillOptions($("expenseCategoryFilter"), expenseCats, "All categories"); fillOptions($("incomeCategoryFilter"), incomeCats, "All categories");
  fillMemberSelect($("expensePaidBy"), $("expensePaidBy").value || state.data.user.id); fillMemberSelect($("incomeReceivedBy"), $("incomeReceivedBy").value || state.data.user.id); fillMemberSelect($("targetOwner"), $("targetOwner").value || state.data.user.id, true);
  renderRecipientChecks([]);
  const years = Array.from(new Set(state.data.experiences.map(function (x) { return String(x.experienceDate).slice(0,4); }))).filter(Boolean).sort().reverse(); const selectedYear = $("experienceYear").value; fillOptions($("experienceYear"), years, "All years"); $("experienceYear").value = years.indexOf(selectedYear) >= 0 ? selectedYear : "";
}
function fillOptions(select, values, allLabel) { const current = select.value; select.innerHTML = '<option value="">' + h(allLabel) + "</option>" + values.map(function (x) { return '<option value="' + h(x) + '">' + h(x) + "</option>"; }).join(""); if (values.indexOf(current) >= 0) select.value = current; }
function fillMemberSelect(select, selected, allowAll) { select.innerHTML = (allowAll ? '<option value="ALL">Whole family</option>' : "") + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = selected || (allowAll ? "ALL" : state.data.user.id); }
function fillMemberFilter(select) { const current = select.value; select.innerHTML = '<option value="">All family members</option>' + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = current; }
function renderRecipientChecks(selected) { if (!state.data) return; $("recipientChecks").innerHTML = state.data.members.map(function (m) { return '<label class="check-row"><input type="checkbox" name="dateRecipient" value="' + h(m.id) + '" ' + (selected.indexOf(m.id) >= 0 ? "checked" : "") + "> " + h(m.name) + "</label>"; }).join(""); }

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
  $("upcomingCount").textContent = plural(upcoming.length, "date"); $("photoCount").textContent = plural(state.data.photos.length, "photo"); $("experienceCount").textContent = plural(state.data.experiences.length, "story", "stories");
  renderCategoryBars(monthExpenses); renderUpcoming(upcoming); renderActivity();
}
function renderCategoryBars(items) {
  const totals = {}; items.forEach(function (x) { totals[x.category] = (totals[x.category] || 0) + Number(x.amount || 0); });
  const rows = Object.keys(totals).map(function (key) { return [key, totals[key]]; }).sort(function (a,b) { return b[1] - a[1]; }).slice(0,6); const max = rows.length ? rows[0][1] : 1;
  $("categoryBars").classList.toggle("empty-block", !rows.length); $("categoryBars").innerHTML = rows.length ? rows.map(function (row) { return '<div class="category-row"><span>' + h(row[0]) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4,row[1]/max*100) + '%"></div></div><strong>' + h(money(row[1])) + "</strong></div>"; }).join("") : "No expenditure added this month.";
}
function upcomingDates(days) { return state.data.importantDates.filter(function (x) { return Number(x.daysUntil) >= 0 && Number(x.daysUntil) <= days; }).sort(function (a,b) { return Number(a.daysUntil)-Number(b.daysUntil); }); }
function renderUpcoming(items) {
  $("upcomingList").classList.toggle("empty-block", !items.length); $("upcomingList").innerHTML = items.length ? items.slice(0,5).map(function (x) { const p=dayParts(x.nextOccurrence); return '<div class="mini-item"><div class="mini-date"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.eventType)+' · '+(Number(x.daysUntil)===0?'Today':plural(Number(x.daysUntil),"day")+" away")+'</small></p></div>'; }).join("") : "No important dates coming up.";
}
function renderActivity() {
  let items = [];
  state.data.expenses.slice(0,4).forEach(function (x) { items.push({date:x.createdAt,icon:"₹",title:x.description,meta:money(x.amount)+" expenditure · "+memberName(x.createdBy)}); });
  state.data.income.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"↗",title:x.source,meta:money(x.amount)+" income · "+memberName(x.createdBy)}); });
  state.data.photos.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"▧",title:x.title,meta:"Photo shared by "+memberName(x.uploadedBy)}); });
  state.data.diary.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"☷",title:x.title,meta:"Diary by "+memberName(x.createdBy)}); });
  items.sort(function(a,b){return String(b.date).localeCompare(String(a.date));}); items=items.slice(0,7);
  $("activityList").classList.toggle("empty-block", !items.length); $("activityList").innerHTML = items.length ? items.map(function(x){return '<div class="activity-item"><span class="activity-icon">'+h(x.icon)+'</span><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.meta)+'</small></p></div>';}).join("") : "Your family's latest additions will appear here.";
}

function filteredExpenses() { const month=$("expenseMonth").value,cat=$("expenseCategoryFilter").value,member=$("expenseMemberFilter").value,q=normalize($("expenseSearch").value); return state.data.expenses.filter(function(x){return (!month||String(x.date).slice(0,7)===month)&&(!cat||x.category===cat)&&(!member||x.paidBy===member)&&(!q||normalize([x.description,x.category,x.paymentMode,memberName(x.paidBy)].join(" ")).includes(q));}).map(function(x){return Object.assign({},x,{paidByName:memberName(x.paidBy)});}); }
function renderExpenses() { const items=filteredExpenses(),total=items.reduce(function(s,x){return s+Number(x.amount||0);},0); $("expenseTotals").innerHTML='<span class="total-pill">'+plural(items.length,"entry","entries")+'</span><span class="total-pill">Total '+h(money(total))+'</span>'; $("expenseRows").innerHTML=items.map(function(x){return '<tr><td>'+h(formatDate(x.date))+'</td><td><strong>'+h(x.description)+'</strong></td><td>'+h(x.category)+'</td><td>'+h(x.paidByName)+'</td><td>'+h(x.paymentMode)+'</td><td class="number"><strong>'+h(money(x.amount))+'</strong></td><td><div class="row-actions"><button class="tiny-button" data-action="edit-expense" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-expense" data-id="'+h(x.id)+'">×</button>':"")+'</div></td></tr>';}).join(""); $("expenseEmpty").classList.toggle("hidden",items.length>0); }
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
    state.data.experiences.forEach(function(x){if(x.experienceDate===iso)events.push({type:"experience",title:x.title});}); state.data.diary.forEach(function(x){if(x.diaryDate===iso)events.push({type:"diary",title:x.title});});
    cells.push('<div class="calendar-cell '+(d.getMonth()!==month?'other-month ':'')+(iso===today?'today':'')+'"><span class="calendar-day">'+d.getDate()+'</span><div class="calendar-events">'+events.slice(0,4).map(function(e){return '<button class="calendar-event '+e.type+'" title="'+h(e.title)+'">'+h(e.title)+'</button>';}).join("")+(events.length>4?'<span class="calendar-event">+'+(events.length-4)+' more</span>':"")+'</div></div>');
  } $("calendarGrid").innerHTML=cells.join("");
}

function renderAdmin() {
  $("settingFamilyName").value=state.data.settings.familyName||""; $("settingCurrency").value=state.data.settings.currency||"INR"; $("settingTimezone").value=state.data.settings.timezone||"Asia/Kolkata";
  const items=state.data.adminMembers||[]; $("memberCount").textContent=plural(items.length,"person","people"); $("memberList").innerHTML=items.map(function(x){return '<div class="member-row"><span class="avatar">'+h(x.name.charAt(0).toUpperCase())+'</span><div><strong>'+h(x.name)+'</strong><small>@'+h(x.username)+'</small></div><div><strong>'+h(x.email||"No email")+'</strong><small>Reminder address</small></div><span class="role-chip">'+(x.role==="ADMIN"?"ADMIN":"MEMBER")+'</span><span class="active-chip '+(!x.active?'inactive':'')+'">'+(x.active?'● Active':'● Inactive')+'</span><div class="member-actions"><button class="tiny-button" data-action="edit-member" data-id="'+h(x.id)+'">Edit</button><button class="tiny-button" data-action="reset-pin" data-id="'+h(x.id)+'">New PIN</button></div></div>';}).join("");
}

function renderGlobalSearch() {
  const q=normalize($("globalSearch").value); if(q.length<2){$("globalSearchResults").innerHTML='<p class="muted">Type at least 2 characters to search all family records.</p>';return;} let results=[];
  state.data.expenses.forEach(function(x){if(normalize([x.description,x.category,memberName(x.paidBy)].join(" ")).includes(q))results.push({view:"expenses",icon:"₹",title:x.description,meta:money(x.amount)+" · "+formatDate(x.date)});});
  state.data.income.forEach(function(x){if(normalize([x.source,x.category,memberName(x.receivedBy)].join(" ")).includes(q))results.push({view:"income",icon:"↗",title:x.source,meta:money(x.amount)+" · "+formatDate(x.date)});});
  state.data.targets.forEach(function(x){if(normalize([x.title,x.category,x.notes].join(" ")).includes(q))results.push({view:"targets",icon:"◎",title:x.title,meta:"Target · "+money(x.targetAmount)});});
  state.data.importantDates.forEach(function(x){if(normalize([x.title,x.eventType,x.notes].join(" ")).includes(q))results.push({view:"dates",icon:"◫",title:x.title,meta:x.eventType+" · "+formatDate(x.nextOccurrence)});});
  state.data.photos.forEach(function(x){if(normalize([x.title,x.caption,memberName(x.uploadedBy)].join(" ")).includes(q))results.push({view:"photos",icon:"▧",title:x.title,meta:"Photo by "+memberName(x.uploadedBy)});});
  state.data.experiences.forEach(function(x){if(normalize([x.title,x.place,x.story,x.tags].join(" ")).includes(q))results.push({view:"experiences",icon:"✦",title:x.title,meta:formatDate(x.experienceDate)+" · "+memberName(x.createdBy)});});
  state.data.diary.forEach(function(x){if(normalize([x.title,x.body,x.mood,x.tags].join(" ")).includes(q))results.push({view:"diary",icon:"☷",title:x.title,meta:formatDate(x.diaryDate)+" · "+memberName(x.createdBy)});});
  results=results.slice(0,30); $("globalSearchResults").innerHTML=results.length?results.map(function(x){return '<button class="search-result" data-search-view="'+h(x.view)+'"><span>'+h(x.icon)+'</span><div><strong>'+h(x.title)+'</strong><small>'+h(x.meta)+'</small></div></button>';}).join(""):'<p class="muted">No matching family records.</p>'; all("[data-search-view]",$("globalSearchResults")).forEach(function(btn){btn.addEventListener("click",function(){ $("searchDialog").close(); goTo(btn.dataset.searchView); });});
}

async function previewPhoto() {
  const file=$("photoFile").files[0]; if(!file)return; if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Choose a JPG, PNG or WebP image.","error");
  showLoading("Preparing photo…"); try { const full=await resizeImage(file,1600,.82),thumb=await resizeImage(file,280,.55); state.pendingPhoto={name:file.name.replace(/[^A-Za-z0-9._-]/g,"_"),fullData:full,thumbData:thumb}; $("photoPreview").src=full; $("photoPreview").classList.remove("hidden"); if(!$("photoTitle").value)$("photoTitle").value=file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," "); } catch(e){toast("This photo could not be prepared.","error");} finally{hideLoading();}
}
function resizeImage(file,maxDimension,quality){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onerror=reject;reader.onload=function(){const img=new Image();img.onerror=reject;img.onload=function(){let w=img.width,hgt=img.height;if(Math.max(w,hgt)>maxDimension){const scale=maxDimension/Math.max(w,hgt);w=Math.round(w*scale);hgt=Math.round(hgt*scale);}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=hgt;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,hgt);ctx.drawImage(img,0,0,w,hgt);resolve(canvas.toDataURL("image/jpeg",quality));};img.src=reader.result;};reader.readAsDataURL(file);});}
function exportCsv(filename,items,fields){if(!items.length)return toast("There is no filtered data to export.","error");const lines=[fields.join(",")].concat(items.map(function(item){return fields.map(function(field){return '"'+String(item[field]==null?"":item[field]).replace(/"/g,'""')+'"';}).join(",");}));const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}

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
