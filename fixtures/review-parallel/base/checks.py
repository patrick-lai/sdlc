import asyncio
from documents import Documents
from jobs import Jobs
from search import Search
from client import checkout_label

assert Documents({'a': {'tenant': 'one', 'body': 'body'}}).get('one', 'a') == 'body'
assert checkout_label(True) == 'Pay now'
async def verify():
    jobs = Jobs()
    async def work():
        return 1
    assert await jobs.run(work) == 1
    assert await jobs.run(work) == 1
    search = Search()
    async def fetch(query):
        return [query]
    await search.select('q', fetch)
    assert search.rows == ['q']
asyncio.run(verify())
