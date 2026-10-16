"use strict";

const CONFIG = window.FAMILY_DASHBOARD_CONFIG || {};
const PLACEHOLDER_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
const FRONTEND_VERSION = "1.0.51";
const SAVED_USERNAME_KEY = "familyDashboardUsername";
const SESSION_TOKEN_KEY = "familyDashboardToken";
const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
const LEGACY_IDLE_TIMEOUT_MINUTES = 5;
const ALLOWED_IDLE_TIMEOUT_MINUTES = [5, 15, 30, 60, 120];
const KEEP_ALIVE_INTERVAL_MS = 2 * 60 * 1000;
const EXPENSE_COLUMN_WIDTHS_KEY = "familyDashboardExpenseColumnWidthsV5";
const state = {
  token: sessionStorage.getItem(SESSION_TOKEN_KEY) || "",
  data: null,
  view: "home",
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  pendingPhoto: null,
  pendingMemberPhoto: null,
  pendingParentsPortrait: null,
  pendingImportantDatePhoto: null,
  removeImportantDatePhoto: false,
  stickyView: "active",
  stickyDrag: null,
  stickyHighestZ: 100,
  stickyLayoutTimers: new Map(),
  stickyLauncherTimer: null,
  backendVersion: "Checking…",
  expenseResize: null,
  idleTimer: null,
  lastActivityResetAt: 0,
  lastKeepAliveAt: 0,
  stickyResize: null,
  stickySideOpenId: "",
  stickySideTimer: null,
  inlineExpenseId: "",
  inlineRecurringId: "",
  recurringEditAll: false,
  categoryDraft: [],
  categoryEditIds: new Set(),
  subcategoryEditIds: new Set(),
  clockTimer: null,
  odiaMappingDateId: "",
  smartPasteResult: null,
  lastToastText: "",
  lastToastAt: 0
};
const pendingRequests = new Map();
const viewTitles = {
  home: "Family overview", expenses: "Expenditure", income: "Income", targets: "Family targets",
  dates: "Reminders", calendar: "Family calendar", diary: "Family diary", photos: "Family memories",
  experiences: "Family experiences", admin: "Administration"
};
const viewModules = { expenses: "EXPENSES", income: "INCOME", targets: "TARGETS", dates: "DATES", calendar: "CALENDAR", diary: "DIARY", photos: "PHOTOS", experiences: "EXPERIENCES" };
const currencySymbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const DEFAULT_EXPENSE_SUBCATEGORIES = {
  "Home": ["Maintenance", "Repairs", "Rent", "Furniture", "Domestic help", "Other home"],
  "Utilities": ["Electricity", "Water", "Gas", "Internet", "Mobile", "DTH / cable"],
  "Food": ["Groceries", "Vegetables", "Dining out", "Milk", "Snacks"],
  "Health": ["Doctor", "Medicine", "Tests", "Hospital", "Fitness"],
  "Transport": ["Fuel", "Service", "Taxi", "Bus / train", "Parking", "Insurance"],
  "Education": ["Fees", "Books", "Tuition", "Courses", "Stationery"],
  "Family transfer": ["Monthly support", "Gift", "Loan", "Emergency support"],
  "Tax & insurance": ["Land tax", "Holding tax", "Property tax", "Life insurance", "Health insurance", "Vehicle insurance"],
  "Travel": ["Tickets", "Hotel", "Food", "Local travel", "Sightseeing"],
  "Shopping": ["Clothing", "Electronics", "Household", "Personal care", "Gifts"],
  "Entertainment": ["Movies", "Subscriptions", "Events", "Hobbies"],
  "Other": ["General", "Donation", "Unexpected"]
};

function fallbackExpenseCategories() {
  return Object.keys(DEFAULT_EXPENSE_SUBCATEGORIES).map(function (name, categoryIndex) {
    return {
      id: "CAT_" + String(categoryIndex + 1).padStart(2, "0"), name: name, active: true,
      subcategories: DEFAULT_EXPENSE_SUBCATEGORIES[name].map(function (subcategory, subcategoryIndex) {
        return { id: "SUB_" + String(categoryIndex + 1).padStart(2, "0") + "_" + String(subcategoryIndex + 1).padStart(2, "0"), name: subcategory, active: true };
      })
    };
  });
}

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
  if (id === "ALL") return "Whole family";
  const member = memberById(id);
  return member ? member.name : "Family member";
}
function memberById(id) { const visible=(state.data&&state.data.members)||[],admin=(state.data&&state.data.adminMembers)||[]; return visible.concat(admin).find(function(item){return item.id===id;})||null; }
function expenseMemberId(item) { return String(item && (item.memberId || item.createdBy || item.paidBy) || "ALL"); }
function memberAvatarMarkup(id, extraClass) {
  const member = memberById(id), name = id === "ALL" ? "Whole family" : member ? member.name : "Family member";
  const className = "member-avatar" + (extraClass ? " " + extraClass : "");
  if (member && member.photoThumbData) return '<span class="'+h(className)+'"><img src="'+h(member.photoThumbData)+'" alt="'+h(name)+'" loading="lazy" decoding="async"></span>';
  return '<span class="'+h(className)+'" aria-label="'+h(name)+'">'+h(id === "ALL" ? "FH" : String(name||"?").charAt(0).toUpperCase())+'</span>';
}
function memberIdentityMarkup(id, compact) { return '<span class="member-identity'+(compact?' compact':'')+'">'+memberAvatarMarkup(id,compact?'small':'')+'<span>'+h(memberName(id))+'</span></span>'; }
function isAdmin() { return !!(state.data && state.data.user && state.data.user.role === "ADMIN"); }
function hasModuleAccess(module) { return isAdmin() || !!(state.data && state.data.user && (state.data.user.permissions || []).indexOf(module) >= 0); }
function canWriteStickyNotes() { return isAdmin() || !!(state.data && state.data.user && (state.data.user.permissions || []).indexOf("STICKY_WRITE") >= 0); }
function mayDelete(item) { return isAdmin() || (item && item.createdBy === state.data.user.id); }
function memoryPhotoLimit() { return Math.max(1, Math.min(24, Number(state.data && state.data.settings && state.data.settings.memoryPhotoLimit) || 12)); }
function memoryPrintPages() { return Number(state.data && state.data.settings && state.data.settings.memoryPrintPages) === 2 ? 2 : 1; }
function canUploadMemories() {
  if (isAdmin()) return true;
  return !!(state.data && state.data.settings && state.data.settings.memoryUploadPolicy === "MEMBERS_WITH_ACCESS" && hasModuleAccess("PHOTOS"));
}
function expenseSharingEnabled() { return !!(state.data && state.data.settings && (state.data.settings.expenseSettlementEnabled === true || String(state.data.settings.expenseSettlementEnabled).toLowerCase() === "true")); }
function adjustableIdleTimeoutSupported() {
  const version = String(state.data && state.data.backendVersion || state.backendVersion || "0.0.0").split(".").map(Number);
  return (version[0] || 0) > 1 || ((version[0] || 0) === 1 && ((version[1] || 0) > 0 || ((version[1] || 0) === 0 && (version[2] || 0) >= 37)));
}
function idleTimeoutMinutes() {
  const configured = Number(state.data && state.data.settings && state.data.settings.sessionIdleMinutes);
  if (ALLOWED_IDLE_TIMEOUT_MINUTES.includes(configured)) return configured;
  return adjustableIdleTimeoutSupported() ? DEFAULT_IDLE_TIMEOUT_MINUTES : LEGACY_IDLE_TIMEOUT_MINUTES;
}
function idleTimeoutLabel(minutes) {
  const value = Number(minutes) || DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (value === 60) return "1 hour";
  if (value === 120) return "2 hours";
  return value + " minutes";
}
function calendarDisplayMode() {
  const value=String(state.data&&state.data.settings&&state.data.settings.calendarDisplayMode||"ENGLISH_ODIA").toUpperCase();
  return ["ENGLISH","ODIA","ENGLISH_ODIA"].includes(value)?value:"ENGLISH_ODIA";
}
function calendarDisplayIncludes(calendar) { const mode=calendarDisplayMode(); return mode===calendar||mode.split("_").includes(calendar); }
function formatEnglishDate(iso) {
  if (!iso) return "—";
  const parts = String(iso).slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Number(parts[2]) + " " + months[Number(parts[1]) - 1] + " " + parts[0];
}
function formatOdiaScriptDate(iso) {
  if(!iso)return "—";
  try{return new Intl.DateTimeFormat("or-IN-u-nu-orya",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(String(iso).slice(0,10)+"T00:00:00Z"));}
  catch(error){return formatEnglishDate(iso);}
}
function formatDate(iso) {
  const parts=[];
  if(calendarDisplayIncludes("ENGLISH"))parts.push(formatEnglishDate(iso));
  if(calendarDisplayIncludes("ODIA"))parts.push("ଓଡ଼ିଆ "+formatOdiaScriptDate(iso));
  return parts.length?parts.join(" · "):formatEnglishDate(iso);
}
function dayParts(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return { day: Number(p[2]) || "—", month: months[(Number(p[1]) || 1) - 1] };
}
const SAKA_MONTHS = ["Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadra","Ashvina","Kartika","Agrahayana","Pausha","Magha","Phalguna"];
const ODIA_MONTHS = {AUTO:"ଭୁବନେଶ୍ୱର ସୂର୍ୟ୍ୟୋଦୟ ତିଥି",CHAITA:"ଚୈତ୍ର",BAISAKHA:"ବୈଶାଖ",JYESTHA:"ଜ୍ୟେଷ୍ଠ",ASADHA:"ଆଷାଢ଼",SRABANA:"ଶ୍ରାବଣ",BHADRA:"ଭାଦ୍ରବ",ASWINA:"ଆଶ୍ୱିନ",KARTIKA:"କାର୍ତ୍ତିକ",MARGASIRA:"ମାର୍ଗଶିର",PAUSA:"ପୌଷ",MAGHA:"ମାଘ",PHALGUNA:"ଫାଲ୍ଗୁନ"};
const ODIA_TITHIS = ["ପ୍ରତିପଦା","ଦ୍ୱିତୀୟା","ତୃତୀୟା","ଚତୁର୍ଥୀ","ପଞ୍ଚମୀ","ଷଷ୍ଠୀ","ସପ୍ତମୀ","ଅଷ୍ଟମୀ","ନବମୀ","ଦଶମୀ","ଏକାଦଶୀ","ଦ୍ୱାଦଶୀ","ତ୍ରୟୋଦଶୀ","ଚତୁର୍ଦ୍ଦଶୀ"];
const ODIA_PERSONAL_PANCHANG_API = "https://shastrapanchangam.com/api/v1/city/bhubaneswar/";
function isGregorianLeapYear(year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function sakaMonthLengths(gregorianStartYear) { return [isGregorianLeapYear(gregorianStartYear) ? 31 : 30,31,31,31,31,31,30,30,30,30,30,30]; }
function sakaIso(year,month,day) { return String(year).padStart(4,"0")+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0"); }
function gregorianToSaka(iso) {
  const valid=validIsoDate.apply(null,String(iso||"").split("-")); if(!valid)return null;
  const date=new Date(valid+"T00:00:00Z"); let startYear=date.getUTCFullYear(); let start=new Date(Date.UTC(startYear,2,isGregorianLeapYear(startYear)?21:22));
  if(date<start){startYear-=1;start=new Date(Date.UTC(startYear,2,isGregorianLeapYear(startYear)?21:22));}
  let offset=Math.round((date-start)/86400000),month=1; const lengths=sakaMonthLengths(startYear);
  while(month<=12&&offset>=lengths[month-1]){offset-=lengths[month-1];month++;}
  return {year:startYear-78,month:month,day:offset+1,iso:sakaIso(startYear-78,month,offset+1)};
}
function sakaToGregorian(year,month,day,clamp) {
  year=Number(year);month=Number(month);day=Number(day); if(!year||month<1||month>12)return "";
  const gregorianYear=year+78,lengths=sakaMonthLengths(gregorianYear); if(clamp)day=Math.max(1,Math.min(day,lengths[month-1]));
  if(day<1||day>lengths[month-1])return ""; let offset=day-1; for(let i=1;i<month;i++)offset+=lengths[i-1];
  const date=new Date(Date.UTC(gregorianYear,2,isGregorianLeapYear(gregorianYear)?21:22)); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10);
}
function formatSakaDate(value) {
  const saka=typeof value==="string"?gregorianToSaka(value):value; if(!saka)return "—";
  return saka.day+" "+SAKA_MONTHS[saka.month-1]+" "+saka.year+" Saka";
}
function formatOdiaPanjika(item, mappedYear) {
  if(!item||!item.odiaMonth)return "Not recorded";
  const number=Number(item.odiaTithi||0),tithi=number===15?(item.odiaPaksha==="SHUKLA"?"ପୂର୍ଣ୍ଣିମା":"ଅମାବାସ୍ୟା"):(ODIA_TITHIS[number-1]||"ତିଥି");
  return (ODIA_MONTHS[item.odiaMonth]||item.odiaMonth)+" · "+(item.odiaPaksha==="SHUKLA"?"ଶୁକ୍ଳ ପକ୍ଷ":"କୃଷ୍ଣ ପକ୍ଷ")+" · "+tithi+((mappedYear||item.odiaYear)?" · ଓଡ଼ିଆ ସାଲ "+(mappedYear||item.odiaYear):"");
}
function addDaysIso(iso, days) {
  const parts=String(iso||"").slice(0,10).split("-").map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  date.setUTCDate(date.getUTCDate()+Number(days||0)); return date.toISOString().slice(0,10);
}
function safeAnniversaryIso(year, month, day) {
  const lastDay=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
  return [String(year),String(month).padStart(2,"0"),String(Math.min(Number(day),lastDay)).padStart(2,"0")].join("-");
}
function panchangTithiIndex(day) {
  const rawTithi=day&&day.tithi,tithiObject=rawTithi&&typeof rawTithi==="object"?rawTithi:null;
  const paksha=String(tithiObject&&tithiObject.paksha||day&&day.paksha||"").toUpperCase();
  let numeric=Number(tithiObject?(tithiObject.number!==undefined?tithiObject.number:tithiObject.index):rawTithi);
  if(Number.isFinite(numeric)&&numeric>=0&&numeric<=29){numeric=Math.floor(numeric);return paksha.includes("KRISHNA")&&numeric<15?15+numeric:numeric;}
  let number=Number(tithiObject&&(tithiObject.tithi_number||tithiObject.tithiNumber)||day&&(day.tithi_number||day.tithiNumber));
  if(Number.isFinite(number)&&number>=1&&number<=15)return(paksha.includes("KRISHNA")?15:0)+number-1;
  const name=String(tithiObject&&tithiObject.name||day&&(day.tithi_name||day.tithiName)||"").toLowerCase().replace(/[^a-z]/g,"");
  if(["pournami","paurnami","purnima","poornima"].includes(name))return 14;
  if(["amavasai","amavasya","amavas"].includes(name))return 29;
  const names={prathamai:1,pratipada:1,pratipad:1,prathama:1,dwitiyai:2,dwitiya:2,dvitiya:2,tritiyai:3,tritiya:3,chaturthi:4,chaturti:4,panchami:5,shashti:6,shashthi:6,sasthi:6,saptami:7,ashtami:8,astami:8,navami:9,dashami:10,dasami:10,ekadashi:11,ekadasi:11,dwadashi:12,dvadashi:12,dwadasi:12,dvadasi:12,trayodashi:13,trayodasi:13,chaturdashi:14,chaturdasi:14};
  number=names[name];
  return number?(paksha.includes("KRISHNA")?15:0)+number-1:-1;
}
async function fetchBrowserPanchangDay(iso, cache) {
  if(cache[iso])return cache[iso];
  const controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},12000);
  try {
    const response=await fetch(ODIA_PERSONAL_PANCHANG_API+encodeURIComponent(iso)+".json",{method:"GET",mode:"cors",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("Panchang service returned HTTP "+response.status+".");
    const payload=await response.json(),day=payload.day||payload.data||payload;
    if(!day||day.tithi===undefined)throw new Error("Panchang data was incomplete.");
    cache[iso]=day; return day;
  } finally { clearTimeout(timeout); }
}
async function deriveBrowserOdiaTithi(eventDate, cache) {
  const iso=String(eventDate||"").slice(0,10),year=Number(iso.slice(0,4));
  if(year<1950)throw new Error("Automatic Odia-tithi lookup supports English dates from 1950 onward.");
  const index=panchangTithiIndex(await fetchBrowserPanchangDay(iso,cache));
  if(index<0)throw new Error("The Panchang source did not return a usable tithi.");
  return {odiaPaksha:index>=15?"KRISHNA":"SHUKLA",odiaTithi:index%15+1};
}
async function resolveBrowserOdiaOccurrence(eventDate, odiaPaksha, odiaTithi, cache) {
  const parts=String(eventDate).split("-").map(Number),today=todayIso(); let targetYear=Number(today.slice(0,4));
  if(addDaysIso(safeAnniversaryIso(targetYear,parts[1],parts[2]),24)<today)targetYear++;
  const targetIndex=(String(odiaPaksha).toUpperCase()==="KRISHNA"?15:0)+Math.max(0,Math.min(14,Number(odiaTithi)-1));
  for(let attempt=0;attempt<2;attempt++){
    const year=targetYear+attempt,base=safeAnniversaryIso(year,parts[1],parts[2]),currentIndex=panchangTithiIndex(await fetchBrowserPanchangDay(base,cache));
    if(currentIndex<0)continue;
    const forward=(targetIndex-currentIndex+30)%30,delta=forward>15?forward-30:forward,estimate=addDaysIso(base,delta);
    for(const offset of [0,-1,1,-2,2,-3,3]){
      const candidate=addDaysIso(estimate,offset),day=await fetchBrowserPanchangDay(candidate,cache);
      if(panchangTithiIndex(day)===targetIndex&&candidate>=today)return candidate;
    }
  }
  return "";
}
function syncImportantDateCalendar() {
  const system=$("importantDateCalendarSystem").value;
  $("importantDateGregorianFields").classList.toggle("hidden",system!=="GREGORIAN");
  $("importantDateSakaFields").classList.toggle("hidden",system!=="SAKA");
  $("importantDateOdiaFields").classList.toggle("hidden",system!=="ODIA");
  $("importantDateValue").required=system==="GREGORIAN";
  ["importantDateSakaYear","importantDateSakaMonth","importantDateSakaDay"].forEach(function(id){$(id).required=system==="SAKA";});
  ["importantDateOdiaYear","importantDateOdiaMonth","importantDateOdiaPaksha","importantDateOdiaTithi","importantDateOdiaEquivalent"].forEach(function(id){$(id).required=system==="ODIA";});
  updateImportantDateConversion();
}
function updateImportantDateConversion() {
  const system=$("importantDateCalendarSystem").value; let gregorian="",saka=null;
  if(system==="SAKA"){
    gregorian=sakaToGregorian($("importantDateSakaYear").value,$("importantDateSakaMonth").value,$("importantDateSakaDay").value,false);
    if(gregorian){saka=gregorianToSaka(gregorian);$("importantDateValue").value=gregorian;}
  } else if(system==="ODIA"){gregorian=$("importantDateOdiaEquivalent").value;saka=gregorianToSaka(gregorian);if(gregorian)$("importantDateValue").value=gregorian;}
  else {gregorian=$("importantDateValue").value;saka=gregorianToSaka(gregorian);if(saka){$("importantDateSakaYear").value=saka.year;$("importantDateSakaMonth").value=String(saka.month);$("importantDateSakaDay").value=saka.day;}}
  const odiaPreview=system==="ODIA"?formatOdiaPanjika({odiaYear:$("importantDateOdiaYear").value,odiaMonth:$("importantDateOdiaMonth").value,odiaPaksha:$("importantDateOdiaPaksha").value,odiaTithi:$("importantDateOdiaTithi").value}):"";
  $("importantDateConversion").textContent=gregorian&&saka?("English: "+formatEnglishDate(gregorian)+" · Odia: "+formatOdiaScriptDate(gregorian)+(odiaPreview?" · Kohinoor/Panjika: "+odiaPreview:"")):(system==="SAKA"?"Enter a valid saved legacy date.":system==="ODIA"?"Enter the Kohinoor/Panjika details and its verified English equivalent date.":"Choose a date to see English and Odia formats.");
}
function syncRecurringFrequency() { const custom=$("recurringExpenseFrequency").value==="CUSTOM"; $("recurringCustomIntervalLabel").classList.toggle("hidden",!custom); $("recurringExpenseIntervalMonths").required=custom; }
function money(value) {
  const code = (state.data && state.data.settings && state.data.settings.currency) || "INR";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch (e) { return (currencySymbols[code] || "") + (Number(value) || 0).toLocaleString("en-IN"); }
}
function plural(count, singular, pluralWord) { return count + " " + (count === 1 ? singular : (pluralWord || singular + "s")); }
function normalize(value) { return String(value || "").toLowerCase().trim(); }
function debounce(callback, delay) {
  let timer = null;
  return function () {
    const args = arguments, context = this;
    clearTimeout(timer);
    timer = setTimeout(function () { callback.apply(context, args); }, delay || 120);
  };
}
function prefersReducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
function safeClockHighlight(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#f0a7cb"; }
function mixHex(color, target, amount) {
  const source = safeClockHighlight(color).slice(1), destination = target.replace("#", "");
  const mixed = [0, 2, 4].map(function (index) {
    const start = parseInt(source.slice(index, index + 2), 16), end = parseInt(destination.slice(index, index + 2), 16);
    return Math.round(start + (end - start) * amount).toString(16).padStart(2, "0");
  });
  return "#" + mixed.join("");
}
function setClockHighlightProperties(target, value) {
  if (!target) return;
  const color = safeClockHighlight(value), rgb = [1, 3, 5].map(function (index) { return parseInt(color.slice(index, index + 2), 16); });
  target.style.setProperty("--clock-highlight", color);
  target.style.setProperty("--clock-highlight-soft", mixHex(color, "#ffffff", .72));
  target.style.setProperty("--clock-highlight-pale", mixHex(color, "#ffffff", .88));
  target.style.setProperty("--clock-highlight-deep", mixHex(color, "#1f1630", .68));
  target.style.setProperty("--clock-highlight-shadow", "rgba(" + rgb.join(",") + ",.32)");
}
function dashboardClockHighlight() { return safeClockHighlight(state.data && state.data.settings && state.data.settings.dashboardClockHighlight); }
function applyDashboardClockTheme() { setClockHighlightProperties(document.documentElement, dashboardClockHighlight()); }
function previewDashboardClockHighlight(value) {
  const preview = $("clockHighlightPreview");
  if (!preview) return;
  setClockHighlightProperties(preview, value);
}
function ordinalSuffix(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
}
function dashboardTimeZone() { return (state.data && state.data.settings && state.data.settings.timezone) || "Asia/Kolkata"; }
function dateTimeParts(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: dashboardTimeZone(), weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
    return parts.reduce(function (result, part) { if (part.type !== "literal") result[part.type] = part.value; return result; }, {});
  } catch (error) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
    return parts.reduce(function (result, part) { if (part.type !== "literal") result[part.type] = part.value; return result; }, {});
  }
}
function updateDashboardClock() {
  const clock = $("dashboardDateTime");
  if (!clock || !state.data) return;
  const now = new Date(), parts = dateTimeParts(now), day = Number(parts.day) || now.getDate();
  let iso=todayIso();
  try{const zoned=new Intl.DateTimeFormat("en-CA",{timeZone:dashboardTimeZone(),year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now).reduce(function(result,part){if(part.type!=="literal")result[part.type]=part.value;return result;},{});iso=zoned.year+"-"+zoned.month+"-"+zoned.day;}catch(error){}
  const dateLabels=[];
  if(calendarDisplayIncludes("ENGLISH"))dateLabels.push(day+ordinalSuffix(day)+"-"+parts.month+"-"+parts.year+" ("+parts.weekday+")");
  if(calendarDisplayIncludes("ODIA")){try{dateLabels.push(new Intl.DateTimeFormat("or-IN-u-nu-orya",{timeZone:dashboardTimeZone(),weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now));}catch(error){dateLabels.push(formatOdiaScriptDate(iso));}}
  const timeText=calendarDisplayMode()==="ODIA"?new Intl.DateTimeFormat("or-IN-u-nu-orya",{timeZone:dashboardTimeZone(),hour:"numeric",minute:"2-digit",hour12:true}).format(now):parts.hour+":"+parts.minute+" "+String(parts.dayPeriod||"").toUpperCase();
  clock.textContent = "◆ " + dateLabels.join(" · ") + " | " + timeText;
  if($("todayLabel"))$("todayLabel").textContent=dateLabels.join(" · ");
  clock.dateTime = now.toISOString();
}
function startDashboardClock() {
  stopDashboardClock();
  const tick = function () {
    updateDashboardClock();
    state.clockTimer = setTimeout(tick, 60050 - (Date.now() % 60000));
  };
  tick();
}
function stopDashboardClock() { if (state.clockTimer) clearTimeout(state.clockTimer); state.clockTimer = null; }

function init() {
  const now = new Date();
  all("button:not([type])").forEach(function (button) { button.type = "button"; });
  renderVersionLabels();
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
  bindExpenseColumnResize();
  bindSessionSafety();
  localStorage.removeItem(SESSION_TOKEN_KEY);
  $("repairSessionButton").addEventListener("click", repairBrowserSession);
  const configured = CONFIG.API_URL && CONFIG.API_URL !== PLACEHOLDER_URL && /^https:\/\/script\.google\.com\//.test(CONFIG.API_URL);
  if (!configured) {
    state.backendVersion = "Not connected";
    renderVersionLabels();
    $("setupHint").classList.remove("hidden");
    state.token = "";
    clearLocalSession();
    return;
  }
  loadBackendVersion();
  if (state.token) restoreSession();
}

async function loadBackendVersion() {
  try {
    const result = await api("version", {});
    state.backendVersion = result && result.version ? String(result.version) : "Unavailable";
  } catch (error) {
    state.backendVersion = /Unknown dashboard action/i.test((error && error.message) || "") ? "Update required" : "Unavailable";
  }
  renderVersionLabels();
}

function renderVersionLabels() {
  const backend = state.data && state.data.backendVersion ? String(state.data.backendVersion) : state.backendVersion;
  const backendLabel = /^\d/.test(backend) ? "BE v" + backend : "BE " + backend;
  const loginFrontend = $("loginFrontendVersion"), sidebarFrontend = $("sidebarFrontendVersion");
  const loginBackend = $("loginBackendVersion"), sidebarBackend = $("sidebarBackendVersion");
  if (loginFrontend) loginFrontend.textContent = "FE v" + FRONTEND_VERSION;
  if (sidebarFrontend) sidebarFrontend.textContent = "FE v" + FRONTEND_VERSION;
  if (loginBackend) { loginBackend.textContent = backendLabel; loginBackend.classList.toggle("version-warning", !/^\d/.test(backend)); }
  if (sidebarBackend) { sidebarBackend.textContent = backendLabel; sidebarBackend.classList.toggle("version-warning", !/^\d/.test(backend)); }
  if ($("loginVersion")) $("loginVersion").textContent = "FE v" + FRONTEND_VERSION + " · " + backendLabel;
  if ($("sidebarVersion")) $("sidebarVersion").textContent = "FE v" + FRONTEND_VERSION + " · " + backendLabel;
}

async function restoreSession() {
  showLoading("Opening your family dashboard…");
  try {
    state.data = normalizeBootstrapData(await api("bootstrap", {}));
    showApp();
  } catch (error) {
    clearLocalSession();
    showLogin();
    toast(error.message || "Please sign in again.", "error");
  } finally { hideLoading(); }
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  renderVersionLabels();
  renderAll();
  resetIdleTimer();
}
function showLogin() {
  stopIdleTimer();
  stopDashboardClock();
  clearTimeout(state.stickyLauncherTimer);
  document.body.classList.remove("sticky-drawer-open");
  $("stickyBoard").classList.add("hidden");
  $("stickyBoardShade").classList.add("hidden");
  $("stickyLauncher").classList.add("hidden");
  $("stickyPinnedLayer").classList.add("hidden");
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  loadSavedUsername();
}

function bindSessionSafety() {
  ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, recordActivity, { passive: true });
  });
  window.addEventListener("pagehide", leaveDashboard);
  window.addEventListener("beforeunload", leaveDashboard);
  window.addEventListener("pageshow", function (event) { if (event.persisted && !state.token) showLogin(); });
}

function recordActivity() {
  if (!state.token || !state.data) return;
  const now = Date.now();
  if (now - state.lastActivityResetAt >= 1000) { state.lastActivityResetAt = now; resetIdleTimer(); }
  if (now - state.lastKeepAliveAt >= KEEP_ALIVE_INTERVAL_MS) {
    state.lastKeepAliveAt = now;
    api("keepAlive", {}).catch(handleSessionError);
  }
}

function resetIdleTimer() {
  stopIdleTimer();
  if (!state.token || !state.data) return;
  const minutes = idleTimeoutMinutes();
  state.idleTimer = setTimeout(function () { endSession("Signed out after " + idleTimeoutLabel(minutes) + " of inactivity.", true); }, minutes * 60 * 1000);
}

function stopIdleTimer() { if (state.idleTimer) clearTimeout(state.idleTimer); state.idleTimer = null; }

function clearLocalSession() {
  stopIdleTimer();
  clearTimeout(state.stickySideTimer);
  state.token = ""; state.data = null; state.stickyView = "active"; state.stickySideOpenId = ""; state.lastKeepAliveAt = 0;
  state.lastActivityResetAt = 0;
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

function sendLogoutBeacon(token) {
  if (!token || !navigator.sendBeacon || !CONFIG.API_URL || CONFIG.API_URL === PLACEHOLDER_URL) return;
  try {
    const data = new FormData();
    data.append("action", "logout"); data.append("requestId", "leave_" + Date.now()); data.append("payload", JSON.stringify({ token: token }));
    navigator.sendBeacon(CONFIG.API_URL, data);
  } catch (error) { /* server idle expiry remains the safety net */ }
}

function leaveDashboard() {
  const token = state.token;
  clearLocalSession();
  showLogin();
  sendLogoutBeacon(token);
}

async function endSession(message, notifyServer) {
  const token = state.token;
  clearLocalSession();
  showLogin();
  if (notifyServer) sendLogoutBeacon(token);
  if (message) toast(message, "error");
}

function handleSessionError(error) {
  const message = (error && error.message) || "";
  if (/session has expired|sign in again|account is inactive/i.test(message)) {
    endSession(message || "Please sign in again.", false);
    return true;
  }
  return false;
}

async function repairBrowserSession() {
  const username = $("loginUsername").value.trim();
  clearLocalSession();
  if (username && $("rememberUsername").checked) localStorage.setItem(SAVED_USERNAME_KEY, username);
  try {
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(function (key) { return caches.delete(key); })); }
    if (navigator.serviceWorker) { const registrations = await navigator.serviceWorker.getRegistrations(); await Promise.all(registrations.map(function (registration) { return registration.unregister(); })); }
  } catch (error) { /* refresh below still repairs the page assets */ }
  const url = new URL(window.location.href); url.searchParams.set("fresh", String(Date.now())); window.location.replace(url.toString());
}
function loadSavedUsername() { const saved = localStorage.getItem(SAVED_USERNAME_KEY) || ""; $("loginUsername").value = saved; $("rememberUsername").checked = !!saved || $("rememberUsername").checked; }
function normalizeBootstrapData(data) { const result = data || {}; ["members","expenses","recurringExpenses","settlements","majorPlans","majorPlanPhases","income","targets","importantDates","odiaFestivals","photos","experiences","diary","stickyNotes"].forEach(function (key) { if (!Array.isArray(result[key])) result[key] = []; }); if (!result.settings) result.settings = {}; if (!Array.isArray(result.expenseCategories) || !result.expenseCategories.length) result.expenseCategories = fallbackExpenseCategories(); return result; }

