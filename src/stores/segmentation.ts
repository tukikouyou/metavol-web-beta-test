import { defineStore } from 'pinia';
import * as THREE from 'three';
import type { Volume } from '../components/Volume';
import { connectedComponents26, assignLabelToComponent } from '../components/segmentation/maskOps';
import { writeNiftiUint16, triggerDownload } from '../components/segmentation/niftiWriter';

export interface LabelEntry {
    id: number;
    name: string;
    color: [number, number, number];
}

export interface SphereROI {
    centerWorld: THREE.Vector3;
    radiusMm: number;
    suvMax: number;
    suvMean: number;
    suvStd: number;
    voxelCount: number;
}

export interface PolygonROIState {
    plane: 'axial' | 'coronal' | 'sagittal' | 'unknown';
    sliceIndexInPet: number;
    sliceAxis: 0 | 1 | 2;
    screenVertices: Array<[number, number]>;
    mode: 'add' | 'erase';
    inProgress: boolean;
    imageBoxId: number;
}

export interface UndoEntry {
    sliceAxis: 0 | 1 | 2;
    sliceIndex: number;
    before: Uint16Array;
}

const ERASE_SENTINEL = 0xFFFF;

const DEFAULT_LABEL_PALETTE: Array<[number, number, number]> = [
    [255, 90, 90],
    [90, 200, 90],
    [90, 130, 255],
    [255, 200, 70],
    [220, 90, 220],
    [70, 220, 220],
    [255, 140, 60],
    [180, 110, 255],
];

interface State {
    petVolumeRef: Volume | null;
    ctVolumeRef: Volume | null;

    thresholdMask: Uint16Array | null;
    manualEdits: Uint16Array | null;
    finalMask: Uint16Array | null;

    threshold: number;
    thresholdUnit: 'SUV' | 'CNTS';

    labels: LabelEntry[];
    currentLabelId: number;

    sphere: SphereROI | null;
    polygon: PolygonROIState | null;

    undoStack: UndoEntry[];

    overlayAlpha: number;
    overlayEnabled: boolean;

    panelOpen: boolean;
    maskVersion: number;

    defaultPolygonMode: 'add' | 'erase';

    componentMap: Uint16Array | null;
    componentCount: number;
    componentMapValid: boolean;
}

