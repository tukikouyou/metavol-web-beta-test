<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSegmentationStore } from '../stores/segmentation';

const store = useSegmentationStore();

const emit = defineEmits<{
    (e: 'redraw'): void;
}>();

const newLabelName = ref('');

const THRESHOLD_PRESETS = [
    { title: 'SUV 2.5', value: '2.5' },
    { title: 'SUV 3.0', value: '3.0' },
    { title: 'SUV 3.5', value: '3.5' },
    { title: 'SUV 4.0', value: '4.0' },
    { title: 'Manual', value: 'manual' },
];

const thresholdSelection = ref<string>(
    ['2.5', '3.0', '3.5', '4.0'].includes(String(store.threshold))
        ? String(store.threshold)
        : 'manual'
);

const onThresholdSelectionChange = (val: string) => {
    thresholdSelection.value = val;
    if (val !== 'manual') {
        store.threshold = Number(val);
    }
};

const petAvailable = computed(() => store.hasPet);

const labelRows = computed(() => {
    const m = store.volumesByLabel;
    return store.labels.map(l => ({
        ...l,
        volume_mm3: m.get(l.id) ?? 0,
        colorCss: `rgb(${l.color[0]},${l.color[1]},${l.color[2]})`,
    }));
});

const onApplyThreshold = () => {
    store.applyThreshold(store.threshold);
    store.findIslands();
    emit('redraw');
};

const onClearThreshold = () => {
    store.clearThresholdMask();
    emit('redraw');
};

const onClearManual = () => {
    store.clearManualEdits();
    emit('redraw');
};

const onAddLabel = () => {
    const name = newLabelName.value.trim() || `lesion${store.labels.length + 1}`;
    const e = store.addLabel(name);
    store.currentLabelId = e.id;
    newLabelName.value = '';
};

const onSelectLabel = (id: number) => {
    store.currentLabelId = id;
};

const onRemoveLabel = (id: number) => {
    store.removeLabel(id);
    emit('redraw');
};

const onToggleOverlay = (val: boolean) => {
    store.overlayEnabled = val;
    emit('redraw');
};

const onAlphaChange = (val: number) => {
    store.overlayAlpha = val;
    emit('redraw');
};

const onFindIslands = () => {
    store.findIslands();
    emit('redraw');
};

const onSave = () => {
    store.saveMaskAsNifti();
};

const polygonModeProxy = computed({
    get: () => store.polygon?.mode ?? store.defaultPolygonMode,
    set: (m: 'add' | 'erase') => {
        store.defaultPolygonMode = m;
        if (store.polygon) store.polygon.mode = m;
    },
});
</script>

