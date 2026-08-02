/**
 * 家长录音的索引键(纯逻辑,可被自测覆盖)。
 *
 * 一句话在程序里会以好几种形态出现:对话里带标点、复述里不带、
 * 动画字幕里首字母大写。如果直接拿原文当键,同一句话录了一遍,
 * 换个地方又找不到 —— 家长会觉得「我明明录过了」。
 *
 * 所以统一归一化:去掉首尾空白、多个空格并一个、转小写、
 * 去掉句末标点。**句中的标点保留** —— "Let's go" 和 "Lets go" 是两句话,
 * 而 "Let's go!" 和 "Let's go" 是同一句。
 */
export function voiceKeyOf(text: string): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:。！？，；：]+$/u, '')
    .toLowerCase()
}

/** 键是否有效 —— 空句子不该占一条录音 */
export function isValidVoiceKey(key: string): boolean {
  return key.length > 0
}
