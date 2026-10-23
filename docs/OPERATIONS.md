# 运行、部署与恢复

## 生产结构

- SSH 主机：`oracle`；域名：`mouses.ninthflux.com`。
- 独立服务：`mouse-nook.service`，监听 `127.0.0.1:18326`，Caddy 提供 HTTPS。
- 代码：`/srv/mouse-nook/releases/<UTC日期>-<Git提交>`；`current` 指向当前版本，`previous` 保留上一个版本。
- 数据：`/var/lib/mouse-nook/mouse-nook.sqlite`，SQLite WAL、0700 数据目录、0600 数据库；与版本目录分离。
- 配置：`/etc/mouse-nook.env`，仅 root 可读；由 systemd 注入进程。首次生成随机访问密码，后续部署保留。
- `admin` 基础认证保护页面与 API，不在公开响应、Git 或日志中输出密码。
- 进程限额：256 MB 内存、50% 单核 CPU；异常重启，关机时等待发送中的队列操作。
- 30 秒一次调度；队列和订阅持久化，多实例发送使用数据库租约。业务保存不受外部推送故障影响。

首次部署前检查端口、已有 Caddy 配置及 DNS 记录。只增加本项目 vhost，不覆盖其他服务。生产数据库保持空库，不自动导入示例。

## 发布

```sh
npm run build
npm test
git status --short # 必须已提交且为空
./scripts/deploy.sh oracle mouses.ninthflux.com
```

脚本只发布 Git HEAD，VPS 内安装依赖、构建并测试，随后移除开发依赖。源代码、构建结果与版本标识保持一致。激活后在服务器本机以认证请求检查健康接口，并执行首次备份。

首次 Caddy 设置需要把 `deploy/mouses.caddy` 放入 `/etc/caddy/sites/` 并添加对应 import；先 `caddy validate`，成功后 reload。Cloudflare 仅增加 `mouses` 记录，不改变主域、邮件与其他子域。上线后实际验证 HTTPS、认证、页面资源、API 保存、服务重启、备份定时器。

## 日常操作

```sh
ssh oracle 'sudo systemctl status mouse-nook --no-pager'
ssh oracle 'sudo journalctl -u mouse-nook -n 50 --no-pager'
ssh oracle 'sudo systemctl list-timers mouse-nook-backup.timer --no-pager'
ssh oracle 'sudo systemctl start mouse-nook-backup.service'
```

每日北京时间 03:20 后随机延迟最多 5 分钟做一致性备份，落在 `/var/lib/mouse-nook/backups/`。不自动删除历史备份；按实际数据增长制定离机备份和保留策略。数据库包含推送订阅与 VAPID 私钥，备份同样受限存放。

`PUSH_ENABLED=0` 可快速停用外部推送，站内计划、日历和实际记录照常使用；修改环境后重启服务。关闭动效可在设置里切到静态，不影响管理功能。

## 代码回滚

```sh
./scripts/rollback.sh oracle
```

切回 `previous` 并重启，数据不回滚。当前架构版本为 1，兼容的代码回退可以直接使用原库；未来架构升级需先保留旧库并制定迁移回退，不能用旧代码直接打开不兼容的新库。

## 数据恢复

1. 停止生产服务；保留现有数据库与最后一份备份。
2. 用当前版本 `dist-server/scripts/restore.js` 指向备份，指定 `DATA_DIR=/var/lib/mouse-nook`，显式使用 `--confirm-replace`。
3. 工具检查 SQLite 完整性、架构版本和核心表，发现运行中的本项目进程时拒绝覆盖；旧目标库自动保留恢复前备份。
4. 以 `mouse-nook` 用户运行恢复，确保数据与 WAL 文件的所有权一致，再启动服务。
5. 验证个体 ID、亲缘、提醒已处理状态和下一换笼实例。恢复后的外部发送先关闭，核对后再开启。

```sh
sudo systemctl stop mouse-nook
sudo -u mouse-nook env DATA_DIR=/var/lib/mouse-nook \
  /usr/bin/node /srv/mouse-nook/current/dist-server/scripts/restore.js \
  /安全目录/backup.sqlite --confirm-replace
sudo systemctl start mouse-nook
```

## 真机推送

1. 在 iPhone 用 HTTPS 打开站点并通过访问认证。
2. 分享 → 添加到主屏幕；从主屏幕打开。
3. 设置 → 开启本设备通知；允许系统权限；发送测试。
4. 记录 iOS 版本、权限、服务接受时间和手机实际显示时间。
5. 关闭页面，配置一次提前与到期节点，分别验证锁屏 / 通知中心显示。
6. 测试撤销订阅、计划改期、实际完成后不再发送旧实例。

没有设备反馈时只能报告队列状态和服务接受结果。当前未实现滴答任务映射，不能把 PWA 队列状态当作滴答同步结果。
