<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSegmentationStore } from '../stores/segmentation';
import { readNiftiMask } from './segmentation/niftiReader';

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

// 現在ラベルの PET 値ヒストグラム。
// finalMask 全 voxel をスキャン (maskVersion 依存) → label に該当する voxel の PET 値を bin 集計。
const HIST_BINS = 30;
const labelHistogram = computed(() => {
    void store.maskVersion; // reactivity 依存
    const id = store.currentLabelId;
    const pet = store.petVolumeRef;
    const mask = store.finalMask;
    if (!pet || !mask) return null;
    const pix = pet.voxel;

    let mn = Infinity, mx = -Infinity, sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] !== id) continue;
        const v = pix[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
        sumSq += v * v;
        n++;
    }
    if (n === 0) {
        return { count: 0, min: 0, max: 0, mean: 0, std: 0, counts: [] as number[], lo: 0, hi: 0, binWidth: 0, peak: 0 };
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const std = Math.sqrt(variance);

    const lo = 0;
    const hi = mx > lo ? mx : lo + 1;
    const binWidth = (hi - lo) / HIST_BINS;
    const counts = new Array<number>(HIST_BINS).fill(0);
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] !== id) continue;
        const v = pix[i];
        let bi = Math.floor((v - lo) / binWidth);
        if (bi < 0) bi = 0;
        if (bi >= HIST_BINS) bi = HIST_BINS - 1;
        counts[bi]++;
    }
    let peak = 0;
    for (const c of counts) if (c > peak) peak = c;

    return { count: n, min: mn, max: mx, mean, std, counts, lo, hi, binWidth, peak };
});

const currentLabel = computed(() => store.labelById(store.currentLabelId));
const currentLabelColorCss = computed(() => {
    const l = currentLabel.value;
    if (!l) return 'var(--mv-accent)';
    return `rgb(${l.color[0]},${l.color[1]},${l.color[2]})`;
});

// SVG 表示領域
const HIST_VB_W = 220;
const HIST_VB_H = 60;

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

const loadFileInput = ref<HTMLInputElement | null>(null);

const onLoadMaskClick = () => {
    loadFileInput.value?.click();
};

const readFileAsArrayBuffer = (f: File): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error(`Failed to read ${f.name}`));
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.readAsArrayBuffer(f);
    });

const readFileAsText = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error(`Failed to read ${f.name}`));
        r.onload = () => resolve(r.result as string);
        r.readAsText(f);
    });