export const useSegmentationStore = defineStore('segmentation', {
    state: (): State => ({
        petVolumeRef: null,
        ctVolumeRef: null,

        thresholdMask: null,
        manualEdits: null,
        finalMask: null,

        threshold: 2.5,
        thresholdUnit: 'SUV',

        labels: [
            { id: 1, name: 'lesion1', color: DEFAULT_LABEL_PALETTE[0] },
        ],
        currentLabelId: 1,

        sphere: null,
        polygon: null,

        undoStack: [],

        overlayAlpha: 0.4,
        overlayEnabled: true,

        panelOpen: false,
        maskVersion: 0,

        defaultPolygonMode: 'add',

        componentMap: null,
        componentCount: 0,
        componentMapValid: false,
    }),

    getters: {
        hasPet(state): boolean {
            return state.petVolumeRef != null;
        },
        labelById: (state) => (id: number): LabelEntry | undefined => {
            return state.labels.find(l => l.id === id);
        },
        petVoxelVolumeMm3(state): number {
            const v = state.petVolumeRef;
            if (!v) return 0;
            return v.vectorX.length() * v.vectorY.length() * v.vectorZ.length();
        },
        volumesByLabel(state): Map<number, number> {
            const out = new Map<number, number>();
            const m = state.finalMask;
            if (!m || !state.petVolumeRef) return out;
            const vox = this.petVoxelVolumeMm3;
            const counts = new Map<number, number>();
            for (let i = 0; i < m.length; i++) {
                const id = m[i];
                if (id === 0) continue;
                counts.set(id, (counts.get(id) ?? 0) + 1);
            }
            for (const [id, c] of counts) {
                out.set(id, c * vox);
            }
            return out;
        },
    },

    actions: {
        invalidateComponentMap() {
            this.componentMapValid = false;
            this.componentMap = null;
            this.componentCount = 0;
        },

        setPetVolume(v: Volume | null) {
            // 同一 PET (seriesUID または voxel 同一性) ならマスク state は保持
            const same = !!(v && this.petVolumeRef && (
                v.voxel === this.petVolumeRef.voxel ||
                (v.metadata?.seriesUID && this.petVolumeRef.metadata?.seriesUID
                    && v.metadata.seriesUID === this.petVolumeRef.metadata.seriesUID)
            ));
            this.petVolumeRef = v;
            if (!same) {
                this.thresholdMask = null;
                this.manualEdits = null;
                this.finalMask = null;
                this.undoStack = [];
                this.sphere = null;
                this.polygon = null;
                this.invalidateComponentMap();
                this.maskVersion++;
            }
        },
        setCtVolume(v: Volume | null) {
            this.ctVolumeRef = v;
        },

        ensureMaskAllocated(): boolean {
            if (!this.petVolumeRef) return false;
            const n = this.petVolumeRef.nx * this.petVolumeRef.ny * this.petVolumeRef.nz;
            if (!this.thresholdMask || this.thresholdMask.length !== n) {
                this.thresholdMask = new Uint16Array(n);
                this.manualEdits = new Uint16Array(n);
                this.finalMask = new Uint16Array(n);
            }
            return true;
        },

        recomputeFinalMask() {
            const t = this.thresholdMask;
            const e = this.manualEdits;
            const f = this.finalMask;
            if (!t || !e || !f) return;
            for (let i = 0; i < f.length; i++) {
                const ev = e[i];
                if (ev === ERASE_SENTINEL) {
                    f[i] = 0;
                } else if (ev !== 0) {
                    f[i] = ev;
                } else {
                    f[i] = t[i];
                }
            }
            this.maskVersion++;
        },

        applyThreshold(threshold: number) {
            this.threshold = threshold;
            if (!this.ensureMaskAllocated()) return;
            const v = this.petVolumeRef!;
            const t = this.thresholdMask!;
            const pet = v.voxel;
            const id = this.currentLabelId;
            for (let i = 0; i < pet.length; i++) {
                t[i] = pet[i] >= threshold ? id : 0;
            }
            this.recomputeFinalMask();
            this.invalidateComponentMap();
        },

        clearThresholdMask() {
            if (this.thresholdMask) this.thresholdMask.fill(0);
            this.recomputeFinalMask();
            this.invalidateComponentMap();
        },

        clearManualEdits() {
            if (this.manualEdits) this.manualEdits.fill(0);
            this.undoStack = [];
            this.recomputeFinalMask();
            this.invalidateComponentMap();
        },

        // Polygon 確定後など外部から手動編集が入った直後に呼ぶ
        markManualEditsChanged() {
            this.invalidateComponentMap();
        },

        addLabel(name: string): LabelEntry {
            const nextId = this.labels.length === 0
                ? 1
                : Math.max(...this.labels.map(l => l.id)) + 1;
            const color = DEFAULT_LABEL_PALETTE[(nextId - 1) % DEFAULT_LABEL_PALETTE.length];
            const entry: LabelEntry = { id: nextId, name, color };
            this.labels.push(entry);
            return entry;
        },

        removeLabel(id: number) {
            this.labels = this.labels.filter(l => l.id !== id);
            if (this.currentLabelId === id && this.labels.length > 0) {
                this.currentLabelId = this.labels[0].id;
            }
        },

        renameLabel(id: number, name: string) {
            const l = this.labels.find(x => x.id === id);
            if (l) l.name = name;
        },

        setSphere(centerWorld: THREE.Vector3, radiusMm: number) {
            this.sphere = {
                centerWorld: centerWorld.clone(),
                radiusMm,
                suvMax: 0,
                suvMean: 0,
                suvStd: 0,
                voxelCount: 0,
            };
        },

        clearSphere() {
            this.sphere = null;
        },

        bumpMaskVersion() {
            this.maskVersion++;
        },

        findIslands() {
            const pet = this.petVolumeRef;
            const m = this.finalMask;
            if (!pet || !m) return 0;
            const { components, count } = connectedComponents26(m, pet.nx, pet.ny, pet.nz);
            this.componentMap = components;
            this.componentCount = count;
            this.componentMapValid = true;
            this.maskVersion++;
            return count;
        },

        ensureComponentMap() {
            // 必要時に最新の componentMap を保証する。古い／無いなら再計算。
            if (!this.componentMapValid || !this.componentMap) {
                this.findIslands();
            }
        },

        clearIslands() {
            this.componentMap = null;
            this.componentCount = 0;
            this.componentMapValid = false;
        },

        assignLabelAtVoxel(i: number, j: number, k: number, labelId: number) {
            const pet = this.petVolumeRef;
            const m = this.finalMask;
            if (!pet || !m) return 0;
            // 古い componentMap で操作すると意図しない領域に波及するため、
            // 必ず最新状態に基づいて計算する。
            this.ensureComponentMap();
            const cm = this.componentMap;
            if (!cm) return 0;

            const seedIdx = k * pet.nx * pet.ny + j * pet.nx + i;
            const compId = cm[seedIdx];
            if (compId === 0) return 0;

            const n = assignLabelToComponent(cm, m, { i, j, k }, pet.nx, pet.ny, labelId);
            // 確定後はその領域を manualEdits にも反映（再計算で消えないように）
            const me = this.manualEdits;
            if (me) {
                for (let p = 0; p < cm.length; p++) {
                    if (cm[p] === compId) me[p] = labelId;
                }
            }
            this.maskVersion++;
            return n;
        },

        saveMaskAsNifti(filename?: string): boolean {
            const pet = this.petVolumeRef;
            const m = this.finalMask;
            if (!pet || !m) return false;
            const blob = writeNiftiUint16(m, pet);
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
            const sid = pet.metadata?.seriesUID
                ? pet.metadata.seriesUID.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32)
                : 'mask';
            const fname = filename ?? `${sid}_${ts}.nii`;
            triggerDownload(blob, fname);

            // JSON サイドカー
            const sidecar = {
                created: new Date().toISOString(),
                threshold: this.threshold,
                thresholdUnit: this.thresholdUnit,
                labels: this.labels,
                petMetadata: pet.metadata ?? null,
                voxelSizeMm: [pet.vectorX.length(), pet.vectorY.length(), pet.vectorZ.length()],
                dims: [pet.nx, pet.ny, pet.nz],
            };
            const jsonBlob = new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' });
            triggerDownload(jsonBlob, fname + '.json');
            return true;
        },
    },
});

export const ERASE_MARK = ERASE_SENTINEL;