function majorPlanById(id) { return (state.data && state.data.majorPlans || []).find(function (item) { return item.id === id; }); }
function majorPlanPhaseById(id) { return (state.data && state.data.majorPlanPhases || []).find(function (item) { return item.id === id; }); }
function majorPlanPhases(planId, includeArchived) { return (state.data && state.data.majorPlanPhases || []).filter(function (item) { return item.majorPlanId === planId && (includeArchived || item.active !== false); }).sort(function (a,b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); }); }
function activeMajorPlans() { return (state.data && state.data.majorPlans || []).filter(function (item) { return String(item.status || "ACTIVE").toUpperCase() === "ACTIVE"; }); }
function majorPlanName(id) { const plan=majorPlanById(id); return plan ? plan.name : ""; }
function majorPlanPhaseName(id) { const phase=majorPlanPhaseById(id); return phase ? phase.name : ""; }
function majorPlanOptions(selected, includeClosed) {
  const plans=(state.data && state.data.majorPlans || []).filter(function(item){return includeClosed || String(item.status||"ACTIVE").toUpperCase()==="ACTIVE";}).slice();
  if (selected && !plans.some(function(item){return item.id===selected;})) { const selectedPlan=majorPlanById(selected); if(selectedPlan)plans.push(selectedPlan); }
  return '<option value="">Not linked to a major plan</option>'+plans.map(function(item){return '<option value="'+h(item.id)+'"'+(item.id===selected?' selected':'')+'>'+h(item.name)+(String(item.status||"ACTIVE").toUpperCase()!=="ACTIVE"?' · '+h(item.status):'')+'</option>';}).join("");
}
function majorPlanPhaseOptions(planId, selected, includeArchived) {
  const phases=majorPlanPhases(planId,includeArchived);
  if(selected&&!phases.some(function(item){return item.id===selected;})){const phase=majorPlanPhaseById(selected);if(phase&&phase.majorPlanId===planId)phases.push(phase);}
  return '<option value="">No phase</option>'+phases.map(function(item){return '<option value="'+h(item.id)+'"'+(item.id===selected?' selected':'')+'>'+h(item.name)+'</option>';}).join("");
}
function fillMajorPlanLinkSelects(planSelect, phaseSelect, selectedPlanId, selectedPhaseId, includeClosed) {
  if(!planSelect||!phaseSelect)return;
  planSelect.innerHTML=majorPlanOptions(selectedPlanId,includeClosed);
  planSelect.value=selectedPlanId||"";
  phaseSelect.innerHTML=majorPlanPhaseOptions(planSelect.value,selectedPhaseId,includeClosed);
  phaseSelect.value=selectedPhaseId||"";
  phaseSelect.disabled=!planSelect.value;
}

function expenseCategoryConfig() { return state.data && Array.isArray(state.data.expenseCategories) && state.data.expenseCategories.length ? state.data.expenseCategories : fallbackExpenseCategories(); }
function activeExpenseCategories() { return expenseCategoryConfig().filter(function (category) { return category.active !== false; }); }
function expenseCategoryByName(name) { return expenseCategoryConfig().find(function (category) { return category.name === name; }); }
function expenseSubcategoryNames(categoryName, includeArchived) {
  const category = expenseCategoryByName(categoryName);
  if (!category) return ["General"];
  return (category.subcategories || []).filter(function (subcategory) { return includeArchived || subcategory.active !== false; }).map(function (subcategory) { return subcategory.name; });
}
function expenseCategoryOptions(selected, includeArchived) {
  const names = (includeArchived ? expenseCategoryConfig() : activeExpenseCategories()).map(function (category) { return category.name; });
  if (selected && names.indexOf(selected) < 0) names.push(selected);
  return names.map(function (name) { return '<option value="'+h(name)+'"'+(name===selected?' selected':'')+'>'+h(name)+'</option>'; }).join("");
}
function expenseSubcategoryOptions(categoryName, selected, includeArchived) {
  const names = expenseSubcategoryNames(categoryName, includeArchived);
  if (selected && names.indexOf(selected) < 0) names.push(selected);
  return names.map(function (name) { return '<option value="'+h(name)+'"'+(name===selected?' selected':'')+'>'+h(name)+'</option>'; }).join("");
}
function fillExpenseCategorySelect(select, selected) {
  const fallback = activeExpenseCategories()[0] && activeExpenseCategories()[0].name || "Other";
  const value = selected || fallback;
  select.innerHTML = expenseCategoryOptions(value, false);
  select.value = value;
}
function fillExpenseSubcategorySelect(select, categoryName, selected) {
  const values = expenseSubcategoryNames(categoryName, false);
  const value = selected || values[0] || "General";
  select.innerHTML = expenseSubcategoryOptions(categoryName, value, false);
  select.value = value;
}

function bindNavigation() {
  all(".nav-button").forEach(function (button) {
    button.addEventListener("click", function () { goTo(button.dataset.view); closeSidebar(); });
  });
  all("[data-go]").forEach(function (button) { button.addEventListener("click", function () { goTo(button.dataset.go); }); });
  $("menuButton").addEventListener("click", function () { $("sidebar").classList.toggle("open"); $("sidebarShade").classList.toggle("show"); });
  if ($("mobileMoreButton")) $("mobileMoreButton").addEventListener("click", function () { $("sidebar").classList.add("open"); $("sidebarShade").classList.add("show"); });
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
  all(".view").forEach(function (el) { const active = el.id === "view-" + view; el.classList.toggle("active", active); el.setAttribute("aria-hidden", active ? "false" : "true"); });
  all(".nav-button").forEach(function (el) { const active = el.dataset.view === view; el.classList.toggle("active", active); if (active) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
  $("viewTitle").textContent = viewTitles[view] || "Family Dashboard";
  renderView(view);
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function bindDialogs() {
  all("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () { prepareNewDialog(button.dataset.open); openDialog(button.dataset.open); });
  });
  all("[data-close]").forEach(function (button) { button.addEventListener("click", function () { button.closest("dialog").close(); }); });
  all("[data-smart-paste]").forEach(function (button) {
    button.addEventListener("click", function () { openSmartPaste(button.dataset.smartPaste || "auto"); });
  });
  all("dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (event) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });
  $("togglePassword").addEventListener("click", function () { $("loginPassword").type = $("loginPassword").type === "password" ? "text" : "password"; });
  $("toggleAdminMemberPassword").addEventListener("click", toggleAdminMemberPasswordVisibility);
  $("generateAdminMemberPassword").addEventListener("click", generateAdminMemberPassword);
  $("changeMyPassword").addEventListener("click", function () { if (state.data && state.data.user) openMemberPasswordDialog(state.data.user.id); });
  $("notifyEveryone").addEventListener("change", function () { $("recipientChecks").classList.toggle("hidden", $("notifyEveryone").checked); });
  $("recurringNotifyEveryone").addEventListener("change", function () { $("recurringRecipientChecks").classList.toggle("hidden", $("recurringNotifyEveryone").checked); });
  $("photoFile").addEventListener("change", previewPhoto);
  $("expenseEntryType").addEventListener("change", syncExpenseEntryType);
  $("expenseCategory").addEventListener("change", function () { populateSubcategoryOptions("expenseCategory", "expenseSubcategory", "expenseSubcategoryOptions", true); });
  $("expenseSplitMethod").addEventListener("change", syncExpenseSharingFields);
  $("expensePaidByMember").addEventListener("change", syncExpenseSharingFields);
  $("expenseMember").addEventListener("change", syncExpenseSharingFields);
  $("expenseAmount").addEventListener("input", updateExpenseShareTotal);
  $("expenseShareMembers").addEventListener("change", syncExpenseSharingFields);
  $("recurringExpenseCategory").addEventListener("change", function () { populateSubcategoryOptions("recurringExpenseCategory", "recurringExpenseSubcategory", "recurringExpenseSubcategoryOptions", true); });
  $("recurringExpenseFrequency").addEventListener("change", syncRecurringFrequency);
  $("importantDateCalendarSystem").addEventListener("change", function(){if(!$("importantDateId").value&&isAdmin())$("importantDateReminderBasis").value=$("importantDateCalendarSystem").value==="ODIA"?"GREGORIAN_ODIA":"GREGORIAN";syncImportantDateCalendar();});
  $("importantDateValue").addEventListener("input", updateImportantDateConversion);
  ["importantDateSakaYear","importantDateSakaMonth","importantDateSakaDay"].forEach(function(id){$(id).addEventListener("input",updateImportantDateConversion);$(id).addEventListener("change",updateImportantDateConversion);});
  ["importantDateOdiaYear","importantDateOdiaMonth","importantDateOdiaPaksha","importantDateOdiaTithi","importantDateOdiaEquivalent"].forEach(function(id){$(id).addEventListener("input",updateImportantDateConversion);$(id).addEventListener("change",updateImportantDateConversion);});
  $("expenseMajorPlan").addEventListener("change", function () { fillMajorPlanLinkSelects($("expenseMajorPlan"), $("expenseMajorPlanPhase"), $("expenseMajorPlan").value, "", false); });
  $("recurringExpenseMajorPlan").addEventListener("change", function () { fillMajorPlanLinkSelects($("recurringExpenseMajorPlan"), $("recurringExpenseMajorPlanPhase"), $("recurringExpenseMajorPlan").value, "", false); });
  $("addMajorPlanPhase").addEventListener("click", function () { addMajorPlanPhaseRow(); });
  $("majorPlanAmount").addEventListener("input", updateMajorPlanPhaseBudgetSummary);
  $("majorPlanPhaseList").addEventListener("input", updateMajorPlanPhaseBudgetSummary);
  $("expenseCategoryAddForm").addEventListener("submit", addExpenseCategoryDraft);
  $("saveExpenseCategories").addEventListener("click", saveExpenseCategories);
  $("odiaMappingForm").addEventListener("submit", saveOdiaReminderMapping);
  $("smartPasteAnalyze").addEventListener("click", analyzeSmartPaste);
  $("smartPasteClear").addEventListener("click", resetSmartPaste);
  $("smartPasteUse").addEventListener("click", applySmartPasteResult);
  $("smartPasteType").addEventListener("change", function () { if ($("smartPasteText").value.trim()) analyzeSmartPaste(); });
  $("smartPasteText").addEventListener("paste", function () { setTimeout(function () { if ($("smartPasteText").value.trim()) analyzeSmartPaste(); }, 80); });
}
function openDialog(id) { const dialog = $(id); if (dialog && !dialog.open) dialog.showModal(); }
function prepareNewDialog(id) {
  const defaults = {
    expenseDialog: ["expenseForm", "expenseId", "expenseDate"], recurringExpenseDialog: ["recurringExpenseForm", "recurringExpenseId", "recurringExpenseDueDate"], incomeDialog: ["incomeForm", "incomeId", "incomeDate"],
    dateDialog: ["dateForm", "importantDateId", "importantDateValue"], memberDialog: ["memberForm", "memberId", null],
    experienceDialog: ["experienceForm", "experienceId", "experienceDate"], diaryDialog: ["diaryForm", "diaryId", "diaryDate"], majorPlanDialog: ["majorPlanForm", "majorPlanId", "majorPlanStartDate"]
  };
  if (defaults[id]) {
    $(defaults[id][0]).reset();
    $(defaults[id][1]).value = "";
    if (defaults[id][2]) $(defaults[id][2]).value = todayIso();
  }
  if (id === "expenseDialog") { $("expenseRecurringId").value = ""; $("expenseMarkPaidId").value = ""; $("expenseRecurringNote").textContent = ""; $("expenseRecurringNote").classList.add("hidden"); $("expenseEntryType").disabled = false; $("expenseEntryType").value = "REGULAR"; fillMemberSelect($("expenseMember"), state.data.user.id, true); fillExpenseCategorySelect($("expenseCategory"), activeExpenseCategories().some(function(category){return category.name==="Home";}) ? "Home" : ""); populateSubcategoryOptions("expenseCategory", "expenseSubcategory", "expenseSubcategoryOptions", true); fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),"","",false); resetExpenseSharingForm(); $("expenseDialogTitle").textContent = "Add paid expenditure"; syncExpenseEntryType(); }
  if (id === "recurringExpenseDialog") { $("recurringExpenseDialogTitle").textContent = "Add regular payment"; fillMemberSelect($("recurringExpenseMember"), state.data.user.id, true); fillExpenseCategorySelect($("recurringExpenseCategory"), activeExpenseCategories().some(function(category){return category.name==="Utilities";}) ? "Utilities" : ""); populateSubcategoryOptions("recurringExpenseCategory", "recurringExpenseSubcategory", "recurringExpenseSubcategoryOptions", true); fillMajorPlanLinkSelects($("recurringExpenseMajorPlan"),$("recurringExpenseMajorPlanPhase"),"","",false); $("recurringExpenseFrequency").value="MONTHLY"; $("recurringExpenseIntervalMonths").value="1"; syncRecurringFrequency(); $("recurringNotifyEveryone").checked = true; $("recurringRecipientChecks").classList.add("hidden"); renderRecurringRecipientChecks([]); }
  if (id === "majorPlanDialog") { $("majorPlanDialogTitle").textContent="Create major plan"; $("majorPlanStartDate").value=todayIso(); const target=new Date(); target.setFullYear(target.getFullYear()+1); $("majorPlanTargetDate").value=[target.getFullYear(),String(target.getMonth()+1).padStart(2,"0"),String(target.getDate()).padStart(2,"0")].join("-"); fillMemberSelect($("majorPlanOwner"),"ALL",true); $("majorPlanPhaseList").innerHTML=""; ["Planning / approvals","Main work","Finishing"].forEach(function(name){addMajorPlanPhaseRow({name:name,proposedAmount:""});}); updateMajorPlanPhaseBudgetSummary(); }
  if (id === "bulkExpenseDialog") $("bulkExpenseForm").reset();
  if (id === "incomeDialog") { $("incomeDialogTitle").textContent = "Add income"; fillMemberSelect($("incomeReceivedBy"), state.data.user.id); }
  if (id === "targetDialog") { $("targetForm").reset(); $("targetDueDate").value = todayIso(); fillMemberSelect($("targetOwner"), state.data.user.id, true); }
  if (id === "contributionDialog") { $("contributionForm").reset(); $("contributionDate").value = todayIso(); }
  if (id === "dateDialog") { $("dateDialogTitle").textContent = "Add important date"; $("importantDateCalendarSystem").value="GREGORIAN"; $("importantDateReminderBasis").value="GREGORIAN"; $("importantDateOdiaMonth").value="BAISAKHA"; $("importantDateOdiaPaksha").value="SHUKLA"; $("importantDateOdiaTithi").value="1"; $("importantDateOdiaEquivalent").value=todayIso(); state.pendingImportantDatePhoto=null; state.removeImportantDatePhoto=false; $("importantDatePhotoFile").value=""; setImportantDatePhotoPreview(null); $("importantDateAdminControls").classList.toggle("hidden",!isAdmin()); const saka=gregorianToSaka($("importantDateValue").value||todayIso()); if(saka){$("importantDateSakaYear").value=saka.year;$("importantDateSakaMonth").value=String(saka.month);$("importantDateSakaDay").value=saka.day;} syncImportantDateCalendar(); $("notifyEveryone").checked = true; $("recipientChecks").classList.add("hidden"); renderRecipientChecks([]); }
  if (id === "photoDialog") { $("photoForm").reset(); $("photoTakenDate").value = todayIso(); $("photoPreview").classList.add("hidden"); state.pendingPhoto = null; }
  if (id === "memberDialog") { $("memberDialogTitle").textContent = "Add family member"; $("memberActive").checked = true; $("memberPassword").required = true; setMemberPermissions(["EXPENSES","INCOME","TARGETS","DATES","CALENDAR","PHOTOS","EXPERIENCES","DIARY"]); syncMemberAccessRole(); }
  if (id === "experienceDialog") $("experienceDialogTitle").textContent = "Add experience";
  if (id === "diaryDialog") $("diaryDialogTitle").textContent = "Write diary entry";
  if (id === "expenseCategoryDialog") { state.categoryDraft = JSON.parse(JSON.stringify(expenseCategoryConfig())); state.categoryEditIds.clear(); state.subcategoryEditIds.clear(); $("newExpenseCategoryName").value = ""; renderExpenseCategoryManager(); }
}

function openSmartPaste(preferredType) {
  resetSmartPaste();
  const choice = String(preferredType || "auto").toUpperCase();
  $("smartPasteType").value = ["EXPENSE", "EVENT"].indexOf(choice) >= 0 ? choice : "AUTO";
  openDialog("smartPasteDialog");
  setTimeout(function () { $("smartPasteText").focus(); }, 60);
}

function resetSmartPaste() {
  state.smartPasteResult = null;
  $("smartPasteText").value = "";
  $("smartPastePreview").classList.add("hidden");
  $("smartPasteFieldList").innerHTML = "";
  $("smartPasteWarning").textContent = "";
  $("smartPasteWarning").classList.add("hidden");
  $("smartPasteUse").disabled = true;
}

function smartPasteValidIso(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day), date = new Date(y, m - 1, d);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
  return [String(y).padStart(4, "0"), String(m).padStart(2, "0"), String(d).padStart(2, "0")].join("-");
}

function smartPasteDate(text) {
  const source = String(text || ""), lower = source.toLowerCase(), now = new Date();
  if (/\btomorrow\b/.test(lower)) { now.setDate(now.getDate() + 1); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-"); }
  if (/\btoday\b/.test(lower)) return todayIso();
  let match = source.match(/\b(20\d{2}|19\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/);
  if (match) return smartPasteValidIso(match[1], match[2], match[3]);
  match = source.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2}|19\d{2})\b/);
  if (match) return smartPasteValidIso(match[3], match[2], match[1]);
  const months = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
  match = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})[,]?\s+(20\d{2}|19\d{2})\b/);
  if (match && months[match[2]]) return smartPasteValidIso(match[3], months[match[2]], match[1]);
  match = lower.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2}|19\d{2})\b/);
  if (match && months[match[1]]) return smartPasteValidIso(match[3], months[match[1]], match[2]);
  return "";
}

function smartPasteAmount(text) {
  const source = String(text || "");
  let match = source.match(/(?:₹|\brs\.?|\binr\b)\s*[:=\-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (!match) match = source.match(/\b(?:amount|total|paid|spent|cost|fare|bill)\s*(?:is|was|of|:|=|\-)?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function smartPasteTime(text) {
  const match = String(text || "").match(/\b(?:at\s+)?(\d{1,2}[:.]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?))\b/i);
  return match ? match[1].replace(".", ":").replace(/\./g, "").toUpperCase() : "";
}

function smartPasteCleanValue(value) {
  return String(value || "").replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, "").split(/\s+(?:on|via|using|through|from|for|dated)\s+/i)[0].trim().slice(0, 100);
}

function smartPastePayee(text) {
  const source = String(text || "");
  let match = source.match(/\b(?:merchant|vendor|payee|send\s+to)\s*[:=\-]\s*([^\n;]+)/i);
  if (!match) match = source.match(/\b(?:paid|sent|transferred)(?:\s+(?:₹|rs\.?|inr)?\s*[0-9][0-9,.]*)?\s+to\s+([^\n;,]+)/i);
  return match ? smartPasteCleanValue(match[1]) : "";
}

function smartPasteAccount(text) {
  const source = String(text || "");
  let match = source.match(/\b(?:from\s+(?:account|acct)|account|acct)\s*[:=\-]?\s*([^\n;,]+)/i);
  if (!match) match = source.match(/\b(?:via|using|through|by)\s+(UPI|cash|credit card|debit card|[^\n;,]+)/i);
  return match ? smartPasteCleanValue(match[1]) : "";
}

function smartPasteCategory(text) {
  const lower = String(text || "").toLowerCase(), categories = activeExpenseCategories();
  const groups = [
    ["Travel", ["travel","trip","flight","train","hotel","ticket","tour"]], ["Transport", ["fuel","petrol","diesel","taxi","cab","uber","ola","parking","vehicle","bus"]],
    ["Food", ["food","grocery","groceries","restaurant","dining","vegetable","milk","snack"]], ["Health", ["doctor","hospital","medicine","medical","clinic","test","pharmacy"]],
    ["Utilities", ["electricity","water bill","gas bill","internet","mobile bill","broadband","dth"]], ["Education", ["school","college","tuition","course","book","fees","stationery"]],
    ["Home", ["house","home","cement","contractor","repair","maintenance","furniture","rent"]], ["Tax & insurance", ["tax","insurance","khajana"]],
    ["Shopping", ["shopping","clothes","clothing","electronics","household","gift"]], ["Entertainment", ["movie","subscription","event","hobby"]],
    ["Family transfer", ["family transfer","monthly support","loan","emergency support","sent to brother"]]
  ];
  const direct = categories.find(function (category) { return lower.indexOf(String(category.name).toLowerCase()) >= 0; });
  if (direct) return direct.name;
  for (let index = 0; index < groups.length; index += 1) {
    if (!groups[index][1].some(function (word) { return lower.indexOf(word) >= 0; })) continue;
    const match = categories.find(function (category) { return normalize(category.name) === normalize(groups[index][0]); });
    if (match) return match.name;
  }
  const other = categories.find(function (category) { return normalize(category.name) === "other"; });
  return other ? other.name : (categories[0] ? categories[0].name : "Other");
}

function smartPasteSubcategory(category, text) {
  const lower = String(text || "").toLowerCase(), names = expenseSubcategoryNames(category, false);
  const direct = names.find(function (name) { return lower.indexOf(String(name).toLowerCase()) >= 0; });
  if (direct) return direct;
  const aliases = [["Fuel",["petrol","diesel","fuel"]],["Taxi",["taxi","cab","uber","ola"]],["Tickets",["ticket","flight","train"]],["Hotel",["hotel","stay","accommodation"]],["Medicine",["medicine","pharmacy"]],["Doctor",["doctor","clinic"]],["Groceries",["grocery","groceries"]],["Electricity",["electricity","power bill"]],["Internet",["internet","broadband"]],["Maintenance",["maintenance","repair"]],["General",[]]];
  for (let index = 0; index < aliases.length; index += 1) {
    if (aliases[index][1].some(function (word) { return lower.indexOf(word) >= 0; })) {
      const match = names.find(function (name) { return normalize(name) === normalize(aliases[index][0]); });
      if (match) return match;
    }
  }
  return names[0] || "General";
}

function smartPasteEventType(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.indexOf("death anniversary") >= 0) return "Death anniversary";
  if (lower.indexOf("birthday") >= 0 || lower.indexOf("birth day") >= 0) return "Birthday";
  if (lower.indexOf("anniversary") >= 0) return "Anniversary";
  if (/appointment|meeting|doctor|interview/.test(lower)) return "Appointment";
  if (/renew|expiry|expires/.test(lower)) return "Renewal";
  if (/payment|pay by|due/.test(lower)) return "Payment";
  return "Other";
}

function smartPasteEventTitle(text) {
  const lines = String(text || "").split(/\n+/).map(function (line) { return line.replace(/^\s*[-*•\d.)]+\s*/, "").trim(); }).filter(Boolean);
  const preferred = lines.find(function (line) { return /flight|train|hotel|trip|travel|visit|meeting|appointment|birthday|anniversary|renewal|departure|arrival/i.test(line); }) || lines[0] || "New event";
  return preferred.replace(/\b(?:20\d{2}|19\d{2})[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/g, "").replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:20\d{2}|19\d{2})\b/g, "").replace(/\s{2,}/g, " ").replace(/[,:;\-\s]+$/g, "").slice(0, 100) || "New event";
}

function parseSmartPaste(text, preferredType) {
  const source = String(text || "").replace(/\r/g, "").trim(), lower = source.toLowerCase();
  if (!source) return null;
  const amount = smartPasteAmount(source), date = smartPasteDate(source), time = smartPasteTime(source);
  const expenseScore = (amount ? 3 : 0) + ((source.indexOf("₹") >= 0 || /\brs\.?\b|\binr\b/.test(lower)) ? 2 : 0) + (/paid|spent|expense|payment|bill|receipt|upi|cash|account|merchant/.test(lower) ? 3 : 0);
  const eventScore = (date ? 2 : 0) + (/itinerary|flight|train|hotel|travel|trip|departure|arrival|visit|meeting|appointment|birthday|anniversary|check.?in|boarding/.test(lower) ? 4 : 0) + (time ? 1 : 0);
  const selected = String(preferredType || "AUTO").toUpperCase(), kind = selected === "EXPENSE" || selected === "EVENT" ? selected : (expenseScore > eventScore ? "EXPENSE" : "EVENT");
  if (kind === "EXPENSE") {
    const category = smartPasteCategory(source), payee = smartPastePayee(source), account = smartPasteAccount(source), warnings = [];
    if (!amount) warnings.push("No amount was recognised. Enter it before saving.");
    if (!date) warnings.push("No complete date was recognised. Today has been inserted—please check it.");
    if (!payee) warnings.push("Recipient / merchant was not clear.");
    if (!account) warnings.push("Payment account or mode was not clear.");
    return { kind:kind, confidence:Math.min(98, 28 + (amount?24:0) + (date?18:0) + (payee?14:0) + (account?8:0) + (category?8:0)), warnings:warnings, fields:{ date:date || todayIso(), amount:amount || "", sentTo:payee, fromAccount:account, category:category, subcategory:smartPasteSubcategory(category, source), reason:source.slice(0,500) } };
  }
  const eventType = smartPasteEventType(source), title = smartPasteEventTitle(source), eventWarnings = [];
  if (!date) eventWarnings.push("No complete date was recognised. Today has been inserted—please check it.");
  if (!time) eventWarnings.push("No time was recognised; add it to Notes if required.");
  const annual = ["Birthday","Anniversary","Death anniversary"].indexOf(eventType) >= 0;
  return { kind:kind, confidence:Math.min(98, 35 + (date?30:0) + (title?20:0) + (time?8:0)), warnings:eventWarnings, fields:{ date:date || todayIso(), title:title, eventType:eventType, occasionLabel:annual ? title + " as per English calendar" : (/itinerary|travel|trip|flight|train|hotel/i.test(source) ? "Travel itinerary" : "Imported from pasted text"), repeatYearly:annual, notes:(time ? "Time: " + time + "\n" : "") + source.slice(0,260) } };
}

function analyzeSmartPaste() {
  const text = $("smartPasteText").value.trim();
  if (!text) return toast("Paste an expense, itinerary or event message first.", "error");
  const result = parseSmartPaste(text, $("smartPasteType").value);
  if (!result) return;
  state.smartPasteResult = result;
  const labels = result.kind === "EXPENSE" ? [["Date",result.fields.date],["Amount",result.fields.amount ? money(result.fields.amount) : "Needs entry"],["Send to",result.fields.sentTo || "Needs entry"],["From account",result.fields.fromAccount || "Needs entry"],["Category",result.fields.category + " / " + result.fields.subcategory],["Reason",result.fields.reason]] : [["Date",result.fields.date],["Title",result.fields.title],["Type",result.fields.eventType],["Repeat",result.fields.repeatYearly ? "Every year" : "One time"],["Details",result.fields.notes]];
  $("smartPastePreviewTitle").textContent = result.kind === "EXPENSE" ? "Expense detected" : "Itinerary / event detected";
  $("smartPasteConfidence").textContent = result.confidence + "% confidence";
  $("smartPasteConfidence").classList.toggle("needs-review", result.confidence < 75);
  $("smartPasteFieldList").innerHTML = labels.map(function (item) { return '<div><span>'+h(item[0])+'</span><strong>'+h(item[1])+'</strong></div>'; }).join("");
  $("smartPasteWarning").textContent = result.warnings.join(" ");
  $("smartPasteWarning").classList.toggle("hidden", !result.warnings.length);
  $("smartPastePreview").classList.remove("hidden");
  $("smartPasteUse").disabled = false;
  $("smartPasteUse").textContent = result.kind === "EXPENSE" ? "Review in Expenditure form" : "Review in Important Date form";
}

function applySmartPasteResult() {
  const result = state.smartPasteResult;
  if (!result) return;
  $("smartPasteDialog").close();
  if (result.kind === "EXPENSE") {
    prepareNewDialog("expenseDialog");
    $("expenseDate").value = result.fields.date;
    $("expenseAmount").value = result.fields.amount;
    fillExpenseCategorySelect($("expenseCategory"), result.fields.category);
    fillExpenseSubcategorySelect($("expenseSubcategory"), result.fields.category, result.fields.subcategory);
    $("expenseSendTo").value = result.fields.sentTo;
    $("expenseFromAccount").value = result.fields.fromAccount;
    $("expenseReason").value = result.fields.reason;
    $("expenseDialogTitle").textContent = "Review pasted expenditure";
    openDialog("expenseDialog");
    setTimeout(function () { (result.fields.amount ? (result.fields.sentTo ? (result.fields.fromAccount ? $("expenseReason") : $("expenseFromAccount")) : $("expenseSendTo")) : $("expenseAmount")).focus(); }, 80);
    return;
  }
  prepareNewDialog("dateDialog");
  $("importantDateCalendarSystem").value = "GREGORIAN";
  $("importantDateValue").value = result.fields.date;
  $("importantDateTitle").value = result.fields.title;
  $("importantDateOccasion").value = result.fields.occasionLabel;
  $("importantDateType").value = result.fields.eventType;
  $("importantDateRepeat").checked = result.fields.repeatYearly;
  $("importantDateReminderBasis").value = "GREGORIAN";
  $("importantDateNotes").value = result.fields.notes.slice(0,300);
  $("dateDialogTitle").textContent = "Review pasted itinerary / event";
  syncImportantDateCalendar();
  updateImportantDateConversion();
  openDialog("dateDialog");
}

function syncExpenseEntryType() {
  const planned = $("expenseEntryType").value === "PREPLANNED";
  const specialPayment = !!($("expenseRecurringId").value || $("expenseMarkPaidId").value);
  const label = $("expenseDateLabel");
  if (label && label.firstChild) label.firstChild.nodeValue = planned ? "Planned date" : "Date paid";
  if (!specialPayment) $("expenseDialogTitle").textContent = planned ? ($("expenseId").value ? "Edit preplanned expenditure" : "Add preplanned expenditure") : ($("expenseId").value ? "Edit expenditure" : "Add paid expenditure");
}

function resetExpenseSharingForm(expense) {
  const item=expense||{}, enabled=expenseSharingEnabled();
  $("expenseSharingFieldset").classList.toggle("hidden",!enabled);
  fillMemberSelect($("expensePaidByMember"),item.paidByMemberId||state.data.user.id,false);
  $("expenseSplitMethod").value=enabled&&["EQUAL","CUSTOM"].indexOf(String(item.splitMethod||"").toUpperCase())>=0?String(item.splitMethod).toUpperCase():"PERSONAL";
  const selected=String(item.sharedWithIds||"").split(",").filter(Boolean), shares=parseExpenseShares(item.shareAmounts);
  $("expenseShareMembers").innerHTML=(state.data.members||[]).map(function(member){return '<label class="expense-share-member">'+memberAvatarMarkup(member.id,"tiny")+'<input type="checkbox" name="expenseShareMember" value="'+h(member.id)+'" '+(selected.indexOf(member.id)>=0?'checked':'')+'><span>'+h(member.name)+'</span></label>';}).join("");
  renderExpenseCustomShares(shares);
  syncExpenseSharingFields();
}
function parseExpenseShares(value) { if(value&&typeof value==="object")return value; try{return JSON.parse(String(value||"{}"));}catch(error){return {};} }
function selectedExpenseShareMembers() { return all('input[name="expenseShareMember"]:checked',$("expenseShareMembers")).map(function(input){return input.value;}); }
function syncExpenseSharingFields() {
  if(!expenseSharingEnabled())return;
  const method=$("expenseSplitMethod").value, shared=method!=="PERSONAL";
  $("expenseShareMembers").classList.toggle("hidden",!shared);
  if(shared&&!selectedExpenseShareMembers().length){
    const preferred=[$("expensePaidByMember").value,$("expenseMember").value].filter(function(id,index,list){return id&&id!=="ALL"&&list.indexOf(id)===index;});
    all('input[name="expenseShareMember"]',$("expenseShareMembers")).forEach(function(input,index){input.checked=preferred.indexOf(input.value)>=0||preferred.length<2&&index<2;});
  }
  renderExpenseCustomShares();
  $("expenseCustomShares").classList.toggle("hidden",method!=="CUSTOM");
  updateExpenseShareTotal();
}
function renderExpenseCustomShares(seed) {
  const old=seed||{}; all("input[data-share-member]",$("expenseCustomShares")).forEach(function(input){old[input.dataset.shareMember]=input.value;});
  $("expenseCustomShares").innerHTML=selectedExpenseShareMembers().map(function(id){return '<label>'+memberIdentityMarkup(id,true)+'<input type="number" min="0" step="0.01" data-share-member="'+h(id)+'" value="'+h(old[id]||"")+'" placeholder="0.00"></label>';}).join("")+'<p id="expenseShareTotal" class="expense-share-total"></p>';
  all("input[data-share-member]",$("expenseCustomShares")).forEach(function(input){input.addEventListener("input",updateExpenseShareTotal);});
}
function updateExpenseShareTotal() { const output=$("expenseShareTotal"); if(!output)return; const total=all("input[data-share-member]",$("expenseCustomShares")).reduce(function(sum,input){return sum+(Number(input.value)||0);},0),amount=Number($("expenseAmount").value)||0; output.textContent="Custom shares: "+money(total)+" of "+money(amount); output.classList.toggle("invalid",Math.abs(total-amount)>0.01); }
function expenseSharingPayload() {
  if(!expenseSharingEnabled())return {paidByMemberId:state.data.user.id,sharedWithIds:"",splitMethod:"PERSONAL",shareAmounts:""};
  const method=$("expenseSplitMethod").value, ids=method==="PERSONAL"?[]:selectedExpenseShareMembers(), shares={};
  if(method==="CUSTOM")all("input[data-share-member]",$("expenseCustomShares")).forEach(function(input){shares[input.dataset.shareMember]=Number(input.value)||0;});
  return {paidByMemberId:$("expensePaidByMember").value,sharedWithIds:ids,splitMethod:method,shareAmounts:shares};
}

