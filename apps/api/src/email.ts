import nodemailer from "nodemailer";import { config } from "./config.js";import { log } from "./logger.js";
export type Email={from:string;to:string;subject:string;text:string};const captured:Email[]=[];export const capturedEmails=()=>[...captured];export const clearCapturedEmails=()=>{captured.length=0};
export async function sendEmail(message:Email){if(config.NODE_ENV==="test"){captured.push(message);return}if(config.EMAIL_TRANSPORT==="log"){log("info","email.queued",{to:message.to,subject:message.subject});return}await nodemailer.createTransport(config.SMTP_URL!).sendMail(message);}
