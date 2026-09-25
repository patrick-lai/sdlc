import asyncio

class Jobs:
    def __init__(self):
        self.capacity = asyncio.Semaphore(1)

    async def run(self, work):
        await self.capacity.acquire()
        try:
            return await work()
        finally:
            self.capacity.release()