function populateSubcategoryOptions(categoryId, inputId, listId, chooseFirst) {
  const values = expenseSubcategoryNames($(categoryId).value, false);
  const selected = chooseFirst || !$(inputId).value ? (values[0] || "General") : $(inputId).value;
  fillExpenseSubcategorySelect($(inputId), $(categoryId).value, selected);
}

function newCategoryConfigId(prefix) { return prefix + "_" + Date.now().toString(36).toUpperCase() + "_" + Math.random().toString(36).slice(2,7).toUpperCase(); }
function categoryDraftById(id) { return state.categoryDraft.find(function (category) { return category.id === id; }); }
function addExpenseCategoryDraft(event) {
  event.preventDefault();
  const name = $("newExpenseCategoryName").value.trim();
  if (!name) return;
  if (state.categoryDraft.some(function (category) { return normalize(category.name) === normalize(name); })) return toast("That expenditure category already exists.", "error");
  state.categoryDraft.push({ id: newCategoryConfigId("CAT"), name: name, active: true, subcategories: [{ id: newCategoryConfigId("SUB"), name: "General", active: true }] });
  $("newExpenseCategoryName").value = "";
  renderExpenseCategoryManager();
  toast("Category created. Choose Save category changes to publish it.", "success");
}
function categoryUsage(categoryName, subcategoryName) {
  const expenses = (state.data.expenses || []).map(normalizeExpense);
  const recurring = state.data.recurringExpenses || [];
  return expenses.concat(recurring).filter(function (item) { return item.category === categoryName && (!subcategoryName || item.subcategory === subcategoryName); }).length;
}
function renderExpenseCategoryManager() {
  const activeCount = state.categoryDraft.filter(function (category) { return category.active !== false; }).length;
  $("expenseCategoryManagerSummary").textContent = plural(state.categoryDraft.length, "category", "categories") + " · " + activeCount + " active";
  $("expenseCategoryManagerList").innerHTML = state.categoryDraft.map(function (category, categoryIndex) {
    const used = categoryUsage(category.name);
    const subcategoryRows = (category.subcategories || []).map(function (subcategory, subcategoryIndex) {
      const subUsed = categoryUsage(category.name, subcategory.name);
      const editKey = category.id + "::" + subcategory.id;
      const editing = state.subcategoryEditIds.has(editKey);
      return '<div class="subcategory-manager-row '+(subcategory.active===false?'archived':'')+' '+(editing?'editing':'')+'" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'"><span class="subcategory-branch">↳</span><input class="subcategory-name-input" maxlength="60" value="'+h(subcategory.name)+'" aria-label="Subcategory name" '+(editing?'':'readonly')+'><small>'+h(plural(subUsed,"record"))+'</small><div class="category-order-actions"><button type="button" class="tiny-button edit-name-button" data-action="'+(editing?'finish-edit-subcategory':'edit-subcategory')+'" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'">'+(editing?'✓ Done':'✎ Edit')+'</button><button type="button" class="tiny-button" data-action="move-subcategory-up" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'" '+(subcategoryIndex===0?'disabled':'')+' aria-label="Move subcategory up">↑</button><button type="button" class="tiny-button" data-action="move-subcategory-down" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'" '+(subcategoryIndex===category.subcategories.length-1?'disabled':'')+' aria-label="Move subcategory down">↓</button><button type="button" class="tiny-button '+(subcategory.active===false?'restore-button':'archive-button')+'" data-action="toggle-subcategory-active" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'">'+(subcategory.active===false?'Restore':'Archive')+'</button><button type="button" class="tiny-button delete-choice-button" data-action="delete-subcategory" data-category-id="'+h(category.id)+'" data-subcategory-id="'+h(subcategory.id)+'">Delete</button></div></div>';
    }).join("");
    const editing = state.categoryEditIds.has(category.id);
    return '<article class="category-manager-card '+(category.active===false?'archived':'')+' '+(editing?'editing':'')+'" data-category-id="'+h(category.id)+'"><header><span class="category-drag-index">'+(categoryIndex+1)+'</span><input class="category-name-input" maxlength="60" value="'+h(category.name)+'" aria-label="Category name" '+(editing?'':'readonly')+'><small>'+h(plural(used,"record"))+'</small><div class="category-order-actions"><button type="button" class="tiny-button edit-name-button" data-action="'+(editing?'finish-edit-category':'edit-category')+'" data-category-id="'+h(category.id)+'">'+(editing?'✓ Done':'✎ Edit')+'</button><button type="button" class="tiny-button" data-action="move-category-up" data-category-id="'+h(category.id)+'" '+(categoryIndex===0?'disabled':'')+' aria-label="Move category up">↑</button><button type="button" class="tiny-button" data-action="move-category-down" data-category-id="'+h(category.id)+'" '+(categoryIndex===state.categoryDraft.length-1?'disabled':'')+' aria-label="Move category down">↓</button><button type="button" class="tiny-button '+(category.active===false?'restore-button':'archive-button')+'" data-action="toggle-category-active" data-category-id="'+h(category.id)+'">'+(category.active===false?'Restore':'Archive')+'</button><button type="button" class="tiny-button delete-choice-button" data-action="delete-category" data-category-id="'+h(category.id)+'">Delete</button></div></header><div class="subcategory-manager-list">'+subcategoryRows+'</div><button type="button" class="add-subcategory-button" data-action="add-subcategory" data-category-id="'+h(category.id)+'">＋ Create subcategory</button></article>';
  }).join("");
}
function moveDraftItem(items, id, direction) {
  const index = items.findIndex(function (item) { return item.id === id; });
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  const item = items.splice(index, 1)[0]; items.splice(next, 0, item);
}
function handleCategoryManagerAction(action, button) {
  const category = categoryDraftById(button.dataset.categoryId);
  if (!category) return;
  if (action === "edit-category") state.categoryEditIds.add(category.id);
  if (action === "finish-edit-category") state.categoryEditIds.delete(category.id);
  if (action === "move-category-up") moveDraftItem(state.categoryDraft, category.id, -1);
  if (action === "move-category-down") moveDraftItem(state.categoryDraft, category.id, 1);
  if (action === "delete-category") {
    const remainingActive = state.categoryDraft.filter(function (item) { return item.id !== category.id && item.active !== false; }).length;
    if (category.active !== false && !remainingActive) return toast("Keep at least one active expenditure category.", "error");
    const usage = categoryUsage(category.name);
    const message = "Delete category “" + category.name + "” from future choices?" + (usage ? " Its " + plural(usage, "historical record") + " will remain unchanged, searchable and printable." : "");
    if (!window.confirm(message)) return;
    state.categoryDraft = state.categoryDraft.filter(function (item) { return item.id !== category.id; });
    state.categoryEditIds.delete(category.id);
    Array.from(state.subcategoryEditIds).forEach(function (key) { if (key.indexOf(category.id + "::") === 0) state.subcategoryEditIds.delete(key); });
    renderExpenseCategoryManager();
    return;
  }
  if (action === "toggle-category-active") {
    if (category.active !== false && state.categoryDraft.filter(function (item) { return item.active !== false; }).length === 1) return toast("Keep at least one active expenditure category.", "error");
    category.active = category.active === false;
    if (category.active && !(category.subcategories || []).some(function (item) { return item.active !== false; }) && category.subcategories[0]) category.subcategories[0].active = true;
  }
  if (action === "add-subcategory") {
    const created = { id: newCategoryConfigId("SUB"), name: "New subcategory", active: true };
    category.subcategories.push(created);
    state.subcategoryEditIds.add(category.id + "::" + created.id);
  }
  const subcategory = (category.subcategories || []).find(function (item) { return item.id === button.dataset.subcategoryId; });
  const editKey = subcategory ? category.id + "::" + subcategory.id : "";
  if (action === "edit-subcategory" && subcategory) state.subcategoryEditIds.add(editKey);
  if (action === "finish-edit-subcategory" && subcategory) state.subcategoryEditIds.delete(editKey);
  if (action === "move-subcategory-up" && subcategory) moveDraftItem(category.subcategories, subcategory.id, -1);
  if (action === "move-subcategory-down" && subcategory) moveDraftItem(category.subcategories, subcategory.id, 1);
  if (action === "delete-subcategory" && subcategory) {
    if (category.subcategories.length === 1) return toast("Every category must keep at least one subcategory.", "error");
    const remainingActive = category.subcategories.filter(function (item) { return item.id !== subcategory.id && item.active !== false; }).length;
    if (category.active !== false && subcategory.active !== false && !remainingActive) return toast("Keep at least one active subcategory inside an active category.", "error");
    const usage = categoryUsage(category.name, subcategory.name);
    const message = "Delete subcategory “" + subcategory.name + "” from future choices?" + (usage ? " Its " + plural(usage, "historical record") + " will remain unchanged, searchable and printable." : "");
    if (!window.confirm(message)) return;
    category.subcategories = category.subcategories.filter(function (item) { return item.id !== subcategory.id; });
    state.subcategoryEditIds.delete(editKey);
  }
  if (action === "toggle-subcategory-active" && subcategory) {
    if (subcategory.active !== false && category.active !== false && category.subcategories.filter(function (item) { return item.active !== false; }).length === 1) return toast("Keep at least one active subcategory inside an active category.", "error");
    subcategory.active = subcategory.active === false;
  }
  renderExpenseCategoryManager();
  if (["add-subcategory","edit-category","edit-subcategory"].indexOf(action) >= 0) {
    const card = all(".category-manager-card", $("expenseCategoryManagerList")).find(function (item) { return item.dataset.categoryId === category.id; });
    let input = null;
    if (card && action === "edit-category") input = card.querySelector(".category-name-input");
    if (card && action === "edit-subcategory") input = card.querySelector('.subcategory-manager-row[data-subcategory-id="'+CSS.escape(subcategory.id)+'"] .subcategory-name-input');
    if (card && action === "add-subcategory") { const inputs = all(".subcategory-name-input", card); input = inputs[inputs.length - 1]; }
    if (input) { input.focus(); input.select(); }
  }
}
async function saveExpenseCategories() {
  const categories = state.categoryDraft.map(function (category) { return { id: category.id, name: String(category.name || "").trim(), active: category.active !== false, subcategories: (category.subcategories || []).map(function (subcategory) { return { id: subcategory.id, name: String(subcategory.name || "").trim(), active: subcategory.active !== false }; }) }; });
  if (categories.some(function (category) { return !category.name || category.subcategories.some(function (subcategory) { return !subcategory.name; }); })) return toast("Every category and subcategory needs a name.", "error");
  const duplicateCategory = categories.some(function (category, index) { return categories.findIndex(function (other) { return normalize(other.name) === normalize(category.name); }) !== index; });
  const duplicateSubcategory = categories.some(function (category) { return category.subcategories.some(function (subcategory, index) { return category.subcategories.findIndex(function (other) { return normalize(other.name) === normalize(subcategory.name); }) !== index; }); });
  if (duplicateCategory || duplicateSubcategory) return toast("Category and subcategory names must be unique.", "error");
  await mutate("saveExpenseCategories", { categories: categories }, "Expenditure categories updated. Matching old records were renamed safely.", "expenseCategoryDialog", "Updating expenditure categories…");
}

function bindForms() {
  $("loginForm").addEventListener("submit", login);
  $("expenseForm").addEventListener("submit", saveExpense);
  $("recurringExpenseForm").addEventListener("submit", saveRecurringExpense);
  $("majorPlanForm").addEventListener("submit", saveMajorPlan);
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
  $("memberPasswordForm").addEventListener("submit", saveAdminMemberPassword);
  $("memberPhotoForm").addEventListener("submit", saveMemberPhoto);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("expenseSettlementForm").addEventListener("submit", saveExpenseSettlement);
  $("stickyNoteForm").addEventListener("submit", saveStickyNote);
  $("stickyQuickForm").addEventListener("submit", saveQuickStickyNote);
  $("createBackupNow").addEventListener("click", createBackupNow);
  $("refreshOdiaCalendarNow").addEventListener("click", refreshOdiaCalendarNow);
  $("addExpenseSettlement").addEventListener("click", function(){openExpenseSettlementDialog();});
  $("memberRole").addEventListener("change", syncMemberAccessRole);
  $("memberPhotoFile").addEventListener("change", previewMemberPhoto);
  $("deleteMemberPhoto").addEventListener("click", deleteMemberPhoto);
  $("parentsPortraitFile").addEventListener("change", previewParentsPortrait);
  $("saveParentsPortrait").addEventListener("click", saveParentsPortrait);
  $("removeParentsPortrait").addEventListener("click", deleteParentsPortrait);
  $("importantDatePhotoFile").addEventListener("change", previewImportantDatePhoto);
  $("removeImportantDatePhoto").addEventListener("click", removeImportantDatePhotoPreview);
  $("settingDashboardClockHighlight").addEventListener("input", function (event) { previewDashboardClockHighlight(event.target.value); });
}

function bindFilters() {
  const expenseSearchRender = debounce(renderExpenses, 120), recurringSearchRender=debounce(renderRecurringExpenses,120), incomeSearchRender = debounce(renderIncome, 120), dateSearchRender = debounce(renderDates, 120), photoSearchRender = debounce(renderPhotos, 120), experienceSearchRender = debounce(renderExperiences, 120), diarySearchRender = debounce(renderDiary, 120), globalSearchRender = debounce(renderGlobalSearch, 120);
  ["expenseMonth", "expenseStatusFilter", "expenseMemberFilter", "expenseCategoryFilter", "expenseSubcategoryFilter", "expenseMajorPlanFilter", "expenseSendToFilter", "expenseAccountFilter"].forEach(function (id) { $(id).addEventListener("input", renderExpenses); });
  $("expenseSearch").addEventListener("input", expenseSearchRender);
  $("majorPlanStatusFilter").addEventListener("input", renderMajorPlans);
  $("recurringStatusFilter").addEventListener("input", renderRecurringExpenses);
  $("recurringSearch").addEventListener("input", recurringSearchRender);
  $("recurringEditAll").addEventListener("click",function(){toggleRecurringEditAll(true);});
  $("recurringCancelAll").addEventListener("click",function(){toggleRecurringEditAll(false);});
  $("recurringSaveAll").addEventListener("click",saveAllRecurringRows);
  $("exportRecurringExpenses").addEventListener("click",function(){exportCsv("family-regular-payments.csv",recurringExportRows(),["active","title","memberName","category","subcategory","frequencyLabel","estimatedAmount","nextDueDate","sentTo","fromAccount","reason","majorPlanName","majorPlanPhaseName"],["Active","Payment","Member","Category","Subcategory","Frequency","Expected amount","Next due","Send to","From account","Reason","Major plan","Phase"]);});
  $("printRecurringExpenses").addEventListener("click",printRecurringExpenses);
  ["incomeMonth", "incomeCategoryFilter", "incomeMemberFilter"].forEach(function (id) { $(id).addEventListener("input", renderIncome); });
  $("incomeSearch").addEventListener("input", incomeSearchRender);
  $("dateTypeFilter").addEventListener("input", renderDates);
  $("dateSearch").addEventListener("input", dateSearchRender);
  $("photoSearch").addEventListener("input", photoSearchRender);
  $("printMemories").addEventListener("click", openMemoryPrintView);
  $("experienceYear").addEventListener("input", renderExperiences);
  $("experienceSearch").addEventListener("input", experienceSearchRender);
  ["diaryMonth", "diaryWriterFilter"].forEach(function (id) { $(id).addEventListener("input", renderDiary); });
  $("diarySearch").addEventListener("input", diarySearchRender);
  $("globalSearch").addEventListener("input", globalSearchRender);
  $("exportExpenses").addEventListener("click", function () { exportCsv("family-expenditure.csv", filteredExpenses().map(function(item){return Object.assign({},item,{memberName:memberName(expenseMemberId(item)),majorPlanName:majorPlanName(item.majorPlanId),majorPlanPhaseName:majorPlanPhaseName(item.majorPlanPhaseId)});}), ["amount", "date", "status", "memberName", "category", "subcategory", "majorPlanName", "majorPlanPhaseName", "sentTo", "fromAccount", "reason"], ["Amt (Rs.)", "Date", "Status", "Member", "Category", "Subcategory", "Major plan", "Phase", "Send to", "From Acct", "Reason"]); });
  $("exportIncome").addEventListener("click", function () { exportCsv("family-income.csv", filteredIncome(), ["date", "source", "category", "receivedByName", "receivingMode", "amount"]); });
  $("printExpenses").addEventListener("click", function () { prepareExpensePrintDialog(); openDialog("expensePrintDialog"); });
  $("printIncome").addEventListener("click", function () { window.print(); });
  $("addPreplannedExpense").addEventListener("click", function () { prepareNewDialog("expenseDialog"); $("expenseEntryType").value = "PREPLANNED"; $("expenseDialogTitle").textContent = "Add preplanned expenditure"; syncExpenseEntryType(); openDialog("expenseDialog"); });
}

function bindExpenseColumnResize() {
  const table = $("expenseTable"), columns = all("col", table), defaults = [360,160,180,190,135,185,230];
  if (!table || !columns.length) return;
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(EXPENSE_COLUMN_WIDTHS_KEY) || "[]"); } catch (error) { saved = []; }
  columns.forEach(function (column,index) { column.style.width = Math.max(50,Math.min(620,Number(saved[index] || defaults[index]))) + "px"; });
  syncExpenseTableWidth();
  all(".column-resizer",table).forEach(function (handle) {
    handle.addEventListener("pointerdown",function (event) {
      event.preventDefault(); event.stopPropagation();
      const index=Number(handle.dataset.expenseColumn),width=parseFloat(columns[index].style.width)||defaults[index];
      handle.setPointerCapture(event.pointerId); handle.classList.add("dragging");
      state.expenseResize={handle:handle,index:index,startX:event.clientX,startWidth:width};
    });
    handle.addEventListener("keydown",function (event) {
      if (event.key!=="ArrowLeft"&&event.key!=="ArrowRight") return;
      event.preventDefault();
      const index=Number(handle.dataset.expenseColumn),current=parseFloat(columns[index].style.width)||defaults[index];
      setExpenseColumnWidth(index,current+(event.key==="ArrowRight"?10:-10));
    });
  });
  window.addEventListener("pointermove",function (event) {
    if (!state.expenseResize) return;
    event.preventDefault();
    setExpenseColumnWidth(state.expenseResize.index,state.expenseResize.startWidth+event.clientX-state.expenseResize.startX,false);
  });
  window.addEventListener("pointerup",finishExpenseColumnResize);
  window.addEventListener("pointercancel",finishExpenseColumnResize);
}

function setExpenseColumnWidth(index,width,save) {
  const columns=all("col",$("expenseTable")); if(!columns[index]) return;
  columns[index].style.width=Math.max(50,Math.min(620,Math.round(width)))+"px";
  syncExpenseTableWidth();
  if(save!==false) saveExpenseColumnWidths();
}
function syncExpenseTableWidth() { const table=$("expenseTable"); if(!table)return; const columns=all("col",table); table.style.width=columns.reduce(function(sum,column){return sum+(parseFloat(column.style.width)||0);},0)+"px"; }
function saveExpenseColumnWidths() { const table=$("expenseTable"); if(!table)return; localStorage.setItem(EXPENSE_COLUMN_WIDTHS_KEY,JSON.stringify(all("col",table).map(function(column){return Math.round(parseFloat(column.style.width)||0);}))); }
function finishExpenseColumnResize() { if(!state.expenseResize)return; state.expenseResize.handle.classList.remove("dragging"); state.expenseResize=null; saveExpenseColumnWidths(); }

function bindActions() {
  document.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === "edit-expense") editExpense(id);
    if (action === "inline-edit-expense") startInlineExpenseEdit(id);
    if (action === "inline-save-expense") await saveInlineExpenseRow(button);
    if (action === "inline-cancel-expense") { state.inlineExpenseId = ""; renderExpenses(); }
    if (action === "mark-planned-paid") openPlannedPayment(id);
    if (action === "delete-expense") confirmDelete("deleteExpense", id, "Delete this expenditure entry?");
    if (action === "pay-recurring-expense") openRecurringPayment(id);
    if (action === "edit-recurring-expense") editRecurringExpense(id);
    if (action === "inline-edit-recurring") startInlineRecurringEdit(id);
    if (action === "inline-save-recurring") await saveInlineRecurringRow(button);
    if (action === "inline-cancel-recurring") { state.inlineRecurringId=""; renderRecurringExpenses(); }
    if (action === "duplicate-recurring-expense") duplicateRecurringExpense(id);
    if (action === "delete-recurring-expense") confirmDelete("deleteRecurringExpense", id, "Remove this regular payment schedule? Past paid expenditure will remain.");
    if (action === "add-major-plan-expense") openMajorPlanExpense(id, false, button.dataset.phase || "");
    if (action === "add-major-plan-preplanned") openMajorPlanExpense(id, true);
    if (action === "edit-major-plan") editMajorPlan(id);
    if (action === "print-major-plan") openMajorPlanReport(id, false);
    if (action === "complete-major-plan") setMajorPlanStatus(id, "COMPLETED", "Complete this major plan? New linked expenditure will be stopped until it is reopened.");
    if (action === "reopen-major-plan" || action === "restore-major-plan") setMajorPlanStatus(id, "ACTIVE", "Reopen this major plan for new expenditure?");
    if (action === "archive-major-plan") setMajorPlanStatus(id, "ARCHIVED", "Archive this completed major plan? Its expenditure and reports will remain saved.");
    if (action === "remove-major-plan-phase") removeMajorPlanPhaseRow(button);
    if (action === "edit-income") editIncome(id);
    if (action === "delete-income") confirmDelete("deleteIncome", id, "Delete this income entry?");
    if (action === "contribute") openContribution(id);
    if (action === "delete-target") confirmDelete("deleteTarget", id, "Delete this target and its contribution history?");
    if (action === "edit-date") editImportantDate(id);
    if (action === "delete-date") confirmDelete("deleteImportantDate", id, "Delete this reminder?");
    if (action === "manage-odia-mappings") openOdiaMappingDialog(id);
    if (action === "delete-odia-mapping") deleteOdiaReminderMapping(id);
    if (action === "view-photo") viewPhoto(id);
    if (action === "delete-photo") { event.stopPropagation(); confirmDelete("deletePhoto", id, "Delete this shared photo from Google Drive?"); }
    if (action === "edit-experience") editExperience(id);
    if (action === "delete-experience") confirmDelete("deleteExperience", id, "Delete this experience?");
    if (action === "edit-diary") editDiary(id);
    if (action === "delete-diary") confirmDelete("deleteDiary", id, "Delete this diary entry?");
    if (action === "edit-member") editMember(id);
    if (action === "set-password") openMemberPasswordDialog(id);
    if (action === "manage-member-photo") openMemberPhotoDialog(id);
    if (action === "filter-expense-member") { $("expenseMemberFilter").value=id; renderExpenses(); $("expenseTable").scrollIntoView({behavior:"smooth",block:"start"}); }
    if (action === "quick-filter-expense-member") { $("expenseMemberFilter").value=id||""; renderExpenses(); }
    if (action === "filter-expense-category") { $("expenseCategoryFilter").value=button.dataset.category||""; renderExpenses(); $("expenseTable").scrollIntoView({behavior:"smooth",block:"start"}); }
    if (action === "toggle-expense-section") toggleExpenseSection(button);
    if (action === "open-expense-settlement") openExpenseSettlementDialog(button.dataset.from,button.dataset.to,button.dataset.amount);
    if (action === "delete-expense-settlement") confirmDelete("deleteSettlement", id, "Remove this settlement record? The shared-expense balance will be recalculated.");
    if (action === "edit-sticky") editStickyNote(id);
    if (action === "delete-sticky") confirmDelete("deleteStickyNote", id, "Delete this sticky note permanently?");
    if (action === "complete-sticky") completeStickyNote(id);
    if (action === "restore-sticky") mutate("restoreStickyNote", { id: id }, "Sticky note restored.");
    if (action === "collapse-sticky") changeStickyLayout(id, "collapse");
    if (action === "pin-sticky") changeStickyLayout(id, "pin");
    if (action === "grow-sticky") changeStickyLayout(id, "grow");
    if (action === "shrink-sticky") changeStickyLayout(id, "shrink");
    if (action === "auto-fit-sticky") autoFitStickyNote(id);
    if (action === "open-side-sticky") openSideSticky(id);
    if (action === "close-side-sticky") closeSideSticky();
    if (["edit-category","finish-edit-category","delete-category","move-category-up","move-category-down","toggle-category-active","add-subcategory","edit-subcategory","finish-edit-subcategory","delete-subcategory","move-subcategory-up","move-subcategory-down","toggle-subcategory-active"].indexOf(action) >= 0) handleCategoryManagerAction(action, button);
  });
  document.addEventListener("input", function (event) {
    const categoryCard = event.target.closest(".category-manager-card");
    if (!categoryCard) return;
    const category = categoryDraftById(categoryCard.dataset.categoryId); if (!category) return;
    if (event.target.classList.contains("category-name-input")) category.name = event.target.value;
    if (event.target.classList.contains("subcategory-name-input")) {
      const row = event.target.closest(".subcategory-manager-row");
      const subcategory = (category.subcategories || []).find(function (item) { return item.id === row.dataset.subcategoryId; });
      if (subcategory) subcategory.name = event.target.value;
    }
  });
  document.addEventListener("change", function (event) {
    const row = event.target.closest("tr");
    if (event.target.classList.contains("inline-expense-category")) {
      const subcategory = row && row.querySelector(".inline-expense-subcategory");
      if (subcategory) subcategory.innerHTML = expenseSubcategoryOptions(event.target.value, "", false);
    }
    if (event.target.classList.contains("inline-expense-major-plan")) {
      const phase = row && row.querySelector(".inline-expense-major-plan-phase");
      if (phase) { phase.innerHTML=majorPlanPhaseOptions(event.target.value,"",false); phase.disabled=!event.target.value; }
    }
    if (event.target.classList.contains("inline-recurring-category")) {
      const subcategory=row&&row.querySelector(".inline-recurring-subcategory");
      if(subcategory)subcategory.innerHTML=expenseSubcategoryOptions(event.target.value,"",false);
    }
    if (event.target.classList.contains("inline-recurring-frequency")) {
      const custom=row&&row.querySelector(".recurring-custom-row");
      if(custom)custom.classList.toggle("hidden",event.target.value!=="CUSTOM");
    }
    if (event.target.classList.contains("inline-recurring-major-plan")) {
      const phase=row&&row.querySelector(".inline-recurring-major-plan-phase");
      if(phase){phase.innerHTML=majorPlanPhaseOptions(event.target.value,"",true);phase.disabled=!event.target.value;}
    }
  });
}

function bindStickyBoard() {
  $("stickyLauncher").addEventListener("click", function () { openStickyBoard("active"); });
  $("stickyLauncher").addEventListener("pointerenter", expandStickyLauncher);
  $("stickyLauncher").addEventListener("pointerleave", function () { scheduleStickyLauncherCollapse(900); });
  $("stickyLauncher").addEventListener("focus", expandStickyLauncher);
  $("stickyLauncher").addEventListener("blur", function () { scheduleStickyLauncherCollapse(500); });
  $("stickyMinimize").addEventListener("click", minimizeStickyBoard);
  $("stickyClose").addEventListener("click", closeStickyBoard);
  $("stickyBoardShade").addEventListener("click", closeStickyBoard);
  all("[data-sticky-close]").forEach(function (button) { button.addEventListener("click", closeStickyBoard); });
  $("stickyTabActive").addEventListener("click", function () { state.stickyView = "active"; renderStickyNotes(); });
  $("stickyTabCompleted").addEventListener("click", function () { state.stickyView = "completed"; renderStickyNotes(); });
  $("stickyCanvas").addEventListener("pointerdown", startStickyResize);
  $("stickyPinnedCanvas").addEventListener("pointerdown", startStickyResize);
  $("stickyCanvas").addEventListener("pointerdown", startStickyDrag);
  $("stickyPinnedCanvas").addEventListener("pointerdown", startStickyDrag);
  window.addEventListener("pointermove", moveStickyDrag);
  window.addEventListener("pointermove", moveStickyResize);
  window.addEventListener("pointerup", endStickyDrag);
  window.addEventListener("pointerup", endStickyResize);
  window.addEventListener("pointercancel", endStickyDrag);
  window.addEventListener("pointercancel", endStickyResize);
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !$("stickyBoard").classList.contains("hidden") && !document.querySelector("dialog[open]")) closeStickyBoard();
  });
}

function openStickyBoard(view) {
  if (!canUseStickyNotes()) return;
  clearTimeout(state.stickyLauncherTimer);
  if (view) state.stickyView = view;
  document.body.classList.add("sticky-drawer-open");
  $("stickyBoard").classList.remove("hidden");
  $("stickyBoardShade").classList.remove("hidden");
  $("stickyPinnedLayer").classList.add("hidden");
  clearTimeout(state.stickySideTimer); state.stickySideOpenId = "";
  $("stickyLauncher").classList.add("hidden");
  $("stickyLauncher").setAttribute("aria-expanded", "true");
  renderStickyNotes();
}

function closeStickyBoard() {
  document.body.classList.remove("sticky-drawer-open");
  $("stickyBoard").classList.add("hidden");
  $("stickyBoardShade").classList.add("hidden");
  $("stickyLauncher").classList.toggle("hidden", !canUseStickyNotes());
  $("stickyLauncher").setAttribute("aria-expanded", "false");
  renderStickyPinnedLayer();
  scheduleStickyLauncherCollapse(4200);
}

function expandStickyLauncher() {
  clearTimeout(state.stickyLauncherTimer);
  $("stickyLauncher").classList.remove("compact");
}

function scheduleStickyLauncherCollapse(delay) {
  clearTimeout(state.stickyLauncherTimer);
  const launcher = $("stickyLauncher");
  launcher.classList.remove("compact");
}

function minimizeStickyBoard() {
  closeStickyBoard();
  const pinnedCount = (state.data.stickyNotes || []).filter(function (note) { return note.status !== "COMPLETED" && note.pinned; }).length;
  toast(pinnedCount ? plural(pinnedCount, "pinned note") + " kept open above the dashboard." : "Sticky-note organiser minimized.", "success");
}

function canUseStickyNotes() { return hasModuleAccess("TARGETS") || hasModuleAccess("DATES"); }

async function login(event) {
  event.preventDefault();
  if (!CONFIG.API_URL || CONFIG.API_URL === PLACEHOLDER_URL) return toast("Paste the Apps Script Web App URL in config.js first.", "error");
  showLoading("Signing you in…");
  try {
    const username = $("loginUsername").value.trim();
    const result = await api("login", { username: username, password: $("loginPassword").value });
    if ($("rememberUsername").checked) localStorage.setItem(SAVED_USERNAME_KEY, username); else localStorage.removeItem(SAVED_USERNAME_KEY);
    state.token = result.token;
    state.data = normalizeBootstrapData(result.bootstrap);
    sessionStorage.setItem(SESSION_TOKEN_KEY, state.token);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    state.lastKeepAliveAt = Date.now();
    $("loginForm").reset();
    showApp();
  } catch (error) { toast(error.message, "error"); }
  finally { hideLoading(); }
}
async function logout() {
  const token = state.token;
  clearLocalSession(); showLogin();
  try { if (token) sendLogoutBeacon(token); } catch (e) { /* local logout still succeeds */ }
}

