import * as THREE from 'three';
import { Volume, voxelToWorld, worldToVoxel } from '../Volume';

export const allocateMaskForPet = (pet: Volume): Uint16Array => {
    return new Uint16Array(pet.nx * pet.ny * pet.nz);
}

export const fillByThreshold = (
    pet: Volume,
    out: Uint16Array,
    threshold: number,
    labelId: number,
) => {
    const v = pet.voxel;
    for (let i = 0; i < v.length; i++) {
        out[i] = v[i] >= threshold ? labelId : 0;
    }
}

export const countByLabel = (mask: Uint16Array): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < mask.length; i++) {
        const v = mask[i];
        if (v === 0) continue;
        m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
}

export const sphereStatsInPet = (
    pet: Volume,
    centerWorld: THREE.Vector3,
    radiusMm: number,
) => {
    const cx = centerWorld.x, cy = centerWorld.y, cz = centerWorld.z;
    const r2 = radiusMm * radiusMm;

    const nx = pet.nx, ny = pet.ny, nz = pet.nz;
    const vox = pet.voxel;

    const stepX = pet.vectorX.length();
    const stepY = pet.vectorY.length();
    const stepZ = pet.vectorZ.length();
    const padX = Math.ceil(radiusMm / Math.max(stepX, 1e-6)) + 1;
    const padY = Math.ceil(radiusMm / Math.max(stepY, 1e-6)) + 1;
    const padZ = Math.ceil(radiusMm / Math.max(stepZ, 1e-6)) + 1;

    const centerVoxel = worldToVoxel(centerWorld, pet);

    const i0 = Math.max(0, Math.floor(centerVoxel.x - padX));
    const i1 = Math.min(nx - 1, Math.ceil(centerVoxel.x + padX));
    const j0 = Math.max(0, Math.floor(centerVoxel.y - padY));
    const j1 = Math.min(ny - 1, Math.ceil(centerVoxel.y + padY));
    const k0 = Math.max(0, Math.floor(centerVoxel.z - padZ));
    const k1 = Math.min(nz - 1, Math.ceil(centerVoxel.z + padZ));

    let max = -Infinity;
    let sum = 0;
    let sum2 = 0;
    let count = 0;

    const p = new THREE.Vector3();
    for (let k = k0; k <= k1; k++) {
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                p.set(i, j, k);
                const w = voxelToWorld(p, pet);
                const dx = w.x - cx, dy = w.y - cy, dz = w.z - cz;
                if (dx * dx + dy * dy + dz * dz > r2) continue;
                const val = vox[k * nx * ny + j * nx + i];
                if (val > max) max = val;
                sum += val;
                sum2 += val * val;
                count++;
            }
        }
    }

    if (count === 0) return { suvMax: 0, suvMean: 0, suvStd: 0, voxelCount: 0 };
    const mean = sum / count;
    const variance = Math.max(0, sum2 / count - mean * mean);
    return {
        suvMax: max,
        suvMean: mean,
        suvStd: Math.sqrt(variance),
        voxelCount: count,
    };
}

export interface PolygonPlaneFillParams {
    pet: Volume;
    target: Uint16Array;
    sliceAxis: 0 | 1 | 2;
    sliceIndex: number;
    polygonVoxelXY: Array<[number, number]>;
    writeValue: number;
}

export const fillPolygonOnSlice = (params: PolygonPlaneFillParams) => {
    const { pet, target, sliceAxis, sliceIndex, polygonVoxelXY, writeValue } = params;
    const { nx, ny, nz } = pet;

    let dimU: number, dimV: number;
    if (sliceAxis === 2) { dimU = nx; dimV = ny; }
    else if (sliceAxis === 1) { dimU = nx; dimV = nz; }
    else { dimU = ny; dimV = nz; }

    if (sliceIndex < 0) return;
    if (sliceAxis === 2 && sliceIndex >= nz) return;
    if (sliceAxis === 1 && sliceIndex >= ny) return;
    if (sliceAxis === 0 && sliceIndex >= nx) return;

    if (polygonVoxelXY.length < 3) return;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [u, v] of polygonVoxelXY) {
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    const u0 = Math.max(0, Math.floor(minU));
    const u1 = Math.min(dimU - 1, Math.ceil(maxU));
    const v0 = Math.max(0, Math.floor(minV));
    const v1 = Math.min(dimV - 1, Math.ceil(maxV));

    for (let v = v0; v <= v1; v++) {
        for (let u = u0; u <= u1; u++) {
            if (!pointInPolygon(u + 0.5, v + 0.5, polygonVoxelXY)) continue;
            const idx = voxelIndexFromAxis(sliceAxis, sliceIndex, u, v, nx, ny);
            target[idx] = writeValue;
        }
    }
}

