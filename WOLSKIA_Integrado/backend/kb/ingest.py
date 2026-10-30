"""Ingesta offline: python -m kb.ingest --xlsm ruta."""
import argparse
from pathlib import Path
from .xlsm_extractor import extract
from .store import Store, DEFAULT_DB

def main():
    parser = argparse.ArgumentParser(description='Indexá el instructivo en tu PC, sin ejecutar macros ni enviar datos.')
    parser.add_argument('--xlsm',type=Path)
    parser.add_argument('--folder',type=Path)
    parser.add_argument('--ocr',action='store_true',help='OCR offline desactivado por defecto; requiere Tesseract con spa y librerías opcionales.')
    parser.add_argument('--ocr-images',action='store_true',help='OCR local de fotos; apagado por defecto.')
    parser.add_argument('--transcribe',action='store_true',help='Transcribir videos con faster-whisper y modelo tiny ya local; apagado por defecto.')
    parser.add_argument('--media-zip',type=Path,help='Indexar solo referencias de fotos/videos del ZIP, sin extraerlos.')
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    args = parser.parse_args()
    if not args.xlsm and not args.folder and not args.media_zip: parser.error('Indicá --xlsm, --folder o --media-zip.')
    if (args.ocr_images or args.transcribe) and not args.folder: parser.error('Los extras requieren --folder con archivos locales extraídos.')
    if args.media_zip and not args.media_zip.is_file(): parser.error('El ZIP no existe.')
    if args.ocr and not args.folder: parser.error('--ocr requiere --folder.')
    if args.folder and not args.folder.is_dir(): parser.error('La carpeta de origen no existe.')
    store = Store(args.db)
    try:
        if args.xlsm:
            print('[1/2] Leyendo el Excel local...')
            count = store.replace_source(args.xlsm.name,extract(args.xlsm))
            print(f'[2/2] Listo: {count} fragmentos de {args.xlsm.name}.')
        if args.folder:
            from .folder import ingest_folder
            summary = ingest_folder(args.folder,store,ocr=args.ocr,ocr_images=args.ocr_images,transcribe=args.transcribe)
            print('Resumen: '+', '.join(f'{k}: {v}' for k,v in summary.items()))
        if args.media_zip:
            from .media import ingest_media_zip
            summary = ingest_media_zip(args.media_zip,store)
            print('Resumen ZIP: '+', '.join(f'{k}: {v}' for k,v in summary.items()))
        print(f'Índice privado: {args.db}')
    except KeyboardInterrupt:
        print('Interrumpido. Los archivos terminados se conservan; repetí el comando para retomar.')
        raise SystemExit(130)
    finally:
        store.close()

if __name__ == '__main__': main()
