import json, os, pathlib, subprocess, psutil, sys
root=pathlib.Path.cwd()
meta=root/'AUDITORIA_ARCHIVOS/instancia-local.json'
state=json.loads(meta.read_text(encoding='utf-8-sig'))
proc=psutil.Process(state['backend_pid'])
expected=(root/'WOLSKIA_Integrado/backend').resolve()
if pathlib.Path(proc.cwd()).resolve()!=expected: raise RuntimeError('Backend inesperado; se conserva')
env=proc.environ()
# The inherited provider keys stay in memory, never in source files or logs.
proc.terminate(); proc.wait(10)
log=open(root/'logs/backend-local.log','a',encoding='utf-8')
new=subprocess.Popen([sys.executable,'app.py'],cwd=expected,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
state['backend_pid']=new.pid
meta.write_text(json.dumps(state,indent=2),encoding='utf-8')
print('Backend local actualizado, puerto',state['backend_port'])
