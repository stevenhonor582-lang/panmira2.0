#!/usr/bin/env bash
#
# build-artifact.sh — 构建 Docker 镜像
# 输入: $1=service $2=version
# 输出: JSON { build_id, image_digest, status, duration_ms }
# 注: 实际命令 mock，不真实执行
#
set -euo pipefail

SERVICE="${1:-panmira-core}"
VERSION="${2:-v1.0.0}"
BUILD_ID="build-$(date +%s)-$(echo "${SERVICE}-${VERSION}" | md5sum | cut -c1-8)"

START_MS=$(date +%s%3N)

# Mock: 实际命令注释保留
# 1. git checkout
# git checkout "${VERSION}"
# 2. 检测项目类型并 build
# case "$SERVICE" in
#   panmira-core) npm run build ;;
#   panmira-portal) yarn build ;;
#   panmira-mcp) go build -o bin/mcp . ;;
# esac
# 3. docker build
# docker build -t "registry.internal/${SERVICE}:${VERSION}" .
# 4. docker push
# docker push "registry.internal/${SERVICE}:${VERSION}"

# Mock 输出
IMAGE_DIGEST="sha256:$(echo "${SERVICE}-${VERSION}-${BUILD_ID}" | sha256sum | cut -c1-64)"

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

cat <<JSON
{
  "build_id": "${BUILD_ID}",
  "service": "${SERVICE}",
  "version": "${VERSION}",
  "image": "registry.internal/${SERVICE}:${VERSION}",
  "image_digest": "${IMAGE_DIGEST}",
  "status": "succeeded",
  "duration_ms": ${DURATION},
  "artifacts": {
    "registry": "registry.internal",
    "repository": "${SERVICE}",
    "tag": "${VERSION}"
  }
}
JSON
