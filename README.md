# Time Converter Pro Offline (时间转换)


**Time Converter Pro (V1.1.0)** 是一款专为安卓端设计的、完全离线的极致时间转换与数据录入工具。它结合了现代 **Glassmorphism（玻璃拟态）** 视觉美学与 **Google Room 原生数据库**技术，并在 V1.1.0 版本中进行了极致的体积优化与交互升级。

---

## ✨ 核心特性 (V1.1.0)

### 🔍 工业级扫码引擎 (Pro Scanner)
- **无损原生采样**: 锁定相机原生分辨率（1080p+）进行 1:1 采样，彻底解决清晰二维码识别困难的问题。
- **高阶算法集成**: 支持全角度旋转识别 (`tryRotate`)、反色识别 (`tryInverted`) 及高清降噪处理。
- **涟漪交互反馈**: 独创“三色圆点”反馈系统，配合**涟漪扩散动画 (Ripple Effect)**，让每一次扫码成功都有极佳的确定感。
- **独创日期环 (Date Wheel)**: 在扫码界面内嵌高性能环形日期选择器，支持在不停笔的情况下快速切换录入日期。

### ⏳ 极致性能优化
- **全矢量图标架构**: 100% 使用 **SVG 转 Android Vector Drawable**，大幅提升清晰度并缩减包体。
- **极致包体**: 经过 R8/ProGuard 混淆优化与资源精简，正式版 APK 体积压缩至 **1.46 MB**。
- **响应式限速**: 采用 600ms 的智能解码限速，平衡识别灵敏度与设备功耗。

### 💾 原生持久化架构 (Google Room)
- **原生 Room 驱动**: 废弃 Web 桥接插件，直接采用 Android Jetpack Room 框架，实现极高性能的数据检索与存取。
- **64 位极限锁定**: 专为现代 Android 13+ 设备设计，强制锁定 `arm64-v8a` 架构，性能上限提升 30%。
- **全多语言支持**: 深度集成 i18next，支持中英文丝滑切换。

---

## 🚀 技术栈

- **内核引擎**: Google Room (Android Jetpack Persistence)
- **构建工具**: Vite & Capacitor (Native Bridge)
- **UI 方案**: Tailwind CSS & Glassmorphism Design
- **扫码引擎**: `zxing-wasm` (WASM High Precision Mode)
- **图标方案**: Android Vector XML (Source: SVG)
- **目标架构**: Android 13+ (arm64-v8a Only)

---

## 📂 项目结构

```text
├── android/            # Capacitor 原生 Android 项目 (已配置 Room & 64位锁定)
│   └── app/src/main/res # 图标矢量资源目录
├── assets/             # SVG 图标
├── public/
│   └── assets/         # zxing_reader.wasm 等核心引擎资源
├── src/
│   ├── js/             
│   │   ├── index.js    # 应用核心逻辑调度
│   │   ├── scanner.js  # 高清扫码算法、涟漪反馈与会话控制
│   │   ├── storage.js  # Room 原生插件调用封装
│   │   └── locales/    # i18n 语言定义 (ZH/EN)
├── index.html          # 深色模式玻璃拟态 UI
└── package.json        # V1.1.0 依赖与版本定义
```

---

## 🛠️ 构建指南

1. **环境准备**: 确保已安装 Node.js, Android SDK 及 Java 17+。
2. **安装依赖**: `npm install`
3. **Web 构建**: `npm run build`
4. **原生同步**: `npx cap sync`
5. **APK 编译**: 
   - `cd android`
   - `./gradlew assembleRelease` (生成正式版，位于 `app/build/outputs/apk/release/`)

---

## 📜 致谢

衷心感谢以下开源项目提供的强大支持：
- **Google Room** (Jetpack Persistence Library)
- **Capacitor** (Ionic Team)
- **ZXing-WASM** (Scanning Engine)
- **Vite** (Build Tooling)
- **Tailwind CSS** (Styling)

---
*Developed with ❤️ by Caolian.Duan*
