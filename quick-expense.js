"use strict";

const CONFIG=window.FAMILY_DASHBOARD_CONFIG||{};
const quickToken=new URLSearchParams(location.search).get("t")||"";
const pending=new Map();
let metadata=null;
const $=function(id){return document.getElementById(id);};
const symbols={INR:"₹",USD:"$",EUR:"€",GBP:"£"};

document.addEventListener("DOMContentLoaded",init);
window.addEventListener("message",receiveApiMessage);

function todayIso(){const d=new Date();return[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function option(value,label,selected){return '<option value="'+escapeHtml(value)+'"'+(value===selected?' selected':'')+'>'+escapeHtml(label)+'</option>';}
function escapeHtml(value){return String(value==null?"":value).replace(/[&<>'"]/g,function(char){return{"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char];});}
function show(id){["loadingCard","errorCard","entryCard","successCard"].forEach(function(name){$(name).classList.toggle("hidden",name!==id);});}
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(function(){$("toast").classList.add("hidden");},5200);}
function formatMoney(value){try{return new Intl.NumberFormat("en-IN",{style:"currency",currency:metadata.currency||"INR",maximumFractionDigits:2}).format(Number(value||0));}catch(error){return (symbols[metadata.currency]||"₹")+Number(value||0).toLocaleString("en-IN");}}

async function init(){
  $("quickExpenseForm").addEventListener("submit",saveExpense);
  $("paidBy").addEventListener("change",syncPayer);
  $("category").addEventListener("change",syncSubcategories);
  $("addAnother").addEventListener("click",addAnother);
  $("expenseDate").value=todayIso();
  if(!quickToken){showError("The private link code is missing. Ask the administrator to copy the complete link again.");return;}
  if(!CONFIG.API_URL||CONFIG.API_URL.indexOf("PASTE_YOUR")>=0){showError("The dashboard backend has not been configured.");return;}
  try{metadata=await api("getQuickExpenseLink",{quickToken:quickToken});renderForm();show("entryCard");setTimeout(function(){$("amount").focus();},80);}
  catch(error){showError(error.message||"This link could not be opened.");}
}
function showError(message){$("errorText").textContent=message;show("errorCard");}
function renderForm(){
  $("familyName").textContent=String(metadata.familyName||"MyFamily").toUpperCase();
  $("linkTitle").textContent=metadata.title||"Travel expense";
  $("currencySymbol").textContent=symbols[metadata.currency]||metadata.currency||"₹";
  $("amount").max=String(metadata.maxAmount||100000);$("amountLimit").textContent="Maximum for this link: "+formatMoney(metadata.maxAmount||100000);
  const until=metadata.validUntil?new Date(metadata.validUntil).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"until the administrator turns it off";
  $("validityText").textContent=metadata.validUntil?("Active until "+until):("Active "+until);
  const members=metadata.members||[],mode=metadata.payerMode||"ANYONE",savedPayer=localStorage.getItem("myfamilyQuickPayer")||"";
  let payerOptions=members.map(function(member){return option(member.id,member.name,savedPayer||metadata.fixedPayerMemberId);}).join("");
  if(mode==="ANYONE")payerOptions+=option("OTHER","Another person",savedPayer);
  $("paidBy").innerHTML=payerOptions;
  if(mode==="FIXED"){$("paidBy").value=metadata.fixedPayerMemberId;$("paidBy").disabled=true;}
  $("memberId").innerHTML=option("ALL","Whole family",metadata.defaultMemberId)+(members.map(function(member){return option(member.id,member.name,metadata.defaultMemberId);}).join(""));
  $("category").innerHTML=(metadata.categories||[]).map(function(category){return option(category.name,category.name,metadata.defaultCategory);}).join("");
  $("category").value=metadata.defaultCategory||($("category").options[0]&&$("category").options[0].value)||"";
  $("fromAccount").value=localStorage.getItem("myfamilyQuickAccount")||metadata.defaultFromAccount||"Cash / UPI";
  $("submittedByName").value=localStorage.getItem("myfamilyQuickEnteredBy")||"";
  $("externalPayerName").value=localStorage.getItem("myfamilyQuickExternalPayer")||"";
  $("majorPlanId").innerHTML=option("","No major plan",metadata.defaultMajorPlanId)+(metadata.majorPlans||[]).map(function(plan){return option(plan.id,plan.name,metadata.defaultMajorPlanId);}).join("");
  syncSubcategories(metadata.defaultSubcategory);syncPayer();
}
function syncPayer(){const other=$("paidBy").value==="OTHER";$("externalPayerRow").classList.toggle("hidden",!other);$("externalPayerName").required=other;if(other)setTimeout(function(){$("externalPayerName").focus();},30);}
function syncSubcategories(selected){const category=(metadata.categories||[]).find(function(item){return item.name===$("category").value;});const values=category&&category.subcategories||["General"];$("subcategory").innerHTML=values.map(function(value){return option(value,value,typeof selected==="string"?selected:"");}).join("");}
async function saveExpense(event){
  event.preventDefault();
  const button=$("saveButton"),payer=$("paidBy").value;
  button.disabled=true;button.querySelector("span").textContent="Saving…";
  try{
    const result=await api("submitQuickExpense",{quickToken:quickToken,amount:$("amount").value,date:$("expenseDate").value,paidByMemberId:payer,externalPayerName:$("externalPayerName").value.trim(),category:$("category").value,subcategory:$("subcategory").value,sentTo:$("sentTo").value.trim(),reason:$("reason").value.trim(),fromAccount:$("fromAccount").value.trim(),memberId:$("memberId").value,majorPlanId:$("majorPlanId").value,submittedByName:$("submittedByName").value.trim(),website:$("website").value});
    if(metadata.payerMode!=="FIXED")localStorage.setItem("myfamilyQuickPayer",payer);
    localStorage.setItem("myfamilyQuickAccount",$("fromAccount").value.trim());localStorage.setItem("myfamilyQuickEnteredBy",$("submittedByName").value.trim());if(payer==="OTHER")localStorage.setItem("myfamilyQuickExternalPayer",$("externalPayerName").value.trim());
    $("successAmount").textContent=formatMoney(result.amount);$("successText").textContent="Paid to "+result.paidTo+" on "+new Date(result.date+"T00:00:00").toLocaleDateString("en-IN",{dateStyle:"medium"})+". It is now in the family expenditure register.";show("successCard");window.scrollTo({top:0,behavior:"smooth"});
  }catch(error){toast(error.message||"The expenditure could not be saved.");}
  finally{button.disabled=false;button.querySelector("span").textContent="Save expenditure";}
}
function addAnother(){$("amount").value="";$("sentTo").value="";$("reason").value="";$("expenseDate").value=todayIso();show("entryCard");syncPayer();setTimeout(function(){$("amount").focus();},60);}

function secureRequestId(prefix){const bytes=new Uint32Array(4);if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(bytes);else for(let index=0;index<bytes.length;index+=1)bytes[index]=Math.floor(Math.random()*0xffffffff);return String(prefix||"req")+"_"+Date.now()+"_"+Array.from(bytes).map(function(value){return value.toString(36);}).join("");}
function api(action,payload){return new Promise(function(resolve,reject){const requestId=secureRequestId("qex"),frameName="quick_api_"+requestId,iframe=document.createElement("iframe");iframe.name=frameName;iframe.hidden=true;iframe.setAttribute("aria-hidden","true");document.body.appendChild(iframe);const form=document.createElement("form");form.method="POST";form.action=CONFIG.API_URL;form.target=frameName;form.hidden=true;[["action",action],["requestId",requestId],["payload",JSON.stringify(payload||{})]].forEach(function(pair){const input=document.createElement("textarea");input.name=pair[0];input.value=pair[1];form.appendChild(input);});document.body.appendChild(form);const timeout=setTimeout(function(){cleanup(requestId);reject(new Error("The server took too long to respond. Check the connection and try again."));},Number(CONFIG.REQUEST_TIMEOUT_MS)||60000);pending.set(requestId,{resolve:resolve,reject:reject,iframe:iframe,form:form,timeout:timeout});form.submit();});}
function receiveApiMessage(event){let message=event.data;if(typeof message==="string"){try{message=JSON.parse(message);}catch(error){return;}}if(!message||message.familyDashboardResponse!==true||!message.requestId)return;const request=pending.get(message.requestId);if(!request)return;const origin=String(event.origin||""),trusted=origin==="https://script.google.com"||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/i.test(origin);if(origin&&!trusted)return;cleanup(message.requestId);if(message.ok)request.resolve(message.data);else request.reject(new Error(message.error||"The request failed."));}
function cleanup(id){const request=pending.get(id);if(!request)return;clearTimeout(request.timeout);request.form.remove();request.iframe.remove();pending.delete(id);}
