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
function fingerprint(){var parts=[navigator.userAgent,navigator.language,screenValue(),new Date().getTimezoneOffset(),navigator.hardwareConcurrency||"",navigator.deviceMemory||"",navigator.platform||""];var s=parts.join("|"),h=0;for(var i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return "fp-"+Math.abs(h).toString(16)}
var script=currentScript(),website=script&&(script.getAttribute("data-website-id")||script.getAttribute("data-site-id")),host=(script&&script.getAttribute("data-host-url"))||location.origin;
if(!website)return;
host=host.replace(/\\/+$/,"");
var endpoint=host+"/api/test-collector/v1/collect",visitor=cookie("elmas_test_v1_vid"),session=cookie("elmas_test_v1_sid"),loadedAt=Date.now(),eventId=uuid();
if(!visitor){visitor=uuid();cookie("elmas_test_v1_vid",visitor,31536000)}
if(!session){session="session-"+uuid();cookie("elmas_test_v1_sid",session,1800)}else cookie("elmas_test_v1_sid",session,1800);
function payload(name,data){return{website:website,hostname:location.hostname,screen:screenValue(),language:navigator.language||"",url:location.pathname+location.search,href:location.href,referrer:document.referrer||"",fingerprint:fingerprint(),id:visitor,sesId:session,type:name?"event":"pageview",name:name||"",eventId:eventId,activeSeconds:Math.round((Date.now()-loadedAt)/1000),variant:variant,userAgent:navigator.userAgent,webdriver:navigator.webdriver,headless:!!(navigator.webdriver||window.callPhantom||window._phantom),outerWidth:outerWidth,outerHeight:outerHeight,data:data||null,ts:Date.now()}}
function encode(body){var params=[];Object.keys(body).forEach(function(key){var value=body[key];if(value===undefined||value===null)return;if(typeof value==="object")value=JSON.stringify(value);params.push(encodeURIComponent(key)+"="+encodeURIComponent(String(value)))});return params.join("&")}
function send(name,data){try{var body=payload(name,data),xhr=new XMLHttpRequest;xhr.open("POST",endpoint,true);xhr.setRequestHeader("Content-Type","application/x-www-form-urlencoded");xhr.send(encode(body));return true}catch(error){return false}}
function eventData(node){var out={};if(!node||!node.attributes)return out;for(var i=0;i<node.attributes.length;i++){var attr=node.attributes[i];if(attr.name.indexOf("data-bik-event-")===0)out[attr.name.slice(15)]=attr.value}return out}
function bind(){send("",{source:"v1-load"});document.addEventListener("click",function(ev){var node=ev.target;while(node&&node!==document){if(node.getAttribute&&node.getAttribute("data-bik-event")){send(node.getAttribute("data-bik-event")||"click",eventData(node));break}if(node.tagName==="A"&&node.href){send("click-link",{href:node.href,text:(node.textContent||"").slice(0,120)});break}node=node.parentNode}},true);window.addEventListener("beforeunload",function(){send("heartbeat",{reason:"beforeunload"})})}
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
