from pathlib import Path
p=Path('WOLSKIA_Integrado/backend/app.py');s=p.read_text(encoding='utf-8')
a=s.index('    result = ai_chat(',s.index('def ai_chat_endpoint'))
b=s.index('    return jsonify(result)',a)
block=s[a:b]
s=s[:a]+'''    from services import space_store as st
    from contextlib import nullcontext
    local = data.get("device_space")
    if local is not None and not isinstance(local, dict):
        return jsonify({"message": "Datos del dispositivo inválidos."}), 400
    try:
        with st.device_session(_public_user(str(data.get("user", "default"))), local) if local is not None else nullcontext():
'''+''.join('        '+line+'\n' for line in block.splitlines())+'''            if local is not None:
                result["device_space"] = st.list_all(str(data.get("user", "default")))
    except st.SpaceError as exc:
        return jsonify({"message": str(exc)}), 400
'''+s[b:]
p.write_text(s,encoding='utf-8')
p=Path('WOLSKIA_Integrado/frontend/src/lib/ai-api.ts');s=p.read_text(encoding='utf-8').replace('export type ChatResult = {','export type ChatResult = {\n  device_space?: SpaceData;').replace('    message: string;\n    history:', '    message: string;\n    device_space?: SpaceData;\n    history:');p.write_text(s,encoding='utf-8')
