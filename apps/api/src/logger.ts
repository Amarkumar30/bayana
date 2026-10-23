import { randomUUID } from "node:crypto";
const sensitive=/authorization|cookie|password|secret|token|otp|code/i;
export const requestId=()=>randomUUID();
export function redact(value:unknown):unknown{if(Array.isArray(value))return value.map(redact);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,entry])=>[key,sensitive.test(key)?"[REDACTED]":redact(entry)]));return value;}
export function log(level:"info"|"warn"|"error",event:string,fields:Record<string,unknown>={}){const safe=redact(fields);process.stdout.write(`${JSON.stringify({level,event,...(safe as Record<string,unknown>),timestamp:new Date().toISOString()})}\n`);}