const voxelIndexFromAxis = (
    sliceAxis: 0 | 1 | 2,
    sliceIndex: number,
    u: number, v: number,
    nx: number, ny: number,
): number => {
    if (sliceAxis === 2) return sliceIndex * nx * ny + v * nx + u;
    if (sliceAxis === 1) return v * nx * ny + sliceIndex * nx + u;
    return v * nx * ny + u * nx + sliceIndex;
}

const pointInPolygon = (px: number, py: number, poly: Array<[number, number]>): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export const findMaximumAxis = (v: THREE.Vector3): 0 | 1 | 2 => {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    if (ax >= ay && ax >= az) return 0;
    if (ay >= ax && ay >= az) return 1;
    return 2;
}

// 26-connected components labeling. Returns Uint16 component map (1..K),
// 0 = background. Treats all non-zero voxels as foreground.
export const connectedComponents26 = (
    mask: Uint16Array,
    nx: number, ny: number, nz: number,
): { components: Uint16Array; count: number } => {
    const out = new Uint16Array(mask.length);
    let nextId = 1;
    const stackI = new Int32Array(mask.length);
    const stackJ = new Int32Array(mask.length);
    const stackK = new Int32Array(mask.length);

    const idx = (i: number, j: number, k: number) => k * nx * ny + j * nx + i;

    for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const a = idx(i, j, k);
                if (mask[a] === 0 || out[a] !== 0) continue;
                const id = nextId++;
                if (id > 65535) {
                    // Out of Uint16 range; bail with what we have.
                    return { components: out, count: id - 1 };
                }
                let sp = 0;
                stackI[sp] = i; stackJ[sp] = j; stackK[sp] = k; sp++;
                out[a] = id;
                while (sp > 0) {
                    sp--;
                    const ci = stackI[sp], cj = stackJ[sp], ck = stackK[sp];
                    for (let dk = -1; dk <= 1; dk++) {
                        const nk = ck + dk; if (nk < 0 || nk >= nz) continue;
                        for (let dj = -1; dj <= 1; dj++) {
                            const nj = cj + dj; if (nj < 0 || nj >= ny) continue;
                            for (let di = -1; di <= 1; di++) {
                                if (di === 0 && dj === 0 && dk === 0) continue;
                                const ni = ci + di; if (ni < 0 || ni >= nx) continue;
                                const b = idx(ni, nj, nk);
                                if (mask[b] === 0 || out[b] !== 0) continue;
                                out[b] = id;
                                stackI[sp] = ni; stackJ[sp] = nj; stackK[sp] = nk; sp++;
                            }
                        }
                    }
                }
            }
        }
    }
    return { components: out, count: nextId - 1 };
}

// 与えられた voxel (i,j,k) が属する成分の全 voxel に対して mask 上で labelId に書き換える。
export const assignLabelToComponent = (
    components: Uint16Array,
    targetMask: Uint16Array,
    seed: { i: number; j: number; k: number },
    nx: number, ny: number,
    labelId: number,
) => {
    const seedIdx = seed.k * nx * ny + seed.j * nx + seed.i;
    const compId = components[seedIdx];
    if (compId === 0) return 0;
    let count = 0;
    for (let i = 0; i < components.length; i++) {
        if (components[i] === compId) {
            targetMask[i] = labelId;
            count++;
        }
    }
    return count;
}
