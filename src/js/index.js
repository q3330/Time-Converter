import { StorageService } from './storage.js';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { i18n } from './i18n.js';

window.userSlots = { 
    A: { name: "用户A", enabled: true }, 
    B: { name: "用户B", enabled: true }
};
window.currentSlot = 'A';
window.selectedNames = [];
let allData = [];
let selectedIds = new Set();
let currentPage = 1;
const pageSize = 5000;
let isLoading = false;
let hasMore = true;

const el = {
    // 视图切换
    views: document.querySelectorAll('.view-content'),
    main: document.querySelector('main'),
    navItems: document.querySelectorAll('.nav-item'),

    // 提交页
    dataInput: document.getElementById('dataInput'),
    dataCount: document.getElementById('dataCount'),
    dateText: document.getElementById('dateText'),
    dateValue: document.getElementById('dateValue'),
    dateGrid: document.getElementById('dateGrid'),
    todayBtn: document.getElementById('todayBtn'),
    prevMonth: document.getElementById('prevMonth'),
    nextMonth: document.getElementById('nextMonth'),
    ymText: document.getElementById('ymText'),
    weekNumber: document.getElementById('weekNumber'),
    datePicker: document.getElementById('datePicker'),
    dateModal: document.getElementById('dateModal'),
    dateMask: document.getElementById('dateMask'),

    namePicker: document.getElementById('namePicker'),
    nameText: document.getElementById('nameText'),
    nameModal: document.getElementById('nameModal'),
    nameMask: document.getElementById('nameMask'),
    nameItems: [], // 动态生成

    dataForm: document.getElementById('dataForm'),

    startScanBtn: document.getElementById('startScanBtn'),
    scanModal: document.getElementById('scanModal'),
    scanWrapper: document.getElementById('scanWrapper'),

    // 查询页
    tableBody: document.getElementById('tableBody'),
    headerSelectCell: document.getElementById('headerSelectCell'),
    headerCountInfo: document.getElementById('headerCountInfo'),
    btnDelete: document.getElementById('btnDelete'),
    btnExport: document.getElementById('btnExport'),

    confirmModal: document.getElementById('confirmModal'),
    btnCancelDel: document.getElementById('btnCancelDel'),
    btnConfirmDel: document.getElementById('btnConfirmDel'),
    delCount: document.getElementById('delCount'),
    addUserBtn: document.getElementById('addUserBtn'),
    
    // 关于弹窗
    appTitleBtn: document.getElementById('appTitleBtn'),
    configModal: document.getElementById('configModal'),
    configMask: document.getElementById('configMask'),
    langSwitchBtn: document.getElementById('langSwitchBtn')
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('[App] Starting initialization...');
        
        // 初始化国际化
        await i18n.init();
        
        // 初始化数据库连接
        await StorageService.init();

        App.addListener('pause', async () => {
            await StorageService.close();
        });

        App.addListener('resume', async () => {
            await StorageService.init();
        });

        const today = new Date().toISOString().split('T')[0];
        if (el.dateValue) el.dateValue.value = today;
        if (el.dateText) el.dateText.innerText = today;

        let savedSlots = await StorageService.getPreference('user_slots');
        if (savedSlots) {
            for (let key in savedSlots) {
                if (typeof savedSlots[key] === 'string') {
                    savedSlots[key] = { name: savedSlots[key], enabled: true };
                }
            }
            window.userSlots = savedSlots;
        }

    let savedSlot = await StorageService.getPreference('last_responsible_slot');
    if (savedSlot && Object.keys(window.userSlots).includes(savedSlot)) {
        window.currentSlot = savedSlot;
    }

        renderUserGrid();
        renderNameTags();

        // 并行初始化独立组件
        if (window.ICON_PROVIDER) window.ICON_PROVIDER.init();
        if (window.DatePicker) window.DatePicker.init(el);
        if (window.QRScanner) window.QRScanner.init(el);

        initRealTimeCount();
        bindEvents();

        // 恢复上一次路由或默认页面
        const lastPage = await StorageService.getPreference('last_page') || 'view-submit';
        switchView(lastPage, false);

        // 加载首屏数据
        await fetchData(true, true);
        await updateTotalCount();

        const tableContainer = document.getElementById('tableScrollContainer');
        if (tableContainer) {
            tableContainer.addEventListener('scroll', async () => {
                if (tableContainer.scrollTop + tableContainer.clientHeight >= tableContainer.scrollHeight - 50) {
                    await fetchData(false, false);
                }
            });
        }
            
        console.log('[App] Initialization complete.');
        } catch (error) {
            console.error('[App] Fatal initialization error during startup:', error);
        } finally {
            // 无论初始化结果如何，强制在 500ms 后隐藏闪屏（给渲染留一点时间）
            setTimeout(async () => {
                try {
                    await SplashScreen.hide();
                    document.body.style.opacity = '1';
                    console.log('[App] Splash screen hidden.');
                } catch (e) {
                    console.warn('[App] SplashScreen hide failed (likely already hidden):', e);
                }
            }, 500);
        }
    });

    // 绑定各组件事件
    bindEvents();

