/** Ejecutores reales de las herramientas originales (HTML en /suri-tools). */
export type SuriOperation = "turnero" | "asistencia" | "encuesta1" | "encuesta2" | "encuestas_auto";
export type AbsenceReason = "ART" | "VACACIONES" | "OTRO";
export type LocalDownload = { name: string; url: string };
export type SuriRunResult = { summary: string; downloads: LocalDownload[] };

const PAGES: Record<SuriOperation,string> = {
  turnero:"/suri-tools/turnero.html",
  asistencia:"/suri-tools/control-asistencia.html",
  encuesta1:"/suri-tools/gestor-encuestas.html",
  encuesta2:"/suri-tools/gestor-encuestas.html",
  encuestas_auto:"/suri-tools/gestor-encuestas.html",
};

export function selectSuriOperation(text:string):SuriOperation | "certificados" | null {
  const t=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/certificad|licencia medica/.test(t))return "certificados";
  if(/fichad|fichaj|control de asistencia|asistencias?|premio por asistencia|presentismo/.test(t))return "asistencia";
  if(/turner|\badtr\b|recordatorios?(?: de turnos)?/.test(t))return "turnero";
  if(/encuesta/.test(t)){
    if(/paso\s*1|primer paso|pasos por taller|preparar encuesta interna/.test(t))return "encuesta1";
    if(/paso\s*2|segundo paso|simplificad|envio de encuestas|envio encuestas/.test(t))return "encuesta2";
    return "encuestas_auto";
  }
  return null;
}
export function combineAttendanceMessages(previous:string,current:string):string {
  return [previous.trim(),current.trim()].filter(Boolean).join("\n").slice(-2000);
}
export function parseAbsenceReasons(text:string):Record<string,AbsenceReason>{
  const out:Record<string,AbsenceReason>={};
  const t=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const group=/(?:^|[;.!?\n])\s*(?:todos(?: los legajos| ellos| de ellos)?|todas|para todos|el resto|los restantes|los demas)\s*(?:(?:estan|estuvieron|son|fueron|tienen)\s+(?:de\s+)?|(?:por|de)\s+|[:=]\s*)?(art|vacaciones|otro)\b/i;
  const g=t.match(group);if(g)out["*"]=g[1].toUpperCase() as AbsenceReason;
  for(const m of t.matchAll(/legajo\s*#?\s*(\d+)\s*(?:es\s+|[:=\-]\s*)?(art|vacaciones|otro)\b/ig)){
    out[String(Number(m[1]))]=m[2].toUpperCase() as AbsenceReason;
  }
  return out;
}
export function resolveSuriOperation(text:string,pending:SuriOperation|"certificados"|null,newExcel:boolean):SuriOperation|"certificados"|null{
  const direct=selectSuriOperation(text);if(direct)return direct;
  if(!pending||pending==="certificados")return null;
  if(pending==="asistencia"&&Object.keys(parseAbsenceReasons(text)).length)return pending;
  if(/^(?:\s*(?:aca|aqui|te lo adjunto|listo|es este|el archivo|la planilla|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\b)/i.test(text)||/feriad|no laborable|\bfecha\b|legajo\s*\d+/i.test(text))return pending;
  return newExcel&&!text.trim()?pending:null;
}
export function parseHolidayDates(text:string):string[]{
  const t=text.toLowerCase();if(!/feriad|no laborable/.test(t))return [];
  const out:string[]=[];
  for(const m of t.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/g)){
    const iso=m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
    const d=new Date(iso+"T12:00:00Z");
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error("Fecha inválida: "+m[0]);
    out.push(iso);
  }
  if(!out.length&&/\b(?:dia|el)\s+\d{1,2}\b/.test(t))throw Error("Para excluir un feriado, indicá día, mes y año (ejemplo: 22/09/2026).");
  return [...new Set(out)];
}
export async function runWorkspaceTool(
  operation:SuriOperation, file:File,
  opts:{holidays?:string[];reasons?:Record<string,AbsenceReason>;period?:"todo"}={}
):Promise<SuriRunResult>{
  if(!file||typeof file.name!=="string"||typeof file.arrayBuffer!=="function")throw Error("El Excel no llegó al procesador.");
  if(!/\.(xls|xlsx)$/i.test(file.name))throw Error("Adjuntá un Excel .xls o .xlsx.");
  if(!file.size||file.size>8*1024*1024)throw Error("El Excel debe pesar entre 1 byte y 8 MB.");
  const bytes=await file.arrayBuffer(),sig=new Uint8Array(bytes.slice(0,8));
  const isOle=sig[0]===0xd0&&sig[1]===0xcf&&sig[2]===0x11&&sig[3]===0xe0;
  const isZip=sig[0]===0x50&&sig[1]===0x4b&&[3,5,7].includes(sig[2]);
  if((/\.xls$/i.test(file.name)&&!isOle)||(/\.xlsx$/i.test(file.name)&&!isZip))throw Error("El contenido no corresponde a un Excel válido.");
  const id=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,14);
  const frame=document.createElement("iframe");
  frame.src=PAGES[operation];
  frame.title="Procesador Excel de SURI";
  frame.setAttribute("aria-hidden","true");
  frame.style.cssText="position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;pointer-events:none";
  return new Promise<SuriRunResult>((resolve,reject)=>{
    let settled=false,sent=false;
    const cleanup=()=>{window.removeEventListener("message",onMessage);window.clearTimeout(timeout);frame.remove();};
    const done=(error?:Error,result?:SuriRunResult)=>{
      if(settled)return;settled=true;cleanup();if(error)reject(error);else if(result)resolve(result);
    };
    const timeout=window.setTimeout(()=>done(Error("La herramienta no respondió en 90 segundos.")),90_000);
    function onMessage(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.contentWindow||!event.data)return;
      const d=event.data;
      if(d.suriToolReady&&!sent){
        if(!frame.contentWindow)return;
        sent=true;
        frame.contentWindow.postMessage({suriToolRun:operation,id,filename:file.name,data:bytes,
          holidays:opts.holidays??[],reasons:opts.reasons??{},period:opts.period??""},location.origin,[bytes]);
        return;
      }
      if(!d.suriToolResult||d.id!==id)return;
      if(!d.ok)return done(Error(String(d.error||"La herramienta falló.")));
      try{
        if(!Array.isArray(d.files)||!d.files.length)throw Error("La herramienta no generó ningún archivo.");
        const downloads:LocalDownload[]=d.files.map((f:{name:string;data:ArrayBuffer})=>{
          if(typeof f.name!=="string"||!(f.data instanceof ArrayBuffer))throw Error("La herramienta devolvió un archivo incompleto.");
          const signature=new Uint8Array(f.data.slice(0,2));
          if(!f.name.toLowerCase().endsWith(".xlsx")||signature[0]!==80||signature[1]!==75)throw Error("El resultado no es un XLSX válido.");
          return {name:f.name,url:URL.createObjectURL(new Blob([f.data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}))};
        });
        done(undefined,{summary:String(d.summary||"Archivo generado."),downloads});
      }catch(e){done(e instanceof Error?e:Error("Error en el resultado."));}
    }
    window.addEventListener("message",onMessage);
    frame.addEventListener("error",()=>done(Error("No se pudo cargar la herramienta.")));
    document.body.appendChild(frame);
  });
}
