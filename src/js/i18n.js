/**
 * i18n.js - 轻量级国际化管理核心
 */
import zh from './locales/zh.js';
import en from './locales/en.js';

const translations = { zh, en };

class I18nManager {
    constructor() {
        this.lang = 'zh'; // Default
    }

    async init() {
        // 1. 检查本地存储 (如果用户手动设置了的话)
        const saved = localStorage.getItem('app_lang');
        if (saved) {
            this.lang = saved;
        } else {
            this.lang = 'zh'; // 默认中文，不再自动跟随系统
        }
        
        this.updateUI();
    }

    setLanguage(lang) {
        if (!translations[lang]) return;
        this.lang = lang;
        localStorage.setItem('app_lang', lang);
        this.updateUI();
    }

    t(key, params = {}) {
        let text = translations[this.lang][key] || translations['en'][key] || key;
        
        Object.keys(params).forEach(p => {
            text = text.replace(`{{${p}}}`, params[p]);
        });
        
        return text;
    }

    updateUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const type = el.getAttribute('data-i18n-type') || 'text';
            
            const translated = this.t(key);
            
            if (type === 'text') {
                el.innerText = translated;
            } else if (type === 'placeholder') {
                el.placeholder = translated;
            } else if (type === 'title') {
                el.title = translated;
            }
        });
        
        if (document.documentElement) {
            document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
        }
    }
}

export const i18n = new I18nManager();
window.i18n = i18n;