async function updateTotalCount() {
    const elCount = document.getElementById('header-total-count');
    if (!elCount) return;
    
    try {
        const data = await StorageService.getRecords(1, 1);
        if (data && data.status === 'success' && data.pagination) {
            const total = data.pagination.total || 0;
            // 使用 i18n
            elCount.innerText = i18n.t('query.total', { total });
        } else {
            elCount.innerText = i18n.t('query.total', { total: 0 });
        }
    } catch (err) {
        console.error('[Header] Update Count Error:', err);
        elCount.innerText = i18n.t('query.total', { total: 0 });
    }
}

async function switchView(targetId, save = true) {
    el.views.forEach(v => {
        v.classList.toggle('hidden', v.id !== targetId);
    });
    el.navItems.forEach(item => {
        item.classList.toggle('active-nav', item.dataset.target === targetId);
    });

    if (targetId === 'view-query') {
        await fetchData(false, true);
    }

    if (save) {
        await StorageService.setPreference('last_page', targetId);
    }
}

async function fetchData(silent = false, reset = false) {
    if (isLoading) return;
    if (!reset && !hasMore) return;

    if (reset) {
        currentPage = 1;
        allData = [];
        selectedIds.clear();
        hasMore = true;
    }

    isLoading = true;
    if (!silent && reset) {
        el.tableBody.innerHTML = `<tr><td colspan="7" class="p-12 text-center theme-text-dim"><span data-icon="spinner" data-icon-class="spin text-3xl mb-3 text-blue-500"></span><br>${i18n.t('query.loading')}</td></tr>`;
        if (window.ICON_PROVIDER) window.ICON_PROVIDER.init();
    }

    try {
        const result = await StorageService.getRecords(currentPage, pageSize, 'created_at', 'DESC');
        if (result.status === 'success') {
            const list = result.data;
            if (list.length < pageSize) {
                hasMore = false;
            }
            allData = reset ? list : [...allData, ...list];
            renderTable();
            updateToolbar();
            currentPage++;
        }
    } catch (err) {
        console.error('Fetch error:', err);
        if (reset) el.tableBody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-red-400">${i18n.t('query.load_error')}</td></tr>`;
    } finally {
        isLoading = false;
        if (window.ICON_PROVIDER) window.ICON_PROVIDER.init();
    }
}

function renderTable() {
    if (allData.length === 0) {
        el.tableBody.innerHTML = `<tr><td colspan="5" class="p-12 text-center theme-text-dim">${i18n.t('query.no_data')}</td></tr>`;
        return;
    }

    el.tableBody.innerHTML = allData.map((row, index) => {
        const isSelected = selectedIds.has(row.id);
        return `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${isSelected ? 'bg-blue-500/10' : ''}">
            <td class="px-4 py-3 text-center cursor-pointer select-none group row-index-cell" data-id="${row.id}">
                <span class="theme-badge ${isSelected ? 'theme-badge-selected' : ''} inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono transition-all">
                    ${index + 1}
                </span>
            </td>
            <td class="px-4 py-3 font-medium theme-text-dim">${row.code}</td>
            <td class="px-4 py-3 theme-text-dim">${row.submit_date}</td>
            <td class="px-4 py-3">
                <span class="theme-badge inline-flex items-center px-2 py-0.5 rounded text-xs font-medium">${row.responsible_person}</span>
            </td>
            <td class="px-4 py-3 font-mono text-blue-400">${row.time_val}</td>
        </tr>
        `;
    }).join('');

    document.querySelectorAll('.row-index-cell').forEach(cell => {
        cell.onclick = () => toggleRowSelection(cell);
    });
}

function toggleRowSelection(cell) {
    const id = parseInt(cell.dataset.id);
    const isNowSelected = !selectedIds.has(id);
    isNowSelected ? selectedIds.add(id) : selectedIds.delete(id);

    const row = cell.closest('tr');
    if (row) {
        row.classList.toggle('bg-blue-500/10', isNowSelected);
        const badge = cell.querySelector('.theme-badge');
        if (badge) badge.classList.toggle('theme-badge-selected', isNowSelected);
    }
    updateToolbar();
}

