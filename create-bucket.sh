# Does not fully work. Keeping it here for reference. Currently using Minio mc client instead. See init-db.sh.
source .env.dev
echo ${AWS_ACCESS_KEY_ID}
echo ${AWS_SECRET_ACCESS_KEY}
echo ${MINIO_KEY}
echo ${MINIO_SECRET}
echo ${S3_BUCKET_NAME}

#  resource="/${S3_BUCKET_NAME}"
#  content_type="application/zstd"
#  date=`date -R`
#  _signature="PUT\n\n${content_type}\n${date}\n${resource}"
#  signature=`echo -en ${_signature} | openssl sha1 -hmac ${AWS_SECRET_ACCESS_KEY} -binary | base64`
#  curl -X PUT \
#    -H "Host: localhost:9000" \
#    -H "Date: $DATE" \
#    -H "Authorization: AWS ${AWS_ACCESS_KEY_ID}:${signature}" \
#    http://localhost:9000/${resource}



URL=localhost:9000
USERNAME=${MINIO_KEY}
PASSWORD=${MINIO_SECRET}
BUCKET=${S3_BUCKET_NAME}
MINIO_PATH="/${BUCKET}"

# Static Vars
DATE=$(date -R)
CONTENT_TYPE='application/zstd'
SIG_STRING="GET\n\n${CONTENT_TYPE}\n${DATE}\n${MINIO_PATH}"
SIGNATURE=`echo -en ${SIG_STRING} | openssl sha1 -hmac ${PASSWORD} -binary | base64`


curl -X PUT \
    -H "Host: $URL" \
    -H "Date: ${DATE}" \
    -H "Content-Type: ${CONTENT_TYPE}" \
    -H "Authorization: AWS ${USERNAME}:${SIGNATURE}" \
    http://$URL${MINIO_PATH}