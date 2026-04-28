import * as nifti from 'nifti-reader-js';

// NIfTI-1 mask reader. Pairs with niftiWriter.ts:
// expects the same Uint16 multi-label volume layout that saveMaskAsNifti() produces,
// but is tolerant of any conformant NIfTI-1 (.nii or gzipped .nii.gz) as long as
// the datatype is UINT16 (=512).
//
// Throws Error with a user-readable English message if the buffer is not a valid
// UINT16 NIfTI-1 volume — callers can surface the message in an alert().

export interface MaskNifti {
    mask: Uint16Array;
    dims: [number, number, number];
    voxelSizeMm: [number, number, number];
}

export const readNiftiMask = (buf: ArrayBuffer): MaskNifti => {
    let raw: ArrayBuffer = buf;
    if (nifti.isCompressed(raw)) {
        raw = nifti.decompress(raw);
    }
    if (!nifti.isNIFTI(raw)) {
        throw new Error('File is not a valid NIfTI-1 volume.');
    }

    const hdr = nifti.readHeader(raw) as nifti.NIFTI1;
    const datatype = (hdr as any).datatypeCode ?? (hdr as any).datatype;
    if (datatype !== 512) {
        throw new Error(
            `Unsupported NIfTI datatype (${datatype}). Mask must be UINT16 (datatype=512).`
        );
    }

    const dimsArr = (hdr as any).dims as number[];
    const nx = dimsArr[1] | 0;
    const ny = dimsArr[2] | 0;
    const nz = dimsArr[3] | 0;
    if (nx <= 0 || ny <= 0 || nz <= 0) {
        throw new Error(`Invalid NIfTI dims: ${nx} x ${ny} x ${nz}.`);
    }

    const px = nifti.readImage(hdr, raw);
    const expected = nx * ny * nz;
    const view = new Uint16Array(px);
    if (view.length < expected) {
        throw new Error(
            `NIfTI image data truncated: got ${view.length} voxels, expected ${expected}.`
        );
    }
    // Copy out so callers own a standalone Uint16Array (not aliased to the file buffer).
    const mask = new Uint16Array(expected);
    mask.set(view.subarray(0, expected));

    const pix = (hdr as any).pixDims as number[];
    const dx = pix?.[1] ?? 1;
    const dy = pix?.[2] ?? 1;
    const dz = pix?.[3] ?? 1;

    return {
        mask,
        dims: [nx, ny, nz],
        voxelSizeMm: [dx, dy, dz],
    };
};
