class Search:
    def __init__(self):
        self.query = ''
        self.rows = []
        self.generation = 0

    async def select(self, query, fetch):
        self.query = query
        self.generation += 1
        generation = self.generation
        rows = await fetch(query)
        if generation == self.generation:
            self.rows = rows
