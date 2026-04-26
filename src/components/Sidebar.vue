<script setup lang="ts">
import { ref } from 'vue';
import SeriesList from './SeriesList.vue';

defineProps<{
  seriesSummaries?: Array<{
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

const emit = defineEmits([
  "fileLoaded",
  "dirLoaded",
  "leftButtonFunctionChanged",
  "openSample",
  "presetSelected",
  "changeSeries",
  "changeSlice",
  "mpr",
  "axi",
  "cor",
  "mip",
  "smip",
  "monochrome",
  "rainbow",
  "hot",
  "reverse",
  "phantom1",
  "phantom2",
  "phantom3",
  "fusion",
  "maximize",
  "redraw",
  "selectSeries",
]);

const presetClicked = (e: string) => emit("presetSelected", e);
const changeSeries = (e: number) => emit("changeSeries", e);
const changeSlice = (e: number) => emit("changeSlice", e);

const showAdvanced = ref(false);
const showSummary = ref(false);
const showTag = ref(false);

const wPresets = [
  { id: 'Lung',  label: 'Lung'  },
  { id: 'Med',   label: 'Med'   },
  { id: 'Abd',   label: 'Abd'   },
  { id: 'Bone',  label: 'Bone'  },
  { id: 'Brain', label: 'Brain' },
  { id: 'Fat',   label: 'Fat'   },
];
</script>

<template>
  <div class="mv-sidebar">

    <!-- Series -->
    <section class="mv-section">
      <div class="mv-section-title">
        <v-icon icon="mdi-folder-multiple-image" size="x-small" />
        Series
      </div>
      <div class="mv-btn-row mb-2">
        <v-btn size="x-small" variant="tonal" @click="changeSeries(-1)">
          <v-icon icon="mdi-arrow-left" size="small" />
        </v-btn>
        <v-btn size="x-small" variant="tonal" @click="changeSeries(1)">
          <v-icon icon="mdi-arrow-right" size="small" />
        </v-btn>
      </div>
      <SeriesList
        :series="seriesSummaries ?? []"
        @select="(i: number) => emit('selectSeries', i)"
      />
    </section>

    <!-- Slice -->
    <section class="mv-section">
      <div class="mv-section-title">
        <v-icon icon="mdi-layers-triple" size="x-small" />
        Slice
      </div>
      <div class="mv-btn-row">
        <v-btn size="x-small" variant="tonal" @click="changeSlice(-100000)">
          <v-icon icon="mdi-arrow-collapse-left" size="small" />
        </v-btn>
        <v-btn size="x-small" variant="tonal" @click="changeSlice(-1)">
          <v-icon icon="mdi-arrow-left" size="small" />
        </v-btn>
        <v-btn size="x-small" variant="tonal" @click="changeSlice(1)">
          <v-icon icon="mdi-arrow-right" size="small" />
        </v-btn>
        <v-btn size="x-small" variant="tonal" @click="changeSlice(100000)">
          <v-icon icon="mdi-arrow-collapse-right" size="small" />
        </v-btn>
      </div>
    </section>

    <!-- Window preset -->
    <section class="mv-section">
      <div class="mv-section-title">
        <v-icon icon="mdi-contrast-circle" size="x-small" />
        Window preset
      </div>
      <div class="mv-btn-row">
        <v-btn
          v-for="p in wPresets"
          :key="p.id"
          size="x-small"
          variant="tonal"
          @click="presetClicked(p.id)"
        >{{ p.label }}</v-btn>
        <v-btn size="x-small" variant="outlined" color="primary" @click="presetClicked('Reset')">Reset</v-btn>
      </div>
    </section>

    <!-- Color -->
    <section class="mv-section">
      <div class="mv-section-title">
        <v-icon icon="mdi-palette" size="x-small" />
        Color
      </div>
      <div class="mv-btn-row">
        <v-btn size="x-small" variant="tonal" @click="emit('monochrome')">Mono</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('rainbow')">Rainbow</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('hot')">Hot</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('reverse')">Reverse</v-btn>
      </div>
    </section>

    <!-- 3D / View -->
    <section class="mv-section">
      <div class="mv-section-title">
        <v-icon icon="mdi-cube-outline" size="x-small" />
        View
      </div>
      <div class="mv-btn-row">
        <v-btn size="x-small" variant="tonal" @click="emit('mpr')">MPR</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('axi')">Axi</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('cor')">Cor</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('mip')">MIP</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('smip')">sMIP</v-btn>
        <v-btn size="x-small" variant="tonal" @click="emit('fusion')">Fusion</v-btn>
      </div>
    </section>

    <!-- Demo / Advanced -->
    <section class="mv-section">
      <div class="d-flex align-center">
        <v-btn
          size="x-small"
          variant="text"
          :prepend-icon="showAdvanced ? 'mdi-chevron-down' : 'mdi-chevron-right'"
          @click="showAdvanced = !showAdvanced"
        >
          Advanced
        </v-btn>
      </div>

      <div v-if="showAdvanced" class="mt-2">
        <div class="mv-section-title">Demo phantoms</div>
        <div class="mv-btn-row">
          <v-btn size="x-small" variant="tonal" @click="emit('phantom3')">Earth</v-btn>
          <v-btn size="x-small" variant="tonal" @click="emit('phantom1')">Humanoid</v-btn>
          <v-btn size="x-small" variant="tonal" @click="emit('phantom2')">Voronoi</v-btn>
        </div>
        <div class="mt-2">
          <v-switch label="Show summary" v-model="showSummary" hide-details density="compact" />
          <v-switch label="Show tag" v-model="showTag" hide-details density="compact" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mv-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}
</style>