function addMajorPlanPhaseRow(phase) {
  const item=phase||{};
  const row=document.createElement("div");
  row.className="major-plan-phase-row"+(item.active===false?" archived":" ");
  row.dataset.phaseId=item.id||"";
  row.innerHTML='<span class="phase-drag" title="Phase order follows this list">↕</span><label>Phase name<input class="major-plan-phase-name" maxlength="80" required value="'+h(item.name||"")+'" placeholder="e.g. Foundation"></label><label>Phase budget<input class="major-plan-phase-amount" type="number" min="0" step="0.01" value="'+h(item.proposedAmount||"")+'" placeholder="0"></label><label class="phase-active-label"><input class="major-plan-phase-active" type="checkbox"'+(item.active===false?'':' checked')+'> Active</label><button class="danger-button" type="button" data-action="remove-major-plan-phase">'+(item.id?'Archive':'Remove')+'</button>';
  $("majorPlanPhaseList").appendChild(row);
  row.querySelector(".major-plan-phase-active").addEventListener("change",function(event){row.classList.toggle("archived",!event.target.checked);updateMajorPlanPhaseBudgetSummary();});
  updateMajorPlanPhaseBudgetSummary();
}
function removeMajorPlanPhaseRow(button) {
  const row=button.closest(".major-plan-phase-row"); if(!row)return;
  if(row.dataset.phaseId){const active=row.querySelector(".major-plan-phase-active");active.checked=false;row.classList.add("archived");button.textContent="Archived";button.disabled=true;}
  else row.remove();
  updateMajorPlanPhaseBudgetSummary();
}
function updateMajorPlanPhaseBudgetSummary() {
  if(!$("majorPlanPhaseBudgetSummary"))return;
  const budget=Number($("majorPlanAmount").value||0);
  const total=all(".major-plan-phase-row",$("majorPlanPhaseList")).filter(function(row){return row.querySelector(".major-plan-phase-active").checked;}).reduce(function(sum,row){return sum+Number(row.querySelector(".major-plan-phase-amount").value||0);},0);
  const unallocated=budget-total;
  $("majorPlanPhaseBudgetSummary").classList.toggle("over-budget",unallocated<0);
  $("majorPlanPhaseBudgetSummary").textContent="Active phase budgets: "+money(total)+(budget?" · "+(unallocated>=0?"Unallocated "+money(unallocated):"Over budget by "+money(Math.abs(unallocated))):"");
}
async function saveMajorPlan(event) {
  event.preventDefault();
  const phases=all(".major-plan-phase-row",$("majorPlanPhaseList")).map(function(row){return {id:row.dataset.phaseId||"",name:row.querySelector(".major-plan-phase-name").value.trim(),proposedAmount:row.querySelector(".major-plan-phase-amount").value,active:row.querySelector(".major-plan-phase-active").checked};});
  if(!phases.length||phases.some(function(phase){return !phase.name;}))return toast("Add at least one named project phase.","error");
  const id=$("majorPlanId").value;
  await mutate("saveMajorPlan",{id:id,name:$("majorPlanName").value.trim(),proposedAmount:$("majorPlanAmount").value,startDate:$("majorPlanStartDate").value,targetDate:$("majorPlanTargetDate").value,ownerId:$("majorPlanOwner").value,notes:$("majorPlanNotes").value.trim(),phases:phases},id?"Major plan updated.":"Major plan created. Add paid or preplanned expenditure from its card.","majorPlanDialog","Saving major plan…");
}

async function saveExpense(event) {
  event.preventDefault();
  const recurringId = $("expenseRecurringId").value;
  const plannedId = $("expenseMarkPaidId").value;
  const action = recurringId ? "markRecurringExpensePaid" : plannedId ? "markPlannedExpensePaid" : $("expenseId").value ? "updateExpense" : "createExpense";
  await mutate(action, Object.assign({
    id: recurringId || plannedId || $("expenseId").value, date: $("expenseDate").value, amount: $("expenseAmount").value,
    memberId: $("expenseMember").value,
    category: $("expenseCategory").value, subcategory: $("expenseSubcategory").value.trim(),
    sentTo: $("expenseSendTo").value.trim(), fromAccount: $("expenseFromAccount").value.trim(),
    reason: $("expenseReason").value.trim(), entryType: recurringId ? "RECURRING" : $("expenseEntryType").value,
    majorPlanId: $("expenseMajorPlan").value, majorPlanPhaseId: $("expenseMajorPlanPhase").value
  },expenseSharingPayload()), recurringId ? "Payment recorded and the next due date was calculated." : plannedId ? "Preplanned expenditure marked as paid." : "Expenditure saved.", "expenseDialog");
}

async function saveExpenseSettlement(event) {
  event.preventDefault();
  if($("settlementFromMember").value===$("settlementToMember").value)return toast("Choose two different family members.","error");
  await mutate("createSettlement",{fromMemberId:$("settlementFromMember").value,toMemberId:$("settlementToMember").value,amount:$("settlementAmount").value,date:$("settlementDate").value,paymentMode:$("settlementPaymentMode").value.trim(),reference:$("settlementReference").value.trim(),notes:$("settlementNotes").value.trim()},"Settlement recorded and balances updated.","expenseSettlementDialog","Recording settlement…");
}

async function saveRecurringExpense(event) {
  event.preventDefault();
  const everyone = $("recurringNotifyEveryone").checked;
  const recipients = everyone ? ["ALL"] : all("input[name='recurringRecipient']:checked").map(function (el) { return el.value; });
  if (!recipients.length) return toast("Choose at least one email recipient.", "error");
  const id = $("recurringExpenseId").value;
  await mutate(id ? "updateRecurringExpense" : "createRecurringExpense", {
    id: id, title: $("recurringExpenseTitle").value.trim(), estimatedAmount: $("recurringExpenseAmount").value,
    memberId: $("recurringExpenseMember").value,
    frequency: $("recurringExpenseFrequency").value, intervalMonths: $("recurringExpenseIntervalMonths").value, nextDueDate: $("recurringExpenseDueDate").value,
    category: $("recurringExpenseCategory").value, subcategory: $("recurringExpenseSubcategory").value.trim(),
    sentTo: $("recurringExpenseSendTo").value.trim(), fromAccount: $("recurringExpenseFromAccount").value.trim(),
    reason: $("recurringExpenseReason").value.trim(), remindDays: $("recurringExpenseRemind").value,
    recipientIds: recipients.join(","), majorPlanId: $("recurringExpenseMajorPlan").value, majorPlanPhaseId: $("recurringExpenseMajorPlanPhase").value
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
  const recipients = Array.from(new Set(state.data.expenses.map(function (item) { return normalizeExpense(item).sentTo; }).filter(Boolean))).sort();
  const accounts = Array.from(new Set(state.data.expenses.map(function (item) { return normalizeExpense(item).fromAccount; }).filter(Boolean))).sort();
  const categories = Array.from(new Set(state.data.expenses.map(function (item) { return normalizeExpense(item).category; }).filter(Boolean))).sort();
  const subcategories = Array.from(new Set(state.data.expenses.map(function (item) { return normalizeExpense(item).subcategory; }).filter(Boolean))).sort();
  $("expensePrintSendTo").innerHTML = '<option value="">All recipients</option>' + recipients.map(function (value) { return '<option value="'+h(value)+'">'+h(value)+'</option>'; }).join("");
  $("expensePrintAccount").innerHTML = '<option value="">All accounts</option>' + accounts.map(function (value) { return '<option value="'+h(value)+'">'+h(value)+'</option>'; }).join("");
  $("expensePrintCategory").innerHTML = '<option value="">All categories</option>' + categories.map(function (value) { return '<option value="'+h(value)+'">'+h(value)+'</option>'; }).join("");
  $("expensePrintSubcategory").innerHTML = '<option value="">All subcategories</option>' + subcategories.map(function (value) { return '<option value="'+h(value)+'">'+h(value)+'</option>'; }).join("");
  $("expensePrintMajorPlan").innerHTML = '<option value="">All major plans</option>' + (state.data.majorPlans||[]).map(function (plan) { return '<option value="'+h(plan.id)+'">'+h(plan.name)+'</option>'; }).join("");
  fillExpenseMemberFilter($("expensePrintMember"));
  $("expensePrintStatus").value = $("expenseStatusFilter").value || "";
  $("expensePrintMember").value = $("expenseMemberFilter").value || "";
  $("expensePrintCategory").value = $("expenseCategoryFilter").value || "";
  $("expensePrintSubcategory").value = $("expenseSubcategoryFilter").value || "";
  $("expensePrintMajorPlan").value = $("expenseMajorPlanFilter").value || "";
  $("expensePrintSendTo").value = $("expenseSendToFilter").value || "";
  $("expensePrintAccount").value = $("expenseAccountFilter").value || "";
  $("expensePrintSearch").value = $("expenseSearch").value || "";
}

function viewExpenseRange() { openExpenseRangeOutput(false); }
function printExpenseRange(event) { event.preventDefault(); openExpenseRangeOutput(true); }

function openExpenseRangeOutput(autoPrint) {
  const from = $("expensePrintFrom").value, to = $("expensePrintTo").value;
  const status = $("expensePrintStatus").value, member=$("expensePrintMember").value, category = $("expensePrintCategory").value, subcategory = $("expensePrintSubcategory").value, majorPlanId=$("expensePrintMajorPlan").value;
  const recipient = $("expensePrintSendTo").value, account = $("expensePrintAccount").value, query = normalize($("expensePrintSearch").value);
  const density = ["comfortable","compact","minimum"].indexOf($("expensePrintDensity").value) >= 0 ? $("expensePrintDensity").value : "comfortable";
  if (!from || !to) return toast("Choose both From date and To date.", "error");
  if (from > to) return toast("From date cannot be later than To date.", "error");
  const items = state.data.expenses.map(normalizeExpense).filter(function (item) {
    const date = String(item.date || "").slice(0,10);
    return date >= from && date <= to && (!status || item.status === status) && (!member || expenseMemberId(item)===member) && (!category || item.category === category) && (!subcategory || item.subcategory === subcategory) && (!majorPlanId || item.majorPlanId===majorPlanId) && (!recipient || item.sentTo === recipient) && (!account || item.fromAccount === account) && (!query || normalize([item.status,memberName(expenseMemberId(item)),item.category,item.subcategory,majorPlanName(item.majorPlanId),majorPlanPhaseName(item.majorPlanPhaseId),item.sentTo,item.fromAccount,item.reason,item.date].join(" ")).includes(query));
  }).sort(function (a,b) { return String(a.date).localeCompare(String(b.date)); });
  if (!items.length) return toast("No expenditure was found in the selected period.", "error");

  const paidTotal = items.filter(function(item){return item.status==="PAID";}).reduce(function (sum,item) { return sum + Number(item.amount || 0); }, 0);
  const plannedTotal = items.filter(function(item){return item.status==="PLANNED";}).reduce(function (sum,item) { return sum + Number(item.amount || 0); }, 0);
  const reportMemberSummary=expenseAnalyticsRows(items).map(function(row){return '<span><b>'+h(row.name)+'</b><small>Paid '+h(money(row.paid))+(row.planned?' · Planned '+h(money(row.planned)):'')+'</small></span>';}).join("");
  const familyName = (state.data.settings && state.data.settings.familyName) || "Our Family Hub";
  const appliedFilters = [status ? "Status: " + (status==="PLANNED"?"Preplanned":"Paid") : "", member ? "Member: "+memberName(member):"", category ? "Category: " + category : "", subcategory ? "Subcategory: " + subcategory : "", majorPlanId ? "Major plan: "+majorPlanName(majorPlanId):"", recipient ? "Send to: " + recipient : "", account ? "From account: " + account : "", query ? "Search: " + $("expensePrintSearch").value.trim() : ""].filter(Boolean);
  const filterLine = appliedFilters.length ? '<p class="filters">'+h(appliedFilters.join(" · "))+'</p>' : "";
  const densityOptions = '<option value="density-comfortable"'+(density==="comfortable"?' selected':'')+'>Comfortable</option><option value="density-compact"'+(density==="compact"?' selected':'')+'>Compact</option><option value="density-minimum"'+(density==="minimum"?' selected':'')+'>Minimum width</option>';
  const reportResizeScript = "<script>(function(){var table=document.getElementById('expenseReportTable'),cols=Array.from(table.querySelectorAll('col')),drag=null,presets={comfortable:[45,120,110,100,145,135,135,165,140,140,165,300],compact:[38,100,92,85,120,115,115,140,115,115,145,250],minimum:[32,82,78,72,98,95,95,115,95,95,120,205]};function applyWidths(widths){var total=0;cols.forEach(function(col,i){var width=Math.max(32,Math.min(620,Number(widths[i])||100));col.style.width=width+'px';total+=width;});table.style.width=total+'px';}window.setReportDensity=function(value){var name=String(value).replace('density-','');document.body.className='density-'+name;applyWidths(presets[name]||presets.comfortable);};document.addEventListener('pointerdown',function(event){var handle=event.target.closest('.report-resizer');if(!handle)return;event.preventDefault();var index=Number(handle.dataset.col);drag={index:index,startX:event.clientX,startWidth:parseFloat(cols[index].style.width)||100,handle:handle};handle.classList.add('dragging');});document.addEventListener('pointermove',function(event){if(!drag)return;event.preventDefault();var widths=cols.map(function(col){return parseFloat(col.style.width)||100;});widths[drag.index]=drag.startWidth+event.clientX-drag.startX;applyWidths(widths);});document.addEventListener('pointerup',function(){if(!drag)return;drag.handle.classList.remove('dragging');drag=null;});window.setReportDensity('density-"+density+"');})();<\/script>";
  const rows = items.map(function (item,index) {
    return "<tr class='"+h(item.status.toLowerCase())+"'><td class='serial'>"+(index+1)+"</td><td class='number'>"+h(money(item.amount))+"</td><td>"+h(formatDate(item.date))+"</td><td>"+h(item.status==="PLANNED"?"Preplanned":"Paid")+"</td><td>"+h(memberName(expenseMemberId(item)))+"</td><td>"+h(item.category)+"</td><td>"+h(item.subcategory)+"</td><td>"+h(majorPlanName(item.majorPlanId)||"—")+"</td><td>"+h(majorPlanPhaseName(item.majorPlanPhaseId)||"—")+"</td><td><strong>"+h(item.sentTo)+"</strong></td><td>"+h(item.fromAccount)+"</td><td class='reason'>"+h(item.reason)+"</td></tr>";
  }).join("");
  const reportWindow = window.open("", "familyExpenseReport", "width=1150,height=820");
  if (!reportWindow) return toast("Allow pop-ups for this page to view or print the selected expenditure.", "error");
  const autoPrintScript = autoPrint ? "<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},200)};<\/script>" : "";
  reportWindow.document.open();
  reportWindow.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Expenditure "+h(from)+" to "+h(to)+"</title><style>"+
    "@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#25243b;background:#f5f3fb;font:12px Arial,sans-serif}.report{max-width:1400px;margin:0 auto;padding:24px;background:white;min-height:100vh;overflow:auto}.screen-actions{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:-12px -12px 18px;padding:10px;background:rgba(255,255,255,.94);border-bottom:1px solid #e5e2ee}.screen-actions label{display:flex;align-items:center;gap:6px;color:#55566d;font-size:11px;font-weight:700}.screen-actions select,.screen-actions button{border:0;border-radius:9px;padding:9px 12px;font-weight:700}.screen-actions select{background:#f1eff7}.screen-actions button{cursor:pointer}.screen-actions .print{color:white;background:#6752c7}.screen-actions .close{color:#4d4e67;background:#efedf5}h1{margin:0 0 5px;font-size:24px}.family{color:#6752c7;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.period{margin:0;color:#66687d}.filters{margin:5px 0 0;color:#5f537f;font-size:11px;font-weight:700}.summary{display:flex;gap:14px;margin:16px 0 8px;padding:11px 14px;border:1px solid #dedbe9;border-radius:10px;background:#f7f5ff;font-weight:700}.summary strong{color:#4b389e}.member-breakdown{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.member-breakdown span{padding:6px 9px;border:1px solid #dfdbea;border-radius:8px;background:#fff}.member-breakdown b,.member-breakdown small{display:block}.member-breakdown b{font-size:9px}.member-breakdown small{margin-top:2px;color:#68677b;font-size:8px}table{border-collapse:collapse;table-layout:fixed}th,td{padding:8px 7px;border:1px solid #dddce7;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{position:relative;color:#3e3a62;background:#e9e4fb;font-size:10px;text-transform:uppercase}tbody tr:nth-child(odd){background:#fff}tbody tr:nth-child(even){background:#edf6ff}tbody tr.planned{background:#fff8dc}.serial{text-align:center}.number{text-align:right;font-variant-numeric:tabular-nums}.reason{line-height:1.4}.report-resizer{position:absolute;right:-5px;top:0;width:11px;height:100%;z-index:2;cursor:col-resize;touch-action:none}.report-resizer:after{content:'';position:absolute;left:5px;top:20%;width:2px;height:60%;background:#b7afd0;border-radius:2px}.report-resizer:hover:after,.report-resizer.dragging:after{background:#6752c7}.density-compact{font-size:10px}.density-compact th,.density-compact td{padding:5px 4px}.density-minimum{font-size:8px}.density-minimum th,.density-minimum td{padding:3px;line-height:1.15}.density-minimum th{font-size:8px}.foot{margin-top:12px;color:#858699;font-size:10px;text-align:right}@media print{body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{max-width:none;padding:0;overflow:visible}.screen-actions{display:none}.report-resizer{display:none}}"+
    "</style></head><body class='density-"+h(density)+"'><main class='report'><div class='screen-actions'><label>Column width <select onchange=\"setReportDensity(this.value)\">"+densityOptions+"</select></label><button class='close' type='button' onclick='window.close()'>Close view</button><button class='print' type='button' onclick='window.print()'>Print this report</button></div><div class='family'>"+h(familyName)+"</div><h1>Expenditure statement</h1><p class='period'>From "+h(formatDate(from))+" to "+h(formatDate(to))+"</p>"+filterLine+"<div class='summary'><span>"+h(plural(items.length,"entry","entries"))+"</span><span>Paid: <strong>"+h(money(paidTotal))+"</strong></span>"+(plannedTotal?"<span>Preplanned: <strong>"+h(money(plannedTotal))+"</strong></span>":"")+"</div><div class='member-breakdown'>"+reportMemberSummary+"</div><table id='expenseReportTable'><colgroup>"+Array(12).fill("<col>").join("")+"</colgroup><thead><tr>"+["Sl.","Amt (Rs.)","Date","Status","Member","Category","Subcategory","Major plan","Phase","Send to","From Acct","Reason"].map(function(label,index){return "<th>"+h(label)+"<span class='report-resizer' data-col='"+index+"'></span></th>";}).join("")+"</tr></thead><tbody>"+rows+"</tbody></table><p class='foot'>Prepared "+h(new Date().toLocaleString("en-IN"))+" · FE v"+h(FRONTEND_VERSION)+" · BE v"+h(state.data.backendVersion||state.backendVersion||"—")+"</p></main>"+reportResizeScript+autoPrintScript+"</body></html>");
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
  const calendarSystem=$("importantDateCalendarSystem").value;
  const sakaDate=sakaIso($("importantDateSakaYear").value,$("importantDateSakaMonth").value,$("importantDateSakaDay").value);
  const eventDate=calendarSystem==="SAKA"?sakaToGregorian($("importantDateSakaYear").value,$("importantDateSakaMonth").value,$("importantDateSakaDay").value,false):calendarSystem==="ODIA"?$("importantDateOdiaEquivalent").value:$("importantDateValue").value;
  if(!eventDate)return toast("Enter a valid date in the selected calendar.","error");
  const id=$("importantDateId").value;
  const payload={
    id:id, title:$("importantDateTitle").value.trim(), occasionLabel:$("importantDateOccasion").value.trim(), eventDate:eventDate,
    calendarSystem:calendarSystem, calendarDate:sakaDate, reminderBasis:$("importantDateReminderBasis").value,
    odiaYear:$("importantDateOdiaYear").value.trim(), odiaMonth:$("importantDateOdiaMonth").value, odiaPaksha:$("importantDateOdiaPaksha").value, odiaTithi:$("importantDateOdiaTithi").value,
    eventType:$("importantDateType").value, repeatYearly:$("importantDateRepeat").checked,
    remindDays:$("importantDateRemind").value, recipientIds:recipients.join(","), notes:$("importantDateNotes").value.trim()
  };
  showLoading(state.pendingImportantDatePhoto?"Saving reminder and photo to Google Drive…":"Saving reminder…");
  try {
    let browserOdiaOccurrence="";
    if(isAdmin()&&calendarSystem!=="ODIA"&&reminderBasisIncludes(payload.reminderBasis,"ODIA")){
      $("loadingText").textContent="Identifying the Bhubaneswar sunrise tithi…";
      try {
        const panchangCache={},derived=await deriveBrowserOdiaTithi(eventDate,panchangCache);
        payload.autoOdiaPaksha=derived.odiaPaksha; payload.autoOdiaTithi=derived.odiaTithi;
        if(payload.repeatYearly)browserOdiaOccurrence=await resolveBrowserOdiaOccurrence(eventDate,derived.odiaPaksha,derived.odiaTithi,panchangCache);
      } catch(browserLookupError) {
        console.warn("Browser Panchang fallback unavailable; the backend will try.",browserLookupError);
      }
      $("loadingText").textContent=state.pendingImportantDatePhoto?"Saving reminder and photo to Google Drive…":"Saving reminder…";
    }
    const saved=await api(id?"updateImportantDate":"createImportantDate",payload),savedId=saved.id;
    let odiaMappingWarning="",photoWarning="";
    if(browserOdiaOccurrence){
      try { await api("saveAutomaticOdiaReminderMapping",{dateId:savedId,gregorianDate:browserOdiaOccurrence}); }
      catch(mappingError){ odiaMappingWarning="The reminder was saved, but its next Odia occurrence could not be cached. Use Odia years to add it manually."; console.warn(mappingError); }
    }
    try {
      if(isAdmin()&&state.removeImportantDatePhoto&&id)await api("deleteImportantDatePhoto",{id:savedId});
      if(isAdmin()&&state.pendingImportantDatePhoto)await api("uploadImportantDatePhoto",{id:savedId,fileName:state.pendingImportantDatePhoto.name,fullData:state.pendingImportantDatePhoto.fullData,thumbData:state.pendingImportantDatePhoto.thumbData});
    } catch(photoError) { photoWarning="The reminder was saved, but the photo could not be stored. Edit this reminder and try the photo again."; console.warn(photoError); }
    if($("dateDialog").open)$("dateDialog").close();
    await refreshData(); toast("Reminder saved for " + reminderBasisLabel(payload.reminderBasis) + ".","success");
    if(odiaMappingWarning)toast(odiaMappingWarning,"error");
    if(photoWarning)toast(photoWarning,"error");
  } catch(error){if(!handleSessionError(error))toast(friendlyApiError(error),"error");}
  finally{hideLoading();}
}

async function saveStickyNote(event) {
  event.preventDefault();
  if (!canWriteStickyNotes()) return toast("Your administrator has not allowed sticky-note writing for your account.", "error");
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
  if (!canWriteStickyNotes()) return toast("Your administrator has not allowed sticky-note writing for your account.", "error");
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
    state.stickyView = "active"; renderStickyNotes();
    const addPanel = $("stickyQuickForm").closest("details"); if (addPanel) addPanel.open = false;
  }
}

function prepareStickyNoteDialog(noteType) {
  if (!canWriteStickyNotes()) return toast("Your administrator has not allowed sticky-note writing for your account.", "error");
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
  const payload = { id: id, name: $("memberName").value.trim(), username: $("memberUsername").value.trim(), email: $("memberEmail").value.trim(), role: $("memberRole").value, password: $("memberPassword").value, active: $("memberActive").checked, permissions: permissions };
  if (!id && !payload.password) return toast("Enter a password for the new member.", "error");
  if (id && id === state.data.user.id && payload.password) {
    showLoading("Updating your administrator password…");
    try { await api("saveMember", payload); if ($("memberDialog").open) $("memberDialog").close(); window.alert("Your password was updated. Please sign in again with the new password."); clearLocalSession(); showLogin(); }
    catch (error) { if (!handleSessionError(error)) toast(error.message, "error"); }
    finally { hideLoading(); }
    return;
  }
  await mutate("saveMember", payload, id ? "Member updated." : "Family member added.", "memberDialog");
}
function openMemberPhotoDialog(id) {
  const member=(state.data.adminMembers||[]).find(function(item){return item.id===id;});
  if(!member||!isAdmin())return;
  $("memberPhotoForm").reset(); state.pendingMemberPhoto=null; $("photoMemberId").value=member.id; $("photoMemberName").textContent=member.name+" (@"+member.username+")";
  $("memberPhotoCurrent").innerHTML=member.photoThumbData?'<img src="'+h(member.photoThumbData)+'" alt="'+h(member.name)+'">':'<span>'+h(String(member.name||"?").charAt(0).toUpperCase())+'</span>';
  $("deleteMemberPhoto").classList.toggle("hidden",!member.photoThumbData); openDialog("memberPhotoDialog");
}
async function saveMemberPhoto(event) {
  event.preventDefault();
  if(!state.pendingMemberPhoto)return toast("Choose a profile photo first.","error");
  await mutate("uploadMemberPhoto",{id:$("photoMemberId").value,fileName:state.pendingMemberPhoto.name,fullData:state.pendingMemberPhoto.fullData,thumbData:state.pendingMemberPhoto.thumbData},"Member photo updated.","memberPhotoDialog","Saving member photo to Google Drive…");
}
async function deleteMemberPhoto() {
  const id=$("photoMemberId").value;
  if(!id||!window.confirm("Delete this member’s profile photo? The Drive file will be moved to Trash."))return;
  await mutate("deleteMemberPhoto",{id:id},"Member photo removed.","memberPhotoDialog","Removing member photo…");
}
async function saveSettings(event) {
  event.preventDefault();
  const result = await mutate("saveSettings", {
    familyName: $("settingFamilyName").value.trim(),
    currency: $("settingCurrency").value,
    timezone: $("settingTimezone").value.trim(),
    calendarDisplayMode: $("settingCalendarDisplayMode").value,
    odiaFestivalAutoEnabled: $("settingOdiaFestivalAutoEnabled").checked,
    odiaPersonalAutoEnabled: $("settingOdiaPersonalAutoEnabled").checked,
    dashboardClockHighlight: safeClockHighlight($("settingDashboardClockHighlight").value),
    parentsPortraitCaption: $("settingParentsPortraitCaption").value.trim(),
    memoryPhotoLimit: Number($("settingMemoryPhotoLimit").value),
    memoryUploadPolicy: $("settingMemoryUploadPolicy").value,
    memoryPrintPages: Number($("settingMemoryPrintPages").value),
    sessionIdleMinutes: Number($("settingSessionIdleMinutes").value),
    monthlyExpenseBudget: Number($("settingMonthlyExpenseBudget").value)||0,
    expenseSettlementEnabled: $("settingExpenseSettlementEnabled").checked
  }, "Family settings updated.");
  if (result) resetIdleTimer();
}
async function refreshOdiaCalendarNow() {
  const result=await mutate("refreshOdiaFestivals",{},"Odia calendar refreshed.",null,"Downloading and calculating Odia calendar dates…");
  if(!result)return;
  const festival=result.festival&&result.festival.count!==undefined?result.festival.count:state.data.odiaFestivals.length;
  const personal=result.personal&&result.personal.created!==undefined?result.personal.created:0;
  if(result.errors&&result.errors.length)toast("Refresh completed with cached fallback: "+result.errors.join(" "),"error");
  else toast("Odia calendar refreshed: "+festival+" public festivals · "+personal+" personal occurrence"+(personal===1?"":"s")+" added.","success");
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
  } catch (error) { if (!handleSessionError(error)) toast(friendlyApiError(error), "error"); return null; }
  finally { hideLoading(); }
}
async function refreshData() { state.data = normalizeBootstrapData(await api("bootstrap", {})); renderVersionLabels(); renderAll(); }
async function confirmDelete(action, id, message) { if (window.confirm(message)) await mutate(action, { id: id }, "Deleted."); }

