"""Lectores opcionales, usados exclusivamente por la ingesta offline."""
import importlib
import re
import zipfile
from .store import redact, CONTACT

class DependencyMissing(RuntimeError):
    """Falta un lector opcional en el entorno offline."""

def optional(name):
    try:
        return importlib.import_module(name)
    except ImportError:
        return None

def fragments(text, source, kind, section, page=None):
    sensitive = bool(CONTACT.search(text))
    words = redact(text).split()
    for start in range(0, len(words), 650):
        yield dict(source_file=source, source_type=kind, etapa=section,
                   page=page, text=' '.join(words[start:start+750]),
                   path_relativo=source, sensible=int(sensitive), sin_asociar=0)

def pdf_chunks(path, source, issues, ocr=False):
    fitz = optional('fitz')
    pypdf = optional('pypdf') if fitz is None else None
    if fitz is None and pypdf is None:
        raise DependencyMissing('Instalá pypdf o pymupdf en el entorno offline.')
    reader = fitz.open(str(path)) if fitz else pypdf.PdfReader(str(path))
    try:
        if (fitz and reader.needs_pass) or (not fitz and reader.is_encrypted):
            raise ValueError('PDF cifrado: se omitió sin intentar descifrarlo.')
        for index, page in enumerate(reader if fitz else reader.pages, 1):
            try:
                text = page.get_text() if fitz else page.extract_text()
                text = text or ''
                if not text.strip():
                    if ocr:
                        tess = optional('pytesseract')
                        pil = optional('PIL.Image')
                        if not fitz or not tess or not pil:
                            issues.append((index, 'requiere_ocr', 'Para OCR hacen falta pymupdf, pytesseract y Pillow.'))
                            continue
                        # Límite de rasterización: evita reservar una imagen enorme.
                        if page.rect.width * page.rect.height * 4 > 16000000:
                            issues.append((index, 'requiere_ocr', 'Página demasiado grande para OCR seguro.'))
                            continue
                        pix = page.get_pixmap(matrix=fitz.Matrix(2,2), alpha=False)
                        image = pil.frombytes('RGB', [pix.width,pix.height], pix.samples)
                        try:
                            text = tess.image_to_string(image, lang='spa', timeout=120)
                        finally:
                            image.close()
                    if not text.strip():
                        issues.append((index, 'requiere_ocr', 'Página sin texto; requiere OCR.'))
                        continue
                # No mezcla páginas: cada fragmento conserva la página de origen.
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                section = lines[0][:160] if lines else 'PDF'
                yield from fragments(text,source,'pdf',section,index)
            except Exception as exc:
                issues.append((index, 'error_pagina', type(exc).__name__))
    finally:
        if fitz:
            reader.close()
        else:
            stream = getattr(reader,'stream',None)
            if stream: stream.close()

def docx_chunks(path, source, issues):
    docx = optional('docx')
    if docx is None:
        raise DependencyMissing('Instalá python-docx en el entorno offline.')
    # Word carga un documento por vez. Evitá paquetes descomprimidos desmedidos.
    with zipfile.ZipFile(path) as archive:
        if sum(i.file_size for i in archive.infolist()) > 80*1024*1024:
            raise ValueError('El DOCX descomprimido supera 80 MB.')
    document = docx.Document(str(path))
    section = 'Documento'
    buffer = []
    count = 0
    # XML en orden documental para conservar títulos, párrafos y tablas.
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    for node in document.element.body:
        if node.tag not in (ns+'p',ns+'tbl'): continue
        text = ' '.join(t.text or '' for t in node.iter(ns+'t')).strip()
        if not text: continue
        props = node.find(ns+'pPr')
        style = props.find(ns+'pStyle') if props is not None else None
        title = style.get(ns+'val','') if style is not None else ''
        heading = bool(re.match(r'(Heading|T.tulo|Title)', title, re.I))
        if heading or count >= 750:
            yield from fragments('\n'.join(buffer),source,'docx',section)
            overlap = ' '.join(' '.join(buffer).split()[-100:]) if not heading else ''
            buffer = [overlap] if overlap else []
            count = len(overlap.split())
        if heading: section = text[:160]
        buffer.append(text); count += len(text.split())
    yield from fragments('\n'.join(buffer),source,'docx',section)
