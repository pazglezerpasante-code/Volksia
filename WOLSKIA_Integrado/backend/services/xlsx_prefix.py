"""Lossless, bounded OOXML prefix edit: retain every unrelated ZIP member."""
import base64
import html
import io
import posixpath
import re
import zipfile
from xml.etree import ElementTree as ET

from .sheets import MAX_BYTES, MAX_CELLS, MAX_COLUMNS

CELL = re.compile(r'<c\b[^>]*?(?<!/)>.*?</c>', re.S)
VALUE = re.compile(r'(<v\b[^>]*>)(.*?)(</v>)', re.S)
TEXT = re.compile(r'(<t\b[^>]*>)(.*?)(</t>)', re.S)
SI = re.compile(r'<si\b[^>]*?(?:/>|>.*?</si>)', re.S)
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def xml(raw):
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('No se admiten entidades XML ni DTD.')
    return ET.fromstring(raw)


def replacement(text, before, after):
    if not re.fullmatch(r'\s*\+?\d[\d\s().-]*', text):
        return None
    match = re.match(r'^(\s*\+?)' + re.escape(before), text)
    return match[1] + after + text[match.end():] if match else None


def patch_text_nodes(fragment, before, after):
    nodes = list(TEXT.finditer(fragment))
    values = [html.unescape(n[2]) for n in nodes]
    original = ''.join(values)
    target = replacement(original, before, after)
    if target is None:
        return None
    start = re.match(r'\s*\+?', original).end()
    end, delta = start + len(before), len(after) - len(before)
    def offset(p):
        return p if p <= start else p + delta if p >= end else start + min(p - start, len(after))
    pieces, cursor, character = [], 0, 0
    for node, text in zip(nodes, values):
        segment = target[offset(character):offset(character + len(text))]
        pieces.extend([fragment[cursor:node.start()], node[1], html.escape(segment, quote=False), node[3]])
        cursor, character = node.end(), character + len(text)
    pieces.append(fragment[cursor:])
    return ''.join(pieces)


def process_prefix_xlsx(data, before, after):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('El archivo supera 8 MB o está vacío.')
    if before == after or not all(re.fullmatch(r'\d{1,15}', v) for v in (before, after)):
        raise ValueError('Los prefijos deben ser numéricos y diferentes.')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or len(set(i.filename for i in infos)) != len(infos):
            raise ValueError('El paquete Excel contiene demasiadas partes o partes repetidas.')
        if sum(i.file_size for i in infos) > 40 * 1024 * 1024:
            raise ValueError('El contenido descomprimido supera 40 MB.')
        names = {i.filename for i in infos}
        if any('vbaProject' in n or n.startswith('_xmlsignatures/') for n in names):
            raise ValueError('No se editan macros ni libros firmados por esta vía.')
        book = xml(archive.read('xl/workbook.xml'))
        rels = xml(archive.read('xl/_rels/workbook.xml.rels'))
        paths = {}
        for rel in rels:
            if rel.attrib.get('TargetMode') == 'External':
                continue
            target = rel.attrib.get('Target', '')
            paths[rel.attrib.get('Id')] = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/' + target)
        sheets = list(book.find('s:sheets', NS))
        if not 1 <= len(sheets) <= 256:
            raise ValueError('El límite es 256 hojas.')
        shared_path = next((paths.get(rel.attrib.get('Id')) for rel in rels if rel.attrib.get('Type', '').endswith('/sharedStrings')), None)
        shared_raw = archive.read(shared_path).decode('utf-8') if shared_path else ''
        shared_nodes = SI.findall(shared_raw)
        appended, shared_map, updates = [], {}, {}
        changed, changed_sheets, visited = 0, 0, 0
        for sheet in sheets:
            rid = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            path = paths.get(rid)
            if not path or not path.startswith('xl/worksheets/'):
                continue
            source_bytes = archive.read(path)
            xml(source_bytes)
            source = source_bytes.decode('utf-8')
            sheet_changes = 0
            def edit_cell(match):
                nonlocal changed, visited, sheet_changes
                cell = match[0]
                visited += 1
                if visited > MAX_CELLS:
                    raise ValueError('El libro supera 1.000.000 de celdas almacenadas.')
                coordinate = re.search(r'\br="([A-Z]+)[0-9]+"', cell.split('>', 1)[0])
                if coordinate:
                    column = 0
                    for letter in coordinate[1]:
                        column = column * 26 + ord(letter) - 64
                    if column > MAX_COLUMNS:
                        raise ValueError('El libro supera 1.024 columnas.')
                if re.search(r'<f(?:\s|>|/)', cell):
                    return cell
                kind = re.search(r'\bt="([^"]+)"', cell.split('>', 1)[0])
                kind = kind[1] if kind else 'n'
                value = VALUE.search(cell)
                if kind == 's' and value:
                    index = int(value[2])
                    if not 0 <= index < len(shared_nodes):
                        raise ValueError('Índice de texto compartido inválido.')
                    if index not in shared_map:
                        updated = patch_text_nodes(shared_nodes[index], before, after)
                        shared_map[index] = None if updated is None else len(shared_nodes) + len(appended)
                        if updated is not None:
                            appended.append(updated)
                    target = shared_map[index]
                    if target is None:
                        return cell
                    cell = cell[:value.start(2)] + str(target) + cell[value.end(2):]
                elif kind in ('inlineStr', 'str'):
                    updated = patch_text_nodes(cell, before, after) if kind == 'inlineStr' else None
                    if kind == 'str' and value:
                        text = replacement(html.unescape(value[2]), before, after)
                        if text is not None:
                            updated = cell[:value.start(2)] + html.escape(text, quote=False) + cell[value.end(2):]
                    if updated is None:
                        return cell
                    cell = updated
                elif kind == 'n' and value:
                    digits = value[2]
                    if not digits.isdigit() or not digits.startswith(before):
                        return cell
                    updated = after + digits[len(before):]
                    if updated.startswith('0') or len(updated) > 15:
                        raise ValueError('El resultado numérico perdería precisión o ceros iniciales.')
                    cell = cell[:value.start(2)] + updated + cell[value.end(2):]
                else:
                    return cell
                changed += 1
                sheet_changes += 1
                return cell
            updated = CELL.sub(edit_cell, source)
            if sheet_changes:
                updates[path] = updated.encode('utf-8')
                changed_sheets += 1
        if not changed:
            raise ValueError(f'No se encontraron números que comiencen con {before}.')
        if appended:
            shared_raw = shared_raw.replace('</sst>', ''.join(appended) + '</sst>')
            shared_raw = re.sub(r'\buniqueCount="\d+"', f'uniqueCount="{len(shared_nodes) + len(appended)}"', shared_raw, count=1)
            updates[shared_path] = shared_raw.encode('utf-8')
        for raw in updates.values():
            xml(raw)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as output:
            for info in infos:
                output.writestr(info, updates.get(info.filename, archive.read(info.filename)))
        result = stream.getvalue()
        if len(result) > MAX_BYTES:
            raise ValueError('El resultado supera 8 MB.')
        with zipfile.ZipFile(io.BytesIO(result)) as verified:
            if verified.testzip() is not None:
                raise ValueError('No se pudo validar el archivo generado.')
        return {'status': 'ok', 'summary': f'Prefijo {before} → {after}: {changed} números actualizados en {changed_sheets} de {len(sheets)} hojas revisadas.',
                'filename': 'suri-prefijos-actualizados.xlsx', 'download': base64.b64encode(result).decode('ascii'), 'preview': [],
                'warning': 'Se conservó el paquete original: solo se editaron las celdas coincidentes y sus textos compartidos. El original no se sobrescribió.'}