function editExpense(id) {
  const item = state.data.expenses.find(function (x) { return x.id === id; }); if (!item) return;
  const expense = normalizeExpense(item); prepareNewDialog("expenseDialog"); $("expenseId").value = expense.id; fillMemberSelect($("expenseMember"), expenseMemberId(expense), true); $("expenseEntryType").value = expense.status === "PLANNED" ? "PREPLANNED" : (expense.entryType === "PREPLANNED" ? "PREPLANNED" : "REGULAR"); $("expenseDate").value = expense.date; $("expenseAmount").value = expense.amount; fillExpenseCategorySelect($("expenseCategory"), expense.category); fillExpenseSubcategorySelect($("expenseSubcategory"), expense.category, expense.subcategory); fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),expense.majorPlanId||"",expense.majorPlanPhaseId||"",true); $("expenseSendTo").value = expense.sentTo; $("expenseFromAccount").value = expense.fromAccount; $("expenseReason").value = expense.reason; resetExpenseSharingForm(expense); $("expenseDialogTitle").textContent = "Edit expenditure"; syncExpenseEntryType(); openDialog("expenseDialog");
}
function openPlannedPayment(id) {
  const item = state.data.expenses.find(function (x) { return x.id === id; }); if (!item) return;
  const expense = normalizeExpense(item); prepareNewDialog("expenseDialog"); $("expenseMarkPaidId").value = expense.id; fillMemberSelect($("expenseMember"), expenseMemberId(expense), true); $("expenseEntryType").value = "REGULAR"; $("expenseEntryType").disabled = true; $("expenseDate").value = todayIso(); $("expenseAmount").value = expense.amount; fillExpenseCategorySelect($("expenseCategory"), expense.category); fillExpenseSubcategorySelect($("expenseSubcategory"), expense.category, expense.subcategory); fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),expense.majorPlanId||"",expense.majorPlanPhaseId||"",true); $("expenseSendTo").value = expense.sentTo; $("expenseFromAccount").value = expense.fromAccount; $("expenseReason").value = expense.reason; resetExpenseSharingForm(expense); $("expenseDialogTitle").textContent = "Mark preplanned expenditure as paid"; $("expenseRecurringNote").textContent = "Planned for " + formatDate(expense.date) + ". Confirm the actual payment date and amount."; $("expenseRecurringNote").classList.remove("hidden"); syncExpenseEntryType(); openDialog("expenseDialog");
}
function openRecurringPayment(id) {
  const item = state.data.recurringExpenses.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("expenseDialog"); $("expenseRecurringId").value = item.id; fillMemberSelect($("expenseMember"), expenseMemberId(item), true); $("expenseEntryType").value = "REGULAR"; $("expenseEntryType").disabled = true; $("expenseDate").value = todayIso(); $("expenseAmount").value = Number(item.estimatedAmount || 0) || ""; fillExpenseCategorySelect($("expenseCategory"), item.category); fillExpenseSubcategorySelect($("expenseSubcategory"), item.category, item.subcategory || "General"); fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),item.majorPlanId||"",item.majorPlanPhaseId||"",true); $("expenseSendTo").value = item.sentTo; $("expenseFromAccount").value = item.fromAccount; $("expenseReason").value = item.reason; resetExpenseSharingForm(item); $("expenseDialogTitle").textContent = "Mark “" + item.title + "” as paid"; $("expenseRecurringNote").textContent = "Due " + formatDate(item.nextDueDate) + ". You can change the actual amount or payment details before saving."; $("expenseRecurringNote").classList.remove("hidden"); syncExpenseEntryType(); openDialog("expenseDialog");
}
function editRecurringExpense(id) {
  const item = state.data.recurringExpenses.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("recurringExpenseDialog"); $("recurringExpenseId").value = item.id; fillMemberSelect($("recurringExpenseMember"), expenseMemberId(item), true); $("recurringExpenseTitle").value = item.title; $("recurringExpenseAmount").value = Number(item.estimatedAmount || 0) || ""; $("recurringExpenseFrequency").value = item.frequency; $("recurringExpenseIntervalMonths").value=item.intervalMonths||1; syncRecurringFrequency(); $("recurringExpenseDueDate").value = item.nextDueDate; fillExpenseCategorySelect($("recurringExpenseCategory"), item.category); fillExpenseSubcategorySelect($("recurringExpenseSubcategory"), item.category, item.subcategory || "General"); fillMajorPlanLinkSelects($("recurringExpenseMajorPlan"),$("recurringExpenseMajorPlanPhase"),item.majorPlanId||"",item.majorPlanPhaseId||"",true); $("recurringExpenseSendTo").value = item.sentTo; $("recurringExpenseFromAccount").value = item.fromAccount; $("recurringExpenseReason").value = item.reason; $("recurringExpenseRemind").value = item.remindDays || "7,1,0";
  const ids = String(item.recipientIds || "ALL").split(","); const everyone = ids.indexOf("ALL") >= 0; $("recurringNotifyEveryone").checked = everyone; $("recurringRecipientChecks").classList.toggle("hidden", everyone); renderRecurringRecipientChecks(ids); $("recurringExpenseDialogTitle").textContent = "Edit regular payment"; openDialog("recurringExpenseDialog");
}
function openMajorPlanExpense(id, planned, phaseId) {
  const plan=majorPlanById(id); if(!plan||String(plan.status||"ACTIVE").toUpperCase()!=="ACTIVE")return toast("Reopen this major plan before adding expenditure.","error");
  prepareNewDialog("expenseDialog"); fillMemberSelect($("expenseMember"), plan.ownerId||"ALL", true); $("expenseEntryType").value=planned?"PREPLANNED":"REGULAR"; fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),plan.id,phaseId||"",false); syncExpenseEntryType(); $("expenseDialogTitle").textContent=(planned?"Add preplanned expenditure · ":"Add paid expenditure · ")+plan.name+(phaseId?" · "+majorPlanPhaseName(phaseId):""); openDialog("expenseDialog");
}
function editMajorPlan(id) {
  const plan=majorPlanById(id); if(!plan||!isAdmin())return;
  prepareNewDialog("majorPlanDialog"); $("majorPlanId").value=plan.id; $("majorPlanName").value=plan.name; $("majorPlanAmount").value=plan.proposedAmount; $("majorPlanStartDate").value=plan.startDate; $("majorPlanTargetDate").value=plan.targetDate; fillMemberSelect($("majorPlanOwner"),plan.ownerId||"ALL",true); $("majorPlanNotes").value=plan.notes||""; $("majorPlanPhaseList").innerHTML=""; majorPlanPhases(plan.id,true).forEach(addMajorPlanPhaseRow); $("majorPlanDialogTitle").textContent="Edit major plan"; updateMajorPlanPhaseBudgetSummary(); openDialog("majorPlanDialog");
}
async function setMajorPlanStatus(id,status,message) { if(!isAdmin()||!window.confirm(message))return; await mutate("setMajorPlanStatus",{id:id,status:status},status==="COMPLETED"?"Major plan completed and preserved in history.":status==="ARCHIVED"?"Major plan archived.":"Major plan reopened."); }
function editIncome(id) {
  const item = state.data.income.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("incomeDialog"); $("incomeId").value = item.id; $("incomeDate").value = item.date; $("incomeAmount").value = item.amount; $("incomeSource").value = item.source; $("incomeCategory").value = item.category; fillMemberSelect($("incomeReceivedBy"), item.receivedBy); $("incomeMode").value = item.receivingMode; $("incomeDialogTitle").textContent = "Edit income"; openDialog("incomeDialog");
}
function openContribution(id) { const target = state.data.targets.find(function (x) { return x.id === id; }); if (!target) return; prepareNewDialog("contributionDialog"); $("contributionTargetId").value = id; $("contributionTitle").textContent = "Add to “" + target.title + "”"; openDialog("contributionDialog"); }
function editImportantDate(id) {
  const item = state.data.importantDates.find(function (x) { return x.id === id; }); if (!item) return;
  prepareNewDialog("dateDialog"); $("importantDateId").value = item.id; $("importantDateTitle").value = item.title; $("importantDateOccasion").value=item.occasionLabel||""; $("importantDateValue").value = item.eventDate; $("importantDateCalendarSystem").value=["GREGORIAN","SAKA","ODIA"].includes(item.calendarSystem)?item.calendarSystem:"GREGORIAN"; const saka=item.calendarDate?{year:Number(String(item.calendarDate).slice(0,4)),month:Number(String(item.calendarDate).slice(5,7)),day:Number(String(item.calendarDate).slice(8,10))}:gregorianToSaka(item.eventDate); if(saka){$("importantDateSakaYear").value=saka.year;$("importantDateSakaMonth").value=String(saka.month);$("importantDateSakaDay").value=saka.day;} $("importantDateOdiaYear").value=item.odiaYear||""; $("importantDateOdiaMonth").value=item.odiaMonth||"BAISAKHA"; $("importantDateOdiaPaksha").value=item.odiaPaksha||"SHUKLA"; $("importantDateOdiaTithi").value=item.odiaTithi||1; $("importantDateOdiaEquivalent").value=item.eventDate; syncImportantDateCalendar(); const basis=String(item.reminderBasis||"").toUpperCase()==="BOTH"?"GREGORIAN_SAKA":String(item.reminderBasis||item.calendarSystem||"GREGORIAN").toUpperCase(); $("importantDateReminderBasis").value=["GREGORIAN","SAKA","ODIA","GREGORIAN_SAKA","GREGORIAN_ODIA","SAKA_ODIA","ALL"].includes(basis)?basis:"GREGORIAN"; $("importantDateType").value = item.eventType; $("importantDateRepeat").checked = item.repeatYearly; $("importantDateRemind").value = item.remindDays; $("importantDateNotes").value = item.notes || ""; state.pendingImportantDatePhoto=null; state.removeImportantDatePhoto=false; setImportantDatePhotoPreview(item.photoThumbData||null); $("removeImportantDatePhoto").classList.toggle("hidden",!item.photoThumbData); $("importantDateAdminControls").classList.toggle("hidden",!isAdmin());
  const ids = String(item.recipientIds || "").split(","); const everyone = ids.indexOf("ALL") >= 0; $("notifyEveryone").checked = everyone; $("recipientChecks").classList.toggle("hidden", everyone); renderRecipientChecks(ids); $("dateDialogTitle").textContent = "Edit reminder"; openDialog("dateDialog");
}
function openOdiaMappingDialog(id) {
  if(!isAdmin())return;
  const item=state.data.importantDates.find(function(entry){return entry.id===id;}); if(!item)return;
  state.odiaMappingDateId=id; $("odiaMappingForm").reset(); $("odiaMappingId").value=""; $("odiaMappingYear").value=""; $("odiaMappingGregorianDate").value=""; $("odiaMappingSourceNote").value="";
  $("odiaMappingReminderTitle").textContent=item.occasionLabel||item.title; $("odiaMappingPanjikaLabel").textContent=formatOdiaPanjika(item);
  renderOdiaMappingList(item); openDialog("odiaMappingDialog");
}
function renderOdiaMappingList(item) {
  const mappings=(item.odiaMappings||[]).slice().sort(function(a,b){return String(a.gregorianDate).localeCompare(String(b.gregorianDate));});
  $("odiaMappingList").innerHTML=mappings.length?mappings.map(function(mapping){return '<div class="odia-mapping-row"><span><strong>'+(mapping.odiaYear?'Odia Sal '+h(mapping.odiaYear):'Automatic Odia occurrence')+'</strong><small>'+h(formatEnglishDate(mapping.gregorianDate))+' · '+h(formatOdiaScriptDate(mapping.gregorianDate))+(mapping.sourceNote?' · '+h(mapping.sourceNote):'')+'</small></span><button class="danger-button" type="button" data-action="delete-odia-mapping" data-id="'+h(mapping.id)+'">Delete</button></div>';}).join(""):'<p class="empty-state compact-empty">No yearly Odia dates saved yet.</p>';
}
async function saveOdiaReminderMapping(event) {
  event.preventDefault(); if(!state.odiaMappingDateId)return;
  const result=await mutate("saveOdiaReminderMapping",{id:$("odiaMappingId").value,dateId:state.odiaMappingDateId,odiaYear:$("odiaMappingYear").value.trim(),gregorianDate:$("odiaMappingGregorianDate").value,sourceNote:$("odiaMappingSourceNote").value.trim()},"Verified Odia Panjika date saved.",null,"Saving verified Panjika date…");
  if(result){const item=state.data.importantDates.find(function(entry){return entry.id===state.odiaMappingDateId;});if(item)renderOdiaMappingList(item);$("odiaMappingForm").reset();}
}
async function deleteOdiaReminderMapping(id) {
  if(!window.confirm("Delete this verified Odia Panjika year mapping?"))return;
  const result=await mutate("deleteOdiaReminderMapping",{id:id},"Odia Panjika mapping deleted.",null,"Deleting mapping…");
  if(result){const item=state.data.importantDates.find(function(entry){return entry.id===state.odiaMappingDateId;});if(item)renderOdiaMappingList(item);}
}
function editStickyNote(id) {
  if (!canWriteStickyNotes()) return toast("Your administrator has not allowed sticky-note writing for your account.", "error");
  const item = state.data.stickyNotes.find(function (note) { return note.id === id; }); if (!item) return;
  $("stickyNoteForm").reset(); $("stickyNoteId").value = item.id; $("stickyNoteType").value = item.noteType; configureStickyTypeChoices();
  $("stickyNoteTitle").value = item.title; $("stickyNoteBody").value = item.body; $("stickyNoteDueDate").value = item.dueDate || ""; setStickyColour(item.color);
  $("stickyNoteDialogTitle").textContent = "Edit " + (item.noteType === "REMINDER" ? "reminder" : "target") + " note"; openDialog("stickyNoteDialog");
}
async function completeStickyNote(id) {
  if (!canWriteStickyNotes()) return toast("Your administrator has not allowed sticky-note writing for your account.", "error");
  if (!window.confirm("Mark this sticky note complete? It will move to the separate Sticky Note Diary sheet.")) return;
  state.stickySideOpenId = "";
  await mutate("completeStickyNote", { id: id }, "Completed and moved to the Sticky Note Diary sheet.");
}
function changeStickyLayout(id, change) {
  const note = state.data.stickyNotes.find(function (item) { return item.id === id; }); if (!note) return;
  if (change === "collapse" && note.pinned) return toast("This note is pinned open. Unpin it before collapsing.", "error");
  if (change === "collapse") note.collapsed = !note.collapsed;
  if (change === "pin") { note.pinned = !note.pinned; note.collapsed = false; state.stickySideOpenId = ""; }
  if (change === "grow") { note.width = Math.min(520, Number(note.width || 280) + 40); note.height = Math.min(500, Number(note.height || 220) + 35); }
  if (change === "shrink") { note.width = Math.max(220, Number(note.width || 280) - 40); note.height = Math.max(160, Number(note.height || 220) - 35); }
  renderStickyNotes();
  queueStickyLayoutSave(note);
  if (change === "pin") { toast(note.pinned ? "Pinned open above the dashboard. Close the panel, then drag Move note to reposition it." : "Unpinned and returned to the right-side sticky panel.", "success"); }
}

function openSideSticky(id) {
  state.stickySideOpenId = id;
  renderStickyPinnedLayer();
  scheduleSideStickyCollapse();
}

function closeSideSticky() {
  clearTimeout(state.stickySideTimer); state.stickySideOpenId = ""; renderStickyPinnedLayer();
}

function scheduleSideStickyCollapse(delay) {
  clearTimeout(state.stickySideTimer);
  state.stickySideTimer = setTimeout(function () { state.stickySideOpenId = ""; renderStickyPinnedLayer(); }, Number(delay) || 8000);
}

function autoFitStickyNote(id) {
  const note = state.data.stickyNotes.find(function (item) { return item.id === id; }); if (!note) return;
  const lines = String(note.body || "").split(/\n/); const longest = Math.max(String(note.title || "").length, 20, lines.reduce(function(max,line){return Math.max(max,line.length);},0));
  note.width = Math.max(250, Math.min(520, 150 + longest * 6));
  note.height = Math.max(180, Math.min(500, 150 + lines.length * 18 + Math.ceil(String(note.body||"").length / Math.max(24, Math.floor((note.width-45)/7))) * 15));
  note.collapsed = false; renderStickyNotes(); queueStickyLayoutSave(note); toast("Sticky note auto-fitted to its content.", "success");
}
function queueStickyLayoutSave(note) {
  const oldTimer = state.stickyLayoutTimers.get(note.id); if (oldTimer) clearTimeout(oldTimer);
  state.stickyLayoutTimers.set(note.id, setTimeout(async function () {
    state.stickyLayoutTimers.delete(note.id);
    try {
      await api("updateStickyLayout", { id: note.id, positionX: note.positionX, positionY: note.positionY, width: note.width, height: note.height, collapsed: !!note.collapsed, pinned: !!note.pinned });
    } catch (error) { if (!handleSessionError(error)) toast(friendlyApiError(error), "error"); }
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
  prepareNewDialog("memberDialog"); $("memberId").value = item.id; $("memberName").value = item.name; $("memberUsername").value = item.username; $("memberEmail").value = item.email || ""; $("memberRole").value = item.role; setMemberPermissions(item.permissions || []); syncMemberAccessRole(); $("memberActive").checked = item.active; $("memberPassword").value = ""; $("memberPassword").required = false; $("memberDialogTitle").textContent = "Edit family member"; openDialog("memberDialog");
}
function setMemberPermissions(permissions) { all("input[name='memberPermission']").forEach(function (el) { el.checked = permissions.indexOf(el.value) >= 0; }); }
function syncMemberAccessRole() { const admin = $("memberRole").value === "ADMIN"; if (admin) setMemberPermissions(["EXPENSES","INCOME","TARGETS","DATES","CALENDAR","PHOTOS","EXPERIENCES","DIARY","STICKY_WRITE"]); all("input[name='memberPermission']").forEach(function (el) { el.disabled = admin; }); }
function openMemberPasswordDialog(id) {
  const member = (state.data.adminMembers || []).find(function (item) { return item.id === id; });
  if (!member) return;
  $("memberPasswordForm").reset();
  $("passwordMemberId").value = member.id;
  $("passwordMemberName").textContent = member.name + " (@" + member.username + ")";
  $("adminMemberPassword").type = "password";
  $("confirmAdminMemberPassword").type = "password";
  $("toggleAdminMemberPassword").textContent = "Show password";
  openDialog("memberPasswordDialog");
  setTimeout(function () { $("adminMemberPassword").focus(); }, 50);
}
function toggleAdminMemberPasswordVisibility() {
  const show = $("adminMemberPassword").type === "password";
  $("adminMemberPassword").type = show ? "text" : "password";
  $("confirmAdminMemberPassword").type = show ? "text" : "password";
  $("toggleAdminMemberPassword").textContent = show ? "Hide password" : "Show password";
}
function generateAdminMemberPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);
  let password = "F" + Array.from(values, function (value) { return alphabet[value % alphabet.length]; }).join("") + "7";
  $("adminMemberPassword").value = password;
  $("confirmAdminMemberPassword").value = password;
  $("adminMemberPassword").type = "text";
  $("confirmAdminMemberPassword").type = "text";
  $("toggleAdminMemberPassword").textContent = "Hide password";
}
async function saveAdminMemberPassword(event) {
  event.preventDefault();
  const id = $("passwordMemberId").value;
  const password = $("adminMemberPassword").value;
  if (password !== $("confirmAdminMemberPassword").value) return toast("The two passwords do not match.", "error");
  showLoading("Changing member password…");
  try {
    await api("setMemberPassword", { id: id, password: password });
    if ($("memberPasswordDialog").open) $("memberPasswordDialog").close();
    if (id === state.data.user.id) {
      window.alert("Your administrator password was changed. Please sign in again with the new password.");
      clearLocalSession();
      showLogin();
    } else {
      await refreshData();
      toast("Password changed. The member’s old password and sessions are no longer valid.", "success");
    }
  } catch (error) {
    if (!handleSessionError(error)) toast(error.message, "error");
  } finally { hideLoading(); }
}
async function resetMemberPassword(id) {
  if (!window.confirm("Generate a new temporary password for this member? Their old password will stop working and all existing sessions will be signed out.")) return;
  showLoading("Generating a temporary password…");
  try { const result = await api("resetMemberPassword", { id: id }); window.alert("Temporary password: " + result.newPassword + "\n\nPlease give this password privately to the family member."); if (id === state.data.user.id) { clearLocalSession(); showLogin(); } else await refreshData(); }
  catch (error) { if (!handleSessionError(error)) toast(error.message, "error"); } finally { hideLoading(); }
}

function renderAll() {
  const settings = state.data.settings || {};
  applyDashboardClockTheme();
  startDashboardClock();
  document.title = (settings.familyName || "Our Family Hub") + " · Family Dashboard";
  $("sidebarFamilyName").textContent = settings.familyName || "Our Family Hub";
  $("loginFamilyName").textContent = settings.familyName || "Our Family Hub";
  $("userName").textContent = state.data.user.name;
  $("userRole").textContent = state.data.user.role === "ADMIN" ? "Administrator" : "Family member";
  $("userAvatar").innerHTML = state.data.user.photoThumbData?'<img src="'+h(state.data.user.photoThumbData)+'" alt="'+h(state.data.user.name)+'">':h(state.data.user.name.charAt(0).toUpperCase());
  $("adminNav").classList.toggle("hidden", !isAdmin());
  $("manageExpenseCategoriesQuick").classList.toggle("hidden", !isAdmin());
  $("createMajorPlan").classList.toggle("hidden", !isAdmin());
  if (!isAdmin() && state.view === "admin") goTo("home");
  applyAccessUI();
  populateFilters();
  renderView(state.view);
  renderStickyNotes();
}
function renderView(view) {
  if (!state.data) return;
  if (view === "home") renderHome();
  if (view === "expenses") { renderMajorPlans(); renderExpenses(); renderRecurringExpenses(); }
  if (view === "income") renderIncome();
  if (view === "targets") renderTargets();
  if (view === "dates") renderDates();
  if (view === "calendar") renderCalendar();
  if (view === "photos") renderPhotos();
  if (view === "experiences") renderExperiences();
  if (view === "diary") renderDiary();
  if (view === "admin" && isAdmin()) renderAdmin();
}
function applyAccessUI() {
  all("[data-module]").forEach(function (el) { el.classList.toggle("hidden", !hasModuleAccess(el.dataset.module)); });
  if (viewModules[state.view] && !hasModuleAccess(viewModules[state.view])) goTo("home");
  configureStickyTypeChoices();
  $("stickyAddPanel").classList.toggle("hidden", !canWriteStickyNotes());
  $("stickyReadOnlyNotice").classList.toggle("hidden", canWriteStickyNotes());
  if (!canUseStickyNotes()) { $("stickyBoard").classList.add("hidden"); $("stickyBoardShade").classList.add("hidden"); $("stickyLauncher").classList.add("hidden"); $("stickyPinnedLayer").classList.add("hidden"); }
  else if ($("stickyBoard").classList.contains("hidden")) { $("stickyLauncher").classList.remove("hidden"); scheduleStickyLauncherCollapse(4200); }
}
function populateFilters() {
  fillMemberFilter($("incomeMemberFilter")); fillMemberFilter($("diaryWriterFilter"));
  fillExpenseMemberFilter($("expenseMemberFilter"));
  const recipients = Array.from(new Set(state.data.expenses.map(function (x) { return normalizeExpense(x).sentTo; }).filter(Boolean))).sort();
  const accounts = Array.from(new Set(state.data.expenses.map(function (x) { return normalizeExpense(x).fromAccount; }).filter(Boolean))).sort();
  const categories = Array.from(new Set(activeExpenseCategories().map(function (category) { return category.name; }).concat(state.data.expenses.map(function (x) { return normalizeExpense(x).category; })).filter(Boolean)));
  const configuredSubcategories = activeExpenseCategories().reduce(function (list, category) { return list.concat((category.subcategories || []).filter(function (subcategory) { return subcategory.active !== false; }).map(function (subcategory) { return subcategory.name; })); }, []);
  const subcategories = Array.from(new Set(configuredSubcategories.concat(state.data.expenses.map(function (x) { return normalizeExpense(x).subcategory; })).filter(Boolean)));
  const incomeCats = Array.from(new Set(state.data.income.map(function (x) { return x.category; }))).sort();
  fillOptions($("expenseSendToFilter"), recipients, "All recipients"); fillOptions($("expenseAccountFilter"), accounts, "All accounts"); fillOptions($("expenseCategoryFilter"), categories, "All categories"); fillOptions($("expenseSubcategoryFilter"), subcategories, "All subcategories"); fillOptions($("incomeCategoryFilter"), incomeCats, "All categories");
  const currentPlanFilter=$("expenseMajorPlanFilter").value; $("expenseMajorPlanFilter").innerHTML='<option value="">All major plans</option>'+(state.data.majorPlans||[]).map(function(plan){return '<option value="'+h(plan.id)+'">'+h(plan.name)+(String(plan.status||"ACTIVE").toUpperCase()==="ARCHIVED"?' · Archived':'')+'</option>';}).join(""); if(majorPlanById(currentPlanFilter))$("expenseMajorPlanFilter").value=currentPlanFilter;
  fillExpenseCategorySelect($("expenseCategory"), $("expenseCategory").value); fillExpenseCategorySelect($("recurringExpenseCategory"), $("recurringExpenseCategory").value);
  fillMajorPlanLinkSelects($("expenseMajorPlan"),$("expenseMajorPlanPhase"),$("expenseMajorPlan").value,$("expenseMajorPlanPhase").value,false); fillMajorPlanLinkSelects($("recurringExpenseMajorPlan"),$("recurringExpenseMajorPlanPhase"),$("recurringExpenseMajorPlan").value,$("recurringExpenseMajorPlanPhase").value,false);
  fillMemberSelect($("incomeReceivedBy"), $("incomeReceivedBy").value || state.data.user.id); fillMemberSelect($("targetOwner"), $("targetOwner").value || state.data.user.id, true); fillMemberSelect($("expenseMember"), $("expenseMember").value || state.data.user.id, true); fillMemberSelect($("recurringExpenseMember"), $("recurringExpenseMember").value || state.data.user.id, true);
  renderRecipientChecks([]); renderRecurringRecipientChecks([]);
  const years = Array.from(new Set(state.data.experiences.map(function (x) { return String(x.experienceDate).slice(0,4); }))).filter(Boolean).sort().reverse(); const selectedYear = $("experienceYear").value; fillOptions($("experienceYear"), years, "All years"); $("experienceYear").value = years.indexOf(selectedYear) >= 0 ? selectedYear : "";
}
function fillOptions(select, values, allLabel) { const current = select.value; select.innerHTML = '<option value="">' + h(allLabel) + "</option>" + values.map(function (x) { return '<option value="' + h(x) + '">' + h(x) + "</option>"; }).join(""); if (values.indexOf(current) >= 0) select.value = current; }
function fillMemberSelect(select, selected, allowAll) { select.innerHTML = (allowAll ? '<option value="ALL">Whole family</option>' : "") + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = selected || (allowAll ? "ALL" : state.data.user.id); }
function fillMemberFilter(select) { const current = select.value; select.innerHTML = '<option value="">All family members</option>' + state.data.members.map(function (m) { return '<option value="' + h(m.id) + '">' + h(m.name) + "</option>"; }).join(""); select.value = current; }
function fillExpenseMemberFilter(select) { const current=select.value; select.innerHTML='<option value="">All members</option><option value="ALL">Whole family</option>'+state.data.members.map(function(m){return '<option value="'+h(m.id)+'">'+h(m.name)+'</option>';}).join(""); if(current==="ALL"||memberById(current))select.value=current; }
function renderRecipientChecks(selected) { if (!state.data) return; $("recipientChecks").innerHTML = state.data.members.map(function (m) { return '<label class="check-row"><input type="checkbox" name="dateRecipient" value="' + h(m.id) + '" ' + (selected.indexOf(m.id) >= 0 ? "checked" : "") + "> " + h(m.name) + "</label>"; }).join(""); }
function renderRecurringRecipientChecks(selected) { if (!state.data) return; $("recurringRecipientChecks").innerHTML = state.data.members.map(function (m) { return '<label class="check-row"><input type="checkbox" name="recurringRecipient" value="' + h(m.id) + '" ' + (selected.indexOf(m.id) >= 0 ? "checked" : "") + "> " + h(m.name) + "</label>"; }).join(""); }

function renderHome() {
  const prefix = currentMonth();
  const monthExpenses = state.data.expenses.map(normalizeExpense).filter(function (x) { return String(x.date).slice(0,7) === prefix && x.status === "PAID"; });
  const monthIncome = state.data.income.filter(function (x) { return String(x.date).slice(0,7) === prefix; });
  const expenseTotal = monthExpenses.reduce(function (sum,x) { return sum + Number(x.amount || 0); }, 0);
  const incomeTotal = monthIncome.reduce(function (sum,x) { return sum + Number(x.amount || 0); }, 0);
  const targetTotal = state.data.targets.reduce(function (sum,x) { return sum + Number(x.targetAmount || 0); }, 0);
  const targetSaved = state.data.targets.reduce(function (sum,x) { return sum + Number(x.currentAmount || 0); }, 0);
  const targetPct = targetTotal ? Math.min(100, Math.round(targetSaved / targetTotal * 100)) : 0;
  const upcoming = upcomingDates(30);
  const greetingParts = dateTimeParts(new Date()); let hour = Number(greetingParts.hour) || 0; if (String(greetingParts.dayPeriod).toUpperCase() === "PM" && hour < 12) hour += 12; if (String(greetingParts.dayPeriod).toUpperCase() === "AM" && hour === 12) hour = 0; const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  $("welcomeHeading").textContent = greeting + ", " + state.data.user.name.split(" ")[0] + ".";
  renderParentsPortrait();
  $("monthSpend").textContent = money(expenseTotal); $("monthExpenseCount").textContent = plural(monthExpenses.length, "entry", "entries");
  $("monthIncome").textContent = money(incomeTotal); $("monthIncomeCount").textContent = plural(monthIncome.length, "entry", "entries");
  $("targetProgress").textContent = targetPct + "%"; $("targetCaption").textContent = state.data.targets.length ? plural(state.data.targets.length, "active target") : "No active targets";
  $("reminderCount").textContent = plural(state.data.importantDates.length, "reminder"); $("upcomingCount").textContent = upcoming.length + " in next 30 days"; $("photoCount").textContent = plural(state.data.photos.length, "photo"); $("experienceCount").textContent = plural(state.data.experiences.length, "story", "stories");
  renderFamilyMembers(); renderCategoryBars(monthExpenses); renderUpcoming(upcoming); renderActivity();
}
function parentsPortraitCaption() { return String(state.data && state.data.settings && state.data.settings.parentsPortraitCaption || "Our roots, our strength."); }
function setParentsPortraitPreview(target, dataUrl) { target.innerHTML=dataUrl?'<img src="'+h(dataUrl)+'" alt="Parents portrait">':'<span>♡</span>'; }
function renderParentsPortrait() {
  const settings=state.data.settings||{},thumb=String(settings.parentsPortraitThumbData||"");
  setParentsPortraitPreview($("parentsPortraitImage"),thumb);
  $("parentsPortraitCard").classList.toggle("has-photo",!!thumb);
  $("parentsPortraitCaption").textContent=parentsPortraitCaption();
}
function renderFamilyMembers() { const members=state.data.members||[]; $("homeMemberCount").textContent=plural(members.length,"member"); $("homeMemberList").innerHTML=members.map(function(member){return '<span class="family-chip">'+memberAvatarMarkup(member.id,"small")+'<span>'+h(member.name||"Family member")+'</span></span>';}).join(""); }
function renderCategoryBars(items) {
  const totals = {}; items.forEach(function (x) { const expense = normalizeExpense(x); if (expense.status !== "PAID") return; const label = expense.category || "Other"; totals[label] = (totals[label] || 0) + Number(x.amount || 0); });
  const rows = Object.keys(totals).map(function (key) { return [key, totals[key]]; }).sort(function (a,b) { return b[1] - a[1]; }).slice(0,6); const max = rows.length ? rows[0][1] : 1;
  $("categoryBars").classList.toggle("empty-block", !rows.length); $("categoryBars").innerHTML = rows.length ? rows.map(function (row) { return '<div class="category-row"><span>' + h(row[0]) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4,row[1]/max*100) + '%"></div></div><strong>' + h(money(row[1])) + "</strong></div>"; }).join("") : "No expenditure added this month.";
}
function upcomingDates(days) { const reminders=state.data.importantDates.filter(function (x) { return Number(x.daysUntil) >= 0 && Number(x.daysUntil) <= days; }); const festivals=state.data.odiaFestivals.filter(function(x){return Number(x.daysUntil)>=0&&Number(x.daysUntil)<=days;}).map(function(x){return {id:x.id,title:x.name,eventType:"Odia festival",nextOccurrence:x.eventDate,daysUntil:x.daysUntil,automaticFestival:true};}); return reminders.concat(festivals).sort(function (a,b) { return Number(a.daysUntil)-Number(b.daysUntil); }); }
function renderUpcoming(items) {
  $("upcomingList").classList.toggle("empty-block", !items.length); $("upcomingList").innerHTML = items.length ? items.slice(0,5).map(function (x) { const p=dayParts(x.nextOccurrence); return '<div class="mini-item"><div class="mini-date"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.eventType)+' · '+(Number(x.daysUntil)===0?'Today':plural(Number(x.daysUntil),"day")+" away")+'</small></p></div>'; }).join("") : (state.data.importantDates.length ? plural(state.data.importantDates.length,"saved reminder")+" · none falls within the next 30 days. Use View all to see every reminder." : "No important dates have been added yet.");
}
function renderActivity() {
  let items = [];
  state.data.expenses.slice(0,4).forEach(function (x) { const expense=normalizeExpense(x); items.push({date:x.createdAt,icon:expense.status==="PLANNED"?"◷":"₹",title:expense.reason||expense.sentTo,meta:(expense.status==="PLANNED"?"Preplanned ":"")+money(x.amount)+" · "+expense.category+" · "+memberName(x.createdBy)}); });
  state.data.income.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"↗",title:x.source,meta:money(x.amount)+" income · "+memberName(x.createdBy)}); });
  state.data.photos.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"▧",title:x.title,meta:"Photo shared by "+memberName(x.uploadedBy)}); });
  state.data.diary.slice(0,3).forEach(function (x) { items.push({date:x.createdAt,icon:"☷",title:x.title,meta:"Diary by "+memberName(x.createdBy)}); });
  items.sort(function(a,b){return String(b.date).localeCompare(String(a.date));}); items=items.slice(0,7);
  $("activityList").classList.toggle("empty-block", !items.length); $("activityList").innerHTML = items.length ? items.map(function(x){return '<div class="activity-item"><span class="activity-icon">'+h(x.icon)+'</span><p><strong>'+h(x.title)+'</strong><br><small>'+h(x.meta)+'</small></p></div>';}).join("") : "Your family's latest additions will appear here.";
}

