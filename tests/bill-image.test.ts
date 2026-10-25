import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { billImageForModel } from '../server/bill-image'
import { extractBill } from '../server/extract'

const heic = readFileSync(new URL('./fixtures/tiny.heic', import.meta.url))
const webp = readFileSync(new URL('./fixtures/tiny.webp', import.meta.url))

async function withoutMock<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.ASSISTANT_MOCK_AI
  delete process.env.ASSISTANT_MOCK_AI
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.ASSISTANT_MOCK_AI
    else process.env.ASSISTANT_MOCK_AI = previous
  }
}

test('a HEIC bill is read as JPEG and the original bytes stay intact', async () => {
  await withoutMock(async () => {
    const original = Buffer.from(heic)
    const prepared = await billImageForModel(heic, 'image/heic')
    assert.equal(prepared.mediaType, 'image/jpeg')
    assert.equal(prepared.bytes[0], 0xff)
    assert.equal(prepared.bytes[1], 0xd8)
    assert.equal(prepared.bytes[2], 0xff)
    assert.ok(prepared.bytes.byteLength > 100)
    assert.deepEqual(Buffer.from(heic), original)

    let seenType = ''
    const fields = await extractBill(heic, 'image/heif', async (bytes, mediaType) => {
      seenType = mediaType
      assert.equal(bytes[0], 0xff)
      assert.equal(bytes[1], 0xd8)
      return { kwhThisPeriod: 842, customerName: 'Pat Example' }
    })
    assert.equal(seenType, 'image/jpeg')
    assert.equal(fields.kwhThisPeriod, 842)
    assert.equal(fields.customerName, 'Pat Example')
    assert.deepEqual(Buffer.from(heic), original)
  })
})

test('a WEBP bill is read as WEBP without rewriting the file', async () => {
  await withoutMock(async () => {
    const prepared = await billImageForModel(webp, 'image/webp')
    assert.equal(prepared.mediaType, 'image/webp')
    assert.equal(prepared.bytes, webp)
    const fields = await extractBill(webp, 'image/webp', async (bytes, mediaType) => {
      assert.equal(mediaType, 'image/webp')
      assert.equal(Buffer.compare(Buffer.from(bytes), webp), 0)
      return { kwhThisPeriod: 640, usageHistory: [{ month: '2026-09', kwh: 640 }] }
    })
    assert.equal(fields.kwhThisPeriod, 640)
    assert.deepEqual(fields.usageHistory, [{ month: '2026-09', kwh: 640 }])
  })
})

test('an unreadable HEIC does not throw and does not call the model', async () => {
  await withoutMock(async () => {
    const junk = Buffer.alloc(32)
    junk.write('ftyp', 4, 'ascii')
    junk.write('heic', 8, 'ascii')
    let called = false
    const fields = await extractBill(junk, 'image/heic', async () => {
      called = true
      return { kwhThisPeriod: 1 }
    })
    assert.equal(called, false)
    assert.equal(fields.kwhThisPeriod, null)
    assert.equal(fields.customerName, null)
  })
})
