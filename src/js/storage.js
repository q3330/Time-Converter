import { registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// 注册我们自定义的原生 RoomStorage 插件
const RoomStorage = registerPlugin('RoomStorage');

export const StorageService = {
    async init() {
        console.log('[Storage] Room Native Database is ready.');
        return Promise.resolve();
    },

    async close() {
        // Room 在原生侧自动管理连接生命周期
        return Promise.resolve();
    },

    async getPreference(key) {
        const { value } = await Preferences.get({ key });
        try {
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return value;
        }
    },

    async setPreference(key, value) {
        await Preferences.set({
            key,
            value: JSON.stringify(value),
        });
    },

    /**
     * 批量提交数据 (Insert/Update)
     * @param {Array} dataList 
     */
    async submitData(dataList) {
        try {
            // 直接调用原生的 Room 批量处理逻辑
            return await RoomStorage.submitData({ data: dataList });
        } catch (error) {
            console.error('[Storage] Room Submit Error:', error);
            throw error;
        }
    },

    /**
     * 分页查询记录
     */
    async getRecords(page = 1, limit = 50, sortField = 'created_at', sortOrder = 'DESC') {
        try {
            // 调用原生 Room 进行高效分页和排序
            return await RoomStorage.getRecords({
                page,
                limit,
                sortField,
                sortOrder
            });
        } catch (err) {
            console.error('[Storage] Room Query error:', err);
            return { status: 'error', data: [], pagination: { total: 0 } };
        }
    },

    /**
     * 获取所有记录 (导出用途)
     */
    async getAllRecords() {
        try {
            // 为简单起见，getAll 通过设置较大的 limit 实现
            const res = await RoomStorage.getRecords({ page: 1, limit: 99999 });
            return res.data || [];
        } catch (e) {
            console.error('[Storage] Room Get all error:', e);
            return [];
        }
    },

    /**
     * 根据条码更新记录
     */
    async updateRecordByCode(code, data) {
        try {
            return await RoomStorage.updateRecordByCode({ code, data });
        } catch (error) {
            console.error('[Storage] Room Update Error:', error);
            throw error;
        }
    },

    /**
     * 批量删除
     * @param {Array<number>} ids 
     */
    async deleteRecords(ids) {
        if (!ids || ids.length === 0) return { status: 'success', deleted: 0 };
        try {
            return await RoomStorage.deleteRecords({ ids });
        } catch (error) {
            console.error('[Storage] Room Delete Error:', error);
            throw error;
        }
    }
};
