class Documents:
    def __init__(self):
        self.rows = {}

    def put(self, tenant, document, value):
        self.rows[(tenant, document)] = value

    def get(self, tenant, document):
        return self.rows.get((tenant, document))
