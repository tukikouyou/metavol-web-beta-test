<template>
  <v-app>
    <v-app-bar class="mv-appbar" flat density="compact" :height="48">
      <template v-slot:prepend>
        <v-btn
          icon="mdi-menu"
          variant="text"
          size="small"
          @click.stop="drawerLeft = !drawerLeft"
        />
      </template>

      <div class="mv-brand ml-1">
        meta<span class="mv-brand-accent">vol</span>
      </div>

      <v-divider vertical class="mx-3" />

      <!-- Tool icons -->
      <div class="mv-tools">
        <v-btn
          v-for="t in tools"
          :key="t.value"
          :class="['mv-tool-btn', { 'is-active': leftButtonFunction === t.value }]"
          variant="text"
          size="small"
          @click="leftButtonFunction = leftButtonFunction === t.value ? null : t.value"
        >
          <v-icon :icon="t.icon" />
          <v-tooltip activator="parent" location="bottom">{{ t.label }}</v-tooltip>
        </v-btn>
      </div>

      <v-spacer />

      <v-btn
        class="mv-tool-btn mv-tool-btn--wide mr-1"
        variant="text"
        size="small"
        @click="loadTestDicom"
      >
        <v-icon icon="mdi-folder-open-outline" />
        <span class="mv-tool-label">Test</span>
        <v-tooltip activator="parent" location="bottom">
          フォルダを選択してテスト DICOM を読み込む（同セッション中は再選択不要）
        </v-tooltip>
      </v-btn>

      <v-btn
        class="mv-pet-std-btn mr-2"
        variant="flat"
        size="small"
        :disabled="!petCtReady"
        @click="petStandardView"
      >
        <v-icon icon="mdi-view-grid" class="mr-1" size="small" />
        PET Standard
        <v-tooltip activator="parent" location="bottom">
          {{ petCtReady ? '2x2: CT axi / PET axi / Fusion axi / PET MIP' : 'PET と CT の両方をロードしてください' }}
        </v-tooltip>
      </v-btn>

      <v-divider vertical class="mx-2" />

      <v-btn
        :class="['mv-tool-btn', { 'is-active': syncImageBox }]"
        variant="text"
        size="small"
        @click="syncImageBox = !syncImageBox"
      >
        <v-icon icon="mdi-link-variant" />
        <v-tooltip activator="parent" location="bottom">{{ syncImageBox ? 'Sync ON' : 'Sync OFF' }}</v-tooltip>
      </v-btn>

      <v-btn
        class="mv-tool-btn"
        variant="text" size="small"
        @click="changeImageBoxSize(-50)"
      >
        <v-icon icon="mdi-magnify-minus-outline" />
        <v-tooltip activator="parent" location="bottom">Smaller</v-tooltip>
      </v-btn>
      <v-btn
        class="mv-tool-btn"
        variant="text" size="small"
        @click="changeImageBoxSize(50)"
      >
        <v-icon icon="mdi-magnify-plus-outline" />
        <v-tooltip activator="parent" location="bottom">Larger</v-tooltip>
      </v-btn>
      <v-btn
        class="mv-tool-btn"
        variant="text" size="small"
        @click="fitToWindow"
      >
        <v-icon icon="mdi-fit-to-screen-outline" />
        <v-tooltip activator="parent" location="bottom">Fit to window</v-tooltip>
      </v-btn>

      <v-divider vertical class="mx-1" />

      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn class="mv-tool-btn mv-tool-btn--wide" variant="text" size="small" v-bind="props">
            <v-icon icon="mdi-view-grid-outline" />
            <span class="mv-tool-label">{{ tileN }}</span>
            <v-tooltip activator="parent" location="bottom">Tile count</v-tooltip>
          </v-btn>
        </template>
        <v-list density="compact" @click:select="clickItem">
          <v-list-item v-for="n in [1,2,3,4,6,8,9,10,12]" :key="n" :value="String(n)">
            <v-list-item-title>{{ n }} {{ n === 1 ? 'box' : 'boxes' }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn
        class="mv-tool-btn"
        variant="text"
        size="small"
        @click="drawerRight = !drawerRight"
      >
        <v-icon icon="mdi-format-vertical-align-top" style="transform: rotate(90deg)" />
        <v-tooltip activator="parent" location="bottom">{{ drawerRight ? 'Hide inspector' : 'Show inspector' }}</v-tooltip>
      </v-btn>

      <v-btn
        class="mv-tool-btn"
        variant="text"
        size="small"
        color="error"
        @click="closingImages = true"
      >
        <v-icon icon="mdi-trash-can-outline" />
        <v-tooltip activator="parent" location="bottom">Close all</v-tooltip>
      </v-btn>
    </v-app-bar>

    <v-main>
      <DicomView
        ref="dicomViewRef"
        v-model:drawer="drawerLeft"
        v-model:inspector="drawerRight"
        v-model:leftButtonFunction="leftButtonFunction"
        v-model:imageBoxW="imageBoxW"
        v-model:imageBoxH="imageBoxW"
        v-model:tileN="tileN"
        v-model:syncImageBox="syncImageBox"
        v-model:closingImages="closingImages"
      />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DicomView from "./components/DicomView.vue";
import { getWH, getTileN } from "./components/UrlParser.ts";
import { useSegmentationStore } from "./stores/segmentation";

const segStore = useSegmentationStore();

// PET Standard ボタンを enable する条件:
//   (a) PET/CT 両方の Volume が既に MPR 済み、または
//   (b) DicomView が公開する seriesSummaries に PT と CT の DICOM がある
const seriesSummariesView = computed(() => dicomViewRef.value?.seriesSummariesPublic ?? []);
const petCtReady = computed(() => {
  if (segStore.petVolumeRef && segStore.ctVolumeRef) return true;
  const list = seriesSummariesView.value as Array<any>;
  const hasPt = list.some(s => s.modality === 'PT' || s.modality === 'PET');
  const hasCt = list.some(s => s.modality === 'CT');
  return hasPt && hasCt;
});

const drawerLeft = ref(true);
const drawerRight = ref(true);
const leftButtonFunction = ref<string | null>(null);
const [w, h] = getWH();
const imageBoxW = ref(w);
const imageBoxH = ref(h);
const closingImages = ref(false);
const tileN = ref(getTileN());
const syncImageBox = ref(false);

const tools = [
  { value: 'window',     icon: 'mdi-contrast-circle',       label: 'Window/Level' },
  { value: 'pan',        icon: 'mdi-hand-back-right-outline', label: 'Pan' },
  { value: 'zoom',       icon: 'mdi-magnify-plus-outline',  label: 'Zoom' },
  { value: 'page',       icon: 'mdi-arrow-up-down',         label: 'Page' },
  { value: 'sphereROI',  icon: 'mdi-circle-outline',        label: 'Sphere ROI' },
  { value: 'polygonROI', icon: 'mdi-vector-polygon',        label: 'Polygon ROI' },
  { value: 'assignLabel',icon: 'mdi-tag-outline',           label: 'Assign Label' },
];

const changeImageBoxSize = (d: number) => {
  let a = imageBoxH.value;
  a += d;
  if (a < 100) a = 100;
  if (a > 1000) a = 1000;
  imageBoxH.value = a;
  imageBoxW.value = a;
  // 手動サイズ変更で autoFit を解除
  dicomViewRef.value?.disableAutoFit?.();
};

const fitToWindow = () => {
  dicomViewRef.value?.fitToWindow?.();
};

const clickItem = (e: any) => {
  tileN.value = Number(e.id);
};

const dicomViewRef = ref<any>(null);
const petStandardView = () => {
  tileN.value = 4;
  setTimeout(() => {
    dicomViewRef.value?.setupPetStandardView?.();
  }, 50);
};

const loadTestDicom = () => {
  dicomViewRef.value?.loadTestDicom?.();
};
</script>

<style scoped>
.mv-tools {
  display: flex;
  gap: 2px;
  align-items: center;
  flex-wrap: nowrap;
}

/* app-bar 内の divider を細く */
:deep(.v-app-bar .v-divider) {
  border-color: var(--mv-border) !important;
  height: 24px !important;
  min-height: 24px !important;
  align-self: center !important;
  opacity: 1;
}

.mv-pet-std-btn {
  background: var(--mv-accent) !important;
  color: var(--mv-bg) !important;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0.01em;
  border-radius: 6px;
  height: 32px;
}
.mv-pet-std-btn:hover {
  background: #00B894 !important;
}

:deep(.mv-tool-btn--wide) {
  width: auto !important;
  padding: 0 8px !important;
  gap: 4px;
}
:deep(.mv-tool-label) {
  font-size: 12px;
  font-weight: 600;
  color: var(--mv-text);
}

:deep(.v-app-bar) {
  border-bottom: 1px solid var(--mv-border);
}
</style>
