/**
 * datepicker.js - 日期选择器模块
 */
import { i18n } from './i18n.js';

const DatePicker = {
    el: {},
    now: new Date(),
    currentYear: null,
    currentMonth: null,
    selectedDate: null,

    init(elements) {
        this.el = elements;
        this.now = new Date();
        this.currentYear = this.now.getFullYear();
        this.currentMonth = this.now.getMonth();
        this.selectedDate = new Date(this.now);

        const initDateStr = this.formatDate(this.selectedDate);
        this.el.dateText.innerText = initDateStr;
        this.el.dateValue.value = initDateStr;

        this.render(this.currentYear, this.currentMonth);
        this.bindEvents();
    },

    bindEvents() {
        this.el.todayBtn.onclick = () => this.jumpToToday();
        this.el.datePicker.onclick = () => this.openModal();
        this.el.dateMask.onclick = () => this.closeModal();

        this.el.prevMonth.onclick = (e) => {
            e.stopPropagation();
            this.currentMonth--;
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
            }
            this.render(this.currentYear, this.currentMonth);
        };

        this.el.nextMonth.onclick = (e) => {
            e.stopPropagation();
            this.currentMonth++;
            if (this.currentMonth > 11) {
                this.currentMonth = 0;
                this.currentYear++;
            }
            this.render(this.currentYear, this.currentMonth);
        };
    },

    confirmSelection() {
        const dateStr = this.formatDate(this.selectedDate);
        this.el.dateText.innerText = dateStr;
        this.el.dateValue.value = dateStr;
        this.closeModal();
    },

    formatDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    openModal() {
        this.el.dateModal.classList.remove('hidden');
        this.el.dateMask.classList.add('show');
    },

    closeModal() {
        this.el.dateModal.classList.add('hidden');
        this.el.dateMask.classList.remove('show');
    },

    jumpToToday() {
        this.selectedDate = new Date(this.now);
        this.currentYear = this.now.getFullYear();
        this.currentMonth = this.now.getMonth();
        this.render(this.currentYear, this.currentMonth);
        this.confirmSelection();
    },

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },

    render(year = this.currentYear, month = this.currentMonth) {
        if (year === null) year = this.currentYear;
        if (month === null) month = this.currentMonth;

        this.el.dateGrid.innerHTML = '';
        // 国际化支持
        this.el.ymText.innerText = i18n.t('date.ym', { year, month: month + 1 });

        const weekNum = this.getWeekNumber(this.selectedDate);
        this.el.weekNumber.innerText = i18n.t('date.week', { num: weekNum });

        const firstDay = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const lastDayOfPrev = new Date(year, month, 0).getDate();

        // 上月日期
        for (let i = 0; i < firstDay; i++) {
            const prevDate = lastDayOfPrev - firstDay + 1 + i;
            const div = document.createElement('div');
            const isWeekend = (i === 0 || i === 6);
            div.className = `h-10 flex items-center justify-center theme-text-dim text-sm cursor-pointer rounded-full hover:bg-white/10 ${isWeekend ? 'bg-emerald-500/10' : ''}`;
            div.innerText = prevDate;
            div.onclick = (e) => {
                e.stopPropagation();
                let prevMonth = month - 1;
                let prevYear = year;
                if (prevMonth < 0) {
                    prevMonth = 11;
                    prevYear--;
                }
                this.currentMonth = prevMonth;
                this.currentYear = prevYear;
                this.selectedDate = new Date(prevYear, prevMonth, prevDate);
                this.render(prevYear, prevMonth);
                this.confirmSelection();
            };
            this.el.dateGrid.appendChild(div);
        }

        // 当月日期
        for (let i = 1; i <= lastDay; i++) {
            const div = document.createElement('div');
            const isToday = i === this.now.getDate() && year === this.now.getFullYear() && month === this.now.getMonth();
            const isSelected = i === this.selectedDate.getDate() && year === this.selectedDate.getFullYear() && month === this.selectedDate.getMonth();
            const dayOfWeek = (firstDay + i - 1) % 7;
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

            div.className = `h-10 flex items-center justify-center text-sm cursor-pointer rounded-full hover:bg-white/10 
            ${isWeekend ? 'bg-emerald-500/10' : ''}
            ${isToday ? 'bg-blue-600/20 text-blue-400 font-bold' : 'theme-text-main'}
            ${isSelected ? 'date-picker-active bg-blue-600 text-white shadow-lg shadow-blue-600/30' : ''}`;
            div.innerText = i;

            div.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('#dateGrid .date-picker-active').forEach(item => item.classList.remove('date-picker-active'));
                div.classList.add('date-picker-active');
                this.selectedDate = new Date(year, month, i);
                this.el.weekNumber.innerText = i18n.t('date.week', { num: this.getWeekNumber(this.selectedDate) });
                this.confirmSelection();
            };
            this.el.dateGrid.appendChild(div);
        }

        // 下月日期
        const totalCells = firstDay + lastDay;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            const div = document.createElement('div');
            const colIndex = (totalCells + i - 1) % 7;
            const isWeekend = (colIndex === 0 || colIndex === 6);
            div.className = `h-10 flex items-center justify-center theme-text-dim text-sm cursor-pointer rounded-full hover:bg-white/10 ${isWeekend ? 'bg-emerald-500/10' : ''}`;
            div.innerText = i;
            div.onclick = (e) => {
                e.stopPropagation();
                let nextMonth = month + 1;
                let nextYear = year;
                if (nextMonth > 11) {
                    nextMonth = 0;
                    nextYear++;
                }
                this.currentMonth = nextMonth;
                this.currentYear = nextYear;
                this.selectedDate = new Date(nextYear, nextMonth, i);
                this.render(nextYear, nextMonth);
                this.confirmSelection();
            };
            this.el.dateGrid.appendChild(div);
        }
    }
};

window.DatePicker = DatePicker;
export default DatePicker;