function updateToolbar() {
    if (el.headerCountInfo) {
        el.headerCountInfo.innerText = `${selectedIds.size}/${allData.length}`;
    }
    el.btnDelete.disabled = selectedIds.size === 0;
    
    // 更新删除按钮文字
    const delBtnSpan = el.btnDelete.querySelector('[data-i18n]');
    if (delBtnSpan) {
        delBtnSpan.innerText = i18n.t('query.delete_btn', { count: selectedIds.size });
    }
}

function timeToMinuteSecond(timeStr) {
    const parts = timeStr.split(':').map(Number);
    const h = isNaN(parts[0]) ? 0 : parts[0];
    const m = isNaN(parts[1]) ? 0 : parts[1];
    const s = isNaN(parts[2]) ? 0 : parts[2];
    return `${h * 60 + m}.${String(s).padStart(2, '0')}`;
}

function parseSingleData(line) {
    if (!line) return null;
    line = line.trim().replace(/：/g, ':');

    let specificPerson = null;
    let specificDate = null;

    let foundTag = true;
    while (foundTag) {
        foundTag = false;
        const dateMatch = line.match(/\s*\[(\d{4}-\d{2}-\d{2})\]$/);
        if (dateMatch) {
            specificDate = dateMatch[1];
            line = line.slice(0, dateMatch.index).trim();
            foundTag = true;
            continue;
        }
        const personMatch = line.match(/\s*\[([^\]]+)\]$/);
        if (personMatch) {
            specificPerson = personMatch[1];
            line = line.slice(0, personMatch.index).trim();
            foundTag = true;
            continue;
        }
    }

    // 仅允许 + 作为分隔符，因为部分编码中含有空格
    const match = line.match(/\+/);
    if (!match) return null;
    const code = line.slice(0, match.index).trim();
    const timeStr = line.slice(match.index + 1).trim();
    if (!code || !timeStr || timeStr.split(':').length !== 3) return null;
    return { code, convertTime: timeToMinuteSecond(timeStr), specificPerson, specificDate };
}

function initRealTimeCount() {
    const calc = () => {
        const raw = el.dataInput.value.trim();
        const valid = raw ? raw.split(/\n/).map(parseSingleData).filter(Boolean) : [];
        el.dataCount.innerText = valid.length;
    };
    el.dataInput.oninput = calc;
}

