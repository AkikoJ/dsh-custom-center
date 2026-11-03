const SENSITIVE_WORDS = ['政治', '政府', '领导人', '主席', '总统', '选举', '游行', '抗议', '民族', '宗教', '邪教',
  '病', '癌', '药', '治疗', '诊断', '自杀', '抑郁', '起诉', '律师', '判', '违法', '坐牢', '报案',
  '身份证', '住址', '手机号', '人肉', '开盒', '社工', '裸', '色情', '约炮', '包养', '赌博', '博彩',
  '洗钱', '跑分', '股票', '荐股', '基金', '炒币', '贷款', '套现', '返利', '破解', '外挂', '盗号', '黑产', '刷单', '代考']
const TEXT_EMOTICONS = ['[憨笑]', '[笑哭]', '[捂脸]', '[比心]', '[害羞]', '[赞]', '[微笑]']
export function sensitiveComment(comment: string): boolean { return SENSITIVE_WORDS.some((word) => comment.includes(word)) }
export function shortReply(value: string): string {
  let text = String(value || '').replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 20)
  const open = text.lastIndexOf('[')
  if (open !== -1 && text.indexOf(']', open) === -1) text = text.slice(0, open).trim()
  return text.replace(/[，、,；;：:\-—…]+$/, '').trim()
}
export function safeReply(comment: string, candidate: string): string {
  return sensitiveComment(comment) ? '这个我不太方便聊，换个话题吧。' : shortReply(candidate)
}
export function pickReply(comment: string, random: () => number = Math.random) {
  if (sensitiveComment(comment)) return { text: safeReply(comment, ''), sensitive: true }
  const emoji = random() < 0.65 ? TEXT_EMOTICONS[Math.floor(random() * TEXT_EMOTICONS.length)] : ''
  let text: string
  if (/[?？]|怎么|为什么|能不能|有没有|求/.test(comment)) text = `这个我也说不好${emoji || '，回头细说'}`
  else if (/谢谢|感谢|爱你|喜欢|好可爱|太棒|厉害/.test(comment)) text = `谢谢喜欢～${emoji}`
  else if (/哈哈|笑死|草|绝了/.test(comment)) text = `哈哈哈你抓到重点了${emoji}`
  else if (/更新|什么时候|催|快更/.test(comment)) text = `在弄了在弄了${emoji || '，别催'}`
  else if (/回我|理我|在吗|说话/.test(comment)) text = `在的在的${emoji}`
  else text = [`我懂你意思${emoji}`, `谢谢你的留言${emoji}`, `嗯…你说得对${emoji}`, `收到，记下了${emoji}`][Math.floor(random() * 4)]
  if (text.length > 20) {
    const cut = text.slice(0, 20), punctuation = cut.match(/^.*[，。！？~、,.!?]/)
    text = (punctuation ? punctuation[0] : cut).replace(/[，。、]$/, '')
  }
  return { text: shortReply(text || '收到[微笑]'), sensitive: false, emoji: !!emoji }
}
