import unittest
from documents import Documents

class DocumentsTest(unittest.TestCase):
    def test_read(self):
        store = Documents()
        store.put('a', 'one', 'value')
        self.assertEqual(store.get('a', 'one'), 'value')

if __name__ == '__main__':
    unittest.main()
