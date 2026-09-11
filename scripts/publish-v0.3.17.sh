#!/usr/bin/env bash
# 发布 v0.3.17 到 npm + 创建 GitHub Release
# 前置:
#   1) npm 已登录(npm login),且 registry 指向官方源
#   2) gh 已登录(gh auth login),或提供 GH_TOKEN
# 用法: bash scripts/publish-v0.3.17.sh
set -euo pipefail

VERSION="0.3.17"
TAG="v${VERSION}"
TGZ="y1x1n-dsh-prompt-optimizer-${VERSION}.tgz"
NOTES="docs/release-${TAG}.md"

cd "$(dirname "$0")/.."

echo "=== 0. 预检 ==="
node -e "const v=require('./package.json').version; if(v!=='${VERSION}'){console.error('版本不匹配: '+v+' != ${VERSION}');process.exit(1)}; console.log('package.json 版本 OK: '+v)"
[ -f "$TGZ" ] || { echo "缺少 tarball,先跑 npm pack"; exit 1; }
[ -f "$NOTES" ] || { echo "缺少 release notes: $NOTES"; exit 1; }

echo "=== 1. 检查 npm registry 与登录 ==="
REG=$(npm config get registry)
echo "当前 registry: $REG"
case "$REG" in
  *registry.npmjs.org*) : ;;
  *) echo "⚠️  registry 不是官方源,正在切换..."; npm config set registry https://registry.npmjs.org/ ;;
esac
npm whoami

echo "=== 2. 发布到 npm ==="
# 若已发布过同版本,npm 会报错;此处直接暴露错误由调用方判断
npm publish "$TGZ" --access public

echo "=== 3. 创建 GitHub Release ==="
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh release create "$TAG" "$TGZ" \
    --title "$TAG — 适配 DeepSeek Harness 0.1.5 线" \
    --notes-file "$NOTES"
else
  echo "⚠️  gh 未登录,跳过自动化创建。请手动到以下地址创建 Release 并上传 $TGZ:"
  echo "    https://github.com/Y1X1n/dsh-prompt-optimizer/releases/new?tag=$TAG"
fi

echo "=== 完成 ==="
