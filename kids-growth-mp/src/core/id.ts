// 小程序环境无 crypto.randomUUID,用时间戳 + 随机串生成足够唯一的 id
let counter = 0
export function newId(): string {
  counter = (counter + 1) % 1e6
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
