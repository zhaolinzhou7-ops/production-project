import Taro from '@tarojs/taro'
import { backupToText, restoreBackup, parseBackup, backupSummary } from '../store/backup'

/**
 * 把备份**发到微信里**,以及从微信里取回来。
 *
 * 为什么是这条路:小程序没有「保存到手机」的通用能力,剪贴板又装不下
 * 几百 KB 的数据(而且用户也没地方粘)。而每个人都有的、不会丢的地方,
 * 是微信的「文件传输助手」——转发过去就等于存进了自己的聊天记录,
 * 换手机、重装小程序都还在。
 *
 * 恢复走 chooseMessageFile:从聊天记录里把那个文件选回来。
 * 这一对是小程序上唯一真正可用的备份闭环。
 */

const FILE_NAME = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `成长学习备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
}

/** 导出:写成文件 → 转发给微信好友(建议选「文件传输助手」) */
export function exportBackupToWechat(onFail: (msg: string) => void): void {
  let path = ''
  try {
    const fs = Taro.getFileSystemManager()
    path = `${Taro.env.USER_DATA_PATH}/${FILE_NAME()}`
    fs.writeFileSync(path, backupToText(), 'utf8')
  } catch (e) {
    onFail('生成备份文件失败:' + (e instanceof Error ? e.message : String(e)))
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const share = (Taro as any).shareFileMessage
    if (typeof share !== 'function') {
      onFail('当前微信版本不支持转发文件,请更新微信后再试')
      return
    }
    share({
      filePath: path,
      fileName: FILE_NAME(),
      fail: (e: { errMsg?: string }) => {
        // 用户自己取消不算错,不要弹窗吓人
        if (e && e.errMsg && e.errMsg.indexOf('cancel') >= 0) return
        onFail((e && e.errMsg) || '转发失败')
      },
    })
  } catch (e) {
    onFail(e instanceof Error ? e.message : String(e))
  }
}

/**
 * 导入:从聊天记录里选回那个备份文件。
 *
 * onPreview 先把「这份备份里有什么」摆出来让用户确认 ——
 * 恢复是破坏性的(先清空再写入),不能点一下就执行。
 */
export function importBackupFromWechat(
  onPreview: (summary: string, doRestore: () => void) => void,
  onFail: (msg: string) => void,
): void {
  try {
    Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f) {
          onFail('没有选到文件')
          return
        }
        let text = ''
        try {
          text = String(Taro.getFileSystemManager().readFileSync(f.path, 'utf8'))
        } catch (e) {
          onFail('读不出这个文件:' + (e instanceof Error ? e.message : String(e)))
          return
        }
        const p = parseBackup(text)
        if (!p.ok || !p.file) {
          onFail(p.msg)
          return
        }
        onPreview(`${p.file.at}\n${backupSummary(p.file)}`, () => {
          const r = restoreBackup(text)
          Taro.showModal({
            title: r.ok ? '恢复完成' : '没能恢复',
            content: r.ok ? `${r.msg}。请退出小程序重新进入。` : r.msg,
            showCancel: false,
          })
        })
      },
      fail: (e) => {
        if (e && e.errMsg && e.errMsg.indexOf('cancel') >= 0) return
        onFail((e && e.errMsg) || '没能打开聊天记录')
      },
    })
  } catch (e) {
    onFail(e instanceof Error ? e.message : String(e))
  }
}