function normalizeExpense(item) { const entryType=String(item.entryType||"REGULAR").toUpperCase(); return Object.assign({}, item, { memberId:expenseMemberId(item), paidByMemberId:item.paidByMemberId||item.createdBy||item.paidBy||expenseMemberId(item), sharedWithIds:item.sharedWithIds||"", splitMethod:String(item.splitMethod||"PERSONAL").toUpperCase(), shareAmounts:item.shareAmounts||"", sentTo: item.sentTo || item.description || "", fromAccount: item.fromAccount || item.paymentMode || "", reason: item.reason || item.description || "", entryType: entryType, category: item.category || (entryType==="OLD"?"Old expenditure":entryType==="RECURRING"?"Regular payment":"Other"), subcategory: item.subcategory || "General", status: String(item.status || (entryType==="PREPLANNED"?"PLANNED":"PAID")).toUpperCase() }); }
function majorPlanTotals(plan) {
  const entries=(state.data.expenses||[]).map(normalizeExpense).filter(function(item){return item.majorPlanId===plan.id;});
  const paid=entries.filter(function(item){return item.status==="PAID";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0);
  const planned=entries.filter(function(item){return item.status==="PLANNED";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0);
  const budget=Number(plan.proposedAmount||0);
  return {entries:entries,paid:paid,planned:planned,budget:budget,remaining:budget-paid,committedRemaining:budget-paid-planned,pct:budget?Math.round(paid/budget*100):0};
}
function renderMajorPlans() {
  const filter=$("majorPlanStatusFilter").value;
  const allPlans=(state.data.majorPlans||[]);
  const plans=allPlans.filter(function(plan){const status=String(plan.status||"ACTIVE").toUpperCase();return filter?status===filter:status!=="ARCHIVED";});
  const active=allPlans.filter(function(plan){return String(plan.status||"ACTIVE").toUpperCase()==="ACTIVE";});
  const totals=active.reduce(function(result,plan){const calc=majorPlanTotals(plan);result.budget+=calc.budget;result.paid+=calc.paid;result.planned+=calc.planned;return result;},{budget:0,paid:0,planned:0});
  $("majorPlanCount").textContent=plural(plans.length,"plan");
  $("majorPlanSummary").innerHTML=active.length?'<span><small>Active plans</small><strong>'+active.length+'</strong></span><span><small>Proposed</small><strong>'+h(money(totals.budget))+'</strong></span><span><small>Paid actual</small><strong>'+h(money(totals.paid))+'</strong></span><span><small>Preplanned</small><strong>'+h(money(totals.planned))+'</strong></span>':'';
  $("majorPlanGrid").innerHTML=plans.map(function(plan){
    const status=String(plan.status||"ACTIVE").toUpperCase(),calc=majorPlanTotals(plan),bar=Math.max(0,Math.min(100,calc.pct));
    const phases=majorPlanPhases(plan.id,true);
    const phaseRows=phases.map(function(phase){const linked=calc.entries.filter(function(item){return item.majorPlanPhaseId===phase.id;}),actual=linked.filter(function(item){return item.status==="PAID";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0),planned=linked.filter(function(item){return item.status==="PLANNED";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0),phaseBudget=Number(phase.proposedAmount||0),phasePct=phaseBudget?Math.round(actual/phaseBudget*100):0;return '<div class="major-plan-phase-progress'+(phase.active===false?' archived':'')+'"><div><strong>'+h(phase.name)+'</strong>'+(phase.active===false?'<em>Archived phase</em>':'')+(status==="ACTIVE"&&phase.active!==false?'<button class="phase-add-expense" data-action="add-major-plan-expense" data-id="'+h(plan.id)+'" data-phase="'+h(phase.id)+'">＋ Add here</button>':'')+'</div><span>'+h(money(actual))+' paid</span><span>'+h(money(planned))+' planned</span><span>'+h(phaseBudget?phasePct+'% of '+money(phaseBudget):'No phase budget')+'</span></div>';}).join("");
    let actions='<button class="tiny-button" data-action="print-major-plan" data-id="'+h(plan.id)+'">▧ View / print</button>';
    if(status==="ACTIVE")actions='<button class="primary-button" data-action="add-major-plan-expense" data-id="'+h(plan.id)+'">＋ Paid expense</button><button class="tiny-button" data-action="add-major-plan-preplanned" data-id="'+h(plan.id)+'">◷ Preplanned</button>'+actions+(isAdmin()?'<button class="tiny-button" data-action="edit-major-plan" data-id="'+h(plan.id)+'">Edit plan</button><button class="tiny-button complete-plan" data-action="complete-major-plan" data-id="'+h(plan.id)+'">✓ Complete</button>':'');
    else if(status==="COMPLETED"&&isAdmin())actions+='<button class="tiny-button" data-action="reopen-major-plan" data-id="'+h(plan.id)+'">Reopen</button><button class="danger-button" data-action="archive-major-plan" data-id="'+h(plan.id)+'">Archive</button>';
    else if(status==="ARCHIVED"&&isAdmin())actions+='<button class="tiny-button" data-action="restore-major-plan" data-id="'+h(plan.id)+'">Restore</button>';
    return '<article class="major-plan-card status-'+h(status.toLowerCase())+'"><header><div><span class="major-plan-status">'+h(status)+'</span><h4>'+h(plan.name)+'</h4><p>'+h(formatDate(plan.startDate))+' → '+h(formatDate(plan.targetDate))+' · '+h(plan.ownerId==="ALL"?"Whole family":memberName(plan.ownerId))+'</p></div><strong>'+h(money(calc.budget))+'</strong></header><div class="major-plan-progress-track"><i style="width:'+bar+'%"></i></div><div class="major-plan-metrics"><span><small>Paid actual</small><strong>'+h(money(calc.paid))+'</strong></span><span><small>Preplanned</small><strong>'+h(money(calc.planned))+'</strong></span><span><small>Remaining</small><strong>'+h(money(calc.remaining))+'</strong></span><span class="'+(calc.committedRemaining<0?'over-budget':'')+'"><small>After commitments</small><strong>'+h(money(calc.committedRemaining))+'</strong></span><span><small>Used</small><strong>'+h(calc.pct)+'%</strong></span></div>'+(plan.notes?'<p class="major-plan-notes">'+h(plan.notes)+'</p>':'')+'<details class="major-plan-phase-details" open><summary>Phase progress · '+h(plural(phases.length,"phase"))+'</summary><div>'+phaseRows+'</div></details><div class="major-plan-actions">'+actions+'</div><footer>'+h(plural(calc.entries.length,"linked expense","linked expenses"))+' · These records are included once in Family Expenditure.</footer></article>';
  }).join("");
  $("majorPlanEmpty").classList.toggle("hidden",plans.length>0);
}
function openMajorPlanReport(id,autoPrint) {
  const plan=majorPlanById(id); if(!plan)return;
  const calc=majorPlanTotals(plan),phases=majorPlanPhases(plan.id,true),familyName=(state.data.settings&&state.data.settings.familyName)||"Our Family Hub";
  const phaseRows=phases.map(function(phase,index){const linked=calc.entries.filter(function(item){return item.majorPlanPhaseId===phase.id;}),paid=linked.filter(function(item){return item.status==="PAID";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0),planned=linked.filter(function(item){return item.status==="PLANNED";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0),budget=Number(phase.proposedAmount||0);return '<tr><td>'+(index+1)+'</td><td><strong>'+h(phase.name)+'</strong></td><td class="number">'+h(money(budget))+'</td><td class="number">'+h(money(paid))+'</td><td class="number">'+h(money(planned))+'</td><td class="number">'+h(money(budget-paid))+'</td></tr>';}).join("");
  const expenseRows=calc.entries.slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));}).map(function(item,index){return '<tr class="'+h(item.status.toLowerCase())+'"><td>'+(index+1)+'</td><td>'+h(formatDate(item.date))+'</td><td>'+h(item.status==="PLANNED"?"Preplanned":"Paid")+'</td><td>'+h(majorPlanPhaseName(item.majorPlanPhaseId)||"Unassigned")+'</td><td>'+h(item.category)+' · '+h(item.subcategory)+'</td><td>'+h(item.sentTo)+'</td><td>'+h(item.fromAccount)+'</td><td>'+h(item.reason)+'</td><td class="number"><strong>'+h(money(item.amount))+'</strong></td></tr>';}).join("");
  const reportWindow=window.open("","majorPlanReport","width=1180,height=850"); if(!reportWindow)return toast("Allow pop-ups to view or print this major-plan report.","error");
  const autoPrintScript=autoPrint?"<script>window.onload=function(){setTimeout(function(){window.print();},200)};<\/script>":"";
  reportWindow.document.open();
  reportWindow.document.write("<!doctype html><html><head><meta charset='utf-8'><title>"+h(plan.name)+" · Major Plan</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;background:#f3f1f8;color:#24243a;font:11px Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report{max-width:1200px;margin:auto;padding:24px;background:#fff;min-height:100vh}.actions{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:8px;background:#fff;border-bottom:1px solid #ddd}.actions button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}.print{background:#6752c7;color:white}h1{margin:5px 0;font-size:25px}.family{color:#6752c7;font-weight:800;letter-spacing:1px}.meta{color:#69697e}.status{display:inline-block;padding:4px 8px;border-radius:99px;background:#eeeafa;color:#554198;font-weight:800}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.summary span{padding:10px;border:1px solid #dedbe9;border-radius:10px;background:#f8f7fc}.summary small{display:block;color:#737287}.summary strong{display:block;margin-top:4px;font-size:15px}h2{margin:18px 0 8px;font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #dedde7;padding:6px;vertical-align:top;overflow-wrap:anywhere}th{background:#e9e4fb;text-transform:uppercase;font-size:9px}tbody tr:nth-child(even){background:#edf6ff}tr.planned{background:#fff7d7}.number{text-align:right}.notes{padding:10px;border-left:4px solid #6752c7;background:#f7f5ff}.foot{text-align:right;color:#858597;margin-top:12px}@media print{body{background:#fff}.report{padding:0;max-width:none}.actions{display:none}}</style></head><body><main class='report'><div class='actions'><button onclick='window.close()'>Close view</button><button class='print' onclick='window.print()'>Print project report</button></div><div class='family'>"+h(familyName)+" · MAJOR EXPENDITURE PLAN</div><h1>"+h(plan.name)+"</h1><p class='meta'><span class='status'>"+h(String(plan.status||"ACTIVE").toUpperCase())+"</span> · "+h(formatDate(plan.startDate))+" to "+h(formatDate(plan.targetDate))+" · Owner: "+h(plan.ownerId==="ALL"?"Whole family":memberName(plan.ownerId))+"</p>"+(plan.notes?"<p class='notes'>"+h(plan.notes)+"</p>":"")+"<section class='summary'><span><small>Proposed</small><strong>"+h(money(calc.budget))+"</strong></span><span><small>Paid actual</small><strong>"+h(money(calc.paid))+"</strong></span><span><small>Preplanned</small><strong>"+h(money(calc.planned))+"</strong></span><span><small>Remaining</small><strong>"+h(money(calc.remaining))+"</strong></span><span><small>Budget used</small><strong>"+h(calc.pct)+"%</strong></span></section><h2>Phase summary</h2><table><thead><tr><th>Sl.</th><th>Phase</th><th>Budget</th><th>Paid</th><th>Preplanned</th><th>Remaining</th></tr></thead><tbody>"+phaseRows+"</tbody></table><h2>Linked expenditure details</h2><table><thead><tr><th>Sl.</th><th>Date</th><th>Status</th><th>Phase</th><th>Category</th><th>Send to</th><th>From account</th><th>Reason</th><th>Amount</th></tr></thead><tbody>"+(expenseRows||"<tr><td colspan='9'>No linked expenditure yet.</td></tr>")+"</tbody></table><p class='foot'>Each linked record is counted once in Family Expenditure · FE v"+h(FRONTEND_VERSION)+" · BE v"+h(state.data.backendVersion||"—")+"</p></main>"+autoPrintScript+"</body></html>");
  reportWindow.document.close();
}
function filteredExpenses() { const month=$("expenseMonth").value,status=$("expenseStatusFilter").value,member=$("expenseMemberFilter").value,category=$("expenseCategoryFilter").value,subcategory=$("expenseSubcategoryFilter").value,majorPlanId=$("expenseMajorPlanFilter").value,recipient=$("expenseSendToFilter").value,account=$("expenseAccountFilter").value,q=normalize($("expenseSearch").value); return state.data.expenses.map(normalizeExpense).filter(function(x){return (!month||String(x.date).slice(0,7)===month)&&(!status||x.status===status)&&(!member||expenseMemberId(x)===member)&&(!category||x.category===category)&&(!subcategory||x.subcategory===subcategory)&&(!majorPlanId||x.majorPlanId===majorPlanId)&&(!recipient||x.sentTo===recipient)&&(!account||x.fromAccount===account)&&(!q||normalize([x.status,memberName(expenseMemberId(x)),x.category,x.subcategory,majorPlanName(x.majorPlanId),majorPlanPhaseName(x.majorPlanPhaseId),x.sentTo,x.fromAccount,x.reason,x.date].join(" ")).includes(q));}); }
function startInlineExpenseEdit(id) {
  state.inlineExpenseId = id;
  renderExpenses();
  setTimeout(function () { const row = document.querySelector('tr[data-inline-expense-id="'+CSS.escape(id)+'"]'); const input = row && row.querySelector("input"); if (input) { input.focus(); input.select(); } }, 20);
}
function renderInlineExpenseRow(item) {
  return '<tr class="expense-'+h(item.status.toLowerCase())+' inline-expense-row" data-inline-expense-id="'+h(item.id)+'"><td colspan="7">'+
    '<div class="inline-expense-editor"><header>'+memberIdentityMarkup(expenseMemberId(item),false)+'<span class="expense-status '+h(item.status.toLowerCase())+'">'+(item.status==="PLANNED"?'PREPLANNED':'PAID')+'</span><strong>Edit this expenditure directly</strong></header><div class="inline-expense-editor-grid">'+
    '<label>Amount<input class="inline-expense-input number" data-inline-field="amount" type="number" min="0.01" step="0.01" value="'+h(item.amount)+'"></label>'+
    '<label>Date<input class="inline-expense-input" data-inline-field="date" type="date" value="'+h(String(item.date).slice(0,10))+'"></label>'+
    '<label>Family member<select class="inline-expense-input" data-inline-field="memberId">'+memberSelectOptions(expenseMemberId(item),true)+'</select></label>'+
    '<label>Category<select class="inline-expense-input inline-expense-category" data-inline-field="category">'+expenseCategoryOptions(item.category,false)+'</select></label>'+
    '<label>Subcategory<select class="inline-expense-input inline-expense-subcategory" data-inline-field="subcategory">'+expenseSubcategoryOptions(item.category,item.subcategory,false)+'</select></label>'+
    '<label>Paid / sent to<input class="inline-expense-input" data-inline-field="sentTo" maxlength="100" value="'+h(item.sentTo)+'"></label>'+
    '<label>From account<input class="inline-expense-input" data-inline-field="fromAccount" maxlength="100" value="'+h(item.fromAccount)+'"></label>'+
    '<label class="inline-editor-wide">Description / reason<textarea class="inline-expense-input inline-expense-reason" data-inline-field="reason" rows="2" maxlength="500">'+h(item.reason)+'</textarea></label>'+
    '<label>Major plan<select class="inline-expense-input inline-expense-major-plan" data-inline-field="majorPlanId">'+majorPlanOptions(item.majorPlanId||"",true)+'</select></label>'+
    '<label>Plan phase<select class="inline-expense-input inline-expense-major-plan-phase" data-inline-field="majorPlanPhaseId"'+(item.majorPlanId?'':' disabled')+'>'+majorPlanPhaseOptions(item.majorPlanId||"",item.majorPlanPhaseId||"",true)+'</select></label></div><div class="inline-save-actions"><button class="tiny-button" data-action="inline-cancel-expense" data-id="'+h(item.id)+'">Cancel</button><button class="tiny-button save-row-button" data-action="inline-save-expense" data-id="'+h(item.id)+'">✓ Save row</button></div></div></td></tr>';
}
function renderExpenseDisplayRow(item) {
  const plan=majorPlanName(item.majorPlanId),phase=majorPlanPhaseName(item.majorPlanPhaseId);
  const shared=item.splitMethod&&item.splitMethod!=="PERSONAL"?'<small class="expense-split-line">'+h(item.splitMethod==="EQUAL"?'Equal split':'Custom split')+' · paid by '+h(memberName(item.paidByMemberId))+'</small>':'';
  return '<tr class="expense-'+h(item.status.toLowerCase())+'"><td><div class="expense-description-cell"><span class="expense-row-icon">₹</span><span><strong>'+h(item.reason||item.sentTo||"Expenditure")+'</strong><small>Paid to '+h(item.sentTo||"—")+' · From '+h(item.fromAccount||"—")+'</small>'+shared+'</span></div></td><td><strong>'+h(formatDate(item.date))+'</strong><span class="expense-status '+h(item.status.toLowerCase())+'">'+(item.status==="PLANNED"?'PREPLANNED':'PAID')+'</span></td><td><span class="expense-category-chip">'+h(item.category)+'</span><small class="expense-subcategory-line">'+h(item.subcategory)+'</small></td><td>'+memberIdentityMarkup(expenseMemberId(item),false)+'</td><td class="number expense-amount-cell"><strong>'+h(money(item.amount))+'</strong></td><td>'+(plan?'<span class="major-plan-link-chip">'+h(plan)+(phase?'<small>'+h(phase)+'</small>':'')+'</span>':'<span class="muted">—</span>')+'</td><td class="row-edit-cell"><div class="statement-actions">'+(item.status==="PLANNED"?'<button class="tiny-button paid-button" data-action="mark-planned-paid" data-id="'+h(item.id)+'">✓ Mark paid</button>':'')+'<button class="row-edit-primary" data-action="inline-edit-expense" data-id="'+h(item.id)+'">✎ Edit row</button><button class="tiny-button" data-action="edit-expense" data-id="'+h(item.id)+'" title="Open every field">Full form</button>'+(mayDelete(item)?'<button class="danger-button" data-action="delete-expense" data-id="'+h(item.id)+'">Delete</button>':"")+'</div></td></tr>';
}
async function saveInlineExpenseRow(button) {
  const row = button.closest("tr"), id = button.dataset.id;
  const original = state.data.expenses.find(function (item) { return item.id === id; });
  if (!row || !original) return;
  const value = function (field) { const input = row.querySelector('[data-inline-field="'+field+'"]'); return input ? input.value.trim() : ""; };
  const amount = value("amount"), date = value("date"), memberId=value("memberId"), category = value("category"), subcategory = value("subcategory"), sentTo = value("sentTo"), fromAccount = value("fromAccount"), reason = value("reason"), majorPlanId=value("majorPlanId"), majorPlanPhaseId=value("majorPlanPhaseId");
  if (!date || !category || !subcategory || !sentTo || !fromAccount || !reason || !(Number(amount) > 0)) return toast("Complete every row field and enter an amount greater than zero.", "error");
  const normalized = normalizeExpense(original);
  state.inlineExpenseId = "";
  const result = await mutate("updateExpense", { id: id, date: date, amount: amount, memberId:memberId, category: category, subcategory: subcategory, sentTo: sentTo, fromAccount: fromAccount, reason: reason, entryType: normalized.status === "PLANNED" ? "PREPLANNED" : normalized.entryType, recurringId: normalized.recurringId || "", majorPlanId:majorPlanId, majorPlanPhaseId:majorPlanPhaseId, paidByMemberId:normalized.paidByMemberId, sharedWithIds:normalized.sharedWithIds, splitMethod:normalized.splitMethod, shareAmounts:normalized.shareAmounts }, "Expenditure row updated.", null, "Saving expenditure row…");
  if (!result) { state.inlineExpenseId = id; renderExpenses(); }
}
function renderExpenses() {
  const items=filteredExpenses(),paid=items.filter(function(x){return x.status==="PAID";}),planned=items.filter(function(x){return x.status==="PLANNED";}),paidTotal=paid.reduce(function(s,x){return s+Number(x.amount||0);},0),plannedTotal=planned.reduce(function(s,x){return s+Number(x.amount||0);},0);
  if (state.inlineExpenseId && !items.some(function (item) { return item.id === state.inlineExpenseId; })) state.inlineExpenseId = "";
  renderExpenseMemberQuickFilters();
  $("expenseStatementSnapshot").innerHTML='<span><small>Showing</small><strong>'+h(plural(items.length,"entry","entries"))+'</strong></span><span><small>Paid</small><strong>'+h(money(paidTotal))+'</strong></span>'+(planned.length?'<span><small>Preplanned</small><strong>'+h(money(plannedTotal))+'</strong></span>':'');
  $("expenseTotals").innerHTML='<span class="total-pill">'+plural(items.length,"entry","entries")+'</span><span class="total-pill">Paid '+h(money(paidTotal))+'</span>'+(planned.length?'<span class="total-pill planned">Preplanned '+h(money(plannedTotal))+'</span>':'');
  renderExpenseMemberAnalytics(items);
  renderExpenseOverview(items);
  renderExpenseSettlements();
  $("expenseRows").innerHTML=items.map(function(item){return item.id===state.inlineExpenseId?renderInlineExpenseRow(item):renderExpenseDisplayRow(item);}).join("");
  $("expenseEmpty").classList.toggle("hidden",items.length>0);
}
function renderExpenseMemberQuickFilters() {
  const selected=$("expenseMemberFilter").value;
  const members=(state.data.members||[]);
  const buttons=[{id:"",name:"Everyone"},{id:"ALL",name:"Whole family"}].concat(members.map(function(member){return {id:member.id,name:member.name};}));
  $("expenseMemberQuickFilters").innerHTML='<span class="member-switcher-label">Viewing &amp; editing for</span>'+buttons.map(function(item){return '<button type="button" class="expense-member-switch'+(selected===item.id?' active':'')+'" data-action="quick-filter-expense-member" data-id="'+h(item.id)+'">'+(item.id?memberAvatarMarkup(item.id,"small"):'<span class="member-avatar small everyone">ALL</span>')+'<span>'+h(item.name)+'</span></button>';}).join("");
}
function memberSelectOptions(selected,allowAll) { return (allowAll?'<option value="ALL" '+(selected==="ALL"?'selected':'')+'>Whole family</option>':'')+(state.data.members||[]).map(function(member){return '<option value="'+h(member.id)+'" '+(selected===member.id?'selected':'')+'>'+h(member.name)+'</option>';}).join(""); }
function expenseAnalyticsRows(items) {
  const ids=[]; items.forEach(function(item){const id=expenseMemberId(item);if(ids.indexOf(id)<0)ids.push(id);});
  return ids.map(function(id){const records=items.filter(function(item){return expenseMemberId(item)===id;}),paid=records.filter(function(item){return item.status==="PAID";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0),planned=records.filter(function(item){return item.status==="PLANNED";}).reduce(function(sum,item){return sum+Number(item.amount||0);},0);return {id:id,name:memberName(id),paid:paid,planned:planned,total:paid+planned,count:records.length};}).sort(function(a,b){return b.total-a.total||a.name.localeCompare(b.name);});
}
function renderExpenseMemberAnalytics(items) {
  const rows=expenseAnalyticsRows(items),paidTotal=rows.reduce(function(sum,row){return sum+row.paid;},0),max=Math.max(1,...rows.map(function(row){return row.total;}));
  $("expenseMemberSummary").innerHTML=rows.length?rows.map(function(row){const share=paidTotal?Math.round(row.paid/paidTotal*100):0;return '<button type="button" class="member-expense-card" data-action="filter-expense-member" data-id="'+h(row.id)+'">'+memberAvatarMarkup(row.id,"summary")+'<span class="member-card-copy"><strong>'+h(row.name)+'</strong><small>'+h(plural(row.count,"entry"))+' · '+share+'% of paid</small><i class="member-spend-track"><b style="width:'+share+'%"></b></i></span><span class="member-money"><b>'+h(money(row.paid))+'</b>'+(row.planned?'<small>'+h(money(row.planned))+' planned</small>':'')+'</span></button>';}).join(""):'<p class="chart-empty">No expenditure matches the selected filters.</p>';
  $("expenseMemberChart").innerHTML=rows.length?rows.map(function(row){const paidWidth=row.paid/max*100,plannedWidth=row.planned/max*100;return '<button type="button" class="expense-bar-row" data-action="filter-expense-member" data-id="'+h(row.id)+'"><span class="bar-label">'+memberAvatarMarkup(row.id,"tiny")+'<strong>'+h(row.name)+'</strong></span><span class="bar-track"><i class="bar-paid" style="width:'+paidWidth.toFixed(2)+'%"></i><i class="bar-planned" style="width:'+plannedWidth.toFixed(2)+'%"></i></span><span class="bar-value">'+h(money(row.total))+'</span></button>';}).join(""):'<p class="chart-empty">Add expenditure to see the member chart.</p>';
  const categoryMap={};items.filter(function(item){return item.status==="PAID";}).forEach(function(item){categoryMap[item.category]=(categoryMap[item.category]||0)+Number(item.amount||0);});const categories=Object.keys(categoryMap).map(function(name){return {name:name,total:categoryMap[name]};}).sort(function(a,b){return b.total-a.total;}).slice(0,8),categoryMax=Math.max(1,...categories.map(function(item){return item.total;}));
  $("expenseCategoryChart").innerHTML=categories.length?categories.map(function(item){return '<button type="button" class="expense-bar-row" data-action="filter-expense-category" data-category="'+h(item.name)+'"><span class="bar-label"><strong>'+h(item.name)+'</strong></span><span class="bar-track"><i class="bar-category" style="width:'+(item.total/categoryMax*100).toFixed(2)+'%"></i></span><span class="bar-value">'+h(money(item.total))+'</span></button>';}).join(""):'<p class="chart-empty">No paid expenditure in this view.</p>';
}
function renderExpenseOverview(items) {
  const paid=items.filter(function(item){return item.status==="PAID";}),planned=items.filter(function(item){return item.status==="PLANNED";}),paidTotal=paid.reduce(function(sum,item){return sum+Number(item.amount||0);},0),plannedTotal=planned.reduce(function(sum,item){return sum+Number(item.amount||0);},0),budget=Number(state.data.settings.monthlyExpenseBudget||0),remaining=budget-paidTotal-plannedTotal,used=budget>0?Math.round((paidTotal+plannedTotal)/budget*100):0,month=$("expenseMonth").value;
  $("expenseOverviewPeriod").textContent=month?new Date(month+"-01T00:00:00").toLocaleDateString("en-IN",{month:"long",year:"numeric"}):"All records";
  $("expenseOverviewCards").innerHTML=[
    {icon:"▣",label:"Monthly budget",value:budget?money(budget):"Not set",note:budget?"Administrator target":"Set in Administration",tone:"budget"},
    {icon:"₹",label:"Paid expenses",value:money(paidTotal),note:plural(paid.length,"payment"),tone:"paid"},
    {icon:"◷",label:"Preplanned",value:money(plannedTotal),note:plural(planned.length,"planned item"),tone:"planned"},
    {icon:remaining<0?"!":"✓",label:"Balance available",value:budget?money(remaining):"—",note:budget?(Math.abs(used)+"% committed"):"Add a monthly budget",tone:remaining<0?"over":"balance"}
  ].map(function(card){return '<article class="expense-overview-card '+card.tone+'"><span class="overview-card-icon">'+h(card.icon)+'</span><div><small>'+h(card.label)+'</small><strong>'+h(card.value)+'</strong><em>'+h(card.note)+'</em></div></article>';}).join("");
  const categoryMap={}; paid.forEach(function(item){categoryMap[item.category]=(categoryMap[item.category]||0)+Number(item.amount||0);});
  const colours=["#ff725e","#15a997","#6d55d9","#efaa22","#3f8ed8","#d05d9b","#7ba73a","#7c8298"], allCategories=Object.keys(categoryMap).map(function(name){return {name:name,total:categoryMap[name]};}).sort(function(a,b){return b.total-a.total;}), categories=allCategories.length>8?allCategories.slice(0,7).concat([{name:"Other categories",total:allCategories.slice(7).reduce(function(sum,item){return sum+item.total;},0)}]):allCategories, categoryTotal=allCategories.reduce(function(sum,item){return sum+item.total;},0);
  let cursor=0; const stops=categories.map(function(item,index){const start=cursor,end=cursor+(categoryTotal?item.total/categoryTotal*100:0);cursor=end;return colours[index]+" "+start.toFixed(2)+"% "+end.toFixed(2)+"%";});
  $("expenseDonutChart").style.background=stops.length?"conic-gradient("+stops.join(",")+")":"conic-gradient(#eceaf4 0 100%)";
  $("expenseDonutChart").innerHTML='<span><small>Total</small><strong>'+h(money(categoryTotal))+'</strong></span>'; $("expenseDonutTotal").textContent=money(categoryTotal);
  $("expenseDonutLegend").innerHTML=categories.length?categories.map(function(item,index){const pct=categoryTotal?Math.round(item.total/categoryTotal*100):0,filter=item.name==="Other categories"?'':' data-action="filter-expense-category" data-category="'+h(item.name)+'"';return '<button type="button"'+filter+'><i style="background:'+colours[index]+'"></i><span><strong>'+h(item.name)+'</strong><small>'+pct+'% · '+h(money(item.total))+'</small></span></button>';}).join(""):'<p class="chart-empty">Add a paid expense to see the category chart.</p>';
  const timeMap={}; paid.forEach(function(item){const key=month?String(item.date).slice(8,10):String(item.date).slice(0,7);timeMap[key]=(timeMap[key]||0)+Number(item.amount||0);});
  const points=Object.keys(timeMap).sort().slice(-14).map(function(key){return {key:key,total:timeMap[key]};}),max=Math.max(1,...points.map(function(point){return point.total;}));
  $("expenseTimelineTitle").textContent=month?"By day":"By month";
  $("expenseTimelineChart").innerHTML=points.length?points.map(function(point){const label=month?Number(point.key):new Date(point.key+"-01T00:00:00").toLocaleDateString("en-IN",{month:"short",year:"2-digit"});return '<div class="timeline-column" title="'+h(label+" · "+money(point.total))+'"><span class="timeline-value">'+h(money(point.total))+'</span><i><b style="height:'+Math.max(5,point.total/max*100).toFixed(2)+'%"></b></i><small>'+h(label)+'</small></div>';}).join(""):'<p class="chart-empty">Paid expenditure will appear here by date.</p>';
}
function expenseBalanceTransfers() {
  const balances={}; (state.data.members||[]).forEach(function(member){balances[member.id]=0;});
  (state.data.expenses||[]).map(normalizeExpense).filter(function(item){return item.status==="PAID"&&["EQUAL","CUSTOM"].indexOf(item.splitMethod)>=0;}).forEach(function(item){
    const ids=String(item.sharedWithIds||"").split(",").filter(function(id){return balances[id]!==undefined;}),payer=item.paidByMemberId,amount=Number(item.amount||0); if(!ids.length||balances[payer]===undefined||!(amount>0))return;
    const custom=parseExpenseShares(item.shareAmounts), equal=amount/ids.length; balances[payer]+=amount; ids.forEach(function(id){balances[id]-=item.splitMethod==="CUSTOM"?Number(custom[id]||0):equal;});
  });
  (state.data.settlements||[]).forEach(function(item){const amount=Number(item.amount||0);if(balances[item.fromMemberId]!==undefined)balances[item.fromMemberId]+=amount;if(balances[item.toMemberId]!==undefined)balances[item.toMemberId]-=amount;});
  const debtors=Object.keys(balances).filter(function(id){return balances[id]<-0.005;}).map(function(id){return {id:id,amount:-balances[id]};}),creditors=Object.keys(balances).filter(function(id){return balances[id]>0.005;}).map(function(id){return {id:id,amount:balances[id]};}),transfers=[]; let d=0,c=0;
  while(d<debtors.length&&c<creditors.length){const amount=Math.min(debtors[d].amount,creditors[c].amount);if(amount>0.005)transfers.push({from:debtors[d].id,to:creditors[c].id,amount:Math.round(amount*100)/100});debtors[d].amount-=amount;creditors[c].amount-=amount;if(debtors[d].amount<0.005)d++;if(creditors[c].amount<0.005)c++;}
  return transfers;
}
function renderExpenseSettlements() {
  const enabled=expenseSharingEnabled(),panel=$("expenseSettlementPanel"); panel.classList.toggle("hidden",!enabled); if(!enabled)return;
  $("addExpenseSettlement").classList.toggle("hidden",!isAdmin());
  const transfers=expenseBalanceTransfers();
  $("expenseSettlementSummary").innerHTML=transfers.length?transfers.map(function(item){return '<article class="settlement-card">'+memberAvatarMarkup(item.from,"small")+'<div><strong>'+h(memberName(item.from))+'</strong><small>owes '+h(memberName(item.to))+'</small></div><span class="settlement-arrow">→</span>'+memberAvatarMarkup(item.to,"small")+'<b>'+h(money(item.amount))+'</b>'+(isAdmin()?'<button class="tiny-button" data-action="open-expense-settlement" data-from="'+h(item.from)+'" data-to="'+h(item.to)+'" data-amount="'+h(item.amount)+'">Settle</button>':'')+'</article>';}).join(""):'<div class="settled-up"><span>✓</span><div><strong>All settled up</strong><small>No outstanding shared-expense balance.</small></div></div>';
  const history=(state.data.settlements||[]).slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
  $("expenseSettlementHistory").innerHTML=history.length?'<details><summary>Settlement history · '+history.length+'</summary>'+history.map(function(item){return '<div class="settlement-history-row"><span>'+memberIdentityMarkup(item.fromMemberId,true)+' → '+memberIdentityMarkup(item.toMemberId,true)+'</span><span><strong>'+h(money(item.amount))+'</strong><small>'+h(formatDate(item.date))+(item.paymentMode?' · '+h(item.paymentMode):'')+'</small></span>'+(isAdmin()?'<button class="danger-button" data-action="delete-expense-settlement" data-id="'+h(item.id)+'">Remove</button>':'')+'</div>';}).join("")+'</details>':'';
}
function openExpenseSettlementDialog(fromId,toId,amount) {
  if(!isAdmin()||!expenseSharingEnabled())return;
  $("expenseSettlementForm").reset(); fillMemberSelect($("settlementFromMember"),fromId||state.data.user.id,false); fillMemberSelect($("settlementToMember"),toId||((state.data.members||[]).find(function(member){return member.id!==$("settlementFromMember").value;})||{}).id,false); $("settlementAmount").value=amount||""; $("settlementDate").value=todayIso(); openDialog("expenseSettlementDialog");
}
function toggleExpenseSection(button) { const panel=button.closest(".panel"); if(!panel)return; const collapsed=panel.classList.toggle("section-collapsed"); button.textContent=collapsed?"Show section":"Hide section"; button.setAttribute("aria-expanded",collapsed?"false":"true"); }
function recurringIsActive(item) { return !(item.active === false || String(item.active).toLowerCase() === "false"); }
function recurringIntervalMonthsClient(item) {
  const frequency=String(item.frequency||"MONTHLY").toUpperCase();
  return frequency==="QUARTERLY"?3:frequency==="HALF_YEARLY"?6:frequency==="YEARLY"?12:frequency==="CUSTOM"?Math.max(1,Math.min(60,Number(item.intervalMonths)||1)):1;
}
function recurringFrequencyLabel(item) {
  const frequency=String(item.frequency||"MONTHLY").toUpperCase();
  if(frequency==="QUARTERLY")return "Quarterly";
  if(frequency==="HALF_YEARLY")return "Half-yearly";
  if(frequency==="YEARLY")return "Yearly";
  if(frequency==="CUSTOM")return "Every "+recurringIntervalMonthsClient(item)+" months";
  return "Monthly";
}
function recurringFrequencyOptions(selected) {
  return [["MONTHLY","Monthly"],["QUARTERLY","Quarterly"],["HALF_YEARLY","Half-yearly"],["YEARLY","Yearly"],["CUSTOM","Custom months"]].map(function(option){return '<option value="'+option[0]+'" '+(selected===option[0]?'selected':'')+'>'+option[1]+'</option>';}).join("");
}
function addRecurringMonthsClient(iso,months) {
  const parts=String(iso||"").slice(0,10).split("-").map(Number); if(parts.length!==3||!parts[0])return "";
  const targetMonth=parts[1]-1+Number(months||1),year=parts[0]+Math.floor(targetMonth/12),month=((targetMonth%12)+12)%12;
  const day=Math.min(parts[2],new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return [year,String(month+1).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
}
function recurringForecastBetween(items,startIso,endIso) {
  return items.filter(recurringIsActive).reduce(function(total,item){
    const amount=Number(item.estimatedAmount||0); if(!(amount>0))return total;
    let due=String(item.nextDueDate||"").slice(0,10),guard=0,interval=recurringIntervalMonthsClient(item);
    while(due&&due<startIso&&guard++<240)due=addRecurringMonthsClient(due,interval);
    while(due&&due<=endIso&&guard++<480){total+=amount;due=addRecurringMonthsClient(due,interval);}
    return total;
  },0);
}
function filteredRecurringExpenses() {
  const status=$("recurringStatusFilter").value,q=normalize($("recurringSearch").value);
  return (state.data.recurringExpenses||[]).filter(function(item){
    const active=recurringIsActive(item),days=Number(item.daysUntil),frequency=String(item.frequency||"MONTHLY").toUpperCase();
    const matchesStatus=!status||(status==="INACTIVE"&&!active)||(status==="OVERDUE"&&active&&days<0)||(status==="DUE"&&active&&days===0)||(status==="UPCOMING"&&active&&days>=0&&days<=30)||(status==="MONTHLY"&&frequency==="MONTHLY")||(status==="YEARLY"&&frequency==="YEARLY");
    return matchesStatus&&(!q||normalize([item.title,memberName(expenseMemberId(item)),item.category,item.subcategory,item.sentTo,item.fromAccount,item.reason,majorPlanName(item.majorPlanId)].join(" ")).includes(q));
  });
}
function recurringDuePresentation(item) {
  if(!recurringIsActive(item))return {className:"inactive",text:"Inactive"};
  const days=Number(item.daysUntil); if(days<0)return {className:"overdue",text:plural(Math.abs(days),"day")+" overdue"};
  if(days===0)return {className:"due",text:"Due today"};
  if(days===1)return {className:"soon",text:"Due tomorrow"};
  if(days<=7)return {className:"soon",text:"Due in "+days+" days"};
  return {className:"scheduled",text:formatDate(item.nextDueDate)};
}
function renderRecurringInlineRow(item) {
  const active=recurringIsActive(item),custom=String(item.frequency).toUpperCase()==="CUSTOM";
  return '<tr class="recurring-edit-row" data-recurring-id="'+h(item.id)+'">'+
    '<td><label class="compact-check"><input data-recurring-field="active" type="checkbox" '+(active?'checked':'')+'><span>'+(active?'On':'Off')+'</span></label></td>'+
    '<td><input class="recurring-inline-input" data-recurring-field="title" maxlength="100" value="'+h(item.title)+'"><textarea class="recurring-inline-input recurring-inline-reason" data-recurring-field="reason" rows="2" maxlength="500">'+h(item.reason||"")+'</textarea></td>'+
    '<td><select class="recurring-inline-input" data-recurring-field="memberId">'+memberSelectOptions(expenseMemberId(item),true)+'</select></td>'+
    '<td><select class="recurring-inline-input inline-recurring-category" data-recurring-field="category">'+expenseCategoryOptions(item.category,true)+'</select><select class="recurring-inline-input inline-recurring-subcategory" data-recurring-field="subcategory">'+expenseSubcategoryOptions(item.category,item.subcategory,true)+'</select></td>'+
    '<td><select class="recurring-inline-input inline-recurring-frequency" data-recurring-field="frequency">'+recurringFrequencyOptions(String(item.frequency||"MONTHLY").toUpperCase())+'</select><label class="recurring-custom-row '+(custom?'':'hidden')+'">Months<input class="recurring-inline-input" data-recurring-field="intervalMonths" type="number" min="1" max="60" value="'+h(item.intervalMonths||1)+'"></label></td>'+
    '<td><input class="recurring-inline-input number" data-recurring-field="estimatedAmount" type="number" min="0" step="0.01" value="'+h(item.estimatedAmount||"")+'"></td>'+
    '<td><input class="recurring-inline-input" data-recurring-field="nextDueDate" type="date" value="'+h(String(item.nextDueDate||"").slice(0,10))+'"></td>'+
    '<td><input class="recurring-inline-input" data-recurring-field="sentTo" maxlength="100" value="'+h(item.sentTo||"")+'"></td>'+
    '<td><input class="recurring-inline-input" data-recurring-field="fromAccount" maxlength="100" value="'+h(item.fromAccount||"")+'"><input class="recurring-inline-input recurring-remind-input" data-recurring-field="remindDays" maxlength="40" value="'+h(item.remindDays||"7,1,0")+'" title="Reminder days"></td>'+
    '<td><select class="recurring-inline-input inline-recurring-major-plan" data-recurring-field="majorPlanId">'+majorPlanOptions(item.majorPlanId||"",true)+'</select><select class="recurring-inline-input inline-recurring-major-plan-phase" data-recurring-field="majorPlanPhaseId" '+(item.majorPlanId?'':'disabled')+'>'+majorPlanPhaseOptions(item.majorPlanId||"",item.majorPlanPhaseId||"",true)+'</select></td>'+
    '<td class="recurring-action-cell">'+(state.recurringEditAll?'<span class="editing-row-label">Bulk edit</span>':'<div class="inline-save-actions"><button class="tiny-button save-row-button" data-action="inline-save-recurring" data-id="'+h(item.id)+'">✓ Save</button><button class="tiny-button" data-action="inline-cancel-recurring">Cancel</button></div>')+'</td></tr>';
}
function renderRecurringViewRow(item) {
  const due=recurringDuePresentation(item),active=recurringIsActive(item),project=majorPlanName(item.majorPlanId),phase=majorPlanPhaseName(item.majorPlanPhaseId);
  return '<tr class="recurring-view-row '+h(due.className)+'"><td><span class="schedule-status '+(active?'active':'inactive')+'">'+(active?'Active':'Inactive')+'</span></td><td><strong>'+h(item.title)+'</strong><small>'+h(item.reason||"")+'</small></td><td>'+memberIdentityMarkup(expenseMemberId(item),true)+'</td><td><span class="expense-category-chip">'+h(item.category||"Other")+'</span><small>'+h(item.subcategory||"General")+'</small></td><td><span class="frequency-chip">↻ '+h(recurringFrequencyLabel(item))+'</span></td><td class="number"><strong>'+(Number(item.estimatedAmount||0)>0?h(money(item.estimatedAmount)):'<span class="muted">At payment</span>')+'</strong></td><td><span class="due-chip '+h(due.className)+'">'+h(due.text)+'</span><small>'+h(formatDate(item.nextDueDate))+(item.lastPaidDate?' · Last '+h(formatDate(item.lastPaidDate)):'')+'</small></td><td>'+h(item.sentTo||"—")+'</td><td>'+h(item.fromAccount||"—")+'</td><td>'+(project?'<span class="major-plan-link-chip compact">'+h(project)+(phase?'<small>'+h(phase)+'</small>':'')+'</span>':'<span class="muted">—</span>')+'</td><td class="recurring-action-cell"><div class="recurring-row-actions">'+(active?'<button class="primary-button" data-action="pay-recurring-expense" data-id="'+h(item.id)+'">✓ Paid</button>':'')+'<button class="row-edit-primary" data-action="inline-edit-recurring" data-id="'+h(item.id)+'">✎ Edit row</button><button class="tiny-button" data-action="edit-recurring-expense" data-id="'+h(item.id)+'">↗ Form</button><button class="tiny-button" data-action="duplicate-recurring-expense" data-id="'+h(item.id)+'">Duplicate</button>'+(mayDelete(item)?'<button class="danger-button" data-action="delete-recurring-expense" data-id="'+h(item.id)+'">Delete</button>':'')+'</div></td></tr>';
}
function renderRecurringExpenses() {
  const allItems=state.data.recurringExpenses||[],items=filteredRecurringExpenses(),today=todayIso(),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
  const monthEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),yearEnd=year+"-12-31",monthStart=today.slice(0,7)+"-01",yearStart=year+"-01-01";
  const active=allItems.filter(recurringIsActive),overdue=active.filter(function(item){return Number(item.daysUntil)<0;}),next30=active.filter(function(item){return Number(item.daysUntil)>=0&&Number(item.daysUntil)<=30;});
  $("recurringExpenseCount").textContent=plural(allItems.length,"payment")+(overdue.length?" · "+overdue.length+" overdue":"");
  $("recurringSummary").innerHTML='<article><small>Active schedules</small><strong>'+active.length+'</strong></article><article class="danger"><small>Overdue</small><strong>'+overdue.length+'</strong></article><article><small>Due in 30 days</small><strong>'+next30.length+'</strong></article><article><small>Expected this month</small><strong>'+h(money(recurringForecastBetween(allItems,monthStart,monthEnd)))+'</strong></article><article><small>Expected this year</small><strong>'+h(money(recurringForecastBetween(allItems,yearStart,yearEnd)))+'</strong></article>';
  if(state.inlineRecurringId&&!items.some(function(item){return item.id===state.inlineRecurringId;}))state.inlineRecurringId="";
  $("recurringExpenseList").innerHTML=items.map(function(item){return state.recurringEditAll||item.id===state.inlineRecurringId?renderRecurringInlineRow(item):renderRecurringViewRow(item);}).join("");
  $("recurringEditAll").classList.toggle("hidden",state.recurringEditAll);
  $("recurringCancelAll").classList.toggle("hidden",!state.recurringEditAll);
  $("recurringSaveAll").classList.toggle("hidden",!state.recurringEditAll);
  $("recurringExpenseEmpty").innerHTML=allItems.length?"No regular payment matches the selected filter.":"No regular payment added. Choose <strong>Add regular payment</strong> to add one now or later.";
  $("recurringExpenseEmpty").classList.toggle("hidden",items.length>0);
}
function startInlineRecurringEdit(id) { state.recurringEditAll=false;state.inlineRecurringId=id;renderRecurringExpenses();setTimeout(function(){const row=document.querySelector('tr[data-recurring-id="'+CSS.escape(id)+'"]'),input=row&&row.querySelector('[data-recurring-field="title"]');if(input){input.focus();input.select();}},20); }
function collectRecurringRow(row,item) {
  const element=function(field){return row.querySelector('[data-recurring-field="'+field+'"]');},value=function(field){const input=element(field);return input?String(input.value||"").trim():"";};
  const frequency=value("frequency"),intervalMonths=frequency==="CUSTOM"?Number(value("intervalMonths")):recurringIntervalMonthsClient({frequency:frequency});
  const payload={id:item.id,active:element("active").checked,title:value("title"),memberId:value("memberId"),estimatedAmount:value("estimatedAmount")||0,frequency:frequency,intervalMonths:intervalMonths,nextDueDate:value("nextDueDate"),category:value("category"),subcategory:value("subcategory"),sentTo:value("sentTo"),fromAccount:value("fromAccount"),reason:value("reason"),remindDays:value("remindDays")||"7,1,0",recipientIds:item.recipientIds||"ALL",majorPlanId:value("majorPlanId"),majorPlanPhaseId:value("majorPlanPhaseId")};
  if(!payload.title||!payload.nextDueDate||!payload.category||!payload.subcategory||!payload.sentTo||!payload.fromAccount||!payload.reason)throw new Error("Complete all required fields in “"+(payload.title||"untitled payment")+"”.");
  if(frequency==="CUSTOM"&&(!(intervalMonths>=1)||intervalMonths>60))throw new Error("Custom frequency must be between 1 and 60 months.");
  return payload;
}
async function saveInlineRecurringRow(button) {
  const row=button.closest("tr"),item=(state.data.recurringExpenses||[]).find(function(entry){return entry.id===button.dataset.id;});if(!row||!item)return;
  let payload;try{payload=collectRecurringRow(row,item);}catch(error){return toast(error.message,"error");}
  state.inlineRecurringId="";const result=await mutate("updateRecurringExpense",payload,"Regular payment row updated.",null,"Saving regular payment…");if(!result){state.inlineRecurringId=item.id;renderRecurringExpenses();}
}
function toggleRecurringEditAll(active) { state.recurringEditAll=!!active;state.inlineRecurringId="";renderRecurringExpenses(); }
async function saveAllRecurringRows() {
  const rows=all("tr[data-recurring-id]",$("recurringExpenseList"));if(!rows.length)return toast("No regular-payment rows are visible to save.","error");
  let items;try{items=rows.map(function(row){const item=(state.data.recurringExpenses||[]).find(function(entry){return entry.id===row.dataset.recurringId;});return collectRecurringRow(row,item);});}catch(error){return toast(error.message,"error");}
  state.recurringEditAll=false;const result=await mutate("bulkUpdateRecurringExpenses",{items:items},plural(items.length,"regular payment")+" updated.",null,"Saving all regular payments…");if(!result){state.recurringEditAll=true;renderRecurringExpenses();}
}
function duplicateRecurringExpense(id) {
  const item=(state.data.recurringExpenses||[]).find(function(entry){return entry.id===id;});if(!item)return;
  editRecurringExpense(id);$("recurringExpenseId").value="";$("recurringExpenseTitle").value=item.title+" copy";$("recurringExpenseDialogTitle").textContent="Duplicate regular payment";
}
function recurringExportRows() { return filteredRecurringExpenses().map(function(item){return Object.assign({},item,{memberName:memberName(expenseMemberId(item)),active:recurringIsActive(item)?"Yes":"No",frequencyLabel:recurringFrequencyLabel(item),majorPlanName:majorPlanName(item.majorPlanId),majorPlanPhaseName:majorPlanPhaseName(item.majorPlanPhaseId)});}); }
function printRecurringExpenses() {
  const items=recurringExportRows();if(!items.length)return toast("No regular payments match the selected filter.","error");
  const rows=items.map(function(item,index){const due=recurringDuePresentation(item);return '<tr><td>'+(index+1)+'</td><td>'+h(item.active)+'</td><td><strong>'+h(item.title)+'</strong><br><small>'+h(item.reason)+'</small></td><td>'+h(item.memberName)+'</td><td>'+h(item.category)+' · '+h(item.subcategory)+'</td><td>'+h(item.frequencyLabel)+'</td><td class="number">'+h(Number(item.estimatedAmount||0)>0?money(item.estimatedAmount):"At payment")+'</td><td>'+h(formatDate(item.nextDueDate))+'<br><small>'+h(due.text)+'</small></td><td>'+h(item.sentTo)+'</td><td>'+h(item.fromAccount)+'</td><td>'+h(item.majorPlanName||"—")+'</td></tr>';}).join("");
  const report=window.open("","regularPaymentReport","width=1180,height=850");if(!report)return toast("Allow pop-ups to open the regular-payment report.","error");
  report.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Regular Payments</title><style>body{font:12px Arial;color:#24233d;margin:0;background:#f5f4fa}.report{max-width:1200px;margin:auto;padding:24px}.actions{text-align:right;margin-bottom:14px}button{padding:8px 12px;border:1px solid #6651c7;border-radius:8px;background:white;color:#513da8;font-weight:bold;margin-left:6px}h1{margin:0 0 5px}.meta{color:#68677b}.summary{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.summary span{padding:8px 11px;border-radius:9px;background:#ede9ff;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid #dddbe8;vertical-align:top}th{background:#e9e4fb;text-align:left;font-size:10px;text-transform:uppercase}tbody tr:nth-child(even){background:#eef6ff}.number{text-align:right}@media print{body{background:#fff}.report{max-width:none;padding:0}.actions{display:none}}</style></head><body><main class='report'><div class='actions'><button onclick='window.close()'>Close</button><button onclick='window.print()'>Print</button></div><h1>Regular Payments</h1><p class='meta'>"+h((state.data.settings&&state.data.settings.familyName)||"Our Family Hub")+" · Printed "+h(formatDate(todayIso()))+"</p><section class='summary'><span>"+h(plural(items.length,"schedule"))+"</span><span>FE v"+h(FRONTEND_VERSION)+"</span><span>BE v"+h(state.data.backendVersion||"—")+"</span></section><table><thead><tr><th>#</th><th>Active</th><th>Payment</th><th>Member</th><th>Category</th><th>Frequency</th><th>Expected</th><th>Next due</th><th>Send to</th><th>Account</th><th>Major plan</th></tr></thead><tbody>"+rows+"</tbody></table></main></body></html>");report.document.close();
}
function filteredIncome() { const month=$("incomeMonth").value,cat=$("incomeCategoryFilter").value,member=$("incomeMemberFilter").value,q=normalize($("incomeSearch").value); return state.data.income.filter(function(x){return (!month||String(x.date).slice(0,7)===month)&&(!cat||x.category===cat)&&(!member||x.receivedBy===member)&&(!q||normalize([x.source,x.category,x.receivingMode,memberName(x.receivedBy)].join(" ")).includes(q));}).map(function(x){return Object.assign({},x,{receivedByName:memberName(x.receivedBy)});}); }
function renderIncome() { const items=filteredIncome(),total=items.reduce(function(s,x){return s+Number(x.amount||0);},0); $("incomeTotals").innerHTML='<span class="total-pill green">'+plural(items.length,"entry","entries")+'</span><span class="total-pill green">Total '+h(money(total))+'</span>'; $("incomeRows").innerHTML=items.map(function(x){return '<tr><td>'+h(formatDate(x.date))+'</td><td><strong>'+h(x.source)+'</strong></td><td>'+h(x.category)+'</td><td>'+memberIdentityMarkup(x.receivedBy,true)+'</td><td>'+h(x.receivingMode)+'</td><td class="number"><strong>'+h(money(x.amount))+'</strong></td><td><div class="row-actions"><button class="tiny-button" data-action="edit-income" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-income" data-id="'+h(x.id)+'">×</button>':"")+'</div></td></tr>';}).join(""); $("incomeEmpty").classList.toggle("hidden",items.length>0); }

function renderTargets() { const items=state.data.targets,total=items.reduce(function(s,x){return s+Number(x.targetAmount||0);},0),saved=items.reduce(function(s,x){return s+Number(x.currentAmount||0);},0); $("targetSummary").innerHTML=items.length?'<span class="total-pill">Total goal '+h(money(total))+'</span><span class="total-pill green">Progress '+h(money(saved))+'</span>':""; $("targetGrid").innerHTML=items.map(function(x){const pct=Number(x.targetAmount)?Math.min(100,Math.round(Number(x.currentAmount)/Number(x.targetAmount)*100)):0;return '<article class="target-card"><div class="target-top"><div><small>'+h(x.category)+' · '+h(x.ownerId==="ALL"?"Whole family":memberName(x.ownerId))+'</small><h3>'+h(x.title)+'</h3><small>Due '+h(formatDate(x.dueDate))+'</small></div><span class="target-icon">◎</span></div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div><div class="target-numbers"><span><strong>'+h(money(x.currentAmount))+'</strong> saved</span><span>'+pct+'% of '+h(money(x.targetAmount))+'</span></div><div class="target-actions"><button class="primary-button" data-action="contribute" data-id="'+h(x.id)+'">＋ Add progress</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-target" data-id="'+h(x.id)+'">Delete</button>':"")+'</div></article>';}).join(""); $("targetEmpty").classList.toggle("hidden",items.length>0); }
function reminderBasis(item){let value=String(item&&item.reminderBasis||item&&item.calendarSystem||"GREGORIAN").toUpperCase();if(value==="BOTH")value="GREGORIAN_SAKA";return ["GREGORIAN","SAKA","ODIA","GREGORIAN_SAKA","GREGORIAN_ODIA","SAKA_ODIA","ALL"].includes(value)?value:"GREGORIAN";}
function reminderBasisIncludes(value,calendar){value=String(value||"").toUpperCase();return value==="ALL"||value===calendar||value.split("_").includes(calendar);}
function reminderBasisLabel(value){value=String(value||"").toUpperCase();return {GREGORIAN:"English calendar",SAKA:"saved legacy calendar",ODIA:"Odia Kohinoor/Panjika",GREGORIAN_SAKA:"English + saved legacy calendar",GREGORIAN_ODIA:"English + Odia Kohinoor/Panjika",SAKA_ODIA:"saved legacy + Odia Kohinoor/Panjika",ALL:"English + Odia Kohinoor/Panjika",ORIGINAL:"Original date"}[value]||"English calendar";}
function renderDates() {
  const type=$("dateTypeFilter").value,q=normalize($("dateSearch").value);
  const items=state.data.importantDates.filter(function(x){return (!type||x.eventType===type)&&(!q||normalize([x.title,x.occasionLabel,x.eventType,x.notes,x.calendarDate,x.odiaYear,x.odiaMonth,x.odiaPaksha,x.odiaTithi].join(" ")).includes(q));});
  $("dateGrid").innerHTML=items.map(function(x){
    const basis=reminderBasis(x),occurrence=x.nextOccurrence||x.eventDate,englishParts=dayParts(occurrence);
    const tile=basis==="ODIA"?'<div class="date-tile odia-primary"><strong>'+h(x.odiaTithi||englishParts.day)+'</strong><span>ଓଡ଼ିଆ</span></div>':'<div class="date-tile"><strong>'+h(englishParts.day)+'</strong><span>'+h(englishParts.month)+'</span></div>';
    const photo=x.photoThumbData?'<div class="important-date-photo"><img src="'+h(x.photoThumbData)+'" alt="'+h(x.title)+'" loading="lazy" decoding="async"></div>':'';
    const nextRows=(x.nextOccurrences||[{date:occurrence,basis:basis}]).map(function(next){return '<span class="next-occurrence '+h(String(next.basis||"").toLowerCase())+'"><b>'+h(reminderBasisLabel(next.basis))+" reminder</b> "+h(formatDate(next.date))+(reminderBasisIncludes(next.basis,"ODIA")&&x.odiaMonth?' · '+h(formatOdiaPanjika(x,next.odiaYear||"")):'')+'</span>';}).join("");
    const panjikaOriginal=x.odiaMonth?'<span class="odia-original"><small>'+(x.odiaMonth==="AUTO"?'AUTO-DERIVED ODIA TITHI':'ODIA KOHINOOR / PANJIKA')+'</small><strong>'+h(formatOdiaPanjika(x))+'</strong></span>':'';
    const mappingButton=isAdmin()?'<button class="tiny-button odia-map-button" data-action="manage-odia-mappings" data-id="'+h(x.id)+'">Odia years</button>':'';
    return '<article class="date-card basis-'+h(basis.toLowerCase())+'"><div class="date-visual">'+photo+tile+'</div><div class="date-card-copy"><h3>'+h(x.title)+'</h3>'+(x.occasionLabel?'<p class="occasion-label">'+h(x.occasionLabel)+'</p>':'')+'<p>'+h(x.eventType)+'</p><div class="original-calendar-pair two-calendars'+(x.odiaMonth?'':' english-only')+'"><span><small>ENGLISH ORIGINAL</small><strong>'+h(formatEnglishDate(x.eventDate))+'</strong></span>'+panjikaOriginal+'</div>'+(x.repeatYearly?'<div class="next-occurrence-list">'+nextRows+(reminderBasisIncludes(basis,"ODIA")&&!(x.odiaMappings||[]).some(function(mapping){return String(mapping.gregorianDate)>=todayIso();})?'<span class="odia-mapping-warning"><b>Odia date pending</b> Use Refresh Odia calendar now; an administrator can add a Kohinoor correction under Odia years.</span>':'')+'</div>':'')+'<p>Email: '+h(reminderText(x.remindDays))+'</p>'+(x.repeatYearly?'<span class="repeat-chip">↻ Remind by '+h(reminderBasisLabel(basis))+'</span>':'<span class="repeat-chip one-time">One-time reminder · saved date</span>')+'</div><div class="row-actions">'+mappingButton+'<button class="tiny-button" data-action="edit-date" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-date" data-id="'+h(x.id)+'">×</button>':"")+'</div></article>';
  }).join("");
  $("dateEmpty").classList.toggle("hidden",items.length>0);
}
function reminderText(days) { return String(days||"").split(",").map(function(d){return Number(d)===0?"same day":d+"d before";}).join(", "); }

function renderPhotos() {
  const q=normalize($("photoSearch").value);
  const allPhotos=state.data.photos||[], limit=memoryPhotoLimit(), count=allPhotos.length;
  const items=allPhotos.filter(function(x){return !q||normalize([x.title,x.caption,memberName(x.uploadedBy)].join(" ")).includes(q);});
  const usage=$("photoUsageText"), upload=$("sharePhotoButton"), print=$("printMemories");
  usage.textContent=count+" of "+limit+" memory photos used"+(count>limit?" · remove "+(count-limit)+" to resume uploads":"");
  usage.classList.toggle("limit-reached",count>=limit);
  upload.classList.toggle("hidden",!canUploadMemories());
  upload.disabled=count>=limit;
  upload.textContent=count>=limit?"Memory limit reached":"＋ Add memory photo";
  upload.title=count>=limit?"Delete a memory or ask the administrator to increase the limit.":"Add a family memory";
  print.classList.toggle("hidden",!allPhotos.length);
  $("photoDialogLimitText").textContent=count+" of "+limit+" memory photos are currently saved.";
  $("photoGrid").innerHTML=items.map(function(x){return '<article class="photo-card"><figure data-action="view-photo" data-id="'+h(x.id)+'"><img src="'+h(x.thumbData)+'" alt="'+h(x.title)+'" loading="lazy" decoding="async">'+(mayDelete({createdBy:x.uploadedBy})?'<button class="photo-delete" type="button" data-action="delete-photo" data-id="'+h(x.id)+'" aria-label="Delete photo">×</button>':"")+'</figure><figcaption><h3>'+h(x.title)+'</h3>'+(x.caption?'<p>'+h(x.caption)+'</p>':"")+'<div class="photo-meta"><span>'+h(formatDate(x.takenDate||x.createdAt))+'</span><span>by '+h(memberName(x.uploadedBy))+'</span></div></figcaption></article>';}).join("");
  $("photoEmpty").classList.toggle("hidden",items.length>0);
}

function openMemoryPrintView() {
  const query=normalize($("photoSearch").value);
  const items=(state.data.photos||[]).filter(function(x){return !query||normalize([x.title,x.caption,memberName(x.uploadedBy)].join(" ")).includes(query);});
  if (!items.length) return toast("No family memories are available to print.","error");
  const configuredPages=memoryPrintPages(), pageCount=Math.min(configuredPages,items.length), perPage=Math.ceil(items.length/pageCount);
  const familyName=(state.data.settings&&state.data.settings.familyName)||"Our Family Hub";
  const pages=[];
  for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
    const pageItems=items.slice(pageIndex*perPage,(pageIndex+1)*perPage);
    if(!pageItems.length)continue;
    const columns=pageItems.length<=4?2:(pageItems.length<=9?3:4), rows=Math.ceil(pageItems.length/columns);
    const cards=pageItems.map(function(item){return '<article class="memory-card"><img src="'+h(item.thumbData)+'" alt="'+h(item.title)+'"><div><h2>'+h(item.title)+'</h2><p>'+h(item.caption||"")+'</p><small>'+h(formatDate(item.takenDate||item.createdAt))+' · '+h(memberName(item.uploadedBy))+'</small></div></article>';}).join("");
    pages.push('<section class="memory-print-page" style="--memory-columns:'+columns+';--memory-rows:'+rows+'"><header><span>FAMILY MEMORIES</span><h1>'+h(familyName)+'</h1><p>Selected moments worth remembering</p></header><div class="memory-print-grid">'+cards+'</div><footer><span>'+h(plural(items.length,"memory","memories"))+'</span><span>Page '+(pageIndex+1)+' of '+pageCount+'</span></footer></section>');
  }
  const reportWindow=window.open("","familyMemoryAlbum","width=980,height=850");
  if(!reportWindow)return toast("Allow pop-ups for this page to view or print family memories.","error");
  reportWindow.document.open();
  reportWindow.document.write("<!doctype html><html><head><meta charset='utf-8'><title>"+h(familyName)+" · Family Memories</title><style>"+
    "@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;padding:62px 18px 24px;color:#25243b;background:#eceaf4;font:12px Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.screen-actions{position:fixed;left:0;right:0;top:0;z-index:5;display:flex;justify-content:center;gap:10px;padding:12px;background:#2d2748}.screen-actions button{border:0;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer}.print{color:white;background:#7258d5}.close{color:#35314e;background:white}.memory-print-page{width:190mm;height:277mm;margin:0 auto 20px;padding:9mm;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:5mm;background:#fff;border-radius:8px;box-shadow:0 8px 30px rgba(31,27,58,.14);page-break-after:always;break-after:page;overflow:hidden}.memory-print-page:last-child{page-break-after:auto;break-after:auto}.memory-print-page header{padding:5mm;border-radius:6mm;color:white;background:linear-gradient(125deg,#5d45b8,#7c62d9 58%,#51aeb5)}header span{font-size:9px;font-weight:800;letter-spacing:2px}header h1{margin:3px 0 1px;font-size:22px}header p{margin:0;color:rgba(255,255,255,.82)}.memory-print-grid{min-height:0;display:grid;grid-template-columns:repeat(var(--memory-columns),minmax(0,1fr));grid-template-rows:repeat(var(--memory-rows),minmax(0,1fr));gap:4mm}.memory-card{min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto;border:1px solid #dedbea;border-radius:4mm;overflow:hidden;background:#faf9fe}.memory-card img{width:100%;height:100%;min-height:0;display:block;object-fit:cover}.memory-card div{padding:3mm}.memory-card h2{margin:0 0 1mm;font-size:12px}.memory-card p{margin:0 0 1mm;min-height:12px;color:#626277;font-size:9px;line-height:1.3}.memory-card small{color:#8b899c;font-size:8px}.memory-print-page footer{display:flex;justify-content:space-between;color:#807e91;font-size:9px}@media print{body{padding:0;background:white}.screen-actions{display:none}.memory-print-page{margin:0;width:190mm;height:277mm;border-radius:0;box-shadow:none}}"+
    "</style></head><body><div class='screen-actions'><button class='close' type='button' onclick='window.close()'>Close view</button><button class='print' type='button' onclick='window.print()'>Print "+pageCount+" page"+(pageCount===1?"":"s")+"</button></div>"+pages.join("")+"</body></html>");
  reportWindow.document.close();
}
async function viewPhoto(id) { const item=state.data.photos.find(function(x){return x.id===id;}); if(!item)return; $("viewerTitle").textContent=item.title; $("viewerMeta").textContent=formatDate(item.takenDate||item.createdAt)+" · by "+memberName(item.uploadedBy); $("viewerText").textContent=item.caption||""; $("viewerImage").classList.add("hidden"); $("viewerLoading").classList.remove("hidden"); openDialog("photoViewer"); try{const result=await api("getPhoto",{id:id}); $("viewerImage").src=result.dataUrl; $("viewerImage").classList.remove("hidden"); $("viewerLoading").classList.add("hidden");}catch(error){if(!handleSessionError(error))$("viewerLoading").textContent=error.message;} }

function renderExperiences() { const year=$("experienceYear").value,q=normalize($("experienceSearch").value); const items=state.data.experiences.filter(function(x){return (!year||String(x.experienceDate).slice(0,4)===year)&&(!q||normalize([x.title,x.place,x.story,x.tags,memberName(x.createdBy)].join(" ")).includes(q));}); $("experienceGrid").innerHTML=items.map(function(x){const tags=String(x.tags||"").split(",").map(function(t){return t.trim();}).filter(Boolean);return '<article class="experience-card"><div class="experience-meta"><span>'+h(formatDate(x.experienceDate))+'</span>'+(x.place?'<span>⌖ '+h(x.place)+'</span>':"")+'</div><h3>'+h(x.title)+'</h3><p class="story">'+h(x.story)+'</p><div class="tag-list">'+tags.map(function(t){return '<span class="tag">'+h(t)+'</span>';}).join("")+'</div><div class="experience-footer"><span class="writer">Written by '+h(memberName(x.createdBy))+'</span><div class="row-actions"><button class="tiny-button" data-action="edit-experience" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-experience" data-id="'+h(x.id)+'">×</button>':"")+'</div></div></article>';}).join(""); $("experienceEmpty").classList.toggle("hidden",items.length>0); }
function renderDiary() { const month=$("diaryMonth").value,writer=$("diaryWriterFilter").value,q=normalize($("diarySearch").value); const items=state.data.diary.filter(function(x){return (!month||String(x.diaryDate).slice(0,7)===month)&&(!writer||x.createdBy===writer)&&(!q||normalize([x.title,x.body,x.mood,x.tags,memberName(x.createdBy)].join(" ")).includes(q));}); $("diaryTimeline").innerHTML=items.map(function(x){const p=dayParts(x.diaryDate),tags=String(x.tags||"").split(",").map(function(t){return t.trim();}).filter(Boolean);return '<article class="diary-entry"><div class="diary-date-badge"><strong>'+p.day+'</strong><span>'+p.month+'</span></div><div class="diary-entry-top"><div><h3>'+h(x.title)+'</h3><span class="writer">Written by '+h(memberName(x.createdBy))+'</span></div><span class="diary-mood">'+h(x.mood)+'</span></div><p class="diary-body">'+h(x.body)+'</p><div class="diary-entry-footer"><div class="tag-list">'+tags.map(function(t){return '<span class="tag">'+h(t)+'</span>';}).join("")+'</div><div class="row-actions"><button class="tiny-button" data-action="edit-diary" data-id="'+h(x.id)+'">Edit</button>'+(mayDelete(x)?'<button class="danger-button" data-action="delete-diary" data-id="'+h(x.id)+'">×</button>':"")+'</div></div></article>';}).join(""); $("diaryEmpty").classList.toggle("hidden",items.length>0); }

