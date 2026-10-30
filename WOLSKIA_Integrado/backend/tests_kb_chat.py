"""El chat del manual solo reproduce texto local; sin recomendaciones generadas."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from kb.store import Store
from services import ai_service

class ManualChatTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'kb.sqlite'
        s=Store(self.path)
        s.replace_source('prueba.xlsm',[dict(source_file='prueba.xlsm',source_type='xlsm',etapa='EJECUCION',paso=n,responsable='Ventanillero',text=t) for n,t in [(18,'Pedido de piezas faltantes a VW por sistema POC.'),(19,'Repuestos faltantes a stock: consulta por Dealer Care luego de un mínimo de 48 horas.')]])
        s.close()
    def tearDown(self):self.tmp.cleanup()
    def ask(self,q,history=None):
        with patch('kb.manual_answer.DEFAULT_DB',self.path),patch.object(ai_service,'check_local_rate_limit',return_value=(True,'')),patch.object(ai_service,'get_providers',side_effect=AssertionError('No usar IA')),patch.object(ai_service,'free_web_search',side_effect=AssertionError('No usar web')):
            return ai_service.chat(q,history or [],[],use_tools=True)
    def test_faltante_stock_sin_mencionar_manual(self):
        result=self.ask('Qué hago cuando no hay repuestos en stock?')
        self.assertEqual(result['intent'],'manual')
        for text in ('POC','Dealer Care','48 horas','paso 18','paso 19','Ventanillero'):self.assertIn(text,result['reply'])
        for text in ('otra marca','solución temporal','agende','nota'):self.assertNotIn(text,result['reply'])
        self.assertEqual(result['actions'],[])
    def test_sin_evidencia_no_completa(self):
        self.assertIn('No encontré',self.ask('Según el libro, plutonio espacial')['reply'])
    def test_libro_ausente_no_inventa(self):
        self.path.unlink()
        self.assertIn('no está disponible',self.ask('Qué hago sin repuestos?')['reply'])
    def test_seguimiento_usa_la_consulta_previa(self):
        result=self.ask('Y cuánto espero?', [{'role':'user','content':'Qué hago sin repuestos en stock?'}])
        self.assertEqual(result['intent'],'manual');self.assertIn('48 horas',result['reply'])
    def test_numero_exacto_etapa_y_numero_inexistente(self):
        result=self.ask('Paso 19 de ejecucion')
        self.assertIn('48 horas',result['reply']);self.assertNotIn('paso 18',result['reply'])
        self.assertIn('No encontré',self.ask('Paso 99 de ejecucion')['reply'])
    def test_todos_los_pasos_no_se_recortan(self):
        s=Store(self.path)
        for stage in ('AGENDAMIENTO','RECEPCION','ENTREGA'):
            s.replace_source(stage+'.xlsm',[dict(source_file=stage+'.xlsm',source_type='xlsm',etapa=stage,paso=n,text=f'Instrucción sintética {n}') for n in range(1,21)])
        s.close()
        result=self.ask('Mostrame todos los pasos del libro')
        self.assertEqual(result['reply'].count('Fuente: '),62)
        result=self.ask('Todos los pasos de entrega')
        self.assertEqual(result['reply'].count('Fuente: '),20)
        self.assertNotIn('EJECUCION',result['reply'])
    def test_etapas_y_seguimiento_numerado(self):
        for stage in ('agendamiento','recepción','ejecución','entrega'):
            self.assertEqual(ai_service.classify_intent('Explicame '+stage),'manual')
        result=self.ask('Y el paso 19?', [{'role':'user','content':'Paso 18 de ejecucion'}])
        self.assertIn('paso 19',result['reply']);self.assertNotIn('paso 18',result['reply'])

    def test_prioridad_acciones_y_chat_general(self):
        self.assertEqual(ai_service.classify_intent('Agregá una tarea para pedir repuestos'),'space')
        self.assertEqual(ai_service.classify_intent('Leé el archivo procedimiento.pdf'),'file')
        self.assertEqual(ai_service.classify_intent('Contame un chiste'),'general')

if __name__=='__main__':unittest.main()
