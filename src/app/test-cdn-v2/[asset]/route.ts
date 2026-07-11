import { NextResponse } from "next/server";
import { findSiteBySlug } from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scriptHeaders = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

const json = (value: unknown) => JSON.stringify(value);

const buildV2Script = (input: {
  origin: string;
  variant: string;
  websiteId: string;
  publishCode: string;
  domain: string;
  allowedDomains: string[];
  collectorNode: string;
}) => `!function(){"use strict";
const x=${json(input.websiteId)},R=${json(`${input.origin}/api/test-collector/v2/collect`)},O=${json(input.publishCode)},W=${json(input.domain)},U=${json(input.allowedDomains)},N=${json(input.collectorNode)},B=${json(input.variant)},j=R+"/send",V=R+"/check",G=R+"/check",F=/data-bik-event-([\\w-_]+)/,$="data-"+"bik-event",J=300;
let E=id(),g=0,u=0,d=0,visibleAt=Date.now(),lastUrl=location.href,de="",me="";
function id(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(e){const t=Math.random()*16|0,n=e==="x"?t:t&3|8;return n.toString(16)})}
function clean(e){return e==="#"||e==="/index.html"?"/":e}
function normalizeHost(e){return String(e||"").replace(/:\\d+$/,"").replace(/^www\\./,"").toLowerCase()}
function allowed(){const e=normalizeHost(location.hostname);return U.some(t=>{t=normalizeHost(t);return e===t||e.endsWith("."+t)})}
function cookie(e,t,n){if(t===undefined){const t=document.cookie.match(new RegExp("(?:^|; )"+e.replace(/[.$?*|{}()[\\]\\\\/+^]/g,"\\\\$&")+"=([^;]*)"));return t?decodeURIComponent(t[1]):""}let r="";if(n){const e=new Date;e.setTime(e.getTime()+1e3*n);r="; expires="+e.toUTCString()}document.cookie=e+"="+encodeURIComponent(t)+r+"; path=/; SameSite=Lax"}
function keepSession(){de=localStorage.getItem("elmas_test_v2_vid_"+x)||cookie("elmas_test_v2_vid_"+x);if(!de){de=id();try{localStorage.setItem("elmas_test_v2_vid_"+x,de)}catch(e){}cookie("elmas_test_v2_vid_"+x,de,31536e3)}me=sessionStorage.getItem("elmas_test_v2_sid_"+x)||cookie("elmas_test_v2_sid_"+x);if(!me){me="session-"+id();try{sessionStorage.setItem("elmas_test_v2_sid_"+x,me)}catch(e){}}cookie("elmas_test_v2_sid_"+x,me,1800)}
function screenValue(){return Math.round((screen.width||0)*(devicePixelRatio||1))+"x"+Math.round((screen.height||0)*(devicePixelRatio||1))}
function hash(e){let t=0;for(let n=0;n<e.length;n++)t=(Math.imul(31,t)+e.charCodeAt(n))|0;return Math.abs(t).toString(16)}
function fp(){const e=[navigator.userAgent,navigator.language,screenValue(),new Date().getTimezoneOffset(),navigator.hardwareConcurrency||"",navigator.deviceMemory||"",navigator.plugins?navigator.plugins.length:0,Boolean(navigator.webdriver)].join("|");return "fp-"+hash(e)}
function headless(){return !!(navigator.webdriver||window.callPhantom||window._phantom||window.Cypress||window.$_Cypress||outerWidth===0&&outerHeight===0)}
function eventData(e){const t={};if(!e||!e.attributes)return t;for(let n=0;n<e.attributes.length;n++){const r=e.attributes[n],a=F.exec(r.name);if(a)t[a[1]]=r.value}return t}
function active(){if(!document.hidden&&visibleAt){g+=Date.now()-visibleAt;visibleAt=Date.now()}return Math.round(g/1e3)}
function base(e,t){keepSession();const n=new URL(location.href);return{c:W,website:x,hostname:location.hostname,title:document.title||"",url:clean(n.pathname+n.search),href:n.href,referrer:clean(document.referrer||""),tag:"5",publishCode:O,fingerprint:fp(),ts:Date.now(),activeSeconds:active(),mouseX:u,mouseY:d,pageViewEvent:E,name:e||"",newScript:"1",collectorNode:N,bundle:B,timestamp:Date.now(),screen:screenValue(),language:navigator.language||"",automationTool:window.callPhantom||window._phantom?"PhantomJS":window.Cypress||window.$_Cypress?"Cypress":undefined,headless:headless(),webdriver:navigator.webdriver,deviceMemory:navigator.deviceMemory,cpuCore:navigator.hardwareConcurrency,pluginCount:navigator.plugins?navigator.plugins.length:0,outerWidth:outerWidth,outerHeight:outerHeight,timezone:(new Date).getTimezoneOffset(),id:de,sesId:me,data:t||undefined}}
async function post(e){if(!allowed())return{ok:false,reason:"domain-not-allowed"};try{const t=await fetch(e.name?G:j,{keepalive:true,method:"POST",body:JSON.stringify(e),headers:{"Content-Type":"application/json"},credentials:"omit"});return await t.json()}catch(t){return{ok:false,reason:"network-error"}}}
function send(e,t){return post(base(e,t))}
function check(){return post({...base("heartbeat",{reason:"interval"}),eventId:E})}
function routeWatch(){const e=history.pushState,t=history.replaceState;history.pushState=function(){const n=e.apply(this,arguments);setTimeout(pageChanged,J);return n};history.replaceState=function(){const e=t.apply(this,arguments);setTimeout(pageChanged,J);return e};addEventListener("popstate",function(){setTimeout(pageChanged,J)})}
function pageChanged(){if(location.href===lastUrl)return;lastUrl=location.href;E=id();send("",{source:"route-change"})}
function bind(){send("",{source:"load"});document.addEventListener("mousemove",function(e){u=e.clientX;d=e.clientY},{passive:true});document.addEventListener("scroll",function(){u=Math.round(scrollX);d=Math.round(scrollY)},{passive:true});document.addEventListener("visibilitychange",function(){if(document.hidden){active();visibleAt=0;check()}else visibleAt=Date.now()});addEventListener("focus",function(){visibleAt=Date.now()});addEventListener("blur",function(){active();visibleAt=0;check()});document.addEventListener("click",function(e){let t=e.target;while(t&&t!==document){if(t.getAttribute&&t.getAttribute($)){send(t.getAttribute($)||"click",eventData(t));break}if(t.tagName==="A"&&t.href){send("click-link",{href:t.href,text:(t.textContent||"").slice(0,120)});break}t=t.parentNode}},true);setInterval(check,3e4);addEventListener("beforeunload",function(){active();check()});routeWatch()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
}();`;

const publicOrigin = (request: Request) => {
  const configured = process.env.NEXT_PUBLIC_HOST_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return new URL(request.url).origin.replace(/\/+$/, "");
};

export async function GET(
  request: Request,
  context: { params: Promise<{ asset: string }> }
) {
  const { asset } = await context.params;
  const match = /^t-([1-3])-(.+)-([0-9]+)\.js$/.exec(asset);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [, variant, slug, version] = match;
  const site = await findSiteBySlug(slug);
  if (!site || String(site.scriptVersion) !== version) {
    return new NextResponse("Not found", { status: 404 });
  }

  const origin = publicOrigin(request);
  return new NextResponse(
    buildV2Script({
      origin,
      variant,
      websiteId: site.websiteId,
      publishCode: site.publishCode,
      domain: site.domain,
      allowedDomains: site.allowedDomains,
      collectorNode: site.collectorNode,
    }),
    { headers: scriptHeaders }
  );
}
