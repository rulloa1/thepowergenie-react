import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assertAllowedUpload, assertBillBytes, safeFileName, sniffMedia } from '../server/files'
import { HttpError } from '../server/http'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('accepts a png and rejects a disguised file', () => {
  assert.equal(sniffMedia(png), 'image/png')
  assert.equal(assertBillBytes(png, 'image/png'), 'image/png')
  assert.throws(() => assertBillBytes(Buffer.from('%PDF-1.7'), 'image/png'), (error: unknown) => error instanceof HttpError && error.status === 415)
})

function ftyp(brand: string): Buffer {
  const bytes = Buffer.alloc(16)
  bytes.write('ftyp', 4, 'ascii')
  bytes.write(brand, 8, 'ascii')
  return bytes
}

test('caps uploads at 10 MB and accepts phone photo types', () => {
  assert.equal(assertAllowedUpload('bill.jpg', 'image/jpeg', 1024), 'image/jpeg')
  assert.equal(assertAllowedUpload('bill.heic', 'image/heic', 1024), 'image/heic')
  assert.equal(assertAllowedUpload('bill.heif', '', 1024), 'image/heif')
  assert.equal(assertAllowedUpload('bill.webp', 'image/webp', 1024), 'image/webp')
  assert.throws(() => assertAllowedUpload('bill.heic', 'image/heic', 10 * 1024 * 1024 + 1), (error: unknown) => error instanceof HttpError && error.status === 413)
  assert.throws(() => assertAllowedUpload('notes.txt', 'text/plain', 20), (error: unknown) => error instanceof HttpError && error.status === 415)
  assert.equal(safeFileName('light-bill', 'image/heic'), 'light-bill.heic')
  assert.equal(safeFileName('light-bill', 'image/webp'), 'light-bill.webp')
})

test('sniffs HEIC, HEIF, and WEBP and rejects other containers', () => {
  const heic = readFileSync(new URL('./fixtures/tiny.heic', import.meta.url))
  const webp = readFileSync(new URL('./fixtures/tiny.webp', import.meta.url))
  assert.equal(sniffMedia(heic), 'image/heic')
  assert.equal(assertBillBytes(heic, 'image/heic'), 'image/heic')
  assert.equal(assertBillBytes(heic, 'image/heif'), 'image/heic')
  assert.equal(sniffMedia(webp), 'image/webp')
  assert.equal(assertBillBytes(webp, 'image/webp'), 'image/webp')
  assert.equal(sniffMedia(ftyp('heix')), 'image/heic')
  assert.equal(sniffMedia(ftyp('mif1')), 'image/heif')
  assert.equal(sniffMedia(ftyp('avif')), null)
  assert.throws(() => assertBillBytes(heic, 'image/jpeg'), (error: unknown) => error instanceof HttpError && error.status === 415)
})