function importantDateMatchesIso(item,iso,cellSaka) {
  if(!item.repeatYearly)return item.eventDate===iso;
  const basis=reminderBasis(item),englishMatch=String(item.eventDate).slice(5)===String(iso).slice(5),saved=String(item.calendarDate||"").split("-").map(Number);
  const sakaMatch=saved.length===3&&saved[1]===cellSaka.month&&Math.min(saved[2],sakaMonthLengths(cellSaka.year+78)[cellSaka.month-1])===cellSaka.day;
  const odiaMatch=(item.odiaMappings||[]).some(function(mapping){return mapping.gregorianDate===iso;});
  return (reminderBasisIncludes(basis,"GREGORIAN")&&englishMatch)||(reminderBasisIncludes(basis,"SAKA")&&sakaMatch)||(reminderBasisIncludes(basis,"ODIA")&&odiaMatch);
}
function renderCalendar() {
  if (!state.data) return;
  const year=state.calendarCursor.getFullYear(),month=state.calendarCursor.getMonth(),englishMonthLabel=state.calendarCursor.toLocaleDateString("en-IN",{month:"long",year:"numeric"}),odiaMonthLabel=state.calendarCursor.toLocaleDateString("or-IN-u-nu-orya",{month:"long",year:"numeric"}); const monthLabels=[];if(calendarDisplayIncludes("ENGLISH"))monthLabels.push('<span class="gregorian-month-label">'+h(englishMonthLabel)+'</span>');if(calendarDisplayIncludes("ODIA"))monthLabels.push('<span class="odia-month-label"><small>ଓଡ଼ିଆ</small>'+h(odiaMonthLabel)+'</span>');$("calendarMonthLabel").innerHTML=monthLabels.join(""); $("calendarMonthLabel").setAttribute("aria-label",[calendarDisplayIncludes("ENGLISH")?englishMonthLabel:"",calendarDisplayIncludes("ODIA")?odiaMonthLabel:""].filter(Boolean).join("; "));
  const first=new Date(year,month,1),start=new Date(year,month,1-first.getDay()),today=todayIso(),cells=[];
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");const events=[],cellSaka=gregorianToSaka(iso);
    state.data.odiaFestivals.forEach(function(x){if(x.eventDate===iso)events.push({type:"odia-festival",title:"Odia festival: "+x.name});});
    state.data.importantDates.forEach(function(x){if(importantDateMatchesIso(x,iso,cellSaka)){const odiaMapping=(x.odiaMappings||[]).find(function(mapping){return mapping.gregorianDate===iso;}),isOdia=!!odiaMapping;events.push({type:isOdia?"odia-reminder":"reminder",title:(x.occasionLabel||x.title)+" · "+(isOdia?formatOdiaPanjika(x,odiaMapping.odiaYear||""):reminderBasisLabel(reminderBasis(x)))});}});
    state.data.recurringExpenses.forEach(function(x){if(recurringIsActive(x)&&x.nextDueDate===iso)events.push({type:"recurring",title:"Payment: "+x.title});});
    state.data.expenses.map(normalizeExpense).forEach(function(x){if(x.status==="PLANNED"&&x.date===iso)events.push({type:"recurring",title:"Preplanned: "+(x.reason||x.category)});});
    state.data.experiences.forEach(function(x){if(x.experienceDate===iso)events.push({type:"experience",title:x.title});}); state.data.diary.forEach(function(x){if(x.diaryDate===iso)events.push({type:"diary",title:x.title});});
    const mainDay=calendarDisplayIncludes("ENGLISH")?d.getDate():new Intl.NumberFormat("or-IN-u-nu-orya").format(d.getDate()),odiaChip=calendarDisplayIncludes("ENGLISH")&&calendarDisplayIncludes("ODIA")?'<small class="odia-day-chip" title="'+h(formatOdiaScriptDate(iso))+'"><b>'+h(new Intl.NumberFormat("or-IN-u-nu-orya").format(d.getDate()))+'</b><em>ଓ</em></small>':'';
    cells.push('<div class="calendar-cell '+(d.getMonth()!==month?'other-month ':'')+(iso===today?'today':'')+'"><div class="calendar-day-pair"><span class="calendar-day">'+mainDay+'</span>'+odiaChip+'</div><div class="calendar-events">'+events.slice(0,4).map(function(e){return '<button class="calendar-event '+e.type+'" title="'+h(e.title)+'">'+h(e.title)+'</button>';}).join("")+(events.length>4?'<span class="calendar-event">+'+(events.length-4)+' more</span>':"")+'</div></div>');
  } $("calendarGrid").innerHTML=cells.join("");
}

