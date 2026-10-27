import json, pathlib, psutil, subprocess
root=pathlib.Path.cwd()
meta=root/'AUDITORIA_ARCHIVOS/instancia-local.json'
state=json.loads(meta.read_text())
p=psutil.Process(state['frontend_8081_pid'])
expected=(root/'WOLSKIA_Integrado/frontend').resolve()
assert pathlib.Path(p.cwd()).resolve()==expected
assert 'preview' in ' '.join(p.cmdline())
env=p.environ()
children=p.children(recursive=True)
for child in reversed(children):
 try: child.terminate()
 except psutil.NoSuchProcess: pass
p.terminate()
psutil.wait_procs(children+[p],timeout=5)
log=open(root/'logs/frontend-8081.log','a')
new=subprocess.Popen(['cmd.exe','/d','/c','npm run preview -- --host 127.0.0.1 --port 8081'],cwd=expected,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
state['frontend_8081_pid']=new.pid
meta.write_text(json.dumps(state,indent=2))
print('Vista compilada reiniciada en 8081')
