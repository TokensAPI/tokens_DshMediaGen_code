# TokensCowork 0.5.25 / 0.7.13 适配（0.3.12）

目标宿主：

- TokensCowork 0.5.25，DSH 0.1.5-rc.2；
- TokensCowork 0.7.13，DSH 0.2.1-rc.2，Cordis 4.0.5。

## 改动

- 保留 TokensCowork 0.5.25 使用的 DSH 0.1.5-rc.2 兼容范围，增加 TokensCowork 0.7.13 使用的精确版本 0.2.1-rc.2；通过 engines.dsh 和 peerDependencies 声明。不使用版本豁免。
- 开发依赖固定到新版宿主 SDK；更新 pnpm 锁文件。
- 图片结果在 TokensCowork 0.7.13 按槽位传入的 sessionId 读取附件，避免依赖新版已移除的全局 current 字段；TokensCowork 0.5.25 继续使用旧宿主的全局 current 回退路径。
- 客户端通过两条运行时都支持的 locale 注册/槽位注入接口提供中英文文案；界面跟随 TokensCowork 当前语言重新渲染，Host 问题 ID、选项值和生成参数保持不变。
- TokensAPI 上传响应若带冗余 Host，只在它与 upload_url 主机完全一致时接受，并且不把它作为可覆盖的请求头发给对象存储。

## 验证

- 新 SDK 类型检查和构建。
- 自动化用例覆盖问答确认、取消、图片上传、生成请求、视频参数、网络恢复，以及新旧宿主的会话附件选择。
- 独立浏览器使用已安装宿主的 React/Cordis，覆盖默认选择、多步确认、关闭取消、所属会话图片和下载入口。

兼容性检查通过时不传任何版本豁免。

以上为隔离验证：不读取用户凭证，不调用模型或提交真实生成任务。尚未安装到用户配置、重启应用或发布 Registry。TokensCowork 0.5.25 的运行时版本来自已保留的历史验收基线；本轮将复验其回退契约，但不会重新启动旧版桌面应用。
