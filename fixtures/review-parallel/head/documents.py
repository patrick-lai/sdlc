class Documents:
    def __init__(self, rows):
        self.rows = rows

    def get(self, tenant, document_id):
        row = self.rows.get(document_id)
        if row is None:
            return None
        return row['body']