const onLoadMaskFiles = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    if (!store.hasPet) {
        alert('Load a PET volume first, then load the mask.');
        return;
    }

    const niiFile = files.find(f => /\.nii(\.gz)?$/i.test(f.name));
    const jsonFile = files.find(f => /\.json$/i.test(f.name));

    if (!niiFile) {
        alert('Please select a .nii or .nii.gz mask file.');
        return;
    }

    try {
        const buf = await readFileAsArrayBuffer(niiFile);
        const parsed = readNiftiMask(buf);

        let sidecar:
            | { threshold?: number; thresholdUnit?: 'SUV' | 'CNTS'; labels?: any[]; petMetadata?: { seriesUID?: string; seriesDescription?: string } }
            | null = null;
        if (jsonFile) {
            try {
                const text = await readFileAsText(jsonFile);
                sidecar = JSON.parse(text);
            } catch {
                alert(`Could not parse sidecar JSON ${jsonFile.name}. Mask will still be loaded.`);
            }
        }

        // ★4: sidecar に PT seriesUID があり、現在 PT の seriesUID と異なる場合は警告。
        const sidecarUid = sidecar?.petMetadata?.seriesUID;
        const currentUid = store.petVolumeRef?.metadata?.seriesUID;
        if (sidecarUid && currentUid && sidecarUid !== currentUid) {
            const sidecarDesc = sidecar?.petMetadata?.seriesDescription ?? sidecarUid;
            const currentDesc = store.petVolumeRef?.metadata?.seriesDescription ?? currentUid;
            const ok = window.confirm(
                `This mask was created for PT series:\n  ${sidecarDesc}\n\n` +
                `but the currently active PT is:\n  ${currentDesc}\n\n` +
                `The geometry (dims/voxel size) may match by coincidence, but the mask may not align anatomically. Load anyway?`
            );
            if (!ok) return;
        }

        const res = store.loadMaskFromNifti(parsed.mask, parsed.dims, sidecar);
        if (!res.ok) {
            alert(res.reason);
            return;
        }
        emit('redraw');
    } catch (err: any) {
        alert(`Failed to load mask: ${err?.message ?? err}`);
    }
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
            Load a PET volume and switch to MPR / Fusion view
        </div>

        <template v-else>
            <!-- Linked PT info: ★4 -->
            <div v-if="store.petVolumeRef" class="mv-linked-pt">
                <v-icon icon="mdi-link-variant" size="x-small" class="mr-1" />
                <span class="mv-linked-pt-label">Linked PT:</span>
                <span class="mv-linked-pt-name" :title="store.petVolumeRef.metadata?.seriesUID ?? ''">
                    {{ store.petVolumeRef.metadata?.seriesDescription ?? '(no description)' }}
                </span>
            </div>

            <!-- Threshold -->
            <section class="mv-section">
                <div class="mv-section-title">
                    <v-icon icon="mdi-tune-variant" size="x-small" />
                    Threshold ({{ store.thresholdUnit }})
                </div>
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
                <div class="mv-section-title">
                    <v-icon icon="mdi-layers-outline" size="x-small" />
                    Overlay
                </div>
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
                <div class="mv-section-title">
                    <v-icon icon="mdi-circle-outline" size="x-small" />
                    Sphere ROI
                </div>
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
                    Click on the PET image with the Sphere ROI tool<br>
                    Wheel inside the sphere to change radius
                </div>
            </section>

            <!-- Polygon ROI -->
            <section class="mv-section">
                <div class="mv-section-title">
                    <v-icon icon="mdi-vector-polygon" size="x-small" />
                    Polygon ROI
                </div>
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
                    Left click = vertex / Right click or double click = finish<br>
                    Esc = cancel / Ctrl+Z = undo
                </div>
            </section>

            <!-- Labels -->
            <section class="mv-section">
                <div class="mv-section-title">
                    <v-icon icon="mdi-tag-multiple-outline" size="x-small" />
                    Labels
                </div>
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

            <!-- Histogram (per label) -->
            <section class="mv-section">
                <div class="mv-section-title">
                    <v-icon icon="mdi-chart-bar" size="x-small" />
                    Histogram — PET ({{ store.thresholdUnit }})
                    <span v-if="currentLabel" class="mv-hist-label-name" :style="{ color: currentLabelColorCss }">
                        {{ currentLabel.name }}
                    </span>
                </div>

                <template v-if="labelHistogram && labelHistogram.count > 0">
                    <svg
                        class="mv-hist-svg"
                        :viewBox="`0 0 ${HIST_VB_W} ${HIST_VB_H}`"
                        preserveAspectRatio="none"
                    >
                        <!-- baseline -->
                        <line :x1="0" :y1="HIST_VB_H" :x2="HIST_VB_W" :y2="HIST_VB_H"
                              stroke="var(--mv-border)" stroke-width="0.5" />
                        <!-- mean line -->
                        <line v-if="labelHistogram.binWidth > 0"
                              :x1="((labelHistogram.mean - labelHistogram.lo) / (labelHistogram.hi - labelHistogram.lo)) * HIST_VB_W"
                              :y1="0"
                              :x2="((labelHistogram.mean - labelHistogram.lo) / (labelHistogram.hi - labelHistogram.lo)) * HIST_VB_W"
                              :y2="HIST_VB_H"
                              stroke="var(--mv-text-muted)" stroke-width="0.6" stroke-dasharray="2 2" />
                        <!-- bars -->
                        <rect
                            v-for="(c, i) in labelHistogram.counts"
                            :key="i"
                            :x="i * (HIST_VB_W / labelHistogram.counts.length) + 0.5"
                            :y="HIST_VB_H - (c / labelHistogram.peak) * HIST_VB_H"
                            :width="(HIST_VB_W / labelHistogram.counts.length) - 1"
                            :height="(c / labelHistogram.peak) * HIST_VB_H"
                            :fill="currentLabelColorCss"
                        />
                    </svg>
                    <div class="mv-hist-axis">
                        <span class="mv-mono">{{ labelHistogram.lo.toFixed(1) }}</span>
                        <span class="mv-mono">{{ labelHistogram.hi.toFixed(1) }}</span>
                    </div>
                    <div class="mv-stats mt-1">
                        <div class="mv-stat-row">
                            <span class="mv-stat-label">min / max</span>
                            <span class="mv-mono">{{ labelHistogram.min.toFixed(2) }} / {{ labelHistogram.max.toFixed(2) }}</span>
                        </div>
                        <div class="mv-stat-row">
                            <span class="mv-stat-label">mean</span>
                            <span class="mv-mono">
                                {{ labelHistogram.mean.toFixed(2) }}
                                <span class="mv-stat-dim">± {{ labelHistogram.std.toFixed(2) }}</span>
                            </span>
                        </div>
                        <div class="mv-stat-row">
                            <span class="mv-stat-label">voxels</span>
                            <span class="mv-mono">{{ labelHistogram.count }}</span>
                        </div>
                    </div>
                </template>
                <div v-else class="mv-hint">
                    No voxels assigned to the current label yet
                </div>
            </section>

            <!-- Islands -->
            <section class="mv-section">
                <div class="mv-section-title">
                    <v-icon icon="mdi-island" size="x-small" />
                    Islands
                </div>
                <div v-if="store.componentMapValid" class="mv-hint">
                    <span class="mv-accent">{{ store.componentCount }}</span> components detected —
                    click an island with the Assign Label tool
                </div>
                <div v-else-if="store.finalMask" class="mv-warn-text">
                    <v-icon icon="mdi-refresh" size="x-small" class="mr-1" />
                    Mask updated — re-run Find islands
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

            <!-- Save / Load / Clean -->
            <section class="mv-section">
                <div class="mv-btn-row">
                    <v-btn size="small" color="primary" variant="flat" @click="onSave">
                        <v-icon icon="mdi-content-save" size="small" class="mr-1" />Save NIfTI
                    </v-btn>
                    <v-btn size="small" variant="tonal" @click="onLoadMaskClick">
                        <v-icon icon="mdi-folder-open" size="small" class="mr-1" />Load Mask
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="onClearManual">Clear edits</v-btn>
                </div>
                <input
                    ref="loadFileInput"
                    type="file"
                    accept=".nii,.nii.gz,.json,application/octet-stream,application/json"
                    multiple
                    style="display: none"
                    @change="onLoadMaskFiles"
                />
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

/* ★4: Linked PT 表示 */
.mv-linked-pt {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(0, 212, 170, 0.06);
    border-bottom: 1px solid var(--mv-border);
    font-size: 11px;
    color: var(--mv-text-dim);
}
.mv-linked-pt-label {
    color: var(--mv-text-muted);
}
.mv-linked-pt-name {
    color: var(--mv-accent);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
    min-width: 0;
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

.mv-hist-svg {
    width: 100%;
    height: 60px;
    background: var(--mv-bg);
    border: 1px solid var(--mv-border);
    border-radius: 3px;
    display: block;
}
.mv-hist-axis {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    font-size: 10px;
    color: var(--mv-text-muted);
}
.mv-hist-label-name {
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 6px;
    font-size: 11px;
}
</style>