function renderUserGrid() {
    const SLOT_KEYS = Object.keys(window.userSlots).sort();
    const uHtml = SLOT_KEYS.map(slot => {
        const item = window.userSlots[slot];
        const isSelected = window.currentSlot === slot;
        const isEnabled = item.enabled !== false;
        
        return `
            <div class="p-3 rounded-xl border border-white/10 flex items-center justify-between theme-card-hover transition-all name-item ${isSelected ? 'name-picker-active' : ''} ${!isEnabled ? 'opacity-50' : ''}" data-slot="${slot}">
                <div class="flex-1 select-area flex items-center gap-2 h-full cursor-pointer">
                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 min-w-[1.4rem] h-5 rounded theme-badge font-bold font-mono text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-white/5 theme-text-muted'} transition-all">${slot}</span>
                    <input type="text" 
                        class="bg-transparent border-none outline-none font-medium text-sm w-full p-0 pointer-events-none slot-input ${isSelected ? 'text-white' : 'theme-text-main'}" 
                        value="${item.name}" 
                        readonly
                        maxlength="10">
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="edit-slot-btn text-blue-400 hover:text-blue-300 text-xs font-bold px-2 py-1" data-slot="${slot}">
                        ${i18n.t('app.edit')}
                    </button>
                    <button type="button" class="toggle-slot-btn p-1 transition-colors ${isEnabled ? 'text-blue-400' : 'text-slate-500'}" data-slot="${slot}">
                        <span data-icon="${isEnabled ? 'toggle-on' : 'toggle-off'}" class="w-6 h-6 inline-block align-middle fill-none stroke-current"></span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('userGrid').innerHTML = uHtml;
    if (window.ICON_PROVIDER) window.ICON_PROVIDER.init();

    document.querySelectorAll('.select-area').forEach(div => {
        div.onclick = async () => {
            const input = div.querySelector('.slot-input');
            if (input && !input.readOnly) return;
            const slot = div.parentElement.dataset.slot;
            if (window.userSlots[slot].enabled === false) return;
            await selectSlot(slot);
            closeModal(el.nameModal, el.nameMask);
        };
    });

    document.querySelectorAll('.edit-slot-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const slot = btn.dataset.slot;
            const container = btn.closest('.name-item');
            const input = container.querySelector('.slot-input');
            input.readOnly = false;
            container.classList.add('bg-blue-500/10', 'border-blue-500/30');
            input.style.pointerEvents = 'auto';
            input.select(); // 自动选中文字方便修改
            input.onclick = (ev) => ev.stopPropagation();
            input.onblur = async () => {
                input.readOnly = true;
                container.classList.remove('bg-blue-500/10', 'border-blue-500/30');
                input.style.pointerEvents = 'none';
                const newName = input.value.trim();
                if (!newName) {
                    delete window.userSlots[slot];
                    await StorageService.setPreference('user_slots', window.userSlots);
                    if (window.currentSlot === slot) await window.cycleResponsiblePerson();
                    renderUserGrid();
                } else {
                    window.userSlots[slot].name = newName;
                    await StorageService.setPreference('user_slots', window.userSlots);
                    if (window.currentSlot === slot) {
                        renderNameTags();
                        if (window.QRScanner) window.QRScanner.updatePersonNameDisplay();
                    }
                }
            };
            input.onkeydown = (ev) => { if (ev.key === 'Enter') input.blur(); };
        };
    });

    document.querySelectorAll('.toggle-slot-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const slot = btn.dataset.slot;
            window.userSlots[slot].enabled = !window.userSlots[slot].enabled;
            await StorageService.setPreference('user_slots', window.userSlots);
            renderUserGrid();
            if (window.currentSlot === slot && !window.userSlots[slot].enabled) await window.cycleResponsiblePerson();
        };
    });
}

async function selectSlot(slot) {
    window.currentSlot = slot;
    await StorageService.setPreference('last_responsible_slot', slot);
    renderUserGrid();
    renderNameTags();
}

window.cycleResponsiblePerson = async () => {
    const SLOT_KEYS = Object.keys(window.userSlots).sort();
    if (SLOT_KEYS.length === 0) return;
    const idx = SLOT_KEYS.indexOf(window.currentSlot);
    for (let i = 1; i <= SLOT_KEYS.length; i++) {
        const nextIdx = (idx + i) % SLOT_KEYS.length;
        const nextSlot = SLOT_KEYS[nextIdx];
        if (window.userSlots[nextSlot].enabled !== false) {
            await selectSlot(nextSlot);
            if (window.QRScanner) window.QRScanner.updatePersonNameDisplay();
            return;
        }
    }
};

function renderNameTags() {
    const item = window.userSlots[window.currentSlot];
    // 去除槽位前缀（如 A:），直接显示用户名
    const displayText = window.currentSlot ? (item.name || i18n.t('user.empty')) : i18n.t('user.empty');
    el.nameText.innerText = `${i18n.t('user.selected')}${displayText}`;
    el.nameText.classList.remove('theme-text-main');
    el.nameText.classList.add('text-blue-400');
    window.selectedNames = [item.name || ''];
}

function openModal(modal, mask) { modal.classList.remove('hidden'); mask.classList.add('show'); }
function closeModal(modal, mask) { modal.classList.add('hidden'); mask.classList.remove('show'); }

function bindEvents() {
    App.addListener('backButton', () => {
        if (window.QRScanner && window.QRScanner.isScanning) { window.QRScanner.stopScanner(); return; }
        if (!el.dateModal.classList.contains('hidden')) { closeModal(el.dateModal, el.dateMask); return; }
        if (!el.nameModal.classList.contains('hidden')) { closeModal(el.nameModal, el.nameMask); return; }
        if (!el.confirmModal.classList.contains('hidden')) { el.confirmModal.classList.add('hidden'); return; }
        if (!el.configModal.classList.contains('hidden')) { 
            el.configModal.classList.add('hidden'); 
            el.configMask.classList.remove('show');
            return; 
        }
        App.exitApp();
    });

    el.navItems.forEach(btn => {
        btn.onclick = () => switchView(btn.dataset.target);
    });

    el.namePicker.onclick = () => openModal(el.nameModal, el.nameMask);
    el.nameMask.onclick = () => closeModal(el.nameModal, el.nameMask);
    el.addUserBtn.onclick = async () => {
        const currentKeys = Object.keys(window.userSlots);
        let nextSlot = '';
        for (let i = 65; i <= 90; i++) {
            const char = String.fromCharCode(i);
            if (!currentKeys.includes(char)) { nextSlot = char; break; }
        }
        if (!nextSlot) return;
        window.userSlots[nextSlot] = { name: `用户${nextSlot}`, enabled: true };
        await StorageService.setPreference('user_slots', window.userSlots);
        renderUserGrid();
        setTimeout(() => {
            const lastItem = document.querySelector(`.name-item[data-slot="${nextSlot}"]`);
            if (lastItem) {
                const editBtn = lastItem.querySelector('.edit-slot-btn');
                if (editBtn) editBtn.click();
            }
        }, 120);
    };

    el.dataForm.onsubmit = async (e) => {
        e.preventDefault();
        const raw = el.dataInput.value.trim();
        const submitDate = el.dateValue.value;
        const responsiblePerson = window.selectedNames.join(',');
        if (!raw) return;
        const list = raw.split(/\n/).map(parseSingleData).filter(Boolean);
        if (list.length === 0) return;
        const btn = el.dataForm.querySelector('button[type="submit"]');
        const oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `${window.ICON_PROVIDER ? window.ICON_PROVIDER.render('spinner', 'spin mr-2') : ''}...`;
        try {
            const final = list.map(item => {
                const finalObj = {
                    ...item,
                    submitDate: item.specificDate || submitDate,
                    responsiblePerson: item.specificPerson || responsiblePerson
                };
                delete finalObj.specificPerson; delete finalObj.specificDate;
                return finalObj;
            });
            const result = await StorageService.submitData(final);
            if (result.status === 'success') {
                el.dataInput.value = '';
                el.dataCount.innerText = 0;
                await fetchData(false, true);
                await updateTotalCount();
            }
        } catch (err) { alert('Error: ' + err.message); } finally { btn.disabled = false; btn.innerHTML = oldText; }
    };

    el.headerSelectCell.onclick = () => {
        if (selectedIds.size > 0) selectedIds.clear();
        else allData.forEach(r => selectedIds.add(r.id));
        updateToolbar(); renderTable();
    };

    el.btnExport.onclick = async () => {
        if (allData.length === 0) return alert(i18n.t('toast.no_data'));
        const rows = selectedIds.size > 0 ? allData.filter(d => selectedIds.has(d.id)) : allData;
        const content = "\ufeff" + [
            [i18n.t('query.table.code'), i18n.t('query.table.date'), i18n.t('query.table.person'), i18n.t('query.table.time')].join(','),
            ...rows.map(r => [`"${r.code}"`, r.submit_date, `"${r.responsible_person}"`, r.time_val].join(','))
        ].join('\n');
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        const fileName = `Records_${stamp}.csv`;
        try {
            const writeResult = await Filesystem.writeFile({ path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
            await Share.share({ title: 'Export', text: `TimeConverter Data (${rows.length} rows)`, url: writeResult.uri, dialogTitle: 'Share' });
        } catch (error) { if (!error.message.includes('canceled')) alert('Error: ' + error.message); }
    };

    el.btnDelete.onclick = () => { 
        el.delCount.innerText = selectedIds.size;
        // 使用 i18n 更新弹窗文字
        document.getElementById('confirmModal').querySelector('p').innerText = i18n.t('modal.delete.desc', { count: selectedIds.size });
        el.confirmModal.classList.remove('hidden'); 
    };
    el.btnCancelDel.onclick = () => el.confirmModal.classList.add('hidden');
    el.btnConfirmDel.onclick = async () => {
        try {
            const result = await StorageService.deleteRecords([...selectedIds]);
            if (result.status === 'success') {
                el.confirmModal.classList.add('hidden');
                selectedIds.clear();
                await fetchData(false, true);
                await updateTotalCount();
            }
        } catch (err) { console.error(err); }
    };

    if (el.confirmModal) {
        el.confirmModal.onclick = (e) => {
            if (e.target === el.confirmModal) {
                el.confirmModal.classList.add('hidden');
            }
        };
    }

    // 关于弹窗
    if (el.appTitleBtn) {
        el.appTitleBtn.onclick = (e) => {
            e.stopPropagation();
            el.configModal.classList.remove('hidden');
            el.configMask.classList.add('show');
        };
    }
    
    if (el.configModal) {
        el.configModal.onclick = (e) => {
            e.stopPropagation();
        };
    }

    if (el.configMask) {
        el.configMask.onclick = () => {
            el.configModal.classList.add('hidden');
            el.configMask.classList.remove('show');
        };
    }

    // 语言切换
    if (el.langSwitchBtn) {
        el.langSwitchBtn.onclick = (e) => {
            e.stopPropagation();
            const newLang = i18n.lang === 'zh' ? 'en' : 'zh';
            i18n.setLanguage(newLang);
            updateTotalCount();
            renderNameTags();
            updateToolbar();
            if (window.DatePicker) window.DatePicker.render();
            if (window.QRScanner) window.QRScanner.updatePersonNameDisplay();
        };
    }
}