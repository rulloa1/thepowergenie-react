-- Phone cameras and the website assistant also send WEBP light bills.
-- The bucket stays private. The 10 MB cap is unchanged.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]
where id = 'hub-light-bills';
