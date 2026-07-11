import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scriptHeaders = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
};

const buildTracker = (variant: string) => `!function(){"use strict";
var variant=${JSON.stringify(variant)};
function currentScript(){if(document.currentScript)return document.currentScript;var scripts=document.getElementsByTagName("script");for(var i=scripts.length-1;i>=0;i--){if((scripts[i].src||"").indexOf("/test-cdn/tracker")>-1)return scripts[i]}return null}
function cookie(name,value,seconds){if(value===undefined){var m=document.cookie.match(new RegExp("(?:^|; )"+name.replace(/[.$?*|{}()[\\]\\\\/+^]/g,"\\\\$&")+"=([^;]*)"));return m?decodeURIComponent(m[1]):""}var expires="";if(seconds){var d=new Date;d.setTime(d.getTime()+seconds*1000);expires="; expires="+d.toUTCString()}document.cookie=name+"="+encodeURIComponent(value)+expires+"; path=/; SameSite=Lax"}
function uuid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:r&3|8;return v.toString(16)})}
function screenValue(){return Math.round((screen.width||0)*(devicePixelRatio||1))+"x"+Math.round((screen.height||0)*(devicePixelRatio||1))}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return Math.abs(h).toString(16)}
function safe(fn,val){try{return fn()}catch(error){return val}}
function pluginCount(){return navigator.plugins?navigator.plugins.length:0}
function languagesLength(){return navigator.languages?navigator.languages.length:(navigator.language?1:0)}
function scrollInfo(){var el=document.documentElement||document.body,maxX=Math.max(1,(el.scrollWidth||0)-(el.clientWidth||innerWidth||0)),maxY=Math.max(1,(el.scrollHeight||0)-(el.clientHeight||innerHeight||0));return{scrollWidth:Math.round(100*(scrollX||pageXOffset||0)/maxX),scrollHeight:Math.round(100*(scrollY||pageYOffset||0)/maxY)}}
function isReloaded(){return safe(function(){if(window.performance&&performance.getEntriesByType){var nav=performance.getEntriesByType("navigation");if(nav&&nav.length&&nav[0].type)return nav[0].type==="reload"}return !!(window.performance&&performance.navigation&&performance.navigation.type===1)},false)}
function isIframe(){return safe(function(){return window.self!==window.top},true)}
function touchInfo(){var points=navigator.maxTouchPoints||navigator.msMaxTouchPoints||0;return{isTouchable:"ontouchstart"in window||points>0,maxTouchPoints:points}}
function canvasHash(){return safe(function(){var canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)return"";canvas.width=240;canvas.height=60;ctx.textBaseline="top";ctx.font="16px Arial";ctx.fillStyle="#f60";ctx.fillRect(0,0,80,24);ctx.fillStyle="#069";ctx.fillText("BikTest-Olcum-123",2,2);ctx.strokeStyle="#0a0";ctx.arc(120,30,18,0,Math.PI*2);ctx.stroke();return hash(canvas.toDataURL())},"")}
function webglInfo(){return safe(function(){var canvas=document.createElement("canvas"),gl=canvas.getContext("webgl")||canvas.getContext("experimental-webgl");if(!gl)return{};var debug=gl.getExtension("WEBGL_debug_renderer_info");return{vendor:String(gl.getParameter(gl.VENDOR)||""),renderer:String(gl.getParameter(gl.RENDERER)||""),version:String(gl.getParameter(gl.VERSION)||""),shadingLanguageVersion:String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)||""),vendorUnmasked:debug?String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)||""):"",rendererUnmasked:debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)||""):""}},{})}
function fontHash(){return safe(function(){var ctx=document.createElement("canvas").getContext("2d");if(!ctx)return"";var fonts=["Arial","Courier New","Georgia","Times New Roman","Verdana","Roboto","Lucida Sans Unicode","Trebuchet MS"];return hash(fonts.map(function(font){ctx.font="72px "+font;return font+":"+Math.round(ctx.measureText("WwMmLli0Oo").width)}).join("|"))},"")}
function automation(){var automationUa=/Headless|PhantomJS|Puppeteer|Playwright|Cypress/i.test(navigator.userAgent||""),plugins=pluginCount(),langs=languagesLength(),brave=!!(navigator.brave||navigator.userAgentData&&navigator.userAgentData.brands&&navigator.userAgentData.brands.some(function(item){return item.brand==="Brave"}));return{isPuppeteer:!!(window.__nightmare||window._phantom||navigator.webdriver&&/Chrome/i.test(navigator.userAgent||"")),isPlaywright:!!(window._playwright||window.__playwright__binding__||window.__pwInitScripts),isHeadless:!!(navigator.webdriver||automationUa||outerWidth===0&&outerHeight===0),isBrave:brave,hasWindowChrome:!!window.chrome,hasUndetectedBehavior:(!window.chrome&&/Chrome/i.test(navigator.userAgent||""))||(plugins===0&&langs===0),languagesLength:langs}}
function fingerprint(){var gl=webglInfo(),parts=[navigator.userAgent,navigator.language,screenValue(),new Date().getTimezoneOffset(),navigator.hardwareConcurrency||"",navigator.deviceMemory||"",navigator.platform||"",pluginCount(),languagesLength(),Boolean(navigator.webdriver),canvasHash(),gl.vendor||"",gl.renderer||"",gl.vendorUnmasked||"",gl.rendererUnmasked||"",fontHash()];return "fp-"+hash(parts.join("|"))}
var script=currentScript(),website=script&&(script.getAttribute("data-website-id")||script.getAttribute("data-site-id")),host=(script&&script.getAttribute("data-host-url"))||location.origin;
if(!website)return;
host=host.replace(/\\/+$/,"");
var endpoint=host+"/api/test-collector/v1/collect",visitor=cookie("elmas_test_v1_vid"),session=cookie("elmas_test_v1_sid"),activeMs=0,visibleAt=Date.now(),eventId=uuid();
if(!visitor){visitor=uuid();cookie("elmas_test_v1_vid",visitor,31536000)}
if(!session){session="session-"+uuid();cookie("elmas_test_v1_sid",session,1800)}else cookie("elmas_test_v1_sid",session,1800);
function active(){if(!document.hidden&&visibleAt){activeMs+=Date.now()-visibleAt;visibleAt=Date.now()}return Math.round(activeMs/1000)}
function payload(name,data){var auto=automation(),scroll=scrollInfo(),touch=touchInfo(),gl=webglInfo(),canvas=canvasHash(),fonts=fontHash();return{website:website,hostname:location.hostname,screen:screenValue(),language:navigator.language||"",url:location.pathname+location.search,href:location.href,referrer:document.referrer||"",fingerprint:fingerprint(),id:visitor,sesId:session,type:name?"event":"pageview",name:name||"",eventId:eventId,activeSeconds:active(),variant:variant,userAgent:navigator.userAgent,webdriver:navigator.webdriver,headless:auto.isHeadless,isHeadless:auto.isHeadless,isPuppeteer:auto.isPuppeteer,isPlaywright:auto.isPlaywright,isBrave:auto.isBrave,automationTool:auto.isPlaywright?"Playwright":window.callPhantom||window._phantom?"PhantomJS":window.Cypress||window.$_Cypress?"Cypress":navigator.webdriver?"WebDriver":undefined,hasWindowChrome:auto.hasWindowChrome,hasUndetectedBehavior:auto.hasUndetectedBehavior,deviceMemory:navigator.deviceMemory,cpuCore:navigator.hardwareConcurrency,hardwareConcurrency:navigator.hardwareConcurrency,pluginCount:pluginCount(),languagesLength:auto.languagesLength,outerWidth:outerWidth,outerHeight:outerHeight,timezone:(new Date).getTimezoneOffset(),scrollWidth:scroll.scrollWidth,scrollHeight:scroll.scrollHeight,isIframe:isIframe(),isPageReloaded:isReloaded(),isTouchable:touch.isTouchable,maxTouchPoints:touch.maxTouchPoints,canvas:canvas,webgl:gl,fontMetrics:fonts,data:data||null,ts:Date.now()}}
function encode(body){var params=[];Object.keys(body).forEach(function(key){var value=body[key];if(value===undefined||value===null)return;if(typeof value==="object")value=JSON.stringify(value);params.push(encodeURIComponent(key)+"="+encodeURIComponent(String(value)))});return params.join("&")}
function send(name,data){try{var body=payload(name,data),xhr=new XMLHttpRequest;xhr.open("POST",endpoint,true);xhr.setRequestHeader("Content-Type","application/x-www-form-urlencoded");xhr.send(encode(body));return true}catch(error){return false}}
function eventData(node){var out={};if(!node||!node.attributes)return out;for(var i=0;i<node.attributes.length;i++){var attr=node.attributes[i];if(attr.name.indexOf("data-bik-event-")===0)out[attr.name.slice(15)]=attr.value}return out}
function bind(){send("",{source:"v1-load"});document.addEventListener("click",function(ev){var node=ev.target;while(node&&node!==document){if(node.getAttribute&&node.getAttribute("data-bik-event")){send(node.getAttribute("data-bik-event")||"click",eventData(node));break}if(node.tagName==="A"&&node.href){send("click-link",{href:node.href,text:(node.textContent||"").slice(0,120)});break}node=node.parentNode}},true);document.addEventListener("visibilitychange",function(){if(document.hidden){active();visibleAt=0;send("heartbeat",{reason:"hidden"})}else visibleAt=Date.now()});setInterval(function(){send("heartbeat",{reason:"interval"})},30000);window.addEventListener("beforeunload",function(){active();send("heartbeat",{reason:"beforeunload"})})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
}();`;

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string }> }
) {
  const { asset } = await context.params;
  const match = /^tracker([1-4])\.js$/.exec(asset);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(buildTracker(match[1]), { headers: scriptHeaders });
}
