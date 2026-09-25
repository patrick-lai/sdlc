class Documents:
    def __init__(self):
        self.rows = {}
        self.cache = {}

    def put(self, tenant, document, value):
        self.rows[(tenant, document)] = value
        self.cache.pop(document, None)

    def get(self, tenant, document):
        if document not in self.cache:
            self.cache[document] = self.rows.get((tenant, document))
        return self.cache[document]
