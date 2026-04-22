import { StorageService } from './storage.js';
import { 
    prepareZXingModule, 
    readBarcodes 
} from 'zxing-wasm/reader';

// 初始化 WASM 模块，指向刚才我们复制到 public/assets 的文件
prepareZXingModule({
    locateFile: (path) => {
        // zxing-wasm 在加载时会寻找 zxing_reader.wasm
        return './assets/zxing_reader.wasm';
    }
});

export const QRScanner = {
    isScanning: false,
    currentBatchSet: new Set(),
    stream: null,
    videoTrack: null,
    torchEnabled: false,
    scanInterval: null,
    currentScanDate: null,
    el: {},
    canvas: null,
    ctx: null,
    sessionMap: {}, // 本次扫码会话的内存清单，用于查重隔离

    init(elements) {
        this.el = elements;
        this.bindEvents();
        
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // 监听视口变化以实时调整日期环位置和弹窗大小
        window.addEventListener('resize', () => {
            if (this.isScanning) {
                this.syncModalSize();
                this.renderDateWheel();
            }
        });
    },

    syncModalSize() {
        if (!this.el.main || !this.el.scanModal) return;
        const rect = this.el.main.getBoundingClientRect();
        
        // 使扫码弹窗完美覆盖主内容区
        Object.assign(this.el.scanModal.style, {
            position: 'absolute',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: '0',
            borderRadius: getComputedStyle(this.el.main).borderRadius
        });
    },

    bindEvents() {
        if (this.el.startScanBtn) {
            this.el.startScanBtn.onclick = () => this.startScanner();
        }
        
        const confirmBtn = document.getElementById('confirmScan');
        if (confirmBtn) {
            confirmBtn.onclick = () => this.stopScanner();
        }

        // 闪光灯切换
        const torchBtn = document.getElementById('toggleTorch');
        if (torchBtn) {
            torchBtn.onclick = () => this.toggleTorch();
        }

        // 人员切换
        const personBtn = document.getElementById('togglePersonBtn');
        if (personBtn) {
            personBtn.onclick = () => {
                if (window.cycleResponsiblePerson) {
                    window.cycleResponsiblePerson();
                }
            };
        }

        // 为弹窗主体增加防冒泡处理，确保内部点击不穿透到外层遮罩
        if (this.el.scanModal) {
            this.el.scanModal.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 点击外层容器（即遮罩区域）时执行关闭动作
        if (this.el.scanWrapper) {
            this.el.scanWrapper.addEventListener('click', (e) => {
                // 只有点击到 wrapper 本身（非内部冒泡上来的）才关闭
                this.stopScanner();
            });
        }
    },

    async startScanner() {
        if (this.isScanning) return;

        try {
            // 获取原生 1080p 高清相机流
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false
            });

            this.videoTrack = this.stream.getVideoTracks()[0];
            const video = document.getElementById('video');
            video.srcObject = this.stream;
            
            // 等待视频元数据加载以获取准确宽高
            video.onloadedmetadata = () => {
                video.play();
                
                // 性能平衡点：将解码画布限制在 1080p 级别，防止 4K 等超高分辨率压垮 WASM 内存
                const maxDecodeSize = 1080;
                let vW = video.videoWidth;
                let vH = video.videoHeight;
                
                if (vW > maxDecodeSize || vH > maxDecodeSize) {
                    const scale = maxDecodeSize / Math.max(vW, vH);
                    vW = Math.floor(vW * scale);
                    vH = Math.floor(vH * scale);
                }

                this.canvas.width = vW;
                this.canvas.height = vH;
                
                setTimeout(() => {
                    this.checkCapabilities();
                }, 200);
            };

            // 绑定基础 UI 动作
            const torchBtn = document.getElementById('toggleTorch');
            if (torchBtn) torchBtn.onclick = () => this.toggleTorch();

            // 显示扫码视窗（统一控制内外层显示）
            this.syncModalSize(); // 先同步尺寸再显示
            this.el.scanWrapper.classList.remove('hidden');
            if (this.el.scanModal) this.el.scanModal.classList.remove('hidden');

            this.isScanning = true;
            this.currentBatchSet.clear();
            this.sessionMap = {}; // 重置本次会话的内存清单
            
            // 初始化日期：同步选择器的日期
            if (window.DatePicker && window.DatePicker.selectedDate) {
                this.currentScanDate = new Date(window.DatePicker.selectedDate);
            } else {
                this.currentScanDate = new Date();
            }

            this.updateCount();
            this.updatePersonNameDisplay(); 
            this.renderDateWheel(); // 渲染日期环

            // 启动识别循环
            this.startScanLoop(video);

        } catch (error) {
            console.error('Camera Error:', error);
            alert('无法启动相机：' + error.message);
        }
    },

    checkCapabilities() {
        if (!this.videoTrack) return;
        
        try {
            const capabilities = this.videoTrack.getCapabilities();
            
            // 1. 闪光灯检测
            const torchBtn = document.getElementById('toggleTorch');
            if (capabilities.torch && torchBtn) {
                torchBtn.classList.remove('hidden');
            }


        } catch (e) {
            console.warn('Capabilities detection failed:', e);
        }
    },



    async toggleTorch() {
        if (!this.videoTrack) return;

        try {
            this.torchEnabled = !this.torchEnabled;
            await this.videoTrack.applyConstraints({
                advanced: [{ torch: this.torchEnabled }]
            });
            
            const torchBtn = document.getElementById('toggleTorch');
            if (torchBtn) {
                // 适配主题样式
                torchBtn.style.color = this.torchEnabled ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
                torchBtn.style.backgroundColor = this.torchEnabled ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.2)';
                torchBtn.style.boxShadow = this.torchEnabled 
                    ? '0 0 20px rgba(255, 255, 255, 0.6)' 
                    : '0 0 10px rgba(255, 255, 255, 0.3)';
            }
        } catch (e) {
            console.error('Failed to toggle torch:', e);
        }
    },

    updatePersonNameDisplay() {
        const scanPersonName = document.getElementById('scanPersonName');
        if (scanPersonName) {
            scanPersonName.innerText = window.currentSlot || 'A';
        }
    },

    renderDateWheel() {
        const wheel = document.getElementById('scanDateWheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        
        let baseDate = new Date();
        if (window.DatePicker && window.DatePicker.selectedDate) {
            baseDate = new Date(window.DatePicker.selectedDate);
        }

        const rect = wheel.getBoundingClientRect();
        const containerW = rect.width || wheel.clientWidth || 360;
        const containerH = rect.height || wheel.clientHeight || 600;
        
        const radiusX = containerW * 0.40;
        const radiusY = containerH * 0.35;

        // 生成 12 个日期按钮（选中日期 + 前 11 天）
        for (let i = 0; i < 12; i++) {
            const offset = i - 11; 
            const d = new Date(baseDate);
            d.setDate(d.getDate() + offset);
            
            const isSelected = this.currentScanDate && 
                d.toLocaleDateString() === this.currentScanDate.toLocaleDateString();

            // 顺时针排布：偏移 0 (i=11) 固定在 12 点钟位置
            const angle = ((i - 11) * (2 * Math.PI / 12)) - Math.PI / 2;
            const x = Math.cos(angle) * radiusX;
            const y = Math.sin(angle) * radiusY;

            const btn = document.createElement('button');
            const dayNum = d.getDate();
            
            // 基础样式：去填充，保留边框和磨砂感
            btn.className = `absolute pointer-events-auto rounded-full flex items-center justify-center font-bold transition-all w-9 h-9 text-xs z-40 border bg-white/5 backdrop-blur-sm`;
            
            // 判断是否跨月（相对于基础日期）
            const isLastMonth = d.getMonth() !== baseDate.getMonth();

            if (isSelected) {
                if (isLastMonth) {
                    // 跨月选中：黄色
                    btn.classList.add('border-yellow-500', 'text-yellow-500', 'shadow-[0_0_15px_rgba(245,158,11,0.5)]');
                } else {
                    // 本月选中：蓝色
                    btn.classList.add('border-blue-500', 'text-blue-400', 'shadow-[0_0_15px_rgba(59,130,246,0.5)]');
                }
            } else {
                // 普通状态：淡色边框，文字根据月份变色
                btn.classList.add('border-white/20');
                if (isLastMonth) {
                    btn.classList.add('text-yellow-500');
                } else {
                    btn.classList.add('text-blue-400');
                }
            }
            
            btn.innerText = dayNum;
            btn.style.left = `calc(50% + ${x}px)`;
            btn.style.top = `calc(50% + ${y}px)`;
            btn.style.transform = 'translate(-50%, -50%)';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.currentScanDate = new Date(d);
                this.renderDateWheel();
            };

            wheel.appendChild(btn);
        }
    },

    async startScanLoop(video) {
        let lastScanTime = -600; // 设置为负值，确保第一次扫码能立即触发
        
        const loop = async (time) => {
            if (!this.isScanning) return;

            // 限制扫描频率（按照反馈调整为 600ms）
            if (time - lastScanTime > 600) { 
                lastScanTime = time;
                
                try {
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        const vW = video.videoWidth;
                        const vH = video.videoHeight;
                        
                        // 核心：中心裁剪 (ROI) 区域逻辑
                        // 提取中心 100% 的区域进行解码，实现全屏无死角识别
                        const roiSize = 1.0; 
                        const sx = vW * (1 - roiSize) / 2;
                        const sy = vH * (1 - roiSize) / 2;
                        const sw = vW * roiSize;
                        const sh = vH * roiSize;

                        // 将裁剪区域绘制并充满用于解码的 Canvas
                        this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
                        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                        
                        // 执行解码
                        const results = await readBarcodes(imageData, {
                            formats: ['QRCode'],
                            tryHarder: true,    // 深度分析模式
                            tryRotate: true,     // 支持旋转识别
                            tryInverted: true,   // 支持反色识别
                            tryDownscale: true,  // 支持高分辨率降采样优化
                            maxNumberOfSymbols: 1
                        });
                        
                        if (results && results.length > 0) {
                            for (const result of results) {
                                const text = result.text;
                                if (text && text.trim().length >= 2) {
                                    // 坐标还原：将 ROI 内部坐标映射回原始视频坐标
                                    const p = result.position;
                                    const mapX = (x) => sx + (x / this.canvas.width) * sw;
                                    const mapY = (y) => sy + (y / this.canvas.height) * sh;

                                    const centerX = (mapX(p.topLeft.x) + mapX(p.topRight.x) + mapX(p.bottomLeft.x) + mapX(p.bottomRight.x)) / 4;
                                    const centerY = (mapY(p.topLeft.y) + mapY(p.topRight.y) + mapY(p.bottomLeft.y) + mapY(p.bottomRight.y)) / 4;

                                    this.handleScannedText(text, { x: centerX, y: centerY });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Decode Error:', err);
                }
            }

            if (this.isScanning) {
                this.scanInterval = requestAnimationFrame(loop);
            }
        };

        this.scanInterval = requestAnimationFrame(loop);
    },

    handleScannedText(text, position) {
        if (!this.el.dataInput) return;

        const barcode = text.trim();
        const currentVal = this.el.dataInput.value;
        const name = (window.selectedNames && window.selectedNames.length > 0) ? window.selectedNames[0] : '';
        const personSuffix = name ? ` [${name}]` : '';
        const dateStr = window.DatePicker ? window.DatePicker.formatDate(this.currentScanDate || new Date()) : '';
        const dateSuffix = dateStr ? ` [${dateStr}]` : '';
        
        const newEntry = `${text}${dateSuffix}${personSuffix}`.trim();

        let status = 'new';
        const sessionRecord = this.sessionMap[barcode];

        if (!sessionRecord) {
            // 1. 本次会话全新的条码：直接追加
            const newVal = currentVal ? (currentVal.endsWith('\n') ? currentVal + newEntry : currentVal + '\n' + newEntry) : newEntry;
            this.el.dataInput.value = newVal;
            this.sessionMap[barcode] = newEntry; // 存入内存
            this.currentBatchSet.add(barcode);
            status = 'new';
        } else if (sessionRecord === newEntry) {
            // 2. 本次会话已扫描且内容完全一致：彻底重复
            status = 'duplicate';
        } else {
            // 3. 本次会话已扫描但信息（人名/日期）变了：执行更新
            const lines = currentVal.split('\n');
            let found = false;
            // 从后往前找，优先更新本次会话刚才添加的那一行
            for (let i = lines.length - 1; i >= 0; i--) {
                const lineBarcode = lines[i].split(' [')[0].trim();
                if (lineBarcode === barcode) {
                    lines[i] = newEntry;
                    found = true;
                    break;
                }
            }
            if (found) {
                this.el.dataInput.value = lines.join('\n');
            } else {
                // 如果在输入框没找到（可能被用户删了），则视为新条码重新添加
                const newVal = currentVal ? (currentVal.endsWith('\n') ? currentVal + newEntry : currentVal + '\n' + newEntry) : newEntry;
                this.el.dataInput.value = newVal;
            }
            this.sessionMap[barcode] = newEntry;
            status = 'replacement';
        }

        this.el.dataInput.dispatchEvent(new Event('input'));
        this.updateCount();

        if (position) {
            this.showVisualFeedback(position, status);
        }
    },

    showVisualFeedback(videoPoint, status = 'new') {
        const overlay = document.getElementById('scanOverlay');
        if (!overlay) return;

        const video = document.getElementById('video');
        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        const domW = video.offsetWidth;
        const domH = video.offsetHeight;

        if (!videoW || !videoH || !domW || !domH) return;

        // 计算 object-cover 映射逻辑
        const scale = Math.max(domW / videoW, domH / videoH);
        const renderW = videoW * scale;
        const renderH = videoH * scale;
        const offsetX = (domW - renderW) / 2;
        const offsetY = (domH - renderH) / 2;

        const domX = offsetX + videoPoint.x * scale;
        const domY = offsetY + videoPoint.y * scale;

        // 颜色方案：更深邃、更专业的色彩
        let bgClass = 'bg-emerald-500';
        let shadowColor = 'rgba(16, 185, 129, 0.6)';
        
        if (status === 'duplicate') {
            bgClass = 'bg-rose-500';
            shadowColor = 'rgba(244, 63, 94, 0.6)';
        } else if (status === 'replacement') {
            bgClass = 'bg-amber-500';
            shadowColor = 'rgba(245, 158, 11, 0.6)';
        }

        // 创建主圆点
        const dot = document.createElement('div');
        dot.className = `absolute ${bgClass} rounded-full border-2 border-white pointer-events-none z-50 transition-all duration-400 ease-out`;
        dot.style.boxShadow = `0 0 25px ${shadowColor}`;
        dot.style.width = '20px';
        dot.style.height = '20px';
        dot.style.left = `${domX}px`;
        dot.style.top = `${domY}px`;
        dot.style.transform = 'translate(-50%, -50%) scale(0)';
        dot.style.opacity = '0';

        // 创建涟漪效果 (Ripple)
        const ripple = document.createElement('div');
        ripple.className = `absolute ${bgClass} rounded-full pointer-events-none z-40 transition-all duration-500 ease-out`;
        ripple.style.width = '20px';
        ripple.style.height = '20px';
        ripple.style.left = `${domX}px`;
        ripple.style.top = `${domY}px`;
        ripple.style.transform = 'translate(-50%, -50%) scale(0)';
        ripple.style.opacity = '0.6';
        
        overlay.appendChild(dot);
        overlay.appendChild(ripple);

        // 触发动画
        requestAnimationFrame(() => {
            // 主圆点弹出
            dot.style.transform = 'translate(-50%, -50%) scale(1)';
            dot.style.opacity = '1';
            
            // 涟漪扩散
            ripple.style.transform = 'translate(-50%, -50%) scale(3)';
            ripple.style.opacity = '0';
        });

        // 400ms 生命周期后淡出移除
        setTimeout(() => {
            dot.style.transform = 'translate(-50%, -50%) scale(1.5)';
            dot.style.opacity = '0';
            setTimeout(() => {
                dot.remove();
                ripple.remove();
            }, 200);
        }, 400);
    },

    updateCount() {
        const countSpan = document.getElementById('scanCount');
        if (countSpan) {
            countSpan.innerText = this.currentBatchSet.size;
        }
    },

    stopScanner() {
        this.isScanning = false;
        // 隐藏扫码视窗
        this.el.scanWrapper.classList.add('hidden');
        
        if (this.scanInterval) {
            cancelAnimationFrame(this.scanInterval);
            this.scanInterval = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.videoTrack = null;
        }

        this.torchEnabled = false;
        const torchBtn = document.getElementById('toggleTorch');
        if (torchBtn) {
            torchBtn.classList.add('hidden');
            torchBtn.style.color = ''; // 重置颜色
            torchBtn.style.backgroundColor = '';
        }

        // 停止视频流
        const video = document.getElementById('video');
        if (video) {
            video.srcObject = null;
        }
    }
};

window.QRScanner = QRScanner;


