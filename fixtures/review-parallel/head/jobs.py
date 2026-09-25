import asyncio

class Jobs:
    def __init__(self):
        self.capacity = asyncio.Semaphore(1)

    async def run(self, work):
        await self.capacity.acquire()
        result = await work()
        self.capacity.release()
        return result
