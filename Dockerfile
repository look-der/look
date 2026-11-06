# ---- 展示网站 Docker 镜像 ----
# 适用于 Railway / Render / Fly.io / 任意支持 Docker 的容器平台
FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单并安装生产依赖（利用镜像层缓存，改代码时不必重装）
COPY package.json ./
RUN npm install --omit=dev

# 拷贝应用代码
COPY . .

# 平台会把外部访问端口映射到这个内部端口（由 config.port / PORT 决定，默认 3000）
EXPOSE 3000

CMD ["npm", "start"]
