# 装柜计算器 Container Planner

整柜进口用的装柜和成本计算工具：

- **货物库**：录入每种货的外箱尺寸、毛重、单价、HS 编码和关税
- **装柜方案**：20GP / 40GP / 40HQ 自动配货或手动配货，3D 显示摆放
- **成本分摊**：海运费、港杂、清关等按 W/M 计费吨、货值或件数分摊，算出每箱落地成本
- **设置**：汇率、GST、货值门槛、柜型尺寸和运价、数据备份

在线使用：https://rickysdq418.github.io/container-planner/

数据只保存在各自的浏览器里，换设备用“设置 → 备份 / 粘贴备份”转移。

文件：`index.html`（页面）、`app.js`（界面逻辑）、`engine.js`（装箱和成本计算）。3D 和线性规划组件从 CDN 加载（three.js r128、javascript-lp-solver 0.4.24）。