<template>
    <div class="mv-seg-panel">
        <div v-if="!petAvailable" class="mv-empty">
            <v-icon icon="mdi-information-outline" size="small" class="mr-1" />
            PET ボリュームをロードして MPR/Fusion 表示にしてください
        </div>

        <template v-else>
            <!-- Threshold -->
            <section class="mv-section">
                <div class="mv-section-title">Threshold ({{ store.thresholdUnit }})</div>
                <v-select
                    :model-value="thresholdSelection"
                    @update:model-value="onThresholdSelectionChange($event)"
                    :items="THRESHOLD_PRESETS"
                    density="compact"
                    hide-details
                    variant="outlined"
                />
                <v-text-field
                    v-if="thresholdSelection === 'manual'"
                    v-model.number="store.threshold"
                    type="number"
                    step="0.1"
                    density="compact"
                    hide-details
                    variant="outlined"
                    label="SUV value"
                    class="mt-1"
                />
                <div class="mv-btn-row mt-2">
                    <v-btn size="small" color="primary" variant="flat" @click="onApplyThreshold">
                        <v-icon icon="mdi-play" size="small" class="mr-1" />Apply
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="onClearThreshold">Clear</v-btn>
                </div>
            </section>

            <!-- Overlay -->
            <section class="mv-section">
                <div class="mv-section-title">Overlay</div>
                <v-switch
                    :model-value="store.overlayEnabled"
                    @update:model-value="onToggleOverlay($event as boolean)"
                    label="Show mask"
                    density="compact"
                    hide-details
                    color="primary"
                />
                <div class="mv-row-label mt-1">
                    <span>Opacity</span>
                    <span class="mv-mono">{{ (store.overlayAlpha * 100).toFixed(0) }}%</span>
                </div>
                <v-slider
                    :model-value="store.overlayAlpha"
                    :min="0.05" :max="1" :step="0.05"
                    density="compact"
                    hide-details
                    color="primary"
                    track-color="surface-light"
                    @update:model-value="onAlphaChange($event as number)"
                />
            </section>

            <!-- Sphere ROI -->
            <section class="mv-section">
                <div class="mv-section-title">Sphere ROI</div>
                <div v-if="store.sphere" class="mv-stats">
                    <div class="mv-stat-row">
                        <span class="mv-stat-label">radius</span>
                        <span class="mv-mono">{{ store.sphere.radiusMm.toFixed(1) }} mm</span>
                    </div>
                    <div class="mv-stat-row">
                        <span class="mv-stat-label">SUVmax</span>
                        <span class="mv-mono mv-accent">{{ store.sphere.suvMax.toFixed(2) }}</span>
                    </div>
                    <div class="mv-stat-row">
                        <span class="mv-stat-label">SUVmean</span>
                        <span class="mv-mono">
                            {{ store.sphere.suvMean.toFixed(2) }}
                            <span class="mv-stat-dim">± {{ store.sphere.suvStd.toFixed(2) }}</span>
                        </span>
                    </div>
                    <div class="mv-stat-row">
                        <span class="mv-stat-label">voxels</span>
                        <span class="mv-mono">{{ store.sphere.voxelCount }}</span>
                    </div>
                    <v-btn size="x-small" variant="text" class="mt-1" @click="store.clearSphere(); emit('redraw')">
                        <v-icon icon="mdi-close" size="x-small" class="mr-1" />Clear
                    </v-btn>
                </div>
                <div v-else class="mv-hint">
                    Sphere ROI ツールで PET 画像をクリック<br>
                    球内ホイールで半径変更
                </div>
            </section>

            <!-- Polygon ROI -->
            <section class="mv-section">
                <div class="mv-section-title">Polygon ROI</div>
                <v-btn-toggle
                    v-model="polygonModeProxy"
                    density="compact"
                    mandatory
                    color="primary"
                    variant="outlined"
                    divided
                >
                    <v-btn value="add" size="small">
                        <v-icon icon="mdi-plus" size="small" class="mr-1" />Add
                    </v-btn>
                    <v-btn value="erase" size="small">
                        <v-icon icon="mdi-minus" size="small" class="mr-1" />Erase
                    </v-btn>
                </v-btn-toggle>
                <div class="mv-hint mt-1">
                    左クリック=頂点 / 右クリック・ダブルクリック=確定<br>
                    Esc=取消 / Ctrl+Z=undo
                </div>
            </section>

            <!-- Labels -->
            <section class="mv-section">
                <div class="mv-section-title">Labels</div>
                <div class="mv-label-list">
                    <div
                        v-for="row in labelRows"
                        :key="row.id"
                        class="mv-label-item"
                        :class="{ 'is-active': row.id === store.currentLabelId }"
                        @click="onSelectLabel(row.id)"
                    >
                        <span class="mv-color-swatch" :style="{ background: row.colorCss }" />
                        <span class="mv-label-name">{{ row.name }}</span>
                        <span class="mv-mono mv-label-vol">{{ row.volume_mm3.toFixed(0) }} mm³</span>
                        <v-btn
                            icon="mdi-close"
                            size="x-small"
                            variant="text"
                            density="compact"
                            class="ml-1"
                            @click.stop="onRemoveLabel(row.id)"
                        />
                    </div>
                </div>
                <div class="mv-add-label mt-2">
                    <v-text-field
                        v-model="newLabelName"
                        placeholder="Label name"
                        density="compact"
                        hide-details
                        variant="outlined"
                        @keyup.enter="onAddLabel"
                    />
                    <v-btn size="small" variant="tonal" @click="onAddLabel">
                        <v-icon icon="mdi-plus" size="small" />
                    </v-btn>
                </div>
            </section>

            <!-- Islands -->
            <section class="mv-section">
                <div class="mv-section-title">Islands</div>
                <div v-if="store.componentMapValid" class="mv-hint">
                    <span class="mv-accent">{{ store.componentCount }}</span> 成分検出済 —
                    Assign Label ツールで島をクリック
                </div>
                <div v-else-if="store.finalMask" class="mv-warn-text">
                    <v-icon icon="mdi-refresh" size="x-small" class="mr-1" />
                    マスクが更新されました
                </div>
                <v-btn
                    size="small"
                    variant="tonal"
                    color="primary"
                    class="mt-1"
                    :disabled="!store.finalMask"
                    @click="onFindIslands"
                >
                    <v-icon icon="mdi-magnify" size="small" class="mr-1" />
                    {{ store.componentMapValid ? 'Re-find' : 'Find islands' }}
                </v-btn>
            </section>

            <!-- Save / Clean -->
            <section class="mv-section">
                <div class="mv-btn-row">
                    <v-btn size="small" color="primary" variant="flat" @click="onSave">
                        <v-icon icon="mdi-content-save" size="small" class="mr-1" />Save NIfTI
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="onClearManual">Clear edits</v-btn>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.mv-seg-panel {
    color: var(--mv-text);
}

.mv-empty {
    padding: 16px 12px;
    color: var(--mv-text-dim);
    font-size: 12px;
    line-height: 1.5;
    border-bottom: 1px solid var(--mv-border);
}

.mv-section {
    padding: 12px;
    border-bottom: 1px solid var(--mv-border);
}

.mv-section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mv-text-dim);
    margin-bottom: 8px;
}

.mv-row-label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--mv-text-dim);
}

.mv-stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.mv-stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
}
.mv-stat-label {
    color: var(--mv-text-dim);
}
.mv-stat-dim {
    color: var(--mv-text-muted);
    margin-left: 4px;
}
.mv-mono {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 11px;
    color: var(--mv-text);
}
.mv-accent {
    color: var(--mv-accent) !important;
    font-weight: 600;
}

.mv-hint {
    font-size: 11px;
    color: var(--mv-text-muted);
    line-height: 1.5;
}

.mv-warn-text {
    font-size: 11px;
    color: var(--mv-warning);
    display: flex;
    align-items: center;
    line-height: 1.5;
}

.mv-btn-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.mv-btn-row .v-btn {
    text-transform: none;
    letter-spacing: 0;
}

.mv-label-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.mv-label-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.1s, border-color 0.1s;
}
.mv-label-item:hover {
    background: var(--mv-surface-2);
}
.mv-label-item.is-active {
    background: rgba(0, 212, 170, 0.10);
    border-color: var(--mv-accent-dim);
}
.mv-color-swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
}
.mv-label-name {
    flex: 1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mv-label-vol {
    color: var(--mv-text-dim);
}

.mv-add-label {
    display: flex;
    gap: 4px;
    align-items: stretch;
}
.mv-add-label .v-text-field {
    flex: 1;
}
</style>
