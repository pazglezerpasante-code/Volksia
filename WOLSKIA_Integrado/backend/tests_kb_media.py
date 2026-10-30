"""Medios sintéticos y motores simulados; no usa contenido de la empresa."""
import base64
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock
from kb.folder import ingest_folder
from kb.media import ingest_media_zip, source_id, video_text
from kb.store import Store

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')

class MediaTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
        self.root=self.base/'manual';self.root.mkdir();self.store=Store(self.base/'kb.sqlite');self.logs=[]
    def tearDown(self):
        self.store.close();self.tmp.cleanup()
    def run_folder(self,**kwargs):
        return ingest_folder(self.root,self.store,log=self.logs.append,**kwargs)
    def test_imagen_y_video_solo_metadatos_sin_abrir_binarios(self):
        (self.root/'Recepcion').mkdir()
        image=self.root/'Recepcion'/'protecciones.png';image.write_bytes(PNG)
        (self.root/'Recepcion'/'proceso.mp4').write_bytes(b'video ficticio sin decodificar')
        with patch('kb.media.image_text',side_effect=AssertionError('OCR no permitido')),patch('kb.media.video_text',side_effect=AssertionError('Transcripción no permitida')),patch('kb.folder.digest',side_effect=AssertionError('No debe leer binarios')),patch.object(Path,'open',side_effect=AssertionError('No abre medios')):
            result=self.run_folder()
        self.assertEqual(result['indexados'],2)
        row=self.store.search('protecciones')[0]
        self.assertEqual(row['path_relativo'],'manual/Recepcion/protecciones.png')
        text=self.store.db.execute("SELECT text FROM chunks WHERE source_type='referencia_imagen'").fetchone()[0]
        self.assertIn('Tamaño:',text);self.assertIn('Fecha:',text)
        self.assertIn('UTC',text);self.assertIn(str(image.stat().st_size),text)
        self.assertTrue(self.store.search('proceso'))
    def test_reanudacion_y_cambio_de_metadata(self):
        p=self.root/'a.png';p.write_bytes(PNG)
        self.run_folder()
        self.assertEqual(self.run_folder()['reanudados'],1)
        p.write_bytes(PNG+b'metadata ficticia')
        self.assertEqual(self.run_folder()['indexados'],1)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM chunks').fetchone()[0],1)
    def test_copias_conservan_referencia_a_cada_carpeta(self):
        (self.root/'a.png').write_bytes(PNG);(self.root/'b.png').write_bytes(PNG)
        self.assertEqual(self.run_folder()['indexados'],2)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM chunks').fetchone()[0],2)
    def test_zip_no_extrae_ni_lee_los_medios(self):
        p=self.base/'medios.zip'
        with zipfile.ZipFile(p,'w') as z:
            z.writestr('Recepcion/foto.png',PNG);z.writestr('Entrega/video.mp4',b'video ficticio')
            z.writestr('../fuera.png',PNG);z.writestr('nota.txt','dato')
        with patch.object(zipfile.ZipFile,'open',side_effect=AssertionError('No abrir miembros del ZIP')):
            result=ingest_media_zip(p,self.store,log=self.logs.append)
        self.assertEqual(result['indexados'],2);self.assertEqual(result['omitidos'],1)
        self.assertEqual(ingest_media_zip(p,self.store,log=self.logs.append)['reanudados'],2)
        self.assertEqual(len(list(self.root.iterdir())),0)
    def test_ocr_solo_con_flag_y_errores_conservan_referencia(self):
        (self.root/'a.png').write_bytes(PNG);self.run_folder()
        with patch('kb.media.image_text',return_value='Proteccion sintetica ficticio@example.invalid') as ocr:
            self.assertEqual(self.run_folder(ocr_images=True)['indexados'],1)
            ocr.assert_called_once()
        self.assertTrue(self.store.search('Proteccion'))
        self.assertEqual(self.store.search('example invalid'),[])
        with patch('kb.media.image_text',side_effect=RuntimeError('motor no disponible')):
            # Forzá un cambio del archivo para comprobar que se guarda solo la referencia.
            (self.root/'a.png').write_bytes(PNG+b'cambio')
            self.run_folder(ocr_images=True)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM chunks').fetchone()[0],1)
        self.assertEqual(self.store.db.execute('SELECT status FROM ingestion_files').fetchone()[0],'parcial')
        self.assertTrue(self.store.search('a png'))
    def test_faltan_dependencias_reintenta_extras_sin_duplicar(self):
        (self.root/'a.png').write_bytes(PNG)
        with patch('kb.media.optional',return_value=None):
            self.run_folder(ocr_images=True)
            self.run_folder(ocr_images=True)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM chunks').fetchone()[0],1)
        self.assertTrue(any('extra_pendiente' in s for s in self.logs))
    def test_transcripcion_mock_tiempos_y_rollback_de_segmentos_parciales(self):
        p=self.root/'a.mp4';p.write_bytes(b'video ficticio')
        with patch('kb.media.video_text',return_value=iter([(0,2,'Procedimiento ficticio')])):
            self.run_folder(transcribe=True)
        text=self.store.db.execute("SELECT text FROM chunks WHERE source_type='transcripcion_video'").fetchone()[0]
        self.assertIn('0.0–2.0',text)
        p.write_bytes(b'video ficticio actualizado')
        def failed(path):
            yield 0,1,'Incompleto'
            raise RuntimeError()
        with patch('kb.media.video_text',side_effect=failed):self.run_folder(transcribe=True)
        self.assertEqual(self.store.search('Incompleto'),[])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM chunks').fetchone()[0],1)
    def test_whisper_no_descarga_modelos(self):
        model=Mock();model.transcribe.return_value=(iter([SimpleNamespace(start=0,end=1,text='dato')]),None)
        factory=Mock(return_value=model)
        with patch('kb.media.optional',return_value=SimpleNamespace(WhisperModel=factory)):
            self.assertEqual(list(video_text(Path('video.mp4'))),[(0,1,'dato')])
        self.assertTrue(factory.call_args.kwargs['local_files_only'])
    def test_redaccion_de_nombres_no_fusiona_fuentes(self):
        a=source_id('manual/1155550000.png');b=source_id('manual/1155550001.png')
        self.assertNotEqual(a,b);self.assertNotIn('1155550000',a)

if __name__ == '__main__':unittest.main()
