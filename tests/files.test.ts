import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertAllowedUpload, assertBillBytes, sniffMedia } from '../server/files'
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

test('caps uploads at 10 MB and refuses HEIC', () => {
  assert.equal(assertAllowedUpload('bill.jpg', 'image/jpeg', 1024), 'image/jpeg')
  assert.throws(() => assertAllowedUpload('bill.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1), (error: unknown) => error instanceof HttpError && error.status === 413)
  assert.throws(() => assertAllowedUpload('bill.heic', 'image/heic', 1024), (error: unknown) => error instanceof HttpError && error.status === 415)
  assert.throws(() => assertAllowedUpload('notes.txt', 'text/plain', 20), (error: unknown) => error instanceof HttpError && error.status === 415)
})
