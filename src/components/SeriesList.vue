<script setup lang="ts">
defineProps<{
    series: Array<{
        index: number;
        description: string;
        modality: string;
        matrixSize: string;
        voxelSize: string;
        fileCount: number;
        hasVolume: boolean;
        thumbnail: string | null;
    }>;
}>();

const emit = defineEmits<{
    (e: 'select', index: number): void;
}>();

const modalityChip = (m: string): { color: string; text: string } => {
    if (m === 'PT' || m === 'PET') return { color: '#ff9b3a', text: 'PT' };
    if (m === 'CT') return { color: '#7ad0ff', text: 'CT' };
    if (m === 'MR') return { color: '#a78bfa', text: 'MR' };
    return { color: '#888', text: m };
};
</script>

<template>
    <v-container fluid class="pa-1">
        <div v-if="series.length === 0" class="text-caption text-disabled px-2">
            シリーズなし
        </div>
        <div
            v-for="s in series"
            :key="s.index"
            class="series-card"
            @click="emit('select', s.index)"
        >
            <div class="thumb">
                <img v-if="s.thumbnail" :src="s.thumbnail" />
                <div v-else class="thumb-placeholder">
                    <v-icon icon="mdi-image-off-outline" size="small"></v-icon>
                </div>
            </div>
            <div class="meta">
                <div class="row1">
                    <span class="modality" :style="{ background: modalityChip(s.modality).color }">
                        {{ modalityChip(s.modality).text }}
                    </span>
                    <span class="desc" :title="s.description">{{ s.description }}</span>
                </div>
                <div class="row2">{{ s.matrixSize }}</div>
                <div class="row3">{{ s.voxelSize }}</div>
                <div class="row4">
                    <span v-if="s.fileCount > 0">{{ s.fileCount }} files</span>
                    <span v-if="s.hasVolume" class="vol-tag">VOL</span>
                </div>
            </div>
        </div>
    </v-container>
</template>

<style scoped>
.series-card {
    display: flex;
    gap: 8px;
    padding: 6px;
    background: var(--mv-surface-2);
    border-radius: 4px;
    margin-bottom: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: border-color 0.15s, background 0.15s;
}
.series-card:hover {
    border-color: var(--mv-border-strong);
    background: #2A3441;
}

.thumb {
    width: 56px;
    height: 56px;
    background: #000;
    border-radius: 3px;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
}
.thumb-placeholder {
    color: var(--mv-text-muted);
}

.meta {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    line-height: 1.3;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--mv-text);
}

.row1 {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
}
.modality {
    color: #0F1419;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 10px;
    flex-shrink: 0;
    letter-spacing: 0.04em;
}
.desc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    color: var(--mv-text);
    font-weight: 500;
}

.row2, .row3 {
    color: var(--mv-text-dim);
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 10px;
}

.row4 {
    display: flex;
    gap: 6px;
    color: var(--mv-text-muted);
    font-size: 10px;
}
.vol-tag {
    color: var(--mv-accent);
    font-weight: 600;
}
</style>