function renderAdmin() {
  $("settingFamilyName").value=state.data.settings.familyName||""; $("settingCurrency").value=state.data.settings.currency||"INR"; $("settingTimezone").value=state.data.settings.timezone||"Asia/Kolkata";
  $("settingCalendarDisplayMode").value=["ENGLISH","ODIA","ENGLISH_ODIA"].includes(String(state.data.settings.calendarDisplayMode||"ENGLISH_ODIA"))?String(state.data.settings.calendarDisplayMode||"ENGLISH_ODIA"):"ENGLISH_ODIA";
  $("settingOdiaFestivalAutoEnabled").checked=String(state.data.settings.odiaFestivalAutoEnabled===undefined?"true":state.data.settings.odiaFestivalAutoEnabled).toLowerCase()!=="false";
  $("settingOdiaPersonalAutoEnabled").checked=String(state.data.settings.odiaPersonalAutoEnabled===undefined?"true":state.data.settings.odiaPersonalAutoEnabled).toLowerCase()!=="false";
  const odiaStatus=$("odiaCalendarAutoStatus"),last=state.data.settings.odiaFestivalLastRefreshAt||"",personalLast=state.data.settings.odiaPersonalLastRefreshAt||"",failure=state.data.settings.odiaFestivalLastError||state.data.settings.odiaPersonalLastError||"",statusTime=last||personalLast; odiaStatus.textContent=failure?("⚠ Cached dates retained · "+failure):statusTime?("● Automatic calendar current · "+new Date(statusTime).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})):(state.data.odiaFestivals.length?"● Automatic festival cache ready":"Not refreshed yet"); odiaStatus.classList.toggle("success",!failure&&!!(statusTime||state.data.odiaFestivals.length));
  $("settingDashboardClockHighlight").value=dashboardClockHighlight(); previewDashboardClockHighlight(dashboardClockHighlight());
  const parentsThumb=String(state.data.settings.parentsPortraitThumbData||""); state.pendingParentsPortrait=null; $("parentsPortraitFile").value=""; setParentsPortraitPreview($("adminParentsPortraitPreview"),parentsThumb); $("settingParentsPortraitCaption").value=parentsPortraitCaption(); $("removeParentsPortrait").classList.toggle("hidden",!parentsThumb); const parentsFolder=$("parentsPortraitFolderLink"),parentsFolderUrl=state.data.parentsPortraitFolderUrl||""; parentsFolder.classList.toggle("hidden",!parentsFolderUrl); if(parentsFolderUrl)parentsFolder.href=parentsFolderUrl;
  $("settingMemoryPhotoLimit").value=memoryPhotoLimit();
  $("settingMemoryUploadPolicy").value=state.data.settings.memoryUploadPolicy==="MEMBERS_WITH_ACCESS"?"MEMBERS_WITH_ACCESS":"ADMIN_ONLY";
  $("settingMemoryPrintPages").value=String(memoryPrintPages());
  const idleTimeoutSupported=adjustableIdleTimeoutSupported(),idleSelect=$("settingSessionIdleMinutes"),idleHelp=$("sessionIdleTimeoutHelp"); idleSelect.value=String(idleTimeoutMinutes()); idleSelect.disabled=!idleTimeoutSupported; idleHelp.textContent=idleTimeoutSupported?("Current inactivity sign-out: "+idleTimeoutLabel(idleTimeoutMinutes())+". Closing or leaving the page still signs out immediately."):"Deploy BE v1.0.37 to enable this control. Until then, the existing 5-minute timeout remains active."; idleHelp.classList.toggle("version-warning",!idleTimeoutSupported);
  $("settingMonthlyExpenseBudget").value=Number(state.data.settings.monthlyExpenseBudget||0)||"";
  $("settingExpenseSettlementEnabled").checked=expenseSharingEnabled();
  const configuredCategories=expenseCategoryConfig(), activeCategories=configuredCategories.filter(function(category){return category.active!==false;}); $("adminExpenseCategorySummary").textContent=plural(configuredCategories.length,"category","categories")+" · "+activeCategories.length+" active";
  const backup=state.data.backupStatus||{}; $("automaticBackupStatus").textContent=backup.automatic?"● Monthly backup enabled":"● Monthly backup needs setup"; $("automaticBackupStatus").classList.toggle("success",!!backup.automatic); $("lastBackupText").textContent=backup.lastBackupAt?("Last backup: "+new Date(backup.lastBackupAt).toLocaleString("en-IN")+(backup.lastBackupName?" · "+backup.lastBackupName:"")):"No backup created yet."; $("backupFolderLink").classList.toggle("hidden",!backup.folderUrl); if(backup.folderUrl)$("backupFolderLink").href=backup.folderUrl;
  const photoFolder=$("memberPhotoFolderLink"),folderUrl=state.data.memberPhotoFolderUrl||""; photoFolder.classList.toggle("hidden",!folderUrl); if(folderUrl)photoFolder.href=folderUrl;
  const labels={EXPENSES:"Exp",INCOME:"Income",TARGETS:"Targets",DATES:"Reminders",CALENDAR:"Calendar",PHOTOS:"Photos",EXPERIENCES:"Experiences",DIARY:"Diary",STICKY_WRITE:"Write sticky notes"}; const items=state.data.adminMembers||[]; $("memberCount").textContent=plural(items.length,"person","people"); $("memberList").innerHTML=items.map(function(x){const access=x.role==="ADMIN"?"All sections · Write sticky notes":(x.permissions||[]).map(function(key){return labels[key]||key;}).join(", ")||"No sections";return '<div class="member-row">'+memberAvatarMarkup(x.id,"admin")+'<div><strong>'+h(x.name)+'</strong><small>@'+h(x.username)+'</small></div><div><strong>'+h(x.email||"No email")+'</strong><small>Access: '+h(access)+'</small></div><span class="role-chip">'+(x.role==="ADMIN"?"ADMIN":"MEMBER")+'</span><span class="active-chip '+(!x.active?'inactive':'')+'">'+(x.active?'● Active':'● Inactive')+'</span><div class="member-actions"><button class="tiny-button photo-button" data-action="manage-member-photo" data-id="'+h(x.id)+'">'+(x.photoThumbData?'Update photo':'Add photo')+'</button><button class="tiny-button" data-action="edit-member" data-id="'+h(x.id)+'">Edit</button><button class="tiny-button" data-action="set-password" data-id="'+h(x.id)+'">Set/change password</button></div></div>';}).join("");
}

function renderStickyNotes() {
  if (!state.data || !canUseStickyNotes()) return;
  const notes = state.data.stickyNotes || [];
  const active = notes.filter(function (note) { return note.status !== "COMPLETED"; });
  const completed = notes.filter(function (note) { return note.status === "COMPLETED"; });
  $("stickyActiveCount").textContent = active.length;
  $("stickyLauncher").setAttribute("aria-label", "Open sticky-note side panel · " + plural(active.length, "active note"));
  $("stickySectionTitle").textContent = state.stickyView === "active" ? "Targets & reminders" : "Completed history";
  $("stickyBoardSummary").textContent = state.stickyView === "active" ? plural(active.length, "active note") : plural(completed.length, "completed note");
  $("stickyTabActive").classList.toggle("active", state.stickyView === "active");
  $("stickyTabCompleted").classList.toggle("active", state.stickyView === "completed");
  $("stickyTabActive").setAttribute("aria-selected", state.stickyView === "active" ? "true" : "false");
  $("stickyTabCompleted").setAttribute("aria-selected", state.stickyView === "completed" ? "true" : "false");
  $("stickyCanvas").classList.toggle("hidden", state.stickyView !== "active");
  $("stickyCompletedList").classList.toggle("hidden", state.stickyView !== "completed");

  $("stickyCanvas").innerHTML = active.map(function (note, index) { return stickyNoteMarkup(note, index, false); }).join("");

  $("stickyCompletedList").innerHTML = completed.map(function (note) {
    const completedText = note.completedAt ? formatDate(note.completedAt) : "Completed";
    const writeActions = canWriteStickyNotes() ? '<button type="button" data-action="restore-sticky" data-id="'+h(note.id)+'">↶ Restore</button>'+(mayDelete(note)?'<button class="delete" type="button" data-action="delete-sticky" data-id="'+h(note.id)+'">Delete</button>':'') : '<span class="sticky-readonly-chip">🔒 Read only</span>';
    return '<article class="sticky-completed-card sticky-'+h(note.color||"yellow")+'" data-sticky-id="'+h(note.id)+'"><span class="sticky-completed-colour"></span><div><small>'+h(note.noteType==="REMINDER"?"REMINDER":"TARGET")+'</small><h4>'+h(note.title)+'</h4><p>'+h(note.body)+'</p><em>'+h(completedText)+' by '+h(memberName(note.completedBy))+(note.dueDate?' · Due '+h(formatDate(note.dueDate)):'')+'</em></div><div class="sticky-archive-actions">'+writeActions+'</div></article>';
  }).join("");

  const empty = state.stickyView === "active" ? !active.length : !completed.length;
  $("stickyEmpty").classList.toggle("hidden", !empty);
  $("stickyEmpty").querySelector("strong").textContent = state.stickyView === "active" ? "No active sticky notes" : "No completed sticky notes";
  $("stickyEmpty").querySelector("p").textContent = state.stickyView === "active" ? "Add a target or reminder here. Pin a note to keep it floating above the dashboard." : "Completed notes are stored in the separate Sticky Note Diary sheet and can be restored.";
  renderStickyPinnedLayer(active);
}

function stickyNoteMarkup(note, index, pinnedOverlay, sideOpen) {
  const width = Math.max(220, Math.min(520, Number(note.width || 280)));
  const height = Math.max(160, Math.min(500, Number(note.height || 220)));
  let x = Math.max(0, Math.min(2000, Number(note.positionX || 20)));
  let y = Math.max(0, Math.min(2000, Number(note.positionY || 20)));
  if (pinnedOverlay && window.matchMedia("(max-width: 640px)").matches) { x = 0; y = 8 + index * 30; }
  const dueClass = note.dueDate && note.dueDate < todayIso() ? " overdue" : "";
  const dueText = note.dueDate ? ((dueClass ? "Overdue · " : "Due · ") + formatDate(note.dueDate)) : "No due date";
  const z = note.pinned ? 5000 + index : sideOpen ? 4800 : 20 + index;
  const collapseControl = note.pinned ? '<button class="sticky-locked-open" type="button" disabled title="Pinned notes stay open">🔒</button>' : sideOpen ? '<button type="button" data-action="close-side-sticky" title="Collapse to side tab">›</button>' : '<button type="button" data-action="collapse-sticky" data-id="'+h(note.id)+'" title="'+(note.collapsed?'Open note':'Collapse note')+'">'+(note.collapsed?'▾':'▴')+'</button>';
  const titleControl = note.pinned ? '<strong class="sticky-note-title" title="This pinned note stays open">'+h(note.title)+'</strong>' : '<button class="sticky-note-title" type="button" data-action="collapse-sticky" data-id="'+h(note.id)+'" title="Open or collapse this note">'+h(note.title)+'</button>';
  const footerCollapse = note.pinned
    ? '<button class="collapse-action locked" type="button" disabled title="Unpin this note before collapsing it">🔒 Stays open</button>'
    : sideOpen ? '<button class="collapse-action" type="button" data-action="close-side-sticky">› Side tab</button>' : '<button class="collapse-action" type="button" data-action="collapse-sticky" data-id="'+h(note.id)+'">▴ Collapse</button>';
  const contentActions = canWriteStickyNotes() ? '<button type="button" data-action="edit-sticky" data-id="'+h(note.id)+'">Edit</button><button class="complete" type="button" data-action="complete-sticky" data-id="'+h(note.id)+'">✓ Complete</button>'+(mayDelete(note)?'<button class="delete" type="button" data-action="delete-sticky" data-id="'+h(note.id)+'">Delete</button>':'') : '<span class="sticky-readonly-chip">🔒 Read only</span>';
  return '<article class="sticky-note sticky-'+h(note.color||"yellow")+(!note.pinned&&note.collapsed&&!sideOpen?' collapsed':'')+(note.pinned?' pinned':'')+(pinnedOverlay?' pinned-overlay-note':'')+(sideOpen?' side-open-note':'')+'" data-sticky-id="'+h(note.id)+'" style="left:'+x+'px;top:'+y+'px;--overlay-top:'+y+'px;width:'+width+'px;height:'+height+'px;z-index:'+z+'">'+
    '<header class="sticky-note-head sticky-drag-handle"><span class="sticky-move-label">⠿ Move note</span><span class="sticky-type">'+(note.noteType==="REMINDER"?'REMINDER':'TARGET')+'</span>'+titleControl+'<div class="sticky-head-actions">'+collapseControl+'</div></header>'+
    '<div class="sticky-note-content"><span class="sticky-pinned-label '+(note.pinned?'':'hidden')+'">📌 PINNED OPEN</span><p>'+h(note.body)+'</p><small class="sticky-due'+dueClass+'">'+h(dueText)+'</small><small>Added by '+h(memberName(note.createdBy))+'</small></div>'+
    '<footer class="sticky-note-actions"><button class="pin-action" type="button" data-action="pin-sticky" data-id="'+h(note.id)+'">'+(note.pinned?'📌 Unpin':'📌 Pin open')+'</button>'+footerCollapse+contentActions+'<span class="sticky-size-actions"><button type="button" data-action="auto-fit-sticky" data-id="'+h(note.id)+'" title="Fit the note to its content">Auto-fit</button><button type="button" data-action="shrink-sticky" data-id="'+h(note.id)+'" title="Decrease note size">−</button><button type="button" data-action="grow-sticky" data-id="'+h(note.id)+'" title="Increase note size">＋</button></span></footer><span class="sticky-resize-handle" title="Drag to resize" aria-label="Resize sticky note"></span></article>';
}

function renderStickyPinnedLayer(activeNotes) {
  if (!state.data || !canUseStickyNotes()) { $("stickyPinnedLayer").classList.add("hidden"); return; }
  const notes = activeNotes || (state.data.stickyNotes || []).filter(function (note) { return note.status !== "COMPLETED"; });
  const pinned = notes.filter(function (note) { return note.pinned; });
  const boardOpen = !$("stickyBoard").classList.contains("hidden");
  $("stickyPinnedCanvas").innerHTML = pinned.map(function (note, index) { return stickyNoteMarkup(note, index, true, false); }).join("");
  $("stickyPinnedLayer").classList.toggle("hidden", boardOpen || !pinned.length);
}

function startStickyDrag(event) {
  if (window.matchMedia("(max-width: 640px)").matches || event.button !== 0 || event.target.closest("button")) return;
  const handle = event.target.closest(".sticky-drag-handle"); if (!handle) return;
  const element = handle.closest(".sticky-note"), note = state.data.stickyNotes.find(function (item) { return item.id === element.dataset.stickyId; }); if (!note) return;
  if (element.classList.contains("side-open-note") || element.closest("#stickyBoard")) return;
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

function startStickyResize(event) {
  const handle = event.target.closest(".sticky-resize-handle"); if (!handle || event.button !== 0) return;
  const element = handle.closest(".sticky-note"), note = state.data.stickyNotes.find(function(item){return item.id===element.dataset.stickyId;}); if (!note) return;
  event.preventDefault(); event.stopPropagation();
  handle.setPointerCapture(event.pointerId); element.classList.add("resizing");
  state.stickyResize = { element: element, note: note, startX: event.clientX, startY: event.clientY, startWidth: element.offsetWidth, startHeight: element.offsetHeight };
}

function moveStickyResize(event) {
  const resize = state.stickyResize; if (!resize) return;
  event.preventDefault();
  const width = Math.max(220, Math.min(520, resize.startWidth + event.clientX - resize.startX));
  const height = Math.max(160, Math.min(500, resize.startHeight + event.clientY - resize.startY));
  resize.element.style.width = Math.round(width) + "px"; resize.element.style.height = Math.round(height) + "px";
}

function endStickyResize() {
  const resize = state.stickyResize; if (!resize) return;
  resize.element.classList.remove("resizing"); resize.note.width = Math.round(resize.element.offsetWidth); resize.note.height = Math.round(resize.element.offsetHeight);
  state.stickyResize = null; queueStickyLayoutSave(resize.note);
}

function renderGlobalSearch() {
  const q=normalize($("globalSearch").value); if(q.length<2){$("globalSearchResults").innerHTML='<p class="muted">Type at least 2 characters to search all family records.</p>';return;} let results=[];
  state.data.expenses.forEach(function(x){const expense=normalizeExpense(x);if(normalize([expense.status,expense.category,expense.subcategory,majorPlanName(expense.majorPlanId),majorPlanPhaseName(expense.majorPlanPhaseId),expense.sentTo,expense.fromAccount,expense.reason].join(" ")).includes(q))results.push({view:"expenses",icon:expense.status==="PLANNED"?"◷":"₹",title:expense.reason||expense.sentTo,meta:(expense.status==="PLANNED"?"Preplanned · ":"")+expense.category+(expense.majorPlanId?" · "+majorPlanName(expense.majorPlanId):"")+" · "+money(x.amount)+" · "+formatDate(x.date)});});
  state.data.recurringExpenses.forEach(function(x){if(normalize([x.title,x.sentTo,x.fromAccount,x.reason,x.frequency].join(" ")).includes(q))results.push({view:"expenses",icon:"↻",title:x.title,meta:(x.frequency==="YEARLY"?"Yearly":"Monthly")+" payment · due "+formatDate(x.nextDueDate)});});
  state.data.majorPlans.forEach(function(x){if(normalize([x.name,x.notes,x.status,memberName(x.ownerId)].join(" ")).includes(q))results.push({view:"expenses",icon:"▣",title:x.name,meta:"Major plan · "+String(x.status||"ACTIVE")+" · "+money(x.proposedAmount)});});
  state.data.income.forEach(function(x){if(normalize([x.source,x.category,memberName(x.receivedBy)].join(" ")).includes(q))results.push({view:"income",icon:"↗",title:x.source,meta:money(x.amount)+" · "+formatDate(x.date)});});
  state.data.targets.forEach(function(x){if(normalize([x.title,x.category,x.notes].join(" ")).includes(q))results.push({view:"targets",icon:"◎",title:x.title,meta:"Target · "+money(x.targetAmount)});});
  state.data.importantDates.forEach(function(x){if(normalize([x.title,x.occasionLabel,x.eventType,x.notes,x.calendarDate].join(" ")).includes(q))results.push({view:"dates",icon:"◫",title:x.occasionLabel||x.title,meta:x.eventType+" · "+reminderBasisLabel(reminderBasis(x))+" · "+formatDate(x.nextOccurrence)});});
  state.data.odiaFestivals.forEach(function(x){if(normalize([x.name,x.source].join(" ")).includes(q))results.push({view:"calendar",icon:"✿",title:x.name,meta:"Automatic Odia festival · "+formatDate(x.eventDate)});});
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
async function previewMemberPhoto() {
  const file=$("memberPhotoFile").files[0]; if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Choose a JPG, PNG or WebP image.","error");
  showLoading("Preparing member photo…");
  try {
    const full=await resizeImage(file,800,.84),thumb=await resizeImage(file,140,.72);
    state.pendingMemberPhoto={name:file.name.replace(/[^A-Za-z0-9._-]/g,"_"),fullData:full,thumbData:thumb};
    $("memberPhotoCurrent").innerHTML='<img src="'+h(thumb)+'" alt="Selected member photo preview">';
  } catch(error) { toast("This member photo could not be prepared.","error"); }
  finally { hideLoading(); }
}
async function previewParentsPortrait() {
  const file=$("parentsPortraitFile").files[0]; if(!file)return;
  if(!isAdmin())return toast("Only an administrator can change the parents’ portrait.","error");
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Choose a JPG, PNG or WebP image.","error");
  showLoading("Preparing parents’ portrait…");
  try {
    const full=await resizeImage(file,1400,.86),thumb=await resizeImage(file,300,.68);
    if(thumb.length>48000)throw new Error("The portrait is still too large after resizing.");
    state.pendingParentsPortrait={name:file.name.replace(/[^A-Za-z0-9._-]/g,"_"),fullData:full,thumbData:thumb};
    setParentsPortraitPreview($("adminParentsPortraitPreview"),thumb);
  } catch(error){toast(error.message||"This portrait could not be prepared.","error");}
  finally{hideLoading();}
}
async function saveParentsPortrait() {
  if(!state.pendingParentsPortrait)return toast("Choose your mother and father’s photo first.","error");
  const portrait=state.pendingParentsPortrait;
  await mutate("uploadParentsPortrait",{fileName:portrait.name,fullData:portrait.fullData,thumbData:portrait.thumbData,caption:$("settingParentsPortraitCaption").value.trim()},"Parents’ portrait updated.",null,"Saving parents’ portrait privately to Google Drive…");
}
async function deleteParentsPortrait() {
  if(!window.confirm("Remove the parents’ portrait from the dashboard? The private Drive file will be moved to Trash."))return;
  await mutate("deleteParentsPortrait",{},"Parents’ portrait removed.",null,"Removing parents’ portrait…");
}
function setImportantDatePhotoPreview(dataUrl) {
  const preview=$("importantDatePhotoPreview");
  preview.innerHTML=dataUrl?'<img src="'+h(dataUrl)+'" alt="Reminder photo preview">':'<span>◎</span>';
  $("removeImportantDatePhoto").classList.toggle("hidden",!dataUrl);
}
async function previewImportantDatePhoto() {
  const file=$("importantDatePhotoFile").files[0]; if(!file)return;
  if(!isAdmin())return toast("Only the administrator can attach reminder photos.","error");
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Choose a JPG, PNG or WebP image.","error");
  showLoading("Preparing reminder photo…");
  try {
    const full=await resizeImage(file,1000,.84),thumb=await resizeImage(file,180,.72);
    state.pendingImportantDatePhoto={name:file.name.replace(/[^A-Za-z0-9._-]/g,"_"),fullData:full,thumbData:thumb};
    state.removeImportantDatePhoto=false; setImportantDatePhotoPreview(thumb);
  } catch(error){toast("This reminder photo could not be prepared.","error");}
  finally{hideLoading();}
}
function removeImportantDatePhotoPreview() {
  if(!isAdmin())return;
  state.pendingImportantDatePhoto=null; state.removeImportantDatePhoto=true; $("importantDatePhotoFile").value=""; setImportantDatePhotoPreview(null);
}
function resizeImage(file,maxDimension,quality){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onerror=reject;reader.onload=function(){const img=new Image();img.onerror=reject;img.onload=function(){let w=img.width,hgt=img.height;if(Math.max(w,hgt)>maxDimension){const scale=maxDimension/Math.max(w,hgt);w=Math.round(w*scale);hgt=Math.round(hgt*scale);}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=hgt;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,hgt);ctx.drawImage(img,0,0,w,hgt);resolve(canvas.toDataURL("image/jpeg",quality));};img.src=reader.result;};reader.readAsDataURL(file);});}
function exportCsv(filename,items,fields,headers){if(!items.length)return toast("There is no filtered data to export.","error");const lines=[(headers||fields).join(",")].concat(items.map(function(item){return fields.map(function(field){return '"'+String(item[field]==null?"":item[field]).replace(/"/g,'""')+'"';}).join(",");}));const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}

function api(action,payload) {
  return new Promise(function (resolve,reject) {
    const requestId="fd_"+Date.now()+"_"+Math.random().toString(36).slice(2),frameName="family_api_"+requestId;
    const iframe=document.createElement("iframe"); iframe.name=frameName; iframe.hidden=true; iframe.setAttribute("aria-hidden","true"); document.body.appendChild(iframe);
    const form=document.createElement("form"); form.method="POST"; form.action=CONFIG.API_URL; form.target=frameName; form.style.display="none";
    const body=Object.assign({},payload||{}); if(action!=="login"&&action!=="version")body.token=state.token;
    [["action",action],["requestId",requestId],["payload",JSON.stringify(body)]].forEach(function(pair){const input=document.createElement("textarea");input.name=pair[0];input.value=pair[1];form.appendChild(input);}); document.body.appendChild(form);
    const timeout=setTimeout(function(){cleanupRequest(requestId);reject(new Error("The server took too long to respond. Please try again."));},Number(CONFIG.REQUEST_TIMEOUT_MS)||60000);
    pendingRequests.set(requestId,{resolve:resolve,reject:reject,iframe:iframe,form:form,timeout:timeout}); form.submit();
  });
}
function receiveApiMessage(event) {
  let message=event.data; if(typeof message==="string"){try{message=JSON.parse(message);}catch(e){return;}} if(!message||message.familyDashboardResponse!==true||!message.requestId)return;
  const request=pendingRequests.get(message.requestId); if(!request)return;
  // Apps Script wraps HtmlService output in its own googleusercontent.com
  // sandbox iframe. The valid reply therefore comes from a descendant of our
  // target iframe, not from target.contentWindow itself. Validate the trusted
  // Apps Script origin and the unguessable pending request ID instead.
  const responseOrigin=String(event.origin||"");
  const trustedAppsScriptOrigin=responseOrigin==="https://script.google.com"||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/i.test(responseOrigin);
  if(responseOrigin&&!trustedAppsScriptOrigin)return;
  cleanupRequest(message.requestId); if(message.ok)request.resolve(message.data);else request.reject(new Error(message.error||"The request failed."));
}
function cleanupRequest(id){const req=pendingRequests.get(id);if(!req)return;clearTimeout(req.timeout);req.form.remove();req.iframe.remove();pendingRequests.delete(id);}
function showLoading(text){$("loadingText").textContent=text||"Working…";$("loadingOverlay").classList.remove("hidden");$("mainContent").setAttribute("aria-busy","true");}
function hideLoading(){$("loadingOverlay").classList.add("hidden");$("mainContent").removeAttribute("aria-busy");}
function toast(message,type){
  const text=String(message||""),now=Date.now(),region=$("toastRegion");
  if(text===state.lastToastText&&now-state.lastToastAt<6000)return;
  state.lastToastText=text; state.lastToastAt=now;
  all(".toast",region).filter(function(item){return item.textContent===text;}).forEach(function(item){item.remove();});
  const el=document.createElement("div");el.className="toast "+(type||"");el.setAttribute("role",type==="error"?"alert":"status");el.textContent=text;region.appendChild(el);setTimeout(function(){el.remove();},5200);
}
function friendlyApiError(error){
  const message=(error&&error.message)||"The change could not be saved.";
  if(/UrlFetchApp\.fetch|script\.external_request/i.test(message))return "The Odia calendar service could not be reached by this browser and the backend is not yet authorized for external calendar access. Deploy BE v1.0.38, run setupFamilyDashboard(), approve access, and try again. You may save English-only meanwhile.";
  return /Unknown dashboard action/i.test(message)?"Backend update required. Deploy the latest Code.gs as a New version, then refresh this page.":message;
}
