"""Browser-owned tasks/notes: no persistent writes, isolated request scratchpads."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from services import space_store as store


class DeviceSpaceTests(unittest.TestCase):
    def test_crud_does_not_touch_server_or_supabase(self):
        with patch.object(store, '_use_supabase', side_effect=AssertionError('persistent storage accessed')):
            with store.device_session('browser', {'tasks': [], 'notes': [], 'events': []}):
                task = store.add('browser', 'task', {'title': 'Revisar informe'})
                store.update('browser', 'task', task['id'], {'done': True})
                self.assertTrue(store.list_all('browser')['tasks'][0]['done'])
                note = store.add('browser', 'note', {'title': 'Idea', 'content': 'Recordar'})
                store.delete('browser', 'note', note['id'])
                self.assertEqual(store.list_all('browser')['notes'], [])
        self.assertIsNone(store._DEVICE_DATA.get())

    def test_concurrent_requests_do_not_share_state(self):
        def request(title):
            with store.device_session('same-id', {'tasks': [], 'notes': [], 'events': []}):
                store.add('same-id', 'task', {'title': title})
                return store.list_all('same-id')['tasks'][0]['title']
        with ThreadPoolExecutor(2) as executor:
            self.assertEqual(list(executor.map(request, ['PC', 'Celular'])), ['PC', 'Celular'])

    def test_context_reset_after_failure(self):
        with self.assertRaises(RuntimeError):
            with store.device_session('browser', {}):
                raise RuntimeError('provider unavailable')
        self.assertIsNone(store._DEVICE_DATA.get())

    def test_invalid_snapshot_rejected(self):
        with self.assertRaises(store.SpaceError):
            with store.device_session('browser', {'tasks': [{'title': 'Sin ID'}]}):
                pass

    def test_chat_returns_device_changes_even_after_provider_error(self):
        import app
        def fake_chat(**kwargs):
            store.add(kwargs['user'], 'note', {'title': 'Nueva idea'})
            return {'reply': 'Falló la respuesta final', 'status': 'error', 'provider': 'local'}
        with patch.object(app, 'PUBLIC_MODE', False), patch('services.ai_service.chat', fake_chat):
            response = app.app.test_client().post('/api/ai/chat', json={
                'message': 'Guardá una idea', 'user': 'browser',
                'device_space': {'tasks': [], 'notes': [], 'events': []},
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['device_space']['notes'][0]['title'], 'Nueva idea')
        self.assertIsNone(store._DEVICE_DATA.get())


if __name__ == '__main__':
    unittest.main()
